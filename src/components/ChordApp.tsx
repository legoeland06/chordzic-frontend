import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Play, Square, Trash2, Sparkles, Music, Volume2, Gauge, Save, FolderOpen, GripVertical } from 'lucide-react';

// ─── Constantes ─────────────────────────────────────────────────────────
const STORAGE_KEY = 'chordjava_saved_grilles';
import { parseGrille, getChordColor, getNoteColor, ChordData, NOTE_NAMES, NOTE_TO_MIDI, QUALITY_INTERVALS } from '../types/chord';
import { AudioEngine, TrackConfig } from '../lib/audioEngine';
import PianoKeyboard from './PianoKeyboard';
import ProgressBar from './ProgressBar';
import ControlBar from './ControlBar';
import TrackPanel from './TrackPanel';
import ChordGrid from './ChordGrid';
import ChordInput from './ChordInput';
import ChordDetailModal from './ChordDetailModal';

// ─── Autocomplétion ────────────────────────────────────────────────────

const NOTE_PATTERN = /^([A-G][#b]?)(.*)/;

/** Liste triée des noms de qualité disponibles */
const QUALITY_NAMES = Object.keys(QUALITY_INTERVALS)
  .filter(k => k && k !== 'M' && k !== '')
  .sort((a, b) => a.length - b.length || a.localeCompare(b));

/** Récupère le token en cours d'édition à la position du curseur */
function getCurrentToken(text: string, cursor: number): {
  start: number; end: number; token: string;
} {
  // Chercher le début du mot avant cursor
  let start = cursor;
  while (start > 0 && text[start - 1] !== ' ') start--;
  // Chercher la fin du mot après cursor
  let end = cursor;
  while (end < text.length && text[end] !== ' ') end++;
  return { start, end, token: text.slice(start, end) };
}

/** Calcule les suggestions pour le token courant */
function getSuggestions(token: string, lastChordChiffrage: string): string[] {
  if (!token || token === ' ') return [];

  const trimmed = token.trim();

  // Cas 1: l'utilisateur est en train de taper un accord complet avec time
  // "4:C" → suggestions "4:Cm7", "4:CM7", "4:C7" etc.
  if (trimmed.includes(':')) {
    const colonIdx = trimmed.indexOf(':');
    const timePart = trimmed.slice(0, colonIdx + 1); // "4:"
    const rest = trimmed.slice(colonIdx + 1); // "Cm7" ou "C"

    const noteMatch = rest.match(NOTE_PATTERN);
    if (noteMatch) {
      const noteName = noteMatch[1];
      const partialQuality = noteMatch[2].toLowerCase();
      if (partialQuality !== rest.toLowerCase()) {
        // L'utilisateur a tapé "C" ou "Cm" — on complète la qualité
        const results: string[] = [];
        for (const q of QUALITY_NAMES) {
          if (q.toLowerCase().startsWith(partialQuality)) {
            results.push(timePart + noteName + q);
          }
        }
        return results.slice(0, 12);
      }
    }
  }

  // Cas 2: l'utilisateur tape juste une note sans time
  // "C" → suggestions "4:Cm7", "4:CM7", ...
  const noteMatch = trimmed.match(NOTE_PATTERN);
  if (noteMatch) {
    const noteName = noteMatch[1];
    const partialQuality = noteMatch[2].toLowerCase();
    const results: string[] = [];
    for (const q of QUALITY_NAMES) {
      if (q.toLowerCase().startsWith(partialQuality)) {
        results.push(noteName + q);
      }
    }
    return results.slice(0, 12);
  }

  // Cas 3: l'utilisateur vient de taper un time "4:" — proposer le dernier accord
  if (/^\d+:$/.test(trimmed) && lastChordChiffrage) {
    return [trimmed + lastChordChiffrage];
  }

  return [];
}

/** Calcule les noms de notes avec octave depuis les midiValues d'un accord */
function notesWithOctave(c: ChordData): string[] {
  const rv = NOTE_TO_MIDI[c.name] ?? 0;
  return c.midiValues.map(v => {
    const mn = 36 + v; // base C3 = 36
    return NOTE_NAMES[mn % 12] + Math.floor(mn / 12);
  });
}

function replaceToken(
  text: string, start: number, end: number, replacement: string
): string {
  return text.slice(0, start) + replacement + text.slice(end);
}

// ─── Composant principal ────────────────────────────────────────────────

export default function ChordApp() {
  const [input, setInput] = useState('1:Fm9 1:Cm9 1:Gm9 1:Dm7');
  const [chords, setChords] = useState<ChordData[]>([]);
  const [highlighted, setHighlighted] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [tempo, setTempo] = useState(120);
  const [volume, setVolume] = useState(127);
  const [use432, setUse432] = useState(true);
  const [browserAudio, setBrowserAudio] = useState(false);
  const [tracks, setLocalTracks] = useState<TrackConfig[]>([
    { channel: 0, label: 'Lead',    program: 51, volume: 15, mute: false },
    { channel: 2, label: 'Bass',    program: 33, volume: 40, mute: false },
    { channel: 3, label: 'Nappes',  program: 48, volume: 30, mute: false },
    { channel: 9, label: 'Drums',   program: 1,  volume: 80, mute: false },
    { channel: 4, label: 'Accent',  program: 2,  volume: 20, mute: false },
  ]);

  // Fonction pour mettre a jour une track
  const updateTrack = (channel: number, cfg: Partial<TrackConfig>) => {
    setLocalTracks(prev => prev.map(t => t.channel === channel ? { ...t, ...cfg } : t));
    engineRef.current?.setTrack(channel, cfg);
  };
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

  // Autocomplétion
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const [suggestToken, setSuggestToken] = useState<{start:number;end:number} | null>(null);
  const [lastChiffrage, setLastChiffrage] = useState('');

  // Drag & drop
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Détail accord
  const [selectedChord, setSelectedChord] = useState<ChordData | null>(null);
  const selectedChordIdx = useMemo(() => {
    if (!selectedChord || chords.length === 0) return -1;
    return chords.findIndex(c =>
      c.time === selectedChord.time &&
      c.chiffrage === selectedChord.chiffrage &&
      c.name === selectedChord.name
    );
  }, [selectedChord, chords]);

  // Sauvegarder / Charger
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [savedGrilles, setSavedGrilles] = useState<Array<{name:string; input:string; tempo:number; sig:string; date:string}>>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Creation synchrone de l'engine (dispo immediatement)
  const engineRef = useRef<AudioEngine>(new AudioEngine());

  const getEngine = useCallback(async () => {
    if (!audioStarted) {
      await engineRef.current.init();
      setAudioStarted(true);
    }
    return engineRef.current;
  }, [audioStarted]);

  // Initialisation au montage
  useEffect(() => {
    getEngine();
    // Envoi initial de la config des tracks au backend
    for (const t of tracks) {
      engineRef.current.setTrack(t.channel, t);
    }
    // Envoi du 432Hz initial (defaut=true, mais backend ne le sait pas encore)
    engineRef.current?.set432Hz(use432);
  }, []);

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

  // ─── Gestion de l'input avec autocomplétion ───

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    // Calculer les suggestions
    const cursor = e.target.selectionStart ?? val.length;
    const { start, end, token } = getCurrentToken(val, cursor);
    const results = getSuggestions(token, lastChiffrage);
    setSuggestions(results);
    setSuggestIdx(0);
    if (results.length > 0) {
      setSuggestToken({ start, end });
    } else {
      setSuggestToken(null);
    }
  };

  const applySuggestion = (suggestion: string) => {
    if (!suggestToken) return;
    const newInput = replaceToken(input, suggestToken.start, suggestToken.end, suggestion);
    setInput(newInput);
    setSuggestions([]);
    setSuggestToken(null);

    // Remettre le curseur à la fin du mot remplacé
    const newCursor = suggestToken.start + suggestion.length;
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursor, newCursor);
      }
    });
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length === 0) return;

    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      applySuggestion(suggestions[suggestIdx]);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSuggestIdx(prev => Math.min(prev + 1, suggestions.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSuggestIdx(prev => Math.max(prev - 1, 0));
      return;
    }

    if (e.key === 'Escape') {
      setSuggestions([]);
      setSuggestToken(null);
      return;
    }
  };

  // ─── Play / Stop / Clear ───

  const playChordPreview = useCallback(async (chord: ChordData) => {
    const engine = await getEngine();
    if (!engine) return;

    engine.setTrack(0, { program: tracks[0].program, mute: tracks[0].mute });
    engine.setWalking(walkingBass);
    engine.set432Hz(use432);
    engine.setVolume(volume);
    engine.setDrums(!tracks[3].mute);
    engine.setBass(!tracks[1].mute);
    engine.setArpeggios(!tracks[0].mute);
    engine.setNappes(!tracks[2].mute);
    engine.setPattern(drumPattern);
    engine.setSig(sig);
    engine.onHighlight((idx) => setHighlighted(idx));

    setPlaying(true);
    setStatus('▶ Prévisualisation...');
    setStatusColor('text-green-400');

    engine.playChordPreview(chord).then(() => {
      setPlaying(false);
      setHighlighted(-1);
      if (engineRef.current && !engineRef.current.isPlaying) {
        setStatus('✅ Arrêté');
        setStatusColor('text-gray-400');
      }
    }).catch((e) => {
      setPlaying(false);
      setStatus(`❌ Erreur: ${e.message}`);
      setStatusColor('text-red-400');
    });
  }, [tempo, volume, tracks, use432, drumPattern, sig, getEngine, walkingBass]);

  const play = useCallback(async () => {
    const engine = await getEngine();
    if (!engine) return;

    let chordsToPlay = chords;
    if (chords.length === 0 && input.trim()) {
      try {
        const grille = parseGrille(input, tempo);
        chordsToPlay = grille.chords;
      } catch {}
    }
    if (chordsToPlay.length === 0) return;

    engine.setTrack(0, { program: tracks[0].program, mute: tracks[0].mute });
    engine.setWalking(walkingBass);
    engine.set432Hz(use432);
    engine.setVolume(volume);
    engine.setDrums(!tracks[3].mute);
    engine.setBass(!tracks[1].mute);
    engine.setArpeggios(!tracks[0].mute);
    engine.setNappes(!tracks[2].mute);
    engine.setPattern(drumPattern);
    engine.setSig(sig);
    engine.onHighlight((idx) => setHighlighted(idx));

    setPlaying(true);
    setStatus('▶ Lecture...');
    setStatusColor('text-green-400');

    const grille = { titre: 'Session', tempo, chords: chordsToPlay };
    engine.playGrille(grille, loopOn).then(() => {
      setPlaying(false);
      setHighlighted(-1);
      setStatus('✅ Lecture terminée');
      setStatusColor('text-green-400');
    }).catch((e) => {
      setPlaying(false);
      setStatus(`❌ Erreur: ${e.message}`);
      setStatusColor('text-red-400');
    });
  }, [chords, tempo, volume, tracks, use432, drumPattern, sig, getEngine, loopOn, input]);

  const stop = () => {
    if (engineRef.current) {
      engineRef.current.stop();
    }
    setPlaying(false);
    setHighlighted(-1);
    setStatus('■ Arrêté');
    setStatusColor('text-gray-400');
  };

  const clear = () => {
    stop();
    setChords([]);
    setHighlighted(-1);
    setStatus('Prêt');
    setStatusColor('text-gray-400');
  };

  // ─── Drag & Drop ───

  /** Reconstruit le texte de l'éditeur à partir du tableau chords */
  const rebuildInputFromChords = (newChords: ChordData[]) => {
    const newInput = newChords.map(c => `${c.time}:${c.chiffrage}`).join(' ');
    setInput(newInput);
    setChords(newChords);
    if (newChords.length > 0) {
      setLastChiffrage(newChords[newChords.length - 1].chiffrage);
    }
    setStatus('🔀 Grille réordonnée');
    setStatusColor('text-blue-400');
  };

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null);
      return;
    }
    const newChords = [...chords];
    const [moved] = newChords.splice(dragIdx, 1);
    newChords.splice(targetIdx, 0, moved);
    setDragIdx(null);
    rebuildInputFromChords(newChords);
  };

  // ─── Sauvegarder / Charger ───

  const persistGrilles = (grilles: Array<{name:string; input:string; tempo:number; sig:string; date:string}>) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(grilles));
    setSavedGrilles(grilles);
  };

  const handleSave = () => {
    if (!saveName.trim() || !input.trim()) return;
    const entry = {
      name: saveName.trim(),
      input,
      tempo,
      sig,
      date: new Date().toLocaleString('fr-FR'),
    };
    // Écraser si même nom
    const filtered = savedGrilles.filter(g => g.name !== entry.name);
    persistGrilles([...filtered, entry]);
    setShowSaveModal(false);
    setSaveName('');
    setStatus(`💾 Grille « ${entry.name} » sauvegardée`);
    setStatusColor('text-green-400');
  };

  const handleLoad = (entry: {name:string; input:string; tempo:number; sig:string}) => {
    setInput(entry.input);
    setTempo(entry.tempo);
    setSig(entry.sig);
    setShowLoadModal(false);
    setStatus(`📂 Grille « ${entry.name} » chargée`);
    setStatusColor('text-blue-400');
    // Re-parse après chargement
    setTimeout(() => {
      try {
        const grille = parseGrille(entry.input, entry.tempo);
        setChords(grille.chords);
        if (grille.chords.length > 0) {
          setLastChiffrage(grille.chords[grille.chords.length - 1].chiffrage);
        }
      } catch {}
    }, 50);
  };

  const handleDeleteSave = (name: string) => {
    persistGrilles(savedGrilles.filter(g => g.name !== name));
  };

  const handleExport = () => {
    const data = {
      type: 'chordJAVA-grille',
      version: 2,
      input,
      tempo,
      sig,
      tracks: tracks.map(t => ({ channel: t.channel, program: t.program, volume: t.volume, mute: t.mute })),
      pattern: drumPattern,
      use432Hz: use432,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chordjava-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('📤 Grille exportée en JSON');
    setStatusColor('text-green-400');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.type === 'chordJAVA-grille' && data.input) {
          setInput(data.input);
          setTempo(data.tempo || 120);
          if (data.sig) setSig(data.sig);
          if (data.tracks) {
            data.tracks.forEach((tc: any) => updateTrack(tc.channel, tc));
          } else {
            if (data.drums !== undefined) updateTrack(9, { mute: !data.drums });
            if (data.bass !== undefined) updateTrack(2, { mute: !data.bass });
            if (data.arpeggios !== undefined) updateTrack(0, { mute: !data.arpeggios });
            if (data.nappes !== undefined) updateTrack(3, { mute: !data.nappes });
            if (data.instrument !== undefined) updateTrack(0, { program: data.instrument });
          }
          if (data.pattern) setDrumPattern(data.pattern);
          if (data.use432Hz !== undefined) setUse432(data.use432Hz);
          setStatus(`📥 Grille importée depuis ${file.name}`);
          setStatusColor('text-green-400');
          setTimeout(() => {
            try {
              const grille = parseGrille(data.input, data.tempo || 120);
              setChords(grille.chords);
              if (grille.chords.length > 0) {
                setLastChiffrage(grille.chords[grille.chords.length - 1].chiffrage);
              }
            } catch {}
          }, 50);
        } else {
          setStatus('❌ Format de fichier invalide');
          setStatusColor('text-red-400');
        }
      } catch {
        setStatus('❌ Fichier JSON invalide');
        setStatusColor('text-red-400');
      }
    };
    reader.readAsText(file);
    // Reset pour permettre le même fichier
    e.target.value = '';
  };

  // ─── Effets ───

  useEffect(() => {
    const t = tracks.find(tc => tc.channel === 9);
    if (t) engineRef.current?.setDrums(!t.mute);
  }, [tracks[3].mute]);
  useEffect(() => {
    const t = tracks.find(tc => tc.channel === 2);
    if (t) engineRef.current?.setBass(!t.mute);
  }, [tracks[1].mute]);
  useEffect(() => {
    const t = tracks.find(tc => tc.channel === 0);
    if (t) engineRef.current?.setArpeggios(!t.mute);
  }, [tracks[0].mute]);
  useEffect(() => {
    const t = tracks.find(tc => tc.channel === 3);
    if (t) engineRef.current?.setNappes(!t.mute);
  }, [tracks[2].mute]);
  useEffect(() => {
    engineRef.current?.setPattern(drumPattern);
  }, [drumPattern]);
  useEffect(() => {
    engineRef.current?.setWalking(walkingBass);
  }, [walkingBass]);
  // Metronome visuel
  useEffect(() => {
    if (!playing) { setCurrentBeat(0); return; }
    const msPerBeat = 60000 / tempo;
    setCurrentBeat(0);
    const interval = setInterval(() => {
      setCurrentBeat(prev => (prev + 1) % 4);
    }, msPerBeat);
    return () => clearInterval(interval);
  }, [playing, tempo]);

  useEffect(() => {
    fetch('http://localhost:4000/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sig }),
    }).catch(() => {});
    engineRef.current?.setSig(sig);
  }, [sig]);
  useEffect(() => {
    fetch('http://localhost:4000/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempo }),
    }).catch(() => {});
    engineRef.current?.setTempo(tempo);
  }, [tempo]);

  // Récupère les samples disponibles
  const fetchSamples = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:4000/samples-list');
      if (res.ok) {
        const data = await res.json();
        setAvailableSamples(data);
      }
    } catch {}
  }, []);
  useEffect(() => { fetchSamples(); }, [fetchSamples]);

  // Envoie use_loops et loop_offset au backend
  useEffect(() => {
    fetch('http://localhost:4000/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ use_loops: useLoops }),
    }).catch(() => {});
  }, [useLoops]);
  useEffect(() => {
    fetch('http://localhost:4000/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loop_offset: loopOffset }),
    }).catch(() => {});
  }, [loopOffset]);
  useEffect(() => {
    fetch('http://localhost:4000/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loop_name: loopName }),
    }).catch(() => {});
  }, [loopName]);

  // Rafraîchir les samples dispo quand le tempo change (nouveaux samples possibles)
  useEffect(() => {
    fetchSamples();
  }, [tempo, fetchSamples]);

  // Parse automatiquement l'input avec debounce (sauf pendant autocomplétion)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (suggestions.length > 0) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      if (!input.trim()) {
        setChords([]);
        setStatus('Prêt');
        setStatusColor('text-gray-400');
        return;
      }
      try {
        const grille = parseGrille(input, tempo);
        setChords(grille.chords);
        if (grille.chords.length > 0 && !lastChiffrage) {
          setLastChiffrage(grille.chords[grille.chords.length - 1].chiffrage);
        }
      } catch {
        setChords([]);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input, tempo, suggestions.length]);

  // Modification d'un accord depuis le modal
  const handleUpdateChord = useCallback((idx: number, newText: string) => {
    const tokens = input.trim().split(/\s+/);
    if (idx >= 0 && idx < tokens.length) {
      tokens[idx] = newText;
      const newInput = tokens.join(' ');
      setInput(newInput);
      // Re-parser immediatement pour mettre a jour selectedChord
      try {
        const grille = parseGrille(newInput, tempo);
        setChords(grille.chords);
        if (grille.chords.length > 0 && idx < grille.chords.length) {
          setSelectedChord(grille.chords[idx]);
        }
      } catch {}
    }
  }, [input, tempo]);

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

        <ChordInput
          input={input}
          onChange={setInput}
        />

        {/* Controls Row 1 */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-2 sm:p-3 mb-2 overflow-x-auto">
        <ControlBar
          chords={chords}
          playing={playing}
          tempo={tempo}
          onAnalyse={parseInput}
          onPlay={play}
          onStop={stop}
          onClear={clear}
          onSave={() => { setSaveName(''); setShowSaveModal(true); }}
          onLoad={() => setShowLoadModal(true)}
          onExport={handleExport}
          onImport={() => fileInputRef.current?.click()}
          onTempoChange={(t) => setTempo(t)}
        />
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        <TrackPanel
          chords={chords}
          highlighted={highlighted}
          playing={playing}
          currentBeat={currentBeat}
          tempo={tempo}
          volume={volume}
          use432={use432}
          browserAudio={browserAudio}
          loopOn={loopOn}
          walkingBass={walkingBass}
          drumPattern={drumPattern}
          sig={sig}
          tracks={tracks}
          onSetVolume={setVolume}
          onSet432={setUse432}
          onSetBrowserAudio={(v) => { setBrowserAudio(v); engineRef.current.browserAudio = v; }}
          onSetLoop={setLoopOn}
          useLoops={useLoops}
          loopOffset={loopOffset}
          loopName={loopName}
          availableSamples={availableSamples}
          onSetWalkingBass={setWalkingBass}
          onSetDrumPattern={setDrumPattern}
          onSetSig={setSig}
          onSetTempo={setTempo}
          onUpdateTrack={updateTrack}
          loopVolume={loopVolume}
          onSetUseLoops={(v) => { setUseLoops(v); engineRef.current?.setUseLoops(v); }}
          onSetLoopOffset={(v) => { setLoopOffset(v); engineRef.current?.setLoopOffset(v); }}
          onSetLoopName={(v) => { setLoopName(v); engineRef.current?.setLoopOffset(loopOffset); }}
          onSetLoopVolume={(v) => { setLoopVolume(v); engineRef.current?.setLoopVolume(v); }}
        />

        <ProgressBar
          chords={chords}
          highlighted={highlighted}
          playing={playing}
          currentBeat={currentBeat}
          tempo={tempo}
        />
        <ChordGrid
          chords={chords}
          highlighted={highlighted}
          playing={playing}
          dragIdx={dragIdx}
          tempo={tempo}
          onClickChord={(c) => setSelectedChord(c)}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={() => setDragIdx(null)}
          onDeleteChord={(idx) => {
            const newChords = chords.filter((_, i) => i !== idx);
            if (newChords.length === 0) { clear(); }
            else { rebuildInputFromChords(newChords); }
          }}
        />

        {/* Empty state */}
        {chords.length === 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
            <Sparkles className="w-12 h-12 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-500 text-sm">Entre des accords pour commencer</p>
          </div>
        )}

        {/* ─── Modal Sauvegarder ─── */}
        {showSaveModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
               onClick={() => setShowSaveModal(false)}>
            <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-80 shadow-2xl"
                 onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-bold text-white mb-3">💾 Sauvegarder la grille</h3>
              <input
                autoFocus
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSaveModal(false); }}
                className="w-full bg-gray-800 text-white text-sm font-mono px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 outline-none mb-4"
                placeholder="Nom de la grille"
              />
              <div className="flex gap-2">
                <button onClick={handleSave}
                  disabled={!saveName.trim()}
                  className="flex-1 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-bold rounded-lg transition-colors">
                  Sauvegarder
                </button>
                <button onClick={() => setShowSaveModal(false)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-bold rounded-lg transition-colors">
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Modal Charger ─── */}
        {showLoadModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
               onClick={() => setShowLoadModal(false)}>
            <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-96 shadow-2xl max-h-[70vh] flex flex-col"
                 onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-bold text-white mb-3">📂 Grilles sauvegardées</h3>

              {savedGrilles.length === 0 ? (
                <p className="text-gray-500 text-xs py-6 text-center">Aucune grille sauvegardée</p>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-1">
                  {[...savedGrilles].reverse().map((g) => (
                    <div key={g.name}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-800 cursor-pointer group"
                      onClick={() => handleLoad(g)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-cyan-400 truncate">{g.name}</div>
                        <div className="text-[10px] text-gray-500 truncate">{g.input} · {g.tempo}bpm</div>
                      </div>
                      <div className="text-[10px] text-gray-600 hidden group-hover:block">{g.date}</div>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteSave(g.name); }}
                        className="text-gray-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-all"
                        title="Supprimer"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={() => setShowLoadModal(false)}
                className="mt-3 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-bold rounded-lg transition-colors">
                Fermer
              </button>
            </div>
          </div>
        )}


        <ChordDetailModal
          chords={chords}
          chord={selectedChord}
          chordIdx={selectedChordIdx}
          chordsCount={chords.length}
          playing={() => playing}
          onClose={() => setSelectedChord(null)}
          onTogglePlay={() => {
            if (playing) {
              stop();
            } else if (selectedChord) {
              playChordPreview(selectedChord);
            }
          }}
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
        {/* Footer */}
        <div className="text-center mt-4 text-[10px] text-gray-700">
          chordJAVA v2 by Legoeland
          &nbsp;· Render WAV · {AudioEngine.INSTRUMENTS.length} instruments · {use432 ? 'A=432Hz' : 'A=440Hz'}
        </div>

          </div>
      </div>
    </div>
  );
}
