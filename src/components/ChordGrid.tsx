/**
 * ChordGrid — affichage visuel de la grille d'accords.
 *
 * Chaque accord est affiché sur une ligne avec :
 * - Poignée de drag & drop (↕) pour réordonner
 * - Le chiffrage (ex: "Cm7") avec un code couleur
 * - La durée en temps
 * - Les notes qui composent l'accord
 * - Bouton de suppression
 *
 * L'accord en cours de lecture est surligné (highlighted).
 * Le drag & drop est désactivé pendant la lecture.
 */
import { memo } from 'react';
import { GripVertical } from 'lucide-react';
import { ChordData, durationLabel, getChordColor, getNoteColor } from '../types/chord';

interface ChordGridProps {
  chords: ChordData[];
  highlighted: number;        // Index de l'accord en cours (-1 = aucun)
  playing: boolean;
  dragIdx: number | null;     // Index de l'élément en cours de drag
  tempo: number;
  onClickChord: (c: ChordData) => void;       // Ouvre le modal de détail
  onDragStart: (idx: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (idx: number) => void;
  onDragEnd: () => void;
  onDeleteChord: (idx: number) => void;
}

function ChordGrid({
  chords, highlighted, playing, dragIdx, tempo,
  onClickChord, onDragStart, onDragOver, onDrop, onDragEnd, onDeleteChord,
}: ChordGridProps) {
  if (chords.length === 0) return null;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* En-tête avec infos session */}
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-bold text-blue-400">
          📊 Session &nbsp;|&nbsp; {tempo} bpm &nbsp;·&nbsp; {chords.length} accords
          <span className="text-[10px] text-gray-500 ml-3 font-normal">
            ↕ glisser pour réordonner
          </span>
        </h2>
      </div>

      {/* Liste des accords */}
      {chords.map((c, idx) => (
        <div
          key={idx}
          draggable={!playing}
          onDragStart={() => onDragStart(idx)}
          onDragOver={onDragOver}
          onDrop={() => onDrop(idx)}
          onDragEnd={onDragEnd}
          className={`px-3 py-3 border-b border-gray-800 last:border-0 transition-all duration-200 ${
            // Surbrillance de l'accord en cours
            highlighted === idx
              ? 'bg-gray-700/60 ring-1 ring-blue-500/30'
              : dragIdx === idx
                ? 'opacity-40 bg-gray-800'       // Élément déplacé → fantôme
                : 'hover:bg-gray-800/50'
          } ${!playing ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
          <div className="flex items-center gap-2">
            {/* Poignée de drag */}
            <span className="text-gray-600 shrink-0 select-none">
              <GripVertical className="w-3.5 h-3.5" />
            </span>

            {/* Chiffrage de l'accord (cliquable → modal détail) */}
            <button
              onClick={() => c.chiffrage !== '_' && onClickChord(c)}
              className={`w-28 shrink-0 text-left bg-transparent border-0 p-0 ${
                c.chiffrage === '_' ? 'cursor-default opacity-50' : 'cursor-pointer'
              }`}
              title="Voir les détails"
            >
              <span className="text-lg font-bold font-mono" style={{ color: getChordColor(idx) }}>
                {c.chiffrage === '_' ? '—' : c.chiffrage}
              </span>
              <span className="text-xs text-gray-500 ml-2">{durationLabel(c.time)}</span>
            </button>

            {/* Notes de l'accord (pastilles colorées) */}
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

            {/* Bouton de suppression */}
            <button
              onClick={() => onDeleteChord(idx)}
              className="ml-auto text-gray-600 hover:text-red-400 transition-colors shrink-0"
              title="Supprimer cet accord"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}


export default memo(ChordGrid);
