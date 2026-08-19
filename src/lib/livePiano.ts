/**
 * Piano Live 7 octaves — portage du rendu de `rusty-chord/src/outils.rs`
 * (app Yew, module `ui`) en TypeScript pur.
 *
 * Le rendu original génère une liste de touches `<li class="…">` avec un
 * ordre graphique fixe par octave (12 entrées : `white e`, `black cs`, …).
 * La note MIDI d'une touche vaut `35 + index + 12 × octave` (octave 0 = C2),
 * et le style des touches (dégradés, ombres, coins) vient de son style.css.
 *
 * Cette logique est extraite ici pour être testable sans DOM ; le composant
 * React (LivePiano.tsx) ne fait que la mettre en forme.
 */

export interface PianoKeyDef {
  /** Classes CSS de la touche (ex. "white e", "black cs") — ordre d'affichage. */
  cls: string;
  /** Index graphique dans l'octave (1..12, cf. ARRAY_OF_GRAPH_NOTES). */
  index: number;
  /** Touche noire ? */
  isBlack: boolean;
  /** Nom de la note (ex. "C", "C#"). */
  name: string;
}

/**
 * Ordre EXACT de `ARRAY_OF_GRAPH_NOTES` de outils.rs, conservé à
 * l'identique. Malgré les noms de classes (e, cs, d, ds, c, b, as, a,
 * gs, g, fs, f — héritage du codepen d'origine), l'ordre correspond à un
 * clavier normal : C, C#, D, D#, E, F, F#, G, G#, A, A#, B.
 */
export const GRAPH_KEYS: readonly PianoKeyDef[] = [
  { cls: 'white e', index: 1, isBlack: false, name: 'C' },
  { cls: 'black cs', index: 2, isBlack: true, name: 'C#' },
  { cls: 'white d', index: 3, isBlack: false, name: 'D' },
  { cls: 'black ds', index: 4, isBlack: true, name: 'D#' },
  { cls: 'white c', index: 5, isBlack: false, name: 'E' },
  { cls: 'white b', index: 6, isBlack: false, name: 'F' },
  { cls: 'black as', index: 7, isBlack: true, name: 'F#' },
  { cls: 'white a', index: 8, isBlack: false, name: 'G' },
  { cls: 'black gs', index: 9, isBlack: true, name: 'G#' },
  { cls: 'white g', index: 10, isBlack: false, name: 'A' },
  { cls: 'black fs', index: 11, isBlack: true, name: 'A#' },
  { cls: 'white f', index: 12, isBlack: false, name: 'B' },
];

/** Nombre d'octaves du piano Live (C2 → B8). */
export const LIVE_PIANO_OCTAVES = 7;
/** Octave de départ (0 = C2, cohérent avec le rendu original). */
export const LIVE_PIANO_START_OCTAVE = 0;

/** Première note MIDI du piano (C2). */
export const LIVE_PIANO_MIN_PITCH =
  35 + GRAPH_KEYS[0].index;
/** Dernière note MIDI du piano (B8). */
export const LIVE_PIANO_MAX_PITCH =
  35 + GRAPH_KEYS[GRAPH_KEYS.length - 1].index + 12 * (LIVE_PIANO_OCTAVES - 1);

export interface LivePianoKey extends PianoKeyDef {
  /** Note MIDI de la touche. */
  pitch: number;
  /** Octave MIDI standard (60 = C4). */
  octave: number;
  /** Nom complet note + octave (ex. "C4"). */
  noteName: string;
}

/**
 * Construit les touches du piano (7 octaves par défaut).
 * `startOctave` = 0 → les notes commencent à C2 (pitch 36).
 */
export function buildPianoKeys(
  octaves = LIVE_PIANO_OCTAVES,
  startOctave = LIVE_PIANO_START_OCTAVE,
): LivePianoKey[] {
  const keys: LivePianoKey[] = [];
  for (let o = startOctave; o < startOctave + octaves; o++) {
    for (const g of GRAPH_KEYS) {
      const pitch = 35 + g.index + 12 * o;
      const octave = Math.floor(pitch / 12) - 1;
      keys.push({
        ...g,
        pitch,
        octave,
        noteName: `${g.name}${octave}`,
      });
    }
  }
  return keys;
}

/**
 * Note MIDI → index graphique dans l'octave (1..12), ou -1 si la note est
 * hors de la plage du piano (36..119).
 */
export function pitchToGraphIndex(pitch: number): number {
  if (pitch < LIVE_PIANO_MIN_PITCH || pitch > LIVE_PIANO_MAX_PITCH) return -1;
  return ((pitch - LIVE_PIANO_MIN_PITCH) % 12) + 1;
}

/**
 * Ensemble des pitchs actifs bornés à la plage du piano.
 * (Les notes hors plage — pédales, percussions, CC… — n'illuminent rien.)
 */
export function activePitchSet(activePitches: number[]): Set<number> {
  return new Set(
    activePitches.filter(
      p => Number.isInteger(p) && p >= LIVE_PIANO_MIN_PITCH && p <= LIVE_PIANO_MAX_PITCH,
    ),
  );
}
