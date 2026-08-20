/**
 * gestures.ts — fonctions pures de mapping des gestes MPE (testables).
 *
 * Partagées par tous les modules : la position d'un pointeur (ou la molette)
 * est convertie en valeurs d'expression (bend 14-bit, timbre CC74, pression,
 * vibrato LFO).
 */

import { BEND_CENTER, TIMBRE_CENTER } from './types';

/** Position X (0-1) → pitch bend 14-bit (0-16383). */
export function xToBend(x: number): number {
  const v = Math.round(Math.max(0, Math.min(1, x)) * 16383);
  return Math.max(0, Math.min(16383, v));
}

/** Position Y (0-1, 0 = haut) → timbre CC74 (0-127). */
export function yToTimbre(y: number): number {
  const v = Math.round((1 - Math.max(0, Math.min(1, y))) * 127);
  return Math.max(0, Math.min(127, v));
}

/**
 * Fraction de la hauteur de la zone pour un bend COMPLET (±range).
 *
 * Une translation verticale du poignet de ~35 % de la hauteur des keywaves
 * (≈ 2-3 cm sur une tablette) suffit pour parcourir tout le range de bend.
 */
export const RISE2_BEND_SPAN = 0.35;

/**
 * Translation verticale d'un doigt (fraction de hauteur, POSITIF = vers le
 * haut) → pitch bend 14-bit pour le RISE 2.
 *
 * La position de POSE du doigt est postulée « juste » : delta = 0 → bend
 * neutre (8192). L'accord posé est donc TOUJOURS parfaitement juste, quelles
 * que soient les hauteurs de pose des doigts ; le bend ne commence qu'avec
 * la translation du poignet (haut = aigu, bas = grave). Le bend max est
 * atteint pour une translation de `span` (défaut RISE2_BEND_SPAN).
 */
export function translationToBend(delta: number, span: number = RISE2_BEND_SPAN): number {
  const s = Math.max(0.05, Math.min(1, span));
  const d = Math.max(-1, Math.min(1, delta / s));
  return Math.max(0, Math.min(16383, Math.round(BEND_CENTER + d * BEND_CENTER)));
}

/**
 * Position X dans la keywave ([-0.5, +0.5], 0 = centre) → profondeur du
 * vibrato (LFO) en demi-tons.
 *
 * Un glissé horizontal de PETITE amplitude autour du centre module
 * l'intensité du vibrato : |xRel| / 0.5 × maxDepth. Le centre = pas de
 * vibrato ; les bords de la keywave = vibrato maximal (borné 0..maxDepth).
 */
export function xToVibrato(xRel: number, maxDepth: number): number {
  const m = Math.max(0, Math.min(24, maxDepth));
  const v = (Math.abs(Math.max(-0.5, Math.min(0.5, xRel))) / 0.5) * m;
  return Math.round(v * 10) / 10;
}

/**
 * Position X relative (0-1 sur toute la surface) → keywave touchée.
 *
 * `index` = keywave (0..count-1), `xRel` = position DANS la keywave
 * ([-0.5, +0.5], 0 = centre — la base du glide/vibrato du Seaboard).
 */
export function locateKeywave(relX: number, count: number): { index: number; xRel: number } {
  const clamped = Math.max(0, Math.min(1, relX));
  const index = Math.min(count - 1, Math.max(0, Math.floor(clamped * count)));
  const xRel = clamped * count - index - 0.5;
  return { index, xRel };
}

/** Delta de molette → nouvelle pression (0-127), pas de 4 par cran. */
export function wheelToPressure(current: number, deltaY: number): number {
  const step = Math.sign(deltaY) * 4;
  return Math.max(0, Math.min(127, current - step));
}

/**
 * Throttle avec trailing : au plus un appel par fenêtre `ms`, le dernier
 * argument de la fenêtre est envoyé en fin de fenêtre.
 */
export function throttleTrailing<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;
  return (...args: A) => {
    pending = args;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const p = pending;
      pending = null;
      if (p) fn(...p);
    }, ms);
  };
}
