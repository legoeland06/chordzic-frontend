/**
 * sampleLoop.ts — fonctions pures de la boucle sample (mode Navig).
 *
 * Séparées du moteur Web Audio pour être testables unitairement
 * (notamment le calcul de phase avec décalage NÉGATIF).
 */

/** Borne du décalage de phase (ms) : −200..+200. */
export const SAMPLE_OFFSET_MIN = -200;
export const SAMPLE_OFFSET_MAX = 200;

/** Volume par défaut du sample (0-100) — volontairement DOUX (55 ≈ −3 dB
 * vs 80) : les samples bruts sont souvent plus forts que le rendu
 * FluidSynth. Le slider reste disponible en aval pour ajuster. */
export const DEFAULT_SAMPLE_VOLUME = 55;

/** Vrai si le sample (nom complet, ex. « snap5_160.wav ») appartient au
 * bucket de clés du tempo donné — utilisé pour rebasculer automatiquement
 * le sample quand on CHANGE de tempo. */
export function sampleBelongsToTempo(
  sample: string,
  tempo: number,
  bucketKeys: string[],
): boolean {
  return bucketKeys.some((s) => sample === `${s}_${tempo}.wav`);
}

/** Borne une valeur de décalage dans [MIN, MAX]. */
export function clampSampleOffset(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.max(SAMPLE_OFFSET_MIN, Math.min(SAMPLE_OFFSET_MAX, ms));
}

/**
 * Position de lecture dans le sample (secondes) pour la position courante
 * du morceau et un décalage de phase donné.
 *
 * `phase = (position_du_morceau + décalage) mod durée_du_sample`
 * — le double modulo garantit un résultat dans [0, durée) même pour un
 * décalage NÉGATIF (le sample est tiré en arrière dans le temps).
 */
export function computeSamplePhase(
  positionSec: number,
  offsetMs: number,
  durationSec: number,
): number {
  if (!(durationSec > 0)) return 0;
  const shifted = positionSec + offsetMs / 1000;
  let phase = ((shifted % durationSec) + durationSec) % durationSec;
  // Robustesse flottante : un résultat à ε près de la durée (ex. 3,9999…
  // pour 4 s) est en réalité le DÉBUT du sample — le normaliser à 0 évite
  // de jouer un échantillon quasi vide en fin de buffer.
  const eps = durationSec * 1e-12;
  if (phase < eps || phase > durationSec - eps) phase = 0;
  return phase;
}
