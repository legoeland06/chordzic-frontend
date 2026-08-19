/**
 * Conversion des notes jouées sur le clavier (mode Live) en notes de piano
 * roll — utilisée par le mode Navig pour insérer l'accord dans la piste
 * sélectionnée, et pour l'illumination fidèle de la piste jouée.
 *
 * ⚠️ L'ORDRE des notes est celui imposé par le pianiste quand il plaque
 * l'accord : le serveur relaie les note-on dans l'ordre d'arrivée (plus de
 * tri par hauteur), et cette conversion le conserve tel quel — elle ne
 * passe plus par le dictionnaire d'harmonie (QUALITY_INTERVALS), qui
 * imposait un ordre fixe (fondamentale, tierce, quinte…). Les hauteurs
 * réelles jouées (inversions, basses, extensions) sont donc préservées.
 */
import type { PianoNote } from './pianoRollTypes';

/** Vélocité par défaut des notes insérées. */
export const DEFAULT_VELOCITY = 80;

/**
 * Construit les notes de piano roll à partir des pitchs RÉELLEMENT joués
 * (état `active` de /live-input, ordre d'appui conservé par le serveur).
 * Une note par pitch, même durée/position/vélocité, ids uniques — l'ordre
 * du tableau d'entrée est préservé dans le tableau de sortie.
 */
export function pitchesToPianoNotes(
  pitches: number[],
  startBeats: number,
  durationBeats: number,
  velocity = DEFAULT_VELOCITY,
): PianoNote[] {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return pitches.map((pitch, i) => ({
    id: `live-${stamp}-${i}`,
    startTime: startBeats,
    pitch,
    duration: durationBeats,
    velocity,
  }));
}

/**
 * Pitchs des notes ACTIVES à une position donnée (en beats) — une note est
 * active quand `startTime <= pos < startTime + duration`. C'est ce qui
 * alimente l'illumination du piano en mode Navig, fidèle au contenu de la
 * piste jouée (que la lecture soit WAV ou MIDI : même tête de lecture).
 */
export function activePitchesAt(notes: PianoNote[], posBeats: number): number[] {
  return notes
    .filter(n => posBeats >= n.startTime && posBeats < n.startTime + n.duration)
    .map(n => n.pitch);
}
