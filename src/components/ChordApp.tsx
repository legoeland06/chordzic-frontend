/**
 * ChordApp — composant principal de l'application chordZIC.
 *
 * Orchestre la grille d'accords, le moteur audio, la lecture synchrone,
 * la sauvegarde/chargement, l'export/import JSON et les modals.
 *
 * État géré entièrement via useState/useRef, l'AudioEngine est une instance
 * unique dans un useRef.
 */
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Sparkles, Music } from 'lucide-react';

import { parseGrille, ChordData } from '../types/chord';
import type { PianoNote } from '../lib/pianoRollTypes';
import { AudioEngine, TrackConfig } from '../lib/audioEngine';
import ChordInput from './ChordInput';
import ControlBar from './ControlBar';
import TrackPanel from './TrackPanel';
import ProgressBar from './ProgressBar';
import ChordGrid from './ChordGrid';
import ChordDetailModal from './ChordDetailModal';
import { SaveModal, LoadModal } from './SaveLoadModal';
import PianoRoll from './PianoRoll';

/** Tableau vide partagé : référence STABLE (évite les re-renders/effets parasites). */
const EMPTY_NOTES: PianoNote[] = [];

// Clé localStorage des ANCIENNES grilles (migration unique vers le serveur)
const STORAGE_KEY = 'chordjava_saved_grilles';

/** URL du backend (serveur Rust) — même origine en standalone, localhost:4000 en dev. */
const API_BASE = 'http://localhost:4000';

/** Une grille sauvegardée (serveur) ou locale (fallback). */
interface GrilleEntry {
  file?: string;              // nom du fichier côté serveur
  name: string;
  input: string;
  tempo: number;
  sig: string;
  date?: number | string;     // timestamp UNIX (serveur) ou date locale (ancien format)
  pianoNotes?: Record<number, PianoNote[]>;
  tracks?: Array<{ channel: number; program: number; volume: number; mute: boolean }>;
  pattern?: string;
  use432Hz?: boolean;
}

