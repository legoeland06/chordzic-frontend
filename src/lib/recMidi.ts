/**
 * Enregistrement MIDI (mode Navig, Rec) — logique pure.
 *
 * Le serveur accumule les événements joués sur le Roland (pitch, on_ms,
 * off_ms — horodatés depuis le début de la session). Ce module les convertit
 * en notes de piano roll positionnées à partir de la tête de lecture, et
 * calcule le décompte de 4 temps du métronome de pré-roll.
 */
import type { PianoNote } from './pianoRollTypes';

/** Note enregistrée par le serveur (GET /rec-midi-state, POST /rec-midi). */
export interface RecMidiEvent {
  pitch: number;
  on_ms: number;
  off_ms: number | null;
}

/** Vélocité par défaut des notes enregistrées. */
export const REC_VELOCITY = 90;

/**
 * Convertit les événements d'une session Rec en notes de piano roll.
 * - `startPosBeats` : position de la tête de lecture au début de l'enregistrement ;
 * - chaque note démarre à `startPosBeats + on_ms` (converti en beats au tempo) ;
 * - une note non relâchée à l'arrêt reçoit une durée d'un temps.
 * L'ordre d'appui du pianiste est conservé.
 */
export function recEventsToNotes(
  events: RecMidiEvent[],
  startPosBeats: number,
  tempo: number,
): PianoNote[] {
  const beatsPerMs = tempo / 60000;
  const oneBeatMs = 60000 / tempo;
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return events.map((e, i) => {
    const durMs = e.off_ms !== null ? Math.max(50, e.off_ms - e.on_ms) : oneBeatMs;
    return {
      id: `rec-${stamp}-${i}`,
      startTime: Math.round((startPosBeats + e.on_ms * beatsPerMs) * 1e6) / 1e6,
      pitch: e.pitch,
      duration: Math.round(durMs * beatsPerMs * 1e6) / 1e6,
      velocity: REC_VELOCITY,
    };
  });
}

/**
 * Décompte du métronome de pré-roll : offsets (ms) des `count` clics, le
 * premier immédiat (t=0). L'enregistrement démarre après le dernier clic.
 */
export function countdownClicks(tempo: number, count = 4): number[] {
  const intervalMs = 60000 / tempo;
  return Array.from({ length: count }, (_, i) => i * intervalMs);
}
