/**
 * pianoNote — LivePiano cliquable : envoie une note (on/off) au Roland.
 *
 * POST /piano-note (note-on à l'appui, note-off au relâchement). `channel`
 * optionnel : canal de la piste cible en mode Navig (le serveur applique
 * aussi le mapping drums natif) ; absent → canal d'écho configuré / 1.
 *
 * ⚠️ ORDRE GARANTI (bug « note off absent » corrigé le 2026-08-20) :
 * les envois passent par une file FIFO — chaque requête part APRÈS la
 * précédente (même connexion keep-alive). Sans ça, jouer vite génère des
 * fetchs concurrents que le navigateur répartit sur plusieurs connexions
 * et que le serveur (Tokio) traite en parallèle → un note-off peut être
 * traité AVANT son note-on → la note sonne et ne s'arrête jamais
 * (vérifié empiriquement : 204 inversions on→off sur 1289 requêtes en
 * rafale). La file garantit l'ordre d'arrivée au serveur.
 */
import { backendUrl } from './chordUtils';

export const PIANO_NOTE_VELOCITY = 96;

/** File FIFO : la requête suivante attend la fin de la précédente. */
let queue: Promise<void> = Promise.resolve();

/** Enfile une tâche derrière les précédentes (la file survit aux échecs). */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job);
  // La chaîne continue même si le job échoue (jamais de blocage).
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Test only : vide la file (un test qui échoue ne bloque pas les suivants). */
export function __resetPianoNoteQueue(): void {
  queue = Promise.resolve();
}

/** Envoie l'appui (`on=true`) ou le relâchement (`on=false`) d'une touche. */
export function sendPianoNote(
  pitch: number,
  on: boolean,
  channel?: number,
  velocity: number = PIANO_NOTE_VELOCITY,
): Promise<boolean> {
  return enqueue(async () => {
    try {
      const res = await fetch(`${backendUrl()}/piano-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pitch, velocity, on, channel }),
      });
      return res.ok;
    } catch (e) {
      console.error('piano-note', e);
      return false;
    }
  });
}