export default function ChordApp() {
  // ── État : grille d'accords ──────────────────────────────────────
  const [input, setInput] = useState('1:Fm9 1:Cm9 1:Gm9 1:Dm7');
  const [chords, setChords] = useState<ChordData[]>([]);
  const [highlighted, setHighlighted] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);

  // ── État : paramètres audio ──────────────────────────────────────
  const [tempo, setTempo] = useState(120);
  const [volume, setVolume] = useState(127);
  const [use432, setUse432] = useState(true);
  const [browserAudio, setBrowserAudio] = useState(false);
  /** Vrai dès qu'un WAV a été rendu en mode Navig (bouton Extract actif). */
  const [hasWav, setHasWav] = useState(false);
  const [tracks, setLocalTracks] = useState<TrackConfig[]>([
    { channel: 0, label: 'Lead',    program: 51, volume: 60, mute: false },
    { channel: 2, label: 'Bass',    program: 33, volume: 70, mute: false },
    { channel: 3, label: 'Nappes',  program: 48, volume: 60, mute: false },
    { channel: 9, label: 'Drums',   program: 1,  volume: 90, mute: false },
    { channel: 4, label: 'Accent',  program: 2,  volume: 50, mute: false },
  ]);

  const updateTrack = (channel: number, cfg: Partial<TrackConfig>) => {
    setLocalTracks(prev => prev.map(t => t.channel === channel ? { ...t, ...cfg } : t));
    engineRef.current?.setTrack(channel, cfg);
  };

  // ── État : options musicales ─────────────────────────────────────
  const [loopOn, setLoopOn] = useState(false);
  const [walkingBass, setWalkingBass] = useState(false);
  const [drumPattern, setDrumPattern] = useState('rock');
  const [sig, setSig] = useState('4/4');
  const [useLoops, setUseLoops] = useState(false);
  const [loopOffset, setLoopOffset] = useState(0);
  const [loopName, setLoopName] = useState('');
  const [loopVolume, setLoopVolume] = useState(80);
  const [availableSamples, setAvailableSamples] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState('Prêt');
  const [statusColor, setStatusColor] = useState('text-gray-400');
  const [audioStarted, setAudioStarted] = useState(false);

  // ── État : piano roll (notes personnalisées par piste) ───────────
  const [pianoNotes, setPianoNotes] = useState<Record<number, PianoNote[]>>({});
  const [openPianoRoll, setOpenPianoRoll] = useState<number | null>(null);

  const handlePianoRollChange = useCallback((channel: number, notes: PianoNote[]) => {
    setPianoNotes(prev => ({ ...prev, [channel]: notes }));
  }, []);

  // ── Pré-remplissage du PianoRoll avec les notes du mode classique ──
  // À l'ouverture d'une piste jamais éditée, on demande au backend les notes
  // que jouerait le mode classique pour la grille COURANTE. Re-déclenché
  // quand la grille change. Les notes marquées `edited` (modifiées par
  // l'utilisateur) ne sont JAMAIS écrasées.
  useEffect(() => {
    if (openPianoRoll === null) return;
    const current = pianoNotes[openPianoRoll];
    // Déjà édité manuellement (notes modifiées, créées, ou canal vidé) → ne pas toucher
    if (current !== undefined && (current.length === 0 || current.some(n => n.edited || !n.id.startsWith('seed-')))) return;
    if (chords.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const engine = await getEngine();
        const fetched = await engine.getPianoNotes({ titre: 'Session', tempo, chords });
        if (cancelled) return;
        const notes = fetched ?? [];
        const chNotes: PianoNote[] = notes
          .filter(n => n.channel === openPianoRoll)
          .map((n, i) => ({
            id: `seed-${openPianoRoll}-${i}`,
            startTime: n.start_time,
            pitch: n.pitch,
            duration: n.duration,
            velocity: n.velocity,
          }));
        setPianoNotes(prev => ({ ...prev, [openPianoRoll]: chNotes }));
        setStatus(`🎹 PianoRoll pré-rempli : ${chNotes.length} notes (mode classique)`);
        setStatusColor('text-green-400');
      } catch (e) {
        console.warn('⚠️ Pré-remplissage PianoRoll impossible:', e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPianoRoll, chords]);

  // ── Dernier chiffrage tapé (pour l'autocomplétion de ChordInput) ──
  const [lastChiffrage, setLastChiffrage] = useState('');

  // ── État : drag & drop ───────────────────────────────────────────
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // ── État : modal détail ──────────────────────────────────────────
  const [selectedChord, setSelectedChord] = useState<ChordData | null>(null);
  const selectedChordIdx = useMemo(() => {
    if (!selectedChord || chords.length === 0) return -1;
    return chords.findIndex(c =>
      c.time === selectedChord.time &&
      c.chiffrage === selectedChord.chiffrage &&
      c.name === selectedChord.name
    );
  }, [selectedChord, chords]);

  // ── État : sauvegarde / chargement ─────────────────────────────────
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [savedGrilles, setSavedGrilles] = useState<GrilleEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── AudioEngine (instance unique) ─────────────────────────────────
  const engineRef = useRef<AudioEngine>(new AudioEngine());

  const getEngine = useCallback(async () => {
    if (!audioStarted) {
      await engineRef.current.init();
      setAudioStarted(true);
    }
    return engineRef.current;
  }, [audioStarted]);

  // ── Effet : initialisation au montage ─────────────────────────────
  useEffect(() => {
    getEngine();
    for (const t of tracks) engineRef.current.setTrack(t.channel, t);
    engineRef.current?.set432Hz(use432);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sauvegarde serveur : chargement + migration localStorage ─────
  const refreshGrilles = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/grilles`);
      if (res.ok) setSavedGrilles(await res.json());
    } catch { /* serveur injoignable : on garde l'état courant */ }
  }, []);

  useEffect(() => {
    // Migration unique : les anciennes grilles localStorage sont poussées
    // vers le serveur (format v3) puis retirées du localStorage.
    const migrateLocalStorage = async () => {
      let local: GrilleEntry[] = [];
      try { local = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { local = []; }

      try {
        const res = await fetch(`${API_BASE}/grilles`);
        if (!res.ok) throw new Error('serveur indisponible');
        const remote: GrilleEntry[] = await res.json();
        setSavedGrilles(remote);

        const remoteNames = new Set(remote.map(g => g.name));
        const toMigrate = local.filter(g => g.name && !remoteNames.has(g.name));
        for (const g of toMigrate) {
          const hasPN = g.pianoNotes && Object.values(g.pianoNotes).some(n => n.length > 0);
          await fetch(`${API_BASE}/save`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'chordJAVA-grille', version: 3,
              name: g.name, input: g.input, tempo: g.tempo, sig: g.sig,
              savedAt: new Date().toISOString(),
              ...(hasPN ? { pianoNotes: g.pianoNotes } : {}),
            }),
          });
        }
        if (toMigrate.length > 0) {
          localStorage.removeItem(STORAGE_KEY);
          await refreshGrilles();
        }
      } catch {
        // Serveur injoignable : repli sur les grilles locales (lecture seule)
        if (local.length) setSavedGrilles(local);
      }
    };
    migrateLocalStorage();
  }, [refreshGrilles]);

  // ── Analyse de l'input ────────────────────────────────────────────
  const parseInput = () => {
    try {
      const grille = parseGrille(input, tempo);
      setChords(grille.chords);
      if (grille.chords.length > 0) {
        setLastChiffrage(grille.chords[grille.chords.length - 1].chiffrage);
      }
      setStatus(`✅ ${grille.chords.length} accords`);
      setStatusColor('text-green-400');
      setHighlighted(-1);
    } catch (e: any) {
      setStatus(`❌ ${e.message}`);
      setStatusColor('text-red-400');
    }
  };

  // ── Analyse automatique de l'input (debounce) ────────────────────
  // Plus besoin de cliquer « Analyser » : la grille est re-parsée
  // automatiquement 600 ms après la dernière modification de l'input
  // (et une fois au montage pour la grille par défaut).
  const lastParsedInput = useRef('');
  useEffect(() => {
    if (input === lastParsedInput.current) return;
    const t = setTimeout(() => {
      lastParsedInput.current = input;
      parseInput();
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  // ─── Play / Stop / Clear ────────────────────────────────────────

  const playChordPreview = useCallback(async (chord: ChordData) => {
    const engine = await getEngine();
    if (!engine) return;

    engine.setTrack(0, { program: tracks[0].program, mute: tracks[0].mute });
    engine.setWalking(walkingBass); engine.set432Hz(use432); engine.setVolume(volume);
    engine.setDrums(!tracks[3].mute); engine.setBass(!tracks[1].mute);
    engine.setArpeggios(!tracks[0].mute); engine.setNappes(!tracks[2].mute);
    engine.setPattern(drumPattern); engine.setSig(sig);
    engine.onHighlight((idx) => setHighlighted(idx));

    setPlaying(true);
    setStatus('▶ Prévisualisation...'); setStatusColor('text-green-400');

    engine.playChordPreview(chord).then(() => {
      setPlaying(false); setHighlighted(-1);
      if (engineRef.current && !engineRef.current.isPlaying) {
        setStatus('✅ Arrêté'); setStatusColor('text-gray-400');
      }
    }).catch((e) => {
      setPlaying(false);
      setStatus(`❌ Erreur: ${e.message}`); setStatusColor('text-red-400');
    });
  }, [tempo, volume, tracks, use432, drumPattern, sig, getEngine, walkingBass]);

  const play = useCallback(async () => {
    const engine = await getEngine();
    if (!engine) return;

    let chordsToPlay = chords;
    // Re-parser systématiquement si l'input a changé depuis le dernier
    // parse (debounce ou clic Play avant la fin du délai)
    if (input !== lastParsedInput.current) {
      lastParsedInput.current = input;
      try {
        const grille = parseGrille(input, tempo);
        chordsToPlay = grille.chords;
        setChords(grille.chords);
      } catch {}
    }
    if (chordsToPlay.length === 0) return;

    engine.setTrack(0, { program: tracks[0].program, mute: tracks[0].mute });
    engine.setWalking(walkingBass); engine.set432Hz(use432); engine.setVolume(volume);
    engine.setDrums(!tracks[3].mute); engine.setBass(!tracks[1].mute);
    engine.setArpeggios(!tracks[0].mute); engine.setNappes(!tracks[2].mute);
    engine.setPattern(drumPattern); engine.setSig(sig);
    engine.onHighlight((idx) => setHighlighted(idx));

    setPlaying(true);
    setStatus('▶ Lecture...'); setStatusColor('text-green-400');

    // Convertir les pianoNotes en customNotes pour le backend
    const customNotes = Object.entries(pianoNotes).flatMap(([ch, notes]) =>
      (notes as PianoNote[]).map(n => ({
        channel: parseInt(ch),
        start_time: n.startTime,
        pitch: n.pitch,
        duration: n.duration,
        velocity: n.velocity,
      }))
    );
    // Canaux en mode PianoRoll (ouverts/édités) — les autres canaux
    // continuent de jouer en mode classique
    const customChannels = Object.keys(pianoNotes).map(Number);

    const grille = { titre: 'Session', tempo, chords: chordsToPlay };
    // En mode Navig (rendu WAV), le WAV sera disponible à l'extraction
    if (browserAudio) setHasWav(true);
    engine.playGrille(grille, loopOn, customNotes.length > 0 ? customNotes : undefined, customChannels.length > 0 ? customChannels : undefined).then(() => {
      setPlaying(false); setHighlighted(-1);
      setStatus('✅ Lecture terminée'); setStatusColor('text-green-400');
    }).catch((e) => {
      setPlaying(false);
      setStatus(`❌ Erreur: ${e.message}`); setStatusColor('text-red-400');
    });
  }, [chords, tempo, volume, tracks, use432, drumPattern, sig, getEngine, loopOn, input, browserAudio]);

  const stop = () => {
    if (engineRef.current) engineRef.current.stop();
    setPlaying(false); setHighlighted(-1);
    setStatus('■ Arrêté'); setStatusColor('text-gray-400');
  };

  const clear = () => { stop(); setChords([]); setHighlighted(-1); setStatus('Prêt'); setStatusColor('text-gray-400'); };

  // ─── Drag & Drop ────────────────────────────────────────────────

  const rebuildInputFromChords = (newChords: ChordData[]) => {
    const newInput = newChords.map(c => `${c.time}:${c.chiffrage}`).join(' ');
    setInput(newInput); setChords(newChords);
    if (newChords.length > 0) setLastChiffrage(newChords[newChords.length - 1].chiffrage);
    setStatus('🔀 Grille réordonnée'); setStatusColor('text-blue-400');
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); return; }
    const newChords = [...chords];
    const [moved] = newChords.splice(dragIdx, 1);
    newChords.splice(targetIdx, 0, moved);
    setDragIdx(null);
    rebuildInputFromChords(newChords);
  };

  // ─── Sauvegarder / Charger ─────────────────────────────────────

  /** Construit l'objet grille complet (format v3) — partagé save/export. */
  const buildGrilleObject = (extra: Record<string, unknown>) => {
    const hasPianoNotes = Object.keys(pianoNotes).length > 0 &&
      Object.values(pianoNotes).some(notes => notes.length > 0);
    return {
      type: 'chordJAVA-grille', version: 3, input, tempo, sig,
      tracks: tracks.map(t => ({ channel: t.channel, program: t.program, volume: t.volume, mute: t.mute })),
      pattern: drumPattern, use432Hz: use432,
      ...(hasPianoNotes ? { pianoNotes } : {}),
      ...extra,
    };
  };

  const handleSave = async (saveName: string) => {
    if (!saveName.trim() || !input.trim()) return;
    const name = saveName.trim();
    try {
      const res = await fetch(`${API_BASE}/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildGrilleObject({ name, savedAt: new Date().toISOString() })),
      });
      if (!res.ok) throw new Error('échec serveur');
      await refreshGrilles();
      setShowSaveModal(false);
      setStatus(`💾 Grille « ${name} » sauvegardée (fichier JSON)`); setStatusColor('text-green-400');
    } catch {
      setStatus('❌ Sauvegarde impossible (serveur injoignable)'); setStatusColor('text-red-400');
    }
  };

  const handleLoad = (entry: GrilleEntry) => {
    setInput(entry.input); setTempo(entry.tempo); setSig(entry.sig);
    // Restaurer les notes du PianoRoll (ancien format sans le champ → aucune)
    setPianoNotes(entry.pianoNotes ?? {});
    // v3 : restaurer aussi les réglages (tracks, pattern, 432Hz)
    if (entry.tracks) entry.tracks.forEach(tc => updateTrack(tc.channel, tc));
    if (entry.pattern) setDrumPattern(entry.pattern);
    if (entry.use432Hz !== undefined) setUse432(entry.use432Hz);
    setShowLoadModal(false);
    setStatus(`📂 Grille « ${entry.name} » chargée`); setStatusColor('text-blue-400');
    setTimeout(() => {
      try { const grille = parseGrille(entry.input, entry.tempo); setChords(grille.chords); } catch {}
    }, 50);
  };

  const handleDeleteSave = async (id: string) => {
    try {
      await fetch(`${API_BASE}/grilles/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await refreshGrilles();
    } catch { /* silencieux */ }
  };

  const handleExport = () => setShowExportModal(true);

  const doExport = (name: string) => {
    const data = buildGrilleObject({ exportedAt: new Date().toISOString() });
    // Nom de fichier lisible : sanitisation du nom choisi par l'utilisateur
    const safeName = name.trim().replace(/[^\w\-]+/g, '_').replace(/_+/g, '_') || 'grille';
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${safeName}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportModal(false);
    setStatus('📤 Grille exportée en JSON'); setStatusColor('text-green-400');
  };

  /** Extrait le dernier rendu WAV (mode Navig) en fichier téléchargeable. */
  const handleExtractWav = () => {
    const blob = engineRef.current?.getLastWavBlob();
    if (!blob) {
      setStatus('❌ Aucun WAV à extraire — lance une lecture d\'abord'); setStatusColor('text-red-400');
      return;
    }
    // Nom de fichier : début de la grille + horodatage
    const base = (input.slice(0, 24).replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')) || 'grille';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}_${Date.now()}.wav`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`📥 WAV extrait (${(blob.size / 1048576).toFixed(1)} Mo)`); setStatusColor('text-green-400');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.type === 'chordJAVA-grille' && data.input) {
          setInput(data.input); setTempo(data.tempo || 120);
          if (data.sig) setSig(data.sig);
          if (data.tracks) data.tracks.forEach((tc: any) => updateTrack(tc.channel, tc));
          else {
            if (data.drums !== undefined) updateTrack(9, { mute: !data.drums });
            if (data.bass !== undefined) updateTrack(2, { mute: !data.bass });
            if (data.arpeggios !== undefined) updateTrack(0, { mute: !data.arpeggios });
            if (data.nappes !== undefined) updateTrack(3, { mute: !data.nappes });
            if (data.instrument !== undefined) updateTrack(0, { program: data.instrument });
          }
          if (data.pattern) setDrumPattern(data.pattern);
          if (data.use432Hz !== undefined) setUse432(data.use432Hz);
          if (data.version >= 3 && data.pianoNotes) {
            setPianoNotes(data.pianoNotes);
          } else {
            setPianoNotes({});
          }
          setStatus(`📥 Grille importée depuis ${file.name}`); setStatusColor('text-green-400');
          setTimeout(() => { try { const grille = parseGrille(data.input, data.tempo || 120); setChords(grille.chords); } catch {} }, 50);
        } else { setStatus('❌ Format de fichier invalide'); setStatusColor('text-red-400'); }
      } catch { setStatus('❌ Fichier JSON invalide'); setStatusColor('text-red-400'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ─── Effets divers ──────────────────────────────────────────────

  useEffect(() => { const t = tracks.find(tc => tc.channel === 9); if (t) engineRef.current?.setDrums(!t.mute); }, [tracks[3].mute]);
  useEffect(() => { const t = tracks.find(tc => tc.channel === 2); if (t) engineRef.current?.setBass(!t.mute); }, [tracks[1].mute]);
  useEffect(() => { const t = tracks.find(tc => tc.channel === 0); if (t) engineRef.current?.setArpeggios(!t.mute); }, [tracks[0].mute]);
  useEffect(() => { const t = tracks.find(tc => tc.channel === 3); if (t) engineRef.current?.setNappes(!t.mute); }, [tracks[2].mute]);
  useEffect(() => {
    // Auto-config Reggae : quand on sélectionne le pattern reggae,
    // les paramètres suivants sont forcés automatiquement.
    if (drumPattern === 'reggae') {
      updateTrack(0, { program: 16, volume: 114 });  // Lead → Drawbar Organ
      updateTrack(4, { program: 4, volume: 114 });   // Accent → Electric Piano 1
      updateTrack(2, { program: 32, volume: 109 });  // Bass → Acoustic Bass
      updateTrack(9, { volume: 127 });                // Drums → vol max
      updateTrack(3, { program: 0, volume: 80, mute: false }); // Nappes → Acoustic Grand Piano (joue seulement sur accords courts)
      setLoopOn(true);                                 // Loop activé
    }
    engineRef.current?.setPattern(drumPattern);
  }, [drumPattern]);
  useEffect(() => { engineRef.current?.setWalking(walkingBass); }, [walkingBass]);

  useEffect(() => {
    if (!playing) { setCurrentBeat(0); return; }
    const msPerBeat = 60000 / tempo;
    setCurrentBeat(0);
    const interval = setInterval(() => setCurrentBeat(prev => (prev + 1) % 4), msPerBeat);
    return () => clearInterval(interval);
  }, [playing, tempo]);

  useEffect(() => {
    fetch('http://localhost:4000/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sig }) }).catch(() => {});
    engineRef.current?.setSig(sig);
  }, [sig]);
  useEffect(() => {
    fetch('http://localhost:4000/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tempo }) }).catch(() => {});
    engineRef.current?.setTempo(tempo);
  }, [tempo]);

  const fetchSamples = useCallback(async () => {
    try { const res = await fetch('http://localhost:4000/samples-list'); if (res.ok) setAvailableSamples(await res.json()); } catch {}
  }, []);
  useEffect(() => { fetchSamples(); }, [fetchSamples]);

  useEffect(() => { fetch('http://localhost:4000/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ use_loops: useLoops }) }).catch(() => {}); }, [useLoops]);
  useEffect(() => { fetch('http://localhost:4000/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loop_offset: loopOffset }) }).catch(() => {}); }, [loopOffset]);
  useEffect(() => { fetch('http://localhost:4000/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loop_name: loopName }) }).catch(() => {}); }, [loopName]);
  useEffect(() => { fetchSamples(); }, [tempo, fetchSamples]);

  // Parse automatique avec debounce
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!input.trim()) { setChords([]); setStatus('Prêt'); setStatusColor('text-gray-400'); return; }
      try { const grille = parseGrille(input, tempo); setChords(grille.chords); } catch { setChords([]); }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [input, tempo]);

  const handleUpdateChord = useCallback((idx: number, newText: string) => {
    const tokens = input.trim().split(/\s+/);
    if (idx >= 0 && idx < tokens.length) {
      tokens[idx] = newText;
      setInput(tokens.join(' '));
      try { const grille = parseGrille(tokens.join(' '), tempo); setChords(grille.chords); if (grille.chords.length > 0 && idx < grille.chords.length) setSelectedChord(grille.chords[idx]); } catch {}
    }
  }, [input, tempo]);

  // ─── Rendu JSX ─────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 flex items-start justify-center p-4">
      <div className="w-full max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Music className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">chordZic</h1>
              <p className="text-xs text-gray-500">Moteur Harmonique - by Legoeland</p>
            </div>
          </div>
          <span className={`text-xs font-mono ${statusColor}`}>{status}</span>
        </div>

        {/* Saisie des accords */}
        <ChordInput input={input} onChange={setInput} />

        {/* Contrôles + TrackPanel */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-2 sm:p-3 mb-2 overflow-x-auto">
          <ControlBar
            chords={chords} playing={playing} tempo={tempo}
            onAnalyse={parseInput} onPlay={play} onStop={stop} onClear={clear}
            onSave={() => setShowSaveModal(true)}
            onLoad={() => setShowLoadModal(true)}
            onExport={handleExport} onImport={() => fileInputRef.current?.click()}
            onExtractWav={handleExtractWav} hasWav={hasWav}
            onTempoChange={setTempo}
          />

          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />

          <TrackPanel
            chords={chords} highlighted={highlighted} playing={playing}
            currentBeat={currentBeat} tempo={tempo}
            volume={volume} use432={use432} browserAudio={browserAudio}
            loopOn={loopOn} walkingBass={walkingBass} drumPattern={drumPattern} sig={sig}
            tracks={tracks}
            onSetVolume={setVolume} onSet432={setUse432}
            onSetBrowserAudio={(v) => { setBrowserAudio(v); engineRef.current.browserAudio = v; }}
            onSetLoop={setLoopOn} onSetWalkingBass={setWalkingBass}
            onSetDrumPattern={setDrumPattern} onSetSig={setSig} onSetTempo={setTempo}
            onUpdateTrack={updateTrack}
            useLoops={useLoops} loopOffset={loopOffset} loopName={loopName}
            availableSamples={availableSamples} loopVolume={loopVolume}
            onSetUseLoops={(v) => { setUseLoops(v); engineRef.current?.setUseLoops(v); }}
            onSetLoopOffset={(v) => { setLoopOffset(v); engineRef.current?.setLoopOffset(v); }}
            onSetLoopName={(v) => { setLoopName(v); }}
            onSetLoopVolume={(v) => { setLoopVolume(v); engineRef.current?.setLoopVolume(v); }}
            onOpenPianoRoll={setOpenPianoRoll}
          />
        </div>

        <ProgressBar chords={chords} highlighted={highlighted} playing={playing} currentBeat={currentBeat} tempo={tempo} />

        <ChordGrid
          chords={chords} highlighted={highlighted} playing={playing} dragIdx={dragIdx} tempo={tempo}
          onClickChord={setSelectedChord}
          onDragStart={handleDragStart} onDragOver={handleDragOver}
          onDrop={handleDrop} onDragEnd={() => setDragIdx(null)}
          onDeleteChord={(idx) => {
            const newChords = chords.filter((_, i) => i !== idx);
            newChords.length === 0 ? clear() : rebuildInputFromChords(newChords);
          }}
        />

        {chords.length === 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
            <Sparkles className="w-12 h-12 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-500 text-sm">Entre des accords pour commencer</p>
          </div>
        )}

        {/* Modals */}
        <SaveModal
          show={showSaveModal}
          onClose={() => setShowSaveModal(false)}
          onSave={handleSave}
        />
        <SaveModal
          show={showExportModal}
          onClose={() => setShowExportModal(false)}
          onSave={doExport}
          title="📤 Exporter la grille en JSON"
          placeholder="Nom du fichier"
          buttonLabel="Exporter"
        />
        <LoadModal
          show={showLoadModal}
          onClose={() => setShowLoadModal(false)}
          grilles={savedGrilles}
          onLoad={handleLoad}
          onDelete={handleDeleteSave}
        />

        <ChordDetailModal
          chords={chords} chord={selectedChord} chordIdx={selectedChordIdx}
          chordsCount={chords.length} playing={() => playing}
          onClose={() => setSelectedChord(null)}
          onTogglePlay={() => { playing ? stop() : selectedChord && playChordPreview(selectedChord); }}
          onPrev={() => {
            const n = chords[selectedChordIdx - 1];
            if (n) { setSelectedChord(n); if (playing) playChordPreview(n); }
          }}
          onNext={() => {
            const n = chords[selectedChordIdx + 1];
            if (n) { setSelectedChord(n); if (playing) playChordPreview(n); }
          }}
          onUpdateChord={handleUpdateChord}
        />

        {/* Piano Roll Modal */}
        {openPianoRoll !== null && (() => {
          const track = tracks.find(t => t.channel === openPianoRoll);
          const channelNotes = pianoNotes[openPianoRoll] ?? EMPTY_NOTES;
          return (
            <PianoRoll
              notes={channelNotes}
              onNotesChange={(notes) => handlePianoRollChange(openPianoRoll, notes)}
              trackLabel={track?.label ?? `Canal ${openPianoRoll}`}
              channel={openPianoRoll}
              onClose={() => setOpenPianoRoll(null)}
              onPreviewNote={(pitch) => { engineRef.current?.playPreviewNote(openPianoRoll, pitch); }}
              tempo={tempo}
              engine={engineRef.current}
            />
          );
        })()}

        <div className="text-center mt-4 text-[10px] text-gray-700">
          chordJAVA v2 by Legoeland · Render WAV · {AudioEngine.INSTRUMENTS.length} instruments · {use432 ? 'A=432Hz' : 'A=440Hz'}
        </div>

      </div>
    </div>
  );
}
