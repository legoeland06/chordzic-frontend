/**
 * projectClipboard — presse-papiers GLOBAL du projet (partagé entre les
 * Piano Rolls des différentes pistes).
 *
 * Permet de copier les notes d'une piste (piste_Origine) et de les coller
 * dans une autre piste (piste_Destination) aux MÊMES emplacements et
 * valeurs (startTime, pitch, duration, velocity inchangés).
 *
 * Singleton en mémoire + petit système de souscription pour que les
 * boutons de l'UI (Copier / Coller) reflètent l'état du presse-papiers.
 */

import type { PianoNote } from './pianoRollTypes';

export interface ProjectClipboard {
  /** Notes copiées — positions ABSOLUES (startTime/pitch/duration/velocity). */
  notes: PianoNote[];
  /** startTime minimal de la copie (pour le collage relatif dans la piste source). */
  minStart: number;
  /** Canal de la piste d'origine. */
  sourceChannel: number;
  /** Nom de la piste d'origine (affichage). */
  sourceLabel: string;
  /** true si TOUTE la piste a été copiée (pas seulement une sélection). */
  wholeTrack: boolean;
  /** Horodatage de la copie. */
  copiedAt: number;
}

let current: ProjectClipboard | null = null;

/** Souscripteurs (fonctions appelées à chaque changement). */
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

/** Contenu courant du presse-papiers (null = vide). */
export function getProjectClipboard(): ProjectClipboard | null {
  return current;
}

/** Remplace le contenu du presse-papiers (null = vider). */
export function setProjectClipboard(clip: ProjectClipboard | null): void {
  current = clip;
  notify();
}

/** S'abonne aux changements ; retourne la fonction de désabonnement. */
export function subscribeProjectClipboard(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
