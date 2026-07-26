import PianoKeyboard from './PianoKeyboard';
import { ChordData, NOTE_NAMES, NOTE_TO_MIDI, getNoteColor } from '../types/chord';

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
  playing: () => boolean;
  onClose: () => void;
  onPlay: () => void;
}

export default function ChordDetailModal({ chords, chord, playing, onClose, onPlay}: ChordDetailModalProps) {
  if (!chord) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
         onClick={onClose}>
      <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-96 shadow-2xl overflow-y-auto"
           style={{maxHeight:'90vh'}}
           onClick={e => e.stopPropagation()}>

        {/* En-tête */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold font-mono text-white">
            {chord.time}:{chord.chiffrage}
          </h3>
	  <button onClick={onPlay} disabled={playing() || chord.length === 0} className="text-gray-500 hover:text-white text-lg">
          Jouer 
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
