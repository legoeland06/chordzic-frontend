import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Square, Trash2, Sparkles, Music, Volume2, Gauge, Save, FolderOpen, GripVertical } from 'lucide-react';

// ─── Constantes ─────────────────────────────────────────────────────────
const STORAGE_KEY = 'chordjava_saved_grilles';
import { parseGrille, getChordColor, getNoteColor, ChordData, NOTE_NAMES, NOTE_TO_MIDI, QUALITY_INTERVALS } from '../types/chord';
import { AudioEngine, TrackConfig } from '../lib/audioEngine';
import PianoKeyboard from './PianoKeyboard';

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
  const [tempo, setTempo] = useState(120);
  const [volume, setVolume] = useState(127);
  const [use432, setUse432] = useState(true);
  const [tracks, setLocalTracks] = useState<TrackConfig[]>([
    { channel: 0, label: 'Lead',    program: 51, volume: 15, mute: false },
    { channel: 2, label: 'Bass',    program: 33, volume: 40, mute: false },
    { channel: 3, label: 'Nappes',  program: 48, volume: 30, mute: false },
    { channel: 9, label: 'Drums',   program: 1,  volume: 80, mute: false },
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
              <h1 className="text-xl font-bold text-white">chordJAVA</h1>
              <p className="text-xs text-gray-500">Moteur Harmonique</p>
            </div>
          </div>
          <span className={`text-xs font-mono ${statusColor}`}>{status}</span>
        </div>

        {/* Input avec autocomplétion */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-4 relative">
          <label className="text-xs text-gray-500 mb-2 block font-mono">
            Accords (ex: 4:Cm7 2:FM7 4:G7 4:C) — <span className="text-blue-400">Tab</span> pour compléter
          </label>
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onBlur={() => { setTimeout(() => { setSuggestions([]); setSuggestToken(null); }, 200); }}
            rows={2}
            className="w-full bg-gray-800 text-white text-sm font-mono px-4 py-3 rounded-lg border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
            placeholder="4:Cm7 2:FM7 4:G7 4:C"
          />

          {/* Liste de suggestions */}
          {suggestions.length > 0 && suggestToken && (
            <div className="absolute left-4 z-50 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden"
                 style={{ top: '100%', minWidth: 160, maxHeight: 280 }}>
              {suggestions.map((s, i) => (
                <button
                  key={s}
                  onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
                  className={`w-full text-left px-4 py-2 text-xs font-mono transition-colors ${
                    i === suggestIdx
                      ? 'bg-blue-700 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {s}
                </button>
              ))}
              <div className="px-4 py-1.5 text-[10px] text-gray-500 border-t border-gray-700">
                ↑↓ naviguer · Tab/Enter valider · Esc fermer
              </div>
            </div>
          )}
        </div>

        {/* Controls Row 1 */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-2 sm:p-3 mb-2 overflow-x-auto">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
            <button onClick={parseInput}
              className="px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors shrink-0">
              Analyser
            </button>
            <button onClick={play} disabled={playing || chords.length === 0}
              className="px-3 sm:px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0">
              <Play className="w-3 h-3" /> Jouer
            </button>
            <button onClick={stop}
              className="px-3 sm:px-4 py-2 bg-red-800 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0">
              <Square className="w-3 h-3" /> Stop
            </button>
            <button onClick={clear}
              className="px-3 sm:px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0">
              <Trash2 className="w-3 h-3" /> Effacer
            </button>

            <div className="w-px h-5 bg-gray-700 mx-0.5 shrink-0" />

            <button onClick={() => { setSaveName(''); setShowSaveModal(true); }}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-emerald-400 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0">
              <Save className="w-3 h-3" /> Save
            </button>
            <button onClick={() => setShowLoadModal(true)}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-cyan-400 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0">
              <FolderOpen className="w-3 h-3" /> Load
            </button>
            <button onClick={handleExport}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-orange-400 text-xs font-bold rounded-lg transition-colors shrink-0" title="Exporter">
              📤
            </button>
            <button onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-orange-400 text-xs font-bold rounded-lg transition-colors shrink-0" title="Importer">
              📥
            </button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport}
              className="hidden" />

            <div className="w-px h-5 bg-gray-700 mx-0.5 shrink-0" />



            <div className="w-px h-5 bg-gray-700 mx-0.5 shrink-0" />

            <Gauge className="w-3 h-3 text-gray-500 shrink-0" />
            <span className="text-xs text-gray-500 shrink-0">Tempo:</span>
            <input type="range" min={40} max={220} value={tempo}
              onChange={(e) => setTempo(parseInt(e.target.value))}
              className="w-16 sm:w-20 accent-blue-500 shrink-0" />
            <span className="text-xs font-bold text-blue-400 w-10 shrink-0">{tempo}</span>
          </div>
        </div>

        {/* Tracks Panel */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-2 sm:p-3 mb-4">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <Volume2 className="w-3 h-3 text-gray-500 shrink-0" />
            <span className="text-xs text-gray-500 shrink-0">Vol:</span>
            <input type="range" min={10} max={127} value={volume}
              onChange={(e) => setVolume(parseInt(e.target.value))}
              className="w-16 sm:w-20 accent-green-500 shrink-0" />
            <span className="text-xs text-gray-400 w-6 shrink-0">{volume}</span>

            <button
              onClick={() => setUse432(!use432)}
              className={`px-2 py-1.5 text-xs font-bold rounded-lg border transition-colors shrink-0 ${
                use432
                  ? 'bg-yellow-900/40 border-yellow-600 text-yellow-400'
                  : 'bg-gray-800 border-gray-700 text-gray-500'
              }`}
            >
              432Hz {use432 ? '●' : '○'}
            </button>

            <button
              onClick={() => setLoopOn(!loopOn)}
              className={`px-2 py-1.5 text-xs font-bold rounded-lg border transition-colors shrink-0 ${
                loopOn
                  ? 'bg-purple-900/40 border-purple-500 text-purple-400'
                  : 'bg-gray-800 border-gray-700 text-gray-500'
              }`}
              disabled={playing}
            >
              🔄 Loop
            </button>

            <button
              onClick={() => setWalkingBass(!walkingBass)}
              className={`px-2 py-1.5 text-xs font-bold rounded-lg border transition-colors shrink-0 ${
                walkingBass
                  ? 'bg-pink-900/40 border-pink-500 text-pink-400'
                  : 'bg-gray-800 border-gray-700 text-gray-500'
              }`}
            >
              🎵 WB
            </button>

            <span className="text-xs text-gray-500 shrink-0">Pattern:</span>
            <select value={drumPattern}
              onChange={e => setDrumPattern(e.target.value)}
              className="bg-gray-800 text-orange-400 text-xs px-2 py-1.5 rounded-lg border border-gray-700 outline-none shrink-0">
              <option value="rock">🎸 Rock</option>
              <option value="pop">🎤 Pop</option>
              <option value="reggae">🌴 Reggae</option>
              <option value="onedrop">⏬ OneDrop</option>
              <option value="bossa">🌊 Bossa</option>
              <option value="jazz">🎷 Jazz</option>
            </select>

            <span className="text-xs text-gray-500 shrink-0">Mesure:</span>
            <select value={sig}
              onChange={e => setSig(e.target.value)}
              className="bg-gray-800 text-teal-400 text-xs px-2 py-1.5 rounded-lg border border-gray-700 outline-none shrink-0">
              <option value="4/4">4/4</option>
              <option value="3/4">3/4</option>
              <option value="6/8">6/8</option>
            </select>
          </div>

          {/* Tracks individuelles */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {tracks.map(t => (
              <div key={t.channel}
                className={`rounded-lg border px-3 py-2 ${
                  t.mute ? 'border-gray-800 bg-gray-900/30 opacity-50' : 'border-gray-700 bg-gray-800/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold" style={{
                    color: t.channel === 0 ? '#60a5fa' : t.channel === 2 ? '#fbbf24' : t.channel === 3 ? '#c084fc' : '#f87171'
                  }}>
                    {t.channel === 0 ? '🎹' : t.channel === 2 ? '🎸' : t.channel === 3 ? '🎻' : '🥁'} {t.label}
                  </span>
                  <button
                    onClick={() => updateTrack(t.channel, { mute: !t.mute })}
                    className={`text-xs px-2 py-0.5 rounded font-bold ${
                      t.mute
                        ? 'bg-red-900/40 text-red-400'
                        : 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {t.mute ? 'MUTE' : 'On'}
                  </button>
                </div>

                {t.channel !== 9 ? (
                  <select
                    value={t.program}
                    onChange={e => updateTrack(t.channel, { program: parseInt(e.target.value) })}
                    className="w-full bg-gray-900 text-xs px-1.5 py-1 rounded border border-gray-700 outline-none mb-1.5"
                    style={{ color: t.channel === 0 ? '#60a5fa' : t.channel === 2 ? '#fbbf24' : '#c084fc' }}
                  >
                    {AudioEngine.INSTRUMENTS.map((name, i) => (
                      <option key={i} value={i}>{name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="h-6" />
                )}

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 w-4">Vol</span>
                  <input
                    type="range"
                    min={1} max={127}
                    value={t.volume}
                    onChange={e => updateTrack(t.channel, { volume: parseInt(e.target.value) })}
                    className="flex-1 h-1 accent-blue-500"
                  />
                  <span className="text-[10px] text-gray-500 w-6 text-right">{t.volume}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chord Grid */}
        {chords.length > 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-800">
              <h2 className="text-sm font-bold text-blue-400">
                📊 Session &nbsp;|&nbsp; {tempo} bpm &nbsp;·&nbsp; {chords.length} accords
                <span className="text-[10px] text-gray-500 ml-3 font-normal">
                  ↕ glisser pour réordonner
                </span>
              </h2>
            </div>

            {/* Chord cards — drag & drop */}
            {chords.map((c, idx) => (
              <div
                key={idx}
                draggable={!playing}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(idx)}
                onDragEnd={() => setDragIdx(null)}
                className={`px-3 py-3 border-b border-gray-800 last:border-0 transition-all duration-200 ${
                  highlighted === idx
                    ? 'bg-gray-700/60 ring-1 ring-blue-500/30'
                    : dragIdx === idx
                      ? 'opacity-40 bg-gray-800'
                      : 'hover:bg-gray-800/50'
                } ${!playing ? 'cursor-grab active:cursor-grabbing' : ''}`}
              >
                <div className="flex items-center gap-2">
                  {/* Drag handle */}
                  <span className="text-gray-600 shrink-0 select-none">
                    <GripVertical className="w-3.5 h-3.5" />
                  </span>

                  {/* Chord name — clic = détail */}
                  <button
                    onClick={() => c.chiffrage !== '_' && setSelectedChord(c)}
                    className={`w-28 shrink-0 text-left bg-transparent border-0 p-0 ${c.chiffrage === '_' ? 'cursor-default opacity-50' : 'cursor-pointer'}`}
                    title="Voir les détails"
                  >
                    <span
                      className="text-lg font-bold font-mono"
                      style={{ color: getChordColor(idx) }}
                    >
                      {c.chiffrage === '_' ? '—' : c.chiffrage}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">{c.time}t</span>
                  </button>

                  {/* Notes */}
                  <div className="flex flex-wrap gap-1.5">
                    {c.notes.map((note, ni) => (
                      <span
                        key={ni}
                        className="px-2.5 py-1 rounded-md text-xs font-mono font-bold border"
                        style={{
                          color: getNoteColor(note),
                          backgroundColor: 'rgba(40,40,40,0.8)',
                          borderColor: 'rgba(60,60,60,0.8)',
                        }}
                      >
                        {note}
                      </span>
                    ))}
                  </div>

                  {/* Delete single chord */}
                  <button
                    onClick={() => {
                      const newChords = chords.filter((_, i) => i !== idx);
                      if (newChords.length === 0) {
                        clear();
                      } else {
                        rebuildInputFromChords(newChords);
                      }
                    }}
                    className="ml-auto text-gray-600 hover:text-red-400 transition-colors shrink-0"
                    title="Supprimer cet accord"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

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

        {/* ─── Modal Détail d'accord ─── */}
        {selectedChord && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
               onClick={() => setSelectedChord(null)}>
            <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-96 shadow-2xl overflow-y-auto"
                 style={{maxHeight:'90vh'}}
                 onClick={e => e.stopPropagation()}>

              {/* En-tête */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold font-mono text-white">
                  {selectedChord.time}:{selectedChord.chiffrage}
                </h3>
                <button onClick={() => setSelectedChord(null)}
                  className="text-gray-500 hover:text-white text-lg">✕</button>
              </div>

              {/* Infos */}
              <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                  <div className="text-[10px] text-gray-500 uppercase">Fondamentale</div>
                  <div className="text-white font-bold font-mono">{selectedChord.name}</div>
                </div>
                <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                  <div className="text-[10px] text-gray-500 uppercase">Qualité</div>
                  <div className="text-cyan-400 font-bold font-mono">{selectedChord.quality || 'Majeure'}</div>
                </div>
                <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                  <div className="text-[10px] text-gray-500 uppercase">Basse</div>
                  <div className="text-amber-400 font-bold font-mono">{selectedChord.bass === selectedChord.name ? '(fond.)' : selectedChord.bass}</div>
                </div>
                <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                  <div className="text-[10px] text-gray-500 uppercase">Durée</div>
                  <div className="text-gray-300 font-bold font-mono">{selectedChord.time} temps</div>
                </div>
              </div>

              {/* Piano */}
              <div className="mb-4">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2 block">
                  Clavier
                </label>
                <div className="bg-gray-800/40 rounded-lg px-2 pt-2 pb-3">
                  <PianoKeyboard activeNotes={notesWithOctave(selectedChord)} />
                </div>
              </div>

              {/* Notes composants */}
              <div className="mb-3">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2 block">
                  Notes
                </label>
                <div className="flex flex-wrap gap-2">
                  {selectedChord.notes.map((note, ni) => {
                    // Calculer l'intervalle depuis la fondamentale
                    const rootVal = NOTE_TO_MIDI[selectedChord.name] ?? 0;
                    const noteVal = NOTE_TO_MIDI[note] ?? 0;
                    const interval = ((noteVal - rootVal) % 12 + 12) % 12;
                    const intervalNames = ['P1','m2','M2','m3','M3','P4','b5','P5','m6','M6','m7','M7'];
                    const intervalName = intervalNames[interval];
                    return (
                      <div key={ni} title={`Intervalle: ${intervalName} (${interval} demi-tons)`}
                        className="flex flex-col items-center px-3 py-2 rounded-lg border"
                        style={{
                          backgroundColor: 'rgba(40,40,40,0.8)',
                          borderColor: 'rgba(60,60,60,0.8)',
                        }}
                      >
                        <span className="text-sm font-bold font-mono"
                          style={{ color: getNoteColor(note) }}>
                          {note}
                        </span>
                        <span className="text-[10px] text-gray-500 mt-0.5">{intervalName}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* MIDI values */}
              {selectedChord.midiValues.length > 0 && (
                <div className="mb-3">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2 block">
                    MIDI raw
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedChord.midiValues.map((v, i) => (
                      <span key={i}
                        className="px-2 py-1 bg-gray-800 rounded text-[11px] font-mono text-gray-400 border border-gray-700">
                        {v}
                      </span>
                    ))}
                    <span className="text-[10px] text-gray-600 self-center ml-1">
                      (+{NOTE_TO_MIDI[selectedChord.name]??0} racine)
                    </span>
                  </div>
                </div>
              )}

              {/* Mini synthèse */}
              <div className="bg-gray-800/50 rounded-lg p-3 mt-2">
                <p className="text-[11px] text-gray-400 font-mono leading-relaxed">
                  <span className="text-blue-400">{selectedChord.name}</span>
                  {selectedChord.quality && <span className="text-cyan-400">{selectedChord.quality}</span>}
                  {selectedChord.bass !== selectedChord.name && (
                    <span className="text-amber-400">/{selectedChord.bass}</span>
                  )}
                  {' → '}
                  <span style={{ color: getNoteColor(selectedChord.notes[0]) }}>{selectedChord.notes[0]}</span>
                  {selectedChord.notes.slice(1).map((n, i) => (
                    <span key={i} style={{ color: getNoteColor(n) }}>, {n}</span>
                  ))}
                </p>
              </div>

              {/* Bouton fermer */}
              <button onClick={() => setSelectedChord(null)}
                className="w-full mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-bold rounded-lg transition-colors">
                Fermer
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-4 text-[10px] text-gray-700">
          chordJAVA v2 by Legoeland — <a href="mailto:ericbruneau@gmail.com" class="text-blue-500 hover:text-blue-400">ericbruneau@gmail.com</a>
          &nbsp;· Tone.js · {AudioEngine.INSTRUMENTS.length} instruments · {use432 ? 'A=432Hz' : 'A=440Hz'}
        </div>

      </div>
    </div>
  );
}
