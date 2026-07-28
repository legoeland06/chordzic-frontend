import { useState, useRef, useEffect } from 'react';
import PianoKeyboard from './PianoKeyboard';
import { ChordData, NOTE_NAMES, NOTE_TO_MIDI, getNoteColor, QUALITY_INTERVALS } from '../types/chord';

// ─── Autocompletion ─────────
const NOTE_PATTERN = /^([A-G][#b]?)(.*)/;
const QUALITY_NAMES = Object.keys(QUALITY_INTERVALS)
  .filter(k => k && k !== 'M' && k !== '')
  .sort((a, b) => a.length - b.length || a.localeCompare(b));

function getSuggestions(token: string): string[] {
  if (!token || !token.includes(':')) return [];
  const colonIdx = token.indexOf(':');
  const timePart = token.slice(0, colonIdx + 1); // "4:"
  const rest = token.slice(colonIdx + 1); // "Cm7"

  const noteMatch = rest.match(NOTE_PATTERN);
  if (!noteMatch) return [];

  const noteName = noteMatch[1];
  const partialQuality = noteMatch[2].toLowerCase();

  if (partialQuality === rest.toLowerCase()) {
    // Pas encore de qualite → juste la fondamentale → proposer maj
    return [`${timePart}${noteName}`, `${timePart}${noteName}m`, `${timePart}${noteName}7`, `${timePart}${noteName}M7`];
  }

  const results: string[] = [];
  for (const q of QUALITY_NAMES) {
    if (q.toLowerCase().startsWith(partialQuality)) {
      results.push(timePart + noteName + q);
    }
  }
  return results.slice(0, 12);
}

function notesWithOctave(c: ChordData): string[] {
  const rv = NOTE_TO_MIDI[c.name] ?? 0;
  return c.midiValues.map(v => {
    const mn = 36 + v;
    return NOTE_NAMES[mn % 12] + Math.floor(mn / 12);
  });
}

const INTERVAL_NAMES = ['P1','m2','M2','m3','M3','P4','b5','P5','m6','M6','m7','M7'];

interface ChordDetailModalProps {
  chords: { time: number }[];
  chord: ChordData | null;
  chordIdx: number;
  chordsCount: number;
  playing: () => boolean;
  onClose: () => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onUpdateChord: (idx: number, text: string) => void;
}

export default function ChordDetailModal({ chords, chord, chordIdx, chordsCount, playing, onClose, onTogglePlay, onPrev, onNext, onUpdateChord}: ChordDetailModalProps) {
  const [editText, setEditText] = useState('');
  const [editing, setEditing] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mettre a jour le texte local quand l'accord change
  useEffect(() => {
    if (chord && !editing) {
      setEditText(`${chord.time}:${chord.chiffrage}`);
    }
  }, [chord, editing]);

  const commitEdit = () => {
    if (!editText.trim() || chordIdx < 0) return;
    onUpdateChord(chordIdx, editText.trim());
    setEditing(false);
    setSuggestions([]);
  };

  const applySuggestion = (suggestion: string) => {
    setEditText(suggestion);
    setSuggestions([]);
    setSuggestIdx(0);
    inputRef.current?.focus();
    // Placer le curseur a la fin
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(suggestion.length, suggestion.length);
      }
    });
  };

  if (!chord) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
         onClick={onClose}>
      <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-96 shadow-2xl overflow-y-auto"
           style={{maxHeight:'90vh'}}
           onClick={e => e.stopPropagation()}>

        {/* En-tête */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={onPrev}
            disabled={chordIdx <= 0}
            className="text-gray-500 hover:text-white text-lg disabled:opacity-30 disabled:cursor-not-allowed">
            ◀
          </button>
          <div className="flex items-center gap-3 relative">
            {editing ? (
              <>
                <input
                  ref={inputRef}
                  autoFocus
                  value={editText}
                  onChange={e => {
                    const val = e.target.value;
                    setEditText(val);
                    const results = getSuggestions(val);
                    setSuggestions(results);
                    setSuggestIdx(0);
                  }}
                  onKeyDown={e => {
                    if (suggestions.length > 0) {
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
                        return;
                      }
                    }
                    if (e.key === 'Enter') commitEdit();
                    if (e.key === 'Escape') { setEditing(false); setEditText(`${chord.time}:${chord.chiffrage}`); setSuggestions([]); }
                  }}
                  onBlur={() => {
                    // Donner le temps de cliquer sur une suggestion
                    setTimeout(() => { setSuggestions([]); }, 200);
                    commitEdit();
                  }}
                  className="bg-gray-800 text-white text-xl font-bold font-mono px-3 py-1 rounded-lg border border-blue-500 outline-none w-40"
                />
                {/* Dropdown suggestions */}
                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden min-w-[8rem]">
                    {suggestions.map((s, i) => (
                      <div key={i}
                        onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
                        className={`px-3 py-1.5 text-sm font-mono cursor-pointer transition-colors ${
                          i === suggestIdx
                            ? 'bg-blue-700 text-white'
                            : 'text-gray-300 hover:bg-gray-700'
                        }`}>
                        {s}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <h3
                onClick={() => { setEditing(true); setEditText(`${chord.time}:${chord.chiffrage}`); }}
                className="text-xl font-bold font-mono text-white cursor-pointer hover:text-blue-400 transition-colors"
                title="Cliquer pour modifier"
              >
                {chord.time}:{chord.chiffrage}
              </h3>
            )}
            <span className="text-[10px] text-gray-600 font-mono">
              {chordIdx + 1}/{chordsCount}
            </span>
          </div>
          <button onClick={onNext}
            disabled={chordIdx >= chordsCount - 1}
            className="text-gray-500 hover:text-white text-lg disabled:opacity-30 disabled:cursor-not-allowed">
            ▶
          </button>

          <button onClick={onTogglePlay}
            disabled={!chord || chord.midiValues.length === 0}
            className={`text-lg font-bold px-3 py-1 rounded-lg transition-colors ${
              playing()
                ? 'bg-red-800 hover:bg-red-700 text-red-300'
                : 'bg-emerald-800 hover:bg-emerald-700 text-emerald-300'
            }`}>
            {playing() ? '■ Arrêter' : '▶ Jouer'}
          </button>

          <button onClick={onClose}
            className="text-gray-500 hover:text-white text-lg">✕</button>
        </div>

        {/* Infos */}
        <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
          <div className="bg-gray-800/60 rounded-lg px-3 py-2">
            <div className="text-[10px] text-gray-500 uppercase">Fondamentale</div>
            <div className="text-white font-bold font-mono">{chord.name}</div>
          </div>
          <div className="bg-gray-800/60 rounded-lg px-3 py-2">
            <div className="text-[10px] text-gray-500 uppercase">Qualité</div>
            <div className="text-cyan-400 font-bold font-mono">{chord.quality || 'Majeure'}</div>
          </div>
          <div className="bg-gray-800/60 rounded-lg px-3 py-2">
            <div className="text-[10px] text-gray-500 uppercase">Basse</div>
            <div className="text-amber-400 font-bold font-mono">{chord.bass === chord.name ? '(fond.)' : chord.bass}</div>
          </div>
          <div className="bg-gray-800/60 rounded-lg px-3 py-2">
            <div className="text-[10px] text-gray-500 uppercase">Durée</div>
            <div className="text-gray-300 font-bold font-mono">{chord.time} temps</div>
          </div>
        </div>

        {/* Piano */}
        <div className="mb-4">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2 block">
            Clavier
          </label>
          <div className="bg-gray-800/40 rounded-lg px-2 pt-2 pb-3">
            <PianoKeyboard activeNotes={notesWithOctave(chord)} />
          </div>
        </div>

        {/* Notes composants */}
        <div className="mb-3">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2 block">
            Notes
          </label>
          <div className="flex flex-wrap gap-2">
            {chord.notes.map((note, ni) => {
              const rootVal = NOTE_TO_MIDI[chord.name] ?? 0;
              const noteVal = NOTE_TO_MIDI[note] ?? 0;
              const interval = ((noteVal - rootVal) % 12 + 12) % 12;
              const intervalName = INTERVAL_NAMES[interval];
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
        {chord.midiValues.length > 0 && (
          <div className="mb-3">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2 block">
              MIDI raw
            </label>
            <div className="flex flex-wrap gap-1.5">
              {chord.midiValues.map((v, i) => (
                <span key={i}
                  className="px-2 py-1 bg-gray-800 rounded text-[11px] font-mono text-gray-400 border border-gray-700">
                  {v}
                </span>
              ))}
              <span className="text-[10px] text-gray-600 self-center ml-1">
                (+{NOTE_TO_MIDI[chord.name]??0} racine)
              </span>
            </div>
          </div>
        )}

        {/* Mini synthèse */}
        <div className="bg-gray-800/50 rounded-lg p-3 mt-2">
          <p className="text-[11px] text-gray-400 font-mono leading-relaxed">
            <span className="text-blue-400">{chord.name}</span>
            {chord.quality && <span className="text-cyan-400">{chord.quality}</span>}
            {chord.bass !== chord.name && (
              <span className="text-amber-400">/{chord.bass}</span>
            )}
            {' → '}
            <span style={{ color: getNoteColor(chord.notes[0]) }}>{chord.notes[0]}</span>
            {chord.notes.slice(1).map((n, i) => (
              <span key={i} style={{ color: getNoteColor(n) }}>, {n}</span>
            ))}
          </p>
        </div>

        {/* Bouton fermer */}
        <button onClick={onClose}
          className="w-full mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-bold rounded-lg transition-colors">
          Fermer
        </button>
      </div>
    </div>
  );
}
