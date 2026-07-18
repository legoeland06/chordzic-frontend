export interface ChordData {
  time: number;
  name: string;
  quality: string;
  bass: string;
  chiffrage: string;
  notes: string[];
  midiValues: number[];
}

export interface GrilleData {
  titre: string;
  tempo: number;
  chords: ChordData[];
}

export const NOTE_TO_MIDI: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1,
  'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'F': 5, 'F#': 6,
  'Gb': 6, 'G': 7, 'G#': 8,
  'Ab': 8, 'A': 9, 'A#': 10,
  'Bb': 10, 'B': 11,
};

export const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

/**
 * Toutes les qualités d'accords — 70+ venues du moteur Java original.
 * Les intervalles sont en demi-tons depuis la fondamentale.
 * Les intervalles ≥ 12 ajoutent une octave (ex: 9 = 14, 13 = 21).
 */
export const QUALITY_INTERVALS: Record<string, number[]> = {
  // Triades de base
  '':       [0, 4, 7],      // Maj (par défaut)
  'M':      [0, 4, 7],      // Maj
  'maj':    [0, 4, 7],
  'min':    [0, 3, 7],
  'm':      [0, 3, 7],      // mineur
  '-':      [0, 3, 7],
  'dim':    [0, 3, 6],      // diminuée
  '(b5)':   [0, 4, 6],      // Maj b5
  'aug':    [0, 4, 8],      // augmentée
  '+':      [0, 4, 8],
  'sus2':   [0, 2, 7],
  'sus4':   [0, 5, 7],
  'sus':    [0, 5, 7],
  '5':      [0, 7],          // quinte (power chord)

  // Accords spéciaux (sans tierce)
  'no5':    [0, 4],
  'omit5':  [0, 4],
  'm(no5)': [0, 3],
  'm(omit5)': [0, 3],

  // Sixte
  '6':      [0, 4, 7, 9],
  'm6':     [0, 3, 7, 9],
  'dim6':   [0, 3, 6, 8],

  // Septième
  '7':      [0, 4, 7, 10],
  '7b5':    [0, 4, 6, 10],
  '7-5':    [0, 4, 6, 10],
  '7#5':    [0, 4, 8, 10],
  '7+5':    [0, 4, 8, 10],
  '7sus4':  [0, 5, 7, 10],
  'm7':     [0, 3, 7, 10],
  'm7b5':   [0, 3, 6, 10],
  'm7-5':   [0, 3, 6, 10],
  'm7#5':   [0, 3, 8, 10],
  'm7+5':   [0, 3, 8, 10],
  'dim7':   [0, 3, 6, 9],
  '7alt':   [0, 3, 6, 9],  // alt = dim7

  // Septième majeure
  'M7':     [0, 4, 7, 11],
  'maj7':   [0, 4, 7, 11],
  'M7#5':   [0, 4, 8, 11],
  'M7+5':   [0, 4, 8, 11],
  'mM7':    [0, 3, 7, 11],

  // Add
  'add4':     [0, 4, 5, 7],
  'Madd4':    [0, 4, 5, 7],
  'madd4':    [0, 3, 5, 7],
  'add9':     [0, 4, 7, 14],
  'Madd9':    [0, 4, 7, 14],
  'madd9':    [0, 3, 7, 14],
  'add11':    [0, 4, 7, 17],
  '2':        [0, 4, 7, 14],  // add9
  '4':        [0, 4, 7, 17],  // add11

  // Sus avec ajouts
  'sus4add9':   [0, 5, 7, 14],
  'sus4add2':   [0, 2, 5, 7],
  '9sus4':      [0, 5, 7, 10, 14],

  // Neuvième
  '9':      [0, 4, 7, 10, 14],
  'm9':     [0, 3, 7, 10, 14],
  'M9':     [0, 4, 7, 11, 14],
  'maj9':   [0, 4, 7, 11, 14],
  '9b5':    [0, 4, 6, 10, 14],
  '9-5':    [0, 4, 6, 10, 14],
  '9#5':    [0, 4, 8, 10, 14],
  '9+5':    [0, 4, 8, 10, 14],
  '7b9':    [0, 4, 7, 10, 13],
  '7-9':    [0, 4, 7, 10, 13],
  '7#9':    [0, 4, 7, 10, 15],
  '7+9':    [0, 4, 7, 10, 15],
  '7b9b5':  [0, 4, 6, 10, 13],
  '7b9#5':  [0, 4, 8, 10, 13],
  '7#9b5':  [0, 4, 6, 10, 15],
  '7#9#5':  [0, 4, 8, 10, 15],
  'm7b9b5': [0, 3, 6, 10, 13],

  // Onzième
  '11':       [0, 7, 10, 14, 17],
  'm11':      [0, 3, 7, 17],     // version simplifiée
  '7#11':     [0, 4, 7, 10, 18],
  '7+11':     [0, 4, 7, 10, 18],
  'M7#11':    [0, 4, 7, 11, 18],
  'M7+11':    [0, 4, 7, 11, 18],
  '7b9#9':    [0, 4, 7, 10, 13, 15],
  '7b9#11':   [0, 4, 7, 10, 13, 18],
  '7#9#11':   [0, 4, 7, 10, 15, 18],
  'm7add11':  [0, 3, 7, 10, 17],
  'M7add11':  [0, 4, 7, 11, 17],
  'mM7add11': [0, 3, 7, 11, 17],

  // Treizième
  '13':       [0, 4, 7, 10, 14, 21],
  '13b9':     [0, 4, 7, 10, 13, 21],
  '13-9':     [0, 4, 7, 10, 13, 21],
  '13#9':     [0, 4, 7, 10, 15, 21],
  '13+9':     [0, 4, 7, 10, 15, 21],
  '13#11':    [0, 4, 7, 10, 18, 21],
  '13+11':    [0, 4, 7, 10, 18, 21],
  '7b13':     [0, 4, 7, 10, 20],
  '7-13':     [0, 4, 7, 10, 20],
  '7b9b13':   [0, 4, 7, 10, 13, 17, 20],

  // Spéciales
  'm69':      [0, 3, 7, 9, 14],
  '69':       [0, 4, 7, 9, 14],
  'Mb5':      [0, 4, 6],
  'ø':        [0, 3, 6, 10],     // demi-diminué = m7b5
  '°':        [0, 3, 6],         // diminué

  // Neuvième #11 (attention : sans 7e, version simplifiée)
  '9#11':     [0, 4, 7, 10, 14, 18],
  '9+11':     [0, 4, 7, 10, 14, 18],

  // Majeure avec treizième
  'M7add13':  [0, 4, 7, 9, 11, 14],

  // Divers
  'm13':      [0, 3, 7, 10, 14, 21],
  'dim/M7':   [0, 3, 6, 11],
  'mb5':      [0, 4, 6],
  'm7b9':     [0, 3, 7, 10, 13],
};

