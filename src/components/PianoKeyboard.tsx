import React from 'react';

interface PianoKeyboardProps {
  /** Noms des notes en surbrillance (ex: ['C', 'Eb', 'G', 'Bb']) */
  highlightedNotes: string[];
  /** Nombre d'octaves à afficher (défaut: 2) */
  octaves?: number;
  /** Octave de départ (défaut: 3 → C3) */
  startOctave?: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11]; // positions dans la gamme
const BLACK_KEYS = [1, 3, 6, 8, 10];       // dièses

/**
 * Mini clavier de piano 2 octaves.
 * Les notes dans `highlightedNotes` sont en surbrillance.
 */
export default function PianoKeyboard({
  highlightedNotes,
  octaves = 2,
  startOctave = 3,
}: PianoKeyboardProps) {
  // Construire la liste des touches blanches
  const whiteKeys: { note: string; octave: number; isHighlighted: boolean }[] = [];
  const blackKeys: { note: string; octave: number; isHighlighted: boolean }[] = [];

  for (let o = startOctave; o < startOctave + octaves; o++) {
    for (let i = 0; i < 12; i++) {
      const noteName = NOTE_NAMES[i];
      const isHighlighted = highlightedNotes.some(
        hn => hn.replace('#', '♯') === noteName || hn === noteName
      );
      if (WHITE_KEYS.includes(i)) {
        whiteKeys.push({ note: noteName, octave: o, isHighlighted });
      } else {
        blackKeys.push({ note: noteName, octave: o, isHighlighted });
      }
    }
  }

  const whiteKeyWidth = 100 / whiteKeys.length; // en %

  return (
    <div className="relative w-full" style={{ height: 80 }}>
      {/* Touches blanches */}
      <div className="absolute inset-0 flex">
        {whiteKeys.map((k, i) => (
          <div
            key={`w-${k.note}${k.octave}`}
            className={`
              border-r border-gray-700 last:border-r-0
              flex items-end justify-center pb-1
              text-[8px] font-mono select-none
              transition-colors duration-150
              ${k.isHighlighted
                ? 'bg-blue-500 text-white font-bold shadow-inner shadow-blue-300/30'
                : 'bg-white text-gray-400 hover:bg-gray-100'
              }
            `}
            style={{ width: `${whiteKeyWidth}%`, height: 80 }}
            title={`${k.note}${k.octave}`}
          >
            {k.note}
          </div>
        ))}
      </div>

      {/* Touches noires */}
      <div className="absolute inset-0" style={{ height: 50, pointerEvents: 'none' }}>
        {blackKeys.map((k, i) => {
          // Calculer la position de la touche noire
          // Elle se trouve entre la blanche i et i+1 dans la séquence des 12 notes
          const noteIndex = NOTE_NAMES.indexOf(k.note);
          // Trouver l'index de la touche blanche avant cette note
          let whiteIndexBefore = 0;
          for (let o = startOctave; o < startOctave + octaves; o++) {
            for (let n = 0; n < 12; n++) {
              if (n === noteIndex) break;
              if (WHITE_KEYS.includes(n)) whiteIndexBefore++;
            }
            if (NOTE_NAMES.indexOf(k.note) === noteIndex) break;
          }
          // Comptage simplifié : position relative dans les touches noires
          // Pour chaque octave: C# entre C-D (index 0), D# entre D-E (index 1),
          // F# entre F-G (index 3 dans l'octave), etc.
          const octaveOffset = Math.floor(i / 5) * 7; // 5 noires pour 7 blanches par octave
          const blackPositions = [0.6, 1.6, 3.6, 4.6, 5.6]; // positions entre blanches
          const posInOctave = i % 5;
          const whiteIdx = octaveOffset + Math.floor(blackPositions[posInOctave]);

          return (
            <div
              key={`b-${k.note}${k.octave}`}
              className={`
                absolute bottom-0 rounded-b-[3px]
                transition-colors duration-150
                ${k.isHighlighted
                  ? 'bg-blue-700 shadow-inner shadow-blue-400/30'
                  : 'bg-gray-900'
                }
              `}
              style={{
                left: `calc(${whiteIdx * whiteKeyWidth}% + ${whiteKeyWidth * 0.55}%)`,
                width: `${whiteKeyWidth * 0.75}%`,
                height: 50,
                zIndex: 10,
              }}
              title={`${k.note}${k.octave}`}
            />
          );
        })}
      </div>

      {/* Légende en bas */}
      <div className="absolute -bottom-4 left-0 right-0 text-center text-[8px] text-gray-600">
        {startOctave === 3 ? 'C3' : `C${startOctave}`}
        {' — '}
        {startOctave === 3 ? 'B4' : `B${startOctave + octaves - 1}`}
      </div>
    </div>
  );
}
