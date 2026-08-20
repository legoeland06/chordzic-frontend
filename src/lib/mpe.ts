/**
 * mpe.ts — API de la modal 🎛 MPE (simulation de contrôleur MPE).
 *
 * La modal génère des gestes d'expression (bend / aftertouch / timbre /
 * LFO) envoyés au serveur (POST /mpe) qui les injecte en direct dans le
 * flux MIDI renvoyé au Roland (Local Control OFF → le serveur est maître
 * du son). Pendant une session Rec MIDI, les gestes sont horodatés et
 * enregistrés avec les notes (réappliqués au rendu).
 *
 * Gestion réseau : throttle avec trailing (~30 ms) — les gestes souris
 * génèrent 60-120 événements/s, on n'envoie que le dernier par fenêtre.
 */
import { backendUrl } from './chordUtils';

const API_BASE = backendUrl();

export type LfoShapeName = 'sin' | 'triangle' | 'square';
/** Cible du son pendant le monitoring MPE : auto / roland / fluid (PC). */
export type MpeTargetName = 'auto' | 'roland' | 'fluid';

export interface MpeState {
  enabled: boolean;
  /** Pitch bend manuel (0-16383, centre 8192). */
  bend: number;
  /** Channel pressure (0-127). */
  pressure: number;
  /** Timbre CC74 (0-127). */
  timbre: number;
  /** Range de bend en demi-tons (RPN 0). */
  pitch_range_st: number;
  lfo_freq: number;
  lfo_depth_st: number;
  lfo_shape: LfoShapeName;
  /** Cible de sortie du monitoring. */
  target: MpeTargetName;
  /** Canal cible explicite (null = auto). */
  channel: number | null;
  /** Canal cible RÉSOLU par le serveur (écho ✨ sinon canal MPE sinon 0). */
  target_channel: number;
  /** Route active : main (Roland/écho) | fluid (PC) | none. */
  route: 'main' | 'fluid' | 'none';
  echo_active: boolean;
  /** Vrai si la connexion FluidSynth est disponible côté serveur. */
  fluid_ok: boolean;
  /** Pitchs tenus sur le Roland. */
  notes: number[];
  rec_active: boolean;
  /** Bend effectif (LFO inclus) calculé par le serveur. */
  effective_bend: number;
}

export const BEND_CENTER = 8192;
export const TIMBRE_CENTER = 64;

export const EMPTY_MPE_STATE: MpeState = {
  enabled: false,
  bend: BEND_CENTER,
  pressure: 0,
  timbre: TIMBRE_CENTER,
  pitch_range_st: 48,
  lfo_freq: 0,
  lfo_depth_st: 0,
  lfo_shape: 'sin',
  target: 'auto',
  channel: null,
  target_channel: 0,
  route: 'none',
  echo_active: false,
  fluid_ok: false,
  notes: [],
  rec_active: false,
  effective_bend: BEND_CENTER,
};

export interface MpePatch {
  enabled?: boolean;
  bend?: number;
  pressure?: number;
  timbre?: number;
  pitch_range_st?: number;
  lfo_freq?: number;
  lfo_depth_st?: number;
  lfo_shape?: LfoShapeName;
  target?: MpeTargetName;
  channel?: number | null;
}

/** POST /mpe — applique un geste (ou active/désactive la modal). */
export async function sendMpe(patch: MpePatch): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/mpe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** GET /mpe-state — état courant (notes tenues, canal résolu, rec…). */
export async function fetchMpeState(): Promise<MpeState> {
  try {
    const res = await fetch(`${API_BASE}/mpe-state`);
    if (!res.ok) return { ...EMPTY_MPE_STATE };
    const j = await res.json();
    return {
      enabled: !!j.enabled,
      bend: typeof j.bend === 'number' ? j.bend : BEND_CENTER,
      pressure: typeof j.pressure === 'number' ? j.pressure : 0,
      timbre: typeof j.timbre === 'number' ? j.timbre : TIMBRE_CENTER,
      pitch_range_st: typeof j.pitch_range_st === 'number' ? j.pitch_range_st : 48,
      lfo_freq: typeof j.lfo_freq === 'number' ? j.lfo_freq : 0,
      lfo_depth_st: typeof j.lfo_depth_st === 'number' ? j.lfo_depth_st : 0,
      lfo_shape: (['sin', 'triangle', 'square'] as const).includes(j.lfo_shape) ? j.lfo_shape : 'sin',
      target: (['auto', 'roland', 'fluid'] as const).includes(j.target) ? j.target : 'auto',
      channel: typeof j.channel === 'number' ? j.channel : null,
      target_channel: typeof j.target_channel === 'number' ? j.target_channel : 0,
      route: (['main', 'fluid', 'none'] as const).includes(j.route) ? j.route : 'none',
      echo_active: !!j.echo_active,
      fluid_ok: !!j.fluid_ok,
      notes: Array.isArray(j.notes) ? j.notes : [],
      rec_active: !!j.rec_active,
      effective_bend: typeof j.effective_bend === 'number' ? j.effective_bend : BEND_CENTER,
    };
  } catch {
    return { ...EMPTY_MPE_STATE };
  }
}

/** POST /mpe-reset — remet l'expression à zéro (bend centre, AT 0, CC74 neutre). */
export async function resetMpe(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/mpe-reset`, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Throttle avec trailing : au plus un appel par fenêtre `ms`, le dernier
 * argument de la fenêtre est envoyé en fin de fenêtre. Idéal pour les
 * pointermove (~60-120 Hz) vers un POST ~30 ms.
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

// ── Mapping des gestes (purs, testables) ──────────────────────────────

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