export function parseChord(input: string): ChordData {
  // Formats: "4:Cmaj7" "2:Fm7" "1:Cmaj7/G" "4:G7" "4:_" (silence)
  const parts = input.split(':');
  const time = parseInt(parts[0]) || 4;
  const rest = parts[1] || parts[0];

  // Silence
  if (rest.trim() === '_') {
    return { time, name: '_', quality: '', bass: '', chiffrage: '_', notes: [], midiValues: [] };
  }

  // Extraire la basse après /
  let chordStr = rest;
  let bass = '';
  if (rest.includes('/')) {
    const split = rest.split('/');
    chordStr = split[0];
    bass = split[1];
  }

  // Extraire le nom de note fondamentale
  const noteMatch = chordStr.match(/^([A-G][#b]?)(.*)/);
  if (!noteMatch) throw new Error(`Format invalide: ${input}`);

  const name = noteMatch[1];
  const quality = noteMatch[2] || 'M';
  const bassNote = bass || name;

  // Résoudre les intervalles
  const rootVal = NOTE_TO_MIDI[name] ?? 0;
  const intervals = resolveQuality(quality);
  // rawValues = root + interval (sans modulo 12 — les octaves comptent !)
  const rawValues: number[] = [];
  for (const i of intervals) {
    const v = rootVal + i;
    // Éviter les doublons strictement identiques
    if (!rawValues.includes(v)) {
      rawValues.push(v);
    }
  }

  // Noms des notes (toujours en 0-11 pour l'affichage, mais on garde l'octave pour le MIDI)
  const notes = rawValues.map((v: number) => {
    return NOTE_NAMES[v % 12];
  });

  const chiffrage = `${name}${quality}${bass !== name ? '/' + bass : ''}`;

  return { time, name, quality, bass: bassNote, chiffrage, notes, midiValues: rawValues };
}

/** Résout une qualité avec ses alias, fallback sur Majeure si inconnue */
function resolveQuality(q: string): number[] {
  // Normalisation : enlever les parenthèses, espaces
  const cleaned = q.trim().replace(/[()]/g, '');

  // Chercher d'abord exacte
  if (QUALITY_INTERVALS[cleaned]) return QUALITY_INTERVALS[cleaned];

  // Essayer minuscule/majuscule
  const lowered = cleaned.toLowerCase();
  const uppered = cleaned.toUpperCase();
  if (QUALITY_INTERVALS[lowered]) return QUALITY_INTERVALS[lowered];
  if (QUALITY_INTERVALS[uppered]) return QUALITY_INTERVALS[uppered];

  // Fallback sur Majeure
  console.warn(`Qualité inconnue: "${q}", fallback Maj`);
  return QUALITY_INTERVALS['M'];
}

export function parseGrille(input: string, tempo: number = 120): GrilleData {
  const parts = input.trim().split(/\s+/);
  const chords = parts.map(p => parseChord(p));
  return { titre: 'Session', tempo, chords };
}

export function getChordColor(idx: number): string {
  const colors = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#f97316', '#a855f7',
                  '#ec4899', '#14b8a6', '#8b5cf6', '#f43f5e'];
  return colors[idx % colors.length];
}

export function getNoteColor(note: string): string {
  if (note.includes('#') || note.includes('b')) return '#60a5fa';
  const colors: Record<string, string> = {
    'C': '#ffffff', 'D': '#fbbf24', 'E': '#67e8f9',
    'F': '#86efac', 'G': '#fb923c', 'A': '#fca5a5', 'B': '#c4b5fd',
  };
  return colors[note] || '#d1d5db';
}
