/**
 * Coordonnées du PianoRoll — helpers PURS (testables).
 *
 * Convention : le clavier de piano est un OVERLAY à DROITE du canvas
 * (largeur PIANO_KEYBOARD_WIDTH) ; l'origine de la grille (beat 0) est à
 * x = 0, ALIGNÉE avec les lanes compactes des autres pistes (c'était le
 * décalage : l'ancienne marge de gauche décalait tout le contenu).
 */
import { PIANO_KEYBOARD_WIDTH } from './pianoRollTypes';

/** x écran d'un beat (pixels), scrollLeft inclus. */
export function xFromBeat(beat: number, ppb: number, scrollLeft: number): number {
  return beat * ppb - scrollLeft;
}

/** Beat sous une position écran x (pixels). */
export function beatFromX(x: number, ppb: number, scrollLeft: number): number {
  return (x + scrollLeft) / ppb;
}

/** Bord gauche du clavier (overlay droit) : les pixels ≥ cette valeur
 * appartiennent au clavier. */
export function keyboardLeftEdge(viewportW: number): number {
  return Math.max(0, viewportW - PIANO_KEYBOARD_WIDTH);
}

/** Une position écran x tombe-t-elle sur le clavier (overlay droit) ? */
export function isInKeyboardZone(x: number, viewportW: number): boolean {
  return x > keyboardLeftEdge(viewportW);
}

/** Clippe un rectangle (note, marquee…) pour qu'il ne dépasse PAS sous le
 * clavier droit. Retourne { x, width } ajustés, ou null si entièrement caché. */
export function clipToKeyboard(
  x: number,
  width: number,
  viewportW: number,
): { x: number; width: number } | null {
  const edge = keyboardLeftEdge(viewportW);
  if (x >= edge) return null; // entièrement sous le clavier
  const w = Math.min(width, edge - x);
  if (w <= 0) return null;
  return { x, width: w };
}
