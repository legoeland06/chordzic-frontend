/**
 * ProgressBar — barre de progression + métronome visuel.
 *
 * Affiche :
 * - Une barre de progression qui avance au fil des accords joués
 * - Le pourcentage de progression
 * - Le compteur "accord courant / total"
 * - 4 ronds lumineux pour les temps (métronome visuel)
 *
 * Ne s'affiche que pendant la lecture (playing === true).
 */

interface ProgressBarProps {
  chords: { time: number }[];
  highlighted: number;   // Index de l'accord en cours (-1 = aucun)
  playing: boolean;
  currentBeat: number;   // Temps courant (0-3) pour le métronome
  tempo: number;
}

export default function ProgressBar({ chords, highlighted, playing, currentBeat, tempo }: ProgressBarProps) {
  // Pas de barre si pas de lecture ou pas d'accords
  if (chords.length === 0 || !playing) return null;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 mb-2">
      <div className="flex items-center gap-3">
        {/* Barre de progression — largeur = pourcentage de la grille jouée */}
        <div className="flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-300 ease-linear"
            style={{ width: `${Math.round(((highlighted + 1) / chords.length) * 100)}%` }}
          />
        </div>
        {/* Pourcentage */}
        <span className="text-[10px] text-gray-500 font-mono shrink-0">
          {Math.round(((highlighted + 1) / chords.length) * 100)}%
        </span>
        {/* Compteur */}
        <span className="text-[10px] text-gray-600 font-mono shrink-0">
          {highlighted + 1}/{chords.length}
        </span>
      </div>

      {/* Métronome visuel — 4 pastilles pour les temps 1-2-3-4 */}
      <div className="flex items-center justify-center gap-2 mt-2">
        {[0, 1, 2, 3].map(b => (
          <div
            key={b}
            className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all duration-100 ${
              currentBeat === b
                ? (b === 0
                    ? 'bg-blue-500 text-white scale-110'   // Temps 1 = bleu + grossi
                    : 'bg-gray-600 text-white')             // Autres temps = gris clair
                : 'bg-gray-800 text-gray-600'               // Inactif
            }`}
          >
            {b + 1}
          </div>
        ))}
        <span className="text-[10px] text-gray-600 ml-1">{tempo} bpm</span>
      </div>
    </div>
  );
}
