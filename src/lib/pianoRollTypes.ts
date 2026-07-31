/**
 * pianoRollTypes — types purs et fonctions de conversion pour le PianoRoll.
 *
 * Définit la structure d'une note de piano (PianoNote) et les constantes
 * de rendu (pixels par beat, hauteur de touche, etc.).
 * Fournit les fonctions de conversion pixel ↔ temps/pitch avec snap to grid.
 */

// ─── Types ──────────────────────────────────────────────────────────────

export interface PianoNote {
  id: string;
  startTime: number;  // Position en beats (0, 0.25, 1.0, 4.0, etc.)
  pitch: number;      // Note MIDI (0-127, 60 = C4)
  duration: number;   // Durée en beats
  velocity: number;   // Vélocité (0-127)
}

// ─── Constantes de rendu ───────────────────────────────────────────────

/** Pixels par beat (zoom par défaut). */
export const DEFAULT_PIXELS_PER_BEAT = 96;

/** Snap minimum : 1/16 de beat (double croche). */
export const SNAP_UNIT = 1 / 16;

/** Hauteur d'une touche blanche en pixels. */
export const WHITE_KEY_HEIGHT = 16;

/** Hauteur d'une touche noire en pixels (un peu moins). */
export const BLACK_KEY_HEIGHT = 10;

/** Largeur du clavier de piano (colonne gauche). */
export const PIANO_KEYBOARD_WIDTH = 100;

/** Hauteur d'une rangée de note MIDI (pitch → y). Correspond à WHITE_KEY_HEIGHT. */
export const PITCH_ROW_HEIGHT = WHITE_KEY_HEIGHT;

/** Palette de couleurs pour la vélocité (dégradé). */
export function velocityColor(velocity: number): string {
  // De bleu foncé (faible) à jaune/rouge vif (fort)
  const t = velocity / 127;
  const r = Math.round(30 + t * 210);
  const g = Math.round(60 + t * 160);
  const b = Math.round(200 - t * 170);
  return `hsl(${220 - t * 160}, ${80 + t * 20}%, ${40 + t * 25}%)`;
}

/** Couleur d'une touche blanche par pitch (pour le clavier). */
export function pitchLabel(pitch: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(pitch / 12) - 1;
  return `${names[pitch % 12]}${octave}`;
}

/** Vrai si la note MIDI est une touche noire (dièse/bémol). */
export function isBlackKey(pitch: number): boolean {
  const chroma = pitch % 12;
  return [1, 3, 6, 8, 10].includes(chroma);
}

/** Nom court d'une note (ex: "C", "F#"). */
export function noteName(pitch: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return names[pitch % 12];
}

// ─── Conversions pixel ↔ temps ─────────────────────────────────────────

export function timeToPixels(time: number, pixelsPerBeat: number = DEFAULT_PIXELS_PER_BEAT): number {
  return time * pixelsPerBeat;
}

export function pixelsToTime(px: number, pixelsPerBeat: number = DEFAULT_PIXELS_PER_BEAT): number {
  return px / pixelsPerBeat;
}

export function pitchToPixels(pitch: number, maxPitch: number): number {
  return (maxPitch - pitch) * WHITE_KEY_HEIGHT;
}

export function pixelsToPitch(px: number, maxPitch: number): number {
  return maxPitch - Math.round(px / WHITE_KEY_HEIGHT);
}

/**
 * Snap une valeur temps au plus proche multiple de SNAP_UNIT.
 */
export function snapToGrid(time: number, unit: number = SNAP_UNIT): number {
  return Math.round(time / unit) * unit;
}

/**
 * Snap une valeur en pixels au plus proche grid vertical (pitch).
 */
export function snapPitch(pitch: number): number {
  return pitch; // Les pitches sont déjà discrets, pas besoin de snap
}

/**
 * Génère un ID unique pour une note.
 */
export function generateNoteId(): string {
  return `pn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Étendue des notes visibles (pitch min/max) pour un ensemble de notes donné,
 * avec une marge d'une octave. Retourne des valeurs sécurisées (0-127).
 */
export function getVisibleRange(
  notes: PianoNote[],
  minPitch: number = 36,
  maxPitch: number = 96,
): { minPitch: number; maxPitch: number } {
  if (notes.length === 0) return { minPitch, maxPitch };

  const pitches = notes.map(n => n.pitch);
  const min = Math.max(0, Math.min(...pitches) - 6);
  const max = Math.min(127, Math.max(...pitches) + 6);

  // Arrondir pour commencer sur un C si possible
  const cMin = Math.floor(min / 12) * 12;
  const cMax = Math.ceil(max / 12) * 12 + 11;

  return {
    minPitch: Math.max(0, cMin),
    maxPitch: Math.min(127, cMax),
  };
}
