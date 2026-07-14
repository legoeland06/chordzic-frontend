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

export function parseChord(input: string): ChordData {
  // Formats: "4:Cmaj7" "2:Fm7" "1:Cmaj7/G" "4:G7"
  const parts = input.split(':');
  const time = parseInt(parts[0]) || 4;
  const rest = parts[1] || parts[0];

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

  // Calculer les notes
  const rootVal = NOTE_TO_MIDI[name] ?? 0;
  const qualityIntervals = QUALITY_INTERVALS[quality] || [0, 4, 7]; // Maj par défaut

  const rawValues = qualityIntervals.map((i: number) => (rootVal + i) % 12);
  const notes = rawValues.map((v: number) => {
    return Object.entries(NOTE_TO_MIDI).find(([, val]) => val === v)?.[0] || '?';
  });

  const chiffrage = `${name}${quality}${bass !== name ? '/' + bass : ''}`;

  return { time, name, quality, bass: bassNote, chiffrage, notes, midiValues: rawValues };
}

export const QUALITY_INTERVALS: Record<string, number[]> = {
  '': [0, 4, 7],
  'M': [0, 4, 7],
  'm': [0, 3, 7],
  'maj7': [0, 4, 7, 11],
  'M7': [0, 4, 7, 11],
  '7': [0, 4, 7, 10],
  'm7': [0, 3, 7, 10],
  'maj9': [0, 4, 7, 11, 14],
  'M9': [0, 4, 7, 11, 14],
  '9': [0, 4, 7, 10, 14],
  'm9': [0, 3, 7, 10, 14],
  'dim': [0, 3, 6],
  'dim7': [0, 3, 6, 9],
  'aug': [0, 4, 8],
  'sus4': [0, 5, 7],
  'sus2': [0, 2, 7],
  '6': [0, 4, 7, 9],
  'm6': [0, 3, 7, 9],
  '7sus4': [0, 5, 7, 10],
  '13': [0, 4, 7, 10, 14, 21],
  'm13': [0, 3, 7, 10, 14, 21],
  'dim/M7': [0, 3, 6, 11],
  'm7b5': [0, 3, 6, 10],
  'mM7': [0, 3, 7, 11],
  'mb5': [0, 4, 6],
  'm7b9': [0, 3, 7, 10, 13],
  '7b9': [0, 4, 7, 10, 13],
  '7#9': [0, 4, 7, 10, 15],
  '7b13': [0, 4, 7, 10, 20],
  '7#11': [0, 4, 7, 10, 18],
  'Mb5': [0, 4, 6],
  '+': [0, 4, 8],
  '°': [0, 3, 6],
  'ø': [0, 3, 6, 10],
};

export function parseGrille(input: string, tempo: number = 120): GrilleData {
  const parts = input.trim().split(/\s+/);
  const chords = parts.map(p => parseChord(p));
  return { titre: 'Session', tempo, chords };
}

export function getChordColor(idx: number): string {
  const colors = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#f97316', '#a855f7'];
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
