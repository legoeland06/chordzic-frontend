/**
 * gestures.ts — fonctions pures de mapping des gestes MPE (testables).
 *
 * Partagées par tous les modules : la position d'un pointeur (ou la molette)
 * est convertie en valeurs d'expression (bend 14-bit, timbre CC74, pression).
 */

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
