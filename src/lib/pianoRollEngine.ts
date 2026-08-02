/**
 * pianoRollEngine — machine à états pour les interactions du PianoRoll.
 *
 * Gère la création, le déplacement, le redimensionnement et la suppression
 * de notes dans un piano roll.
 *
 * États : IDLE → CREATING / DRAGGING / RESIZING → IDLE
 */

import { PianoNote, generateNoteId, snapToGrid, DEFAULT_PIXELS_PER_BEAT, SNAP_UNIT, WHITE_KEY_HEIGHT, pitchToPixels, pixelsToPitch } from './pianoRollTypes';

// ─── Types de l'état machine ───────────────────────────────────────────

export type InteractionState = 'IDLE' | 'CREATING' | 'DRAGGING' | 'RESIZING';

export interface InteractionContext {
  state: InteractionState;
  /** ID de la note manipulée (pour DRAGGING / RESIZING). */
  targetId: string | null;
  /** Offset de souris au début du drag (en pixels), pour conserver la position relative. */
  offsetX: number;
  offsetY: number;
  /** Valeurs de départ (pour undo éventuel). */
  startTime: number;
  startPitch: number;
  startDuration: number;
}

export function createEmptyContext(): InteractionContext {
  return {
    state: 'IDLE',
    targetId: null,
    offsetX: 0,
    offsetY: 0,
    startTime: 0,
    startPitch: 0,
    startDuration: 0,
  };
}

// ─── Coordonnées d'un clic / événement souris ──────────────────────────

export interface MouseCoord {
  /** X en pixels dans le canvas (temps). */
  px: number;
  /** Y en pixels dans le canvas (pitch). */
  py: number;
}

/**
 * Trouve la note sous le curseur (parmi `notes`), avec une tolérance.
 * Retourne l'index et la note, ou null.
 */
export function hitTest(
  notes: PianoNote[],
  coord: MouseCoord,
  pixelsPerBeat: number = DEFAULT_PIXELS_PER_BEAT,
  maxPitch: number = 96,
): { index: number; note: PianoNote; region: 'body' | 'rightEdge' } | null {
  const edgeThreshold = 6;

  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    const x = n.startTime * pixelsPerBeat;
    const w = n.duration * pixelsPerBeat;
    const y = pitchToPixels(n.pitch, maxPitch);
    const h = WHITE_KEY_HEIGHT;

    if (coord.px >= x && coord.px <= x + w && coord.py >= y && coord.py <= y + h) {
      if (coord.px >= x + w - edgeThreshold) {
        return { index: i, note: n, region: 'rightEdge' };
      }
      return { index: i, note: n, region: 'body' };
    }
  }
  return null;
}

// ─── Interactions ──────────────────────────────────────────────────────

/**
 * Tentative de démarrer une interaction (clic souris).
 *
 * Retourne un nouvel InteractionContext (ou inchangé si IDLE).
 * Si le clic est sur une note → DRAGGING (body) ou RESIZING (rightEdge).
 * Si le clic est sur le vide → CREATING (une nouvelle note est créée).
 */
export function startInteraction(
  ctx: InteractionContext,
  notes: PianoNote[],
  coord: MouseCoord,
  pixelsPerBeat: number,
  maxPitch: number,
  snapUnit: number = SNAP_UNIT,
): { ctx: InteractionContext; createdNote?: PianoNote } {
  const hit = hitTest(notes, coord, pixelsPerBeat, maxPitch);

  if (hit) {
    const n = hit.note;
    if (hit.region === 'rightEdge') {
      return {
        ctx: {
          state: 'RESIZING',
          targetId: n.id,
          offsetX: coord.px - (n.startTime + n.duration) * pixelsPerBeat,
          offsetY: 0,
          startTime: n.startTime,
          startPitch: n.pitch,
          startDuration: n.duration,
        },
      };
    } else {
      return {
        ctx: {
          state: 'DRAGGING',
          targetId: n.id,
          offsetX: coord.px - n.startTime * pixelsPerBeat,
          offsetY: coord.py - pitchToPixels(n.pitch, maxPitch),
          startTime: n.startTime,
          startPitch: n.pitch,
          startDuration: n.duration,
        },
      };
    }
  }

  // Clic sur le vide → créer une nouvelle note
  const snappedTime = snapToGrid(coord.px / pixelsPerBeat, snapUnit);
  const pitch = Math.max(0, Math.min(127, pixelsToPitch(coord.py, maxPitch)));
  const newNote: PianoNote = {
    id: generateNoteId(),
    startTime: Math.max(0, snappedTime),
    pitch,
    duration: snapUnit,
    velocity: 100,
  };

  return {
    ctx: {
      state: 'CREATING',
      targetId: newNote.id,
      offsetX: 0,
      offsetY: 0,
      startTime: newNote.startTime,
      startPitch: newNote.pitch,
      startDuration: newNote.duration,
    },
    createdNote: newNote,
  };
}

/**
 * Met à jour l'interaction en cours (mouvement de souris).
 *
 * @param ctx Contexte d'interaction courant.
 * @param coord Position actuelle de la souris.
 * @param pixelsPerBeat Zoom horizontal.
 * @param minPitch Pitch minimum visible.
 * @returns Un objet avec l'éventuelle mutation à appliquer à la note.
 */
export function updateInteraction(
  ctx: InteractionContext,
  coord: MouseCoord,
  pixelsPerBeat: number,
  maxPitch: number,
  snapUnit: number = SNAP_UNIT,
): { note?: Partial<PianoNote>; done?: boolean } {
  switch (ctx.state) {
    case 'IDLE':
    case 'CREATING':
      return {};

    case 'DRAGGING': {
      const newStartTime = snapToGrid(Math.max(0, (coord.px - ctx.offsetX) / pixelsPerBeat), snapUnit);
      const rawPitch = pixelsToPitch(coord.py - ctx.offsetY, maxPitch);
      const newPitch = Math.max(0, Math.min(127, rawPitch));
      return {
        note: { startTime: newStartTime, pitch: newPitch },
      };
    }

    case 'RESIZING': {
      const edgeX = coord.px - ctx.offsetX;
      const newEndTime = snapToGrid(Math.max(snapUnit, edgeX / pixelsPerBeat), snapUnit);
      const newDuration = Math.max(snapUnit, newEndTime - ctx.startTime);
      return {
        note: { duration: newDuration },
      };
    }

    default:
      return {};
  }
}

/**
 * Termine l'interaction (relâchement souris).
 * Retourne le nouvel état et l'éventuelle mutation finale.
 */
export function endInteraction(
  ctx: InteractionContext,
  coord: MouseCoord,
  pixelsPerBeat: number,
  maxPitch: number,
  snapUnit: number = SNAP_UNIT,
): { ctx: InteractionContext; note?: Partial<PianoNote>; finishedNew?: PianoNote } {
  const update = updateInteraction(ctx, coord, pixelsPerBeat, maxPitch, snapUnit);

  const newCtx: InteractionContext = {
    state: 'IDLE',
    targetId: null,
    offsetX: 0,
    offsetY: 0,
    startTime: 0,
    startPitch: 0,
    startDuration: 0,
  };

  return { ctx: newCtx, note: update.note };
}

/**
 * Supprime une note par ID.
 */
export function deleteNote(notes: PianoNote[], id: string): PianoNote[] {
  return notes.filter(n => n.id !== id);
}
