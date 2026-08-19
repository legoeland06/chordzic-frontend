/**
 * PianoKeyboard — mini clavier de piano visuel (2 octaves).
 *
 * Affichage : touches blanches + noires disposées comme un vrai piano,
 * avec surbrillance des notes actives.
 *
 * Deux modes de surbrillance :
 * - `activeNotes` (recommandé) : notes précises avec octave → "F3", "G#4"
 *   → seules ces touches spécifiques s'allument.
 * - `highlightedNotes` (legacy) : notes sans octave → "F", "G#"
 *   → toutes les occurrences sur les 2 octaves s'allument.
 */


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

// Mapping index chromatique → nom de note
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// Indices des touches blanches dans les 12 demi-tons
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];

/**
 * Mini clavier de piano, 2 octaves (C3 à B4 par défaut).
 *
 * Layout :
 * - Touches blanches : côte à côte, largeur égale
 * - Touches noires : positionnées par-dessus, décalées selon leur position
 *   dans l'octave (positions relatives aux touches blanches)
 *
 * La hauteur totale est fixe (84px) pour s'intégrer dans le modal de détail.
 */
export default function PianoKeyboard({
  activeNotes,
  highlightedNotes,
  octaves = 2,
  startOctave = 3,
}: PianoKeyboardProps) {
  // Construire un Set pour lookup rapide (évite de re-parcourir le tableau)
  const activeSet = new Set(activeNotes ?? []);
  const legacySet = new Set(highlightedNotes ?? []);

  // Tableaux des touches avec leurs propriétés de rendu
  const whiteKeys: { note: string; octave: number; isHighlighted: boolean }[] = [];
  const blackKeys: { note: string; octave: number; isHighlighted: boolean }[] = [];

  // Générer toutes les touches sur les octaves demandées
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

  // Largeur de chaque touche blanche en pourcentage
  const whiteKeyWidth = 100 / whiteKeys.length;

  return (
    <div className="relative w-full" style={{ height: 84 }}>
      {/* ---------- Touches blanches ---------- */}
      <div className="absolute inset-0 flex">
        {whiteKeys.map((k) => (
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

      {/* ---------- Touches noires ---------- */}
      {/* Positionnées en absolu par-dessus les blanches, plus courtes (52px) */}
      <div className="absolute inset-0" style={{ height: 52, pointerEvents: 'none' }}>
        {blackKeys.map((k, i) => {
          // Positions relatives des noires dans l'octave (index des blanches)
          // Do# = entre Do et Ré, Ré# = entre Ré et Mi, etc.
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

      {/* Légende : plage d'octaves */}
      <div className="absolute -bottom-3.5 left-0 right-0 text-center text-[7px] text-gray-600 select-none">
        C{startOctave} — B{startOctave + octaves - 1}
      </div>
    </div>
  );
}
