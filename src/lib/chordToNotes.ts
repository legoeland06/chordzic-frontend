/**
 * Conversion d'un accord reconnu (mode Live) en notes de piano roll —
 * utilisé par le mode Navig pour insérer l'accord dans la piste
 * sélectionnée, et pour l'illumination fidèle de la piste jouée.
 */
import { NOTE_NAMES, QUALITY_INTERVALS } from '../types/chord';
import type { RecognizedChord } from './chordRecognition';
import type { PianoNote } from './pianoRollTypes';

/** Octave de base de la fondamentale (C4 = 60). */
export const ROOT_PITCH = 60;
/** Octave de la basse imposée (C3 = 48 — sous la fondamentale). */
export const BASS_PITCH = 48;
/** Vélocité par défaut des notes insérées. */
export const DEFAULT_VELOCITY = 80;

/**
 * Construit les notes d'un accord plaqué (fondamentale + intervalles de la
 * qualité + basse imposée éventuelle), prêtes à insérer dans un piano roll.
 *
 * - La fondamentale est posée à C4 (60) + root, les extensions suivent les
 *   intervalles de QUALITY_INTERVALS (ex. C9 → 60, 64, 67, 70, 74).
 * - Si l'accord a une basse imposée (ex. C/G, Am7/D) différente de la
 *   fondamentale, elle est ajoutée une octave plus bas (C3 = 48 + classe).
 * - Notes triées, uniques, ids uniques (insérables telles quelles).
 */
export function chordToPianoNotes(
  chord: RecognizedChord,
  startBeats: number,
  durationBeats: number,
  velocity = DEFAULT_VELOCITY,
): PianoNote[] {
  const intervals = QUALITY_INTERVALS[chord.quality] ?? [0, 4, 7];
  const pitchSet = new Set<number>(intervals.map(iv => ROOT_PITCH + chord.root + iv));
  if (chord.bass) {
    const bassClass = NOTE_NAMES.indexOf(chord.bass);
    if (bassClass !== -1 && bassClass !== chord.root) {
      pitchSet.add(BASS_PITCH + bassClass);
    }
  }
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return [...pitchSet].sort((a, b) => a - b).map((pitch, i) => ({
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
