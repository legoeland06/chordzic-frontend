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
 * Position Y (0-1, 0 = haut) → pitch bend 14-bit pour le RISE 2.
 *
 * Le centre vertical de la keywave (y = 0.5) = bend neutre ; glisser vers le
 * HAUT = bend aigu (+8192), vers le BAS = bend grave (-8192) — comme le vrai
 * Seaboard (le glide se fait en glissant le doigt le long de la touche).
 */
export function yToBend(y: number): number {
  const v = Math.round(BEND_CENTER + (0.5 - Math.max(0, Math.min(1, y))) * 2 * BEND_CENTER);
  return Math.max(0, Math.min(16383, v));
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
