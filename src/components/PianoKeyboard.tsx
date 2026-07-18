import React from 'react';

interface PianoKeyboardProps {
  /** Notes actives avec octave (ex: ['F3', 'G#3', 'C4', 'D#4', 'G4']) */
  activeNotes?: string[];
  /** Noms des notes sans octave (legacy — surligne toutes les octaves) */
  highlightedNotes?: string[];
  /** Nombre d'octaves à afficher (défaut: 2) */
  octaves?: number;
  /** Octave de départ (défaut: 3 → C3) */
  startOctave?: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_KEYS = [1, 3, 6, 8, 10];

/**
 * Mini clavier de piano 2 octaves.
 * activeNotes = ["F3","G#3","C4"] → seules ces touches s'allument.
 * highlightedNotes = ["F","G#"] (legacy) → toutes les occurrences sur 2 octaves.
 */
export default function PianoKeyboard({
  activeNotes,
  highlightedNotes,
  octaves = 2,
  startOctave = 3,
}: PianoKeyboardProps) {
  // Construire un Set pour lookup rapide
  const activeSet = new Set(activeNotes ?? []);
  const legacySet = new Set(highlightedNotes ?? []);

  const whiteKeys: { note: string; octave: number; isHighlighted: boolean }[] = [];
  const blackKeys: { note: string; octave: number; isHighlighted: boolean }[] = [];

  for (let o = startOctave; o < startOctave + octaves; o++) {
    for (let i = 0; i < 12; i++) {
      const noteName = NOTE_NAMES[i];
      const fullName = `${noteName}${o}`;
      let isHighlighted: boolean;

      if (activeSet.size > 0) {
        // Mode notes précises avec octave
        isHighlighted = activeSet.has(fullName);
      } else {
        // Mode legacy : toutes les octaves
        isHighlighted = legacySet.has(noteName);
      }

      if (WHITE_KEYS.includes(i)) {
        whiteKeys.push({ note: noteName, octave: o, isHighlighted });
      } else {
        blackKeys.push({ note: noteName, octave: o, isHighlighted });
      }
    }
  }

  const whiteKeyWidth = 100 / whiteKeys.length;

  return (
    <div className="relative w-full" style={{ height: 84 }}>
      {/* Touches blanches */}
      <div className="absolute inset-0 flex">
        {whiteKeys.map((k, i) => (
          <div
            key={`w-${k.note}${k.octave}`}
            draggable={false}
            className={`
              border-r border-gray-700 last:border-r-0
              flex items-end justify-center pb-1
              text-[8px] font-mono select-none
              transition-colors duration-150 cursor-default
              ${k.isHighlighted
                ? 'bg-blue-500 text-white font-bold shadow-inner shadow-blue-300/40 z-10'
                : 'bg-white text-gray-400'
              }
            `}
            style={{ width: `${whiteKeyWidth}%`, height: 84 }}
            title={`${k.note}${k.octave}`}
          >
            {k.note}
          </div>
        ))}
      </div>

      {/* Touches noires */}
      <div className="absolute inset-0" style={{ height: 52, pointerEvents: 'none' }}>
        {blackKeys.map((k, i) => {
          const octaveOffset = Math.floor(i / 5) * 7;
          const blackPositions = [0.6, 1.6, 3.6, 4.6, 5.6];
          const posInOctave = i % 5;
          const whiteIdx = octaveOffset + Math.floor(blackPositions[posInOctave]);

          return (
            <div
              key={`b-${k.note}${k.octave}`}
              className={`
                absolute bottom-0 rounded-b-[3px]
                transition-colors duration-150
                ${k.isHighlighted
                  ? 'bg-blue-700 shadow-inner shadow-blue-400/30 z-20'
                  : 'bg-gray-900 z-10'
                }
              `}
              style={{
                left: `calc(${whiteIdx * whiteKeyWidth}% + ${whiteKeyWidth * 0.55}%)`,
                width: `${whiteKeyWidth * 0.75}%`,
                height: 52,
              }}
              title={`${k.note}${k.octave}`}
            />
          );
        })}
      </div>

      {/* Légende en bas */}
      <div className="absolute -bottom-3.5 left-0 right-0 text-center text-[7px] text-gray-600 select-none">
        C{startOctave} — B{startOctave + octaves - 1}
      </div>
    </div>
  );
}
