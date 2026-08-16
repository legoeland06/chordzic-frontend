/**
 * Helpers purs de position de lecture — mode Navig.
 *
 * En mode « Sortie » (clic séparé, lecture SERVEUR en double canaux), le
 * navigateur ne joue aucun buffer : il n'a donc pas d'horloge audio. La tête
 * de lecture est alors estimée localement (performance.now) — ces fonctions
 * pures rendent cette logique testable (aucune dépendance DOM/audio).
 */

/** Position estimée (secondes) depuis le début de la lecture serveur.
 * `startMs` : performance.now() au démarrage ; `nowMs` : maintenant. */
export function estimatePositionSec(startMs: number, nowMs: number): number {
  return Math.max(0, (nowMs - startMs) / 1000);
}

/** Beats → secondes (tempo en BPM). */
export function secondsFromBeats(beats: number, tempo: number): number {
  return (beats * 60) / Math.max(1, tempo);
}

/** Secondes → beats (tempo en BPM). */
export function beatsFromSeconds(sec: number, tempo: number): number {
  return (Math.max(0, sec) * Math.max(1, tempo)) / 60;
}

/** start_at (beats) à envoyer au backend pour une lecture qui doit démarrer
 * à `seconds` — utilisé par le scrub en mode séparé (navig-play). */
export function navStartAtBeats(seconds: number, tempo: number): number {
  return beatsFromSeconds(seconds, tempo);
}
