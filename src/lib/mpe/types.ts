/**
 * types.ts — types partagés du système MPE Modules.
 *
 * Chaque module (contrôleur simulé : Seaboard, LinnStrument, Osmose…) parle
 * le même langage : des gestes d'expression (bend / pression / timbre / LFO)
 * envoyés au serveur, qui les injecte en direct dans le flux MIDI.
 */

export type LfoShapeName = 'sin' | 'triangle' | 'square';

/** Cible du son pendant le monitoring MPE : auto / roland / fluid (PC). */
export type MpeTargetName = 'auto' | 'roland' | 'fluid';

/** État MPE partagé (serveur). */
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
  /** Instrument GM (0-127) posé sur le canal cible (mode PC / sans Roland). */
  program: number;
  /** Canal cible explicite (null = auto). */
  channel: number | null;
  /** Canal cible RÉSOLU par le serveur (écho ✨ sinon canal MPE sinon 0). */
  target_channel: number;
  /** Route active : main (Roland/écho) | fluid (PC) | none. */
  route: 'main' | 'fluid' | 'none';
  echo_active: boolean;
  /** Vrai si la connexion FluidSynth est disponible côté serveur. */
  fluid_ok: boolean;
  /** Vrai si la sortie principale est FluidSynth (pas de Roland branché). */
  main_is_fluid: boolean;
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
  pitch_range_st: 2,
  lfo_freq: 0,
  lfo_depth_st: 0,
  lfo_shape: 'sin',
  target: 'auto',
  program: 0,
  channel: null,
  target_channel: 0,
  route: 'none',
  echo_active: false,
  fluid_ok: false,
  main_is_fluid: false,
  notes: [],
  rec_active: false,
  effective_bend: BEND_CENTER,
};

/** Patch partiel envoyé au serveur (chaque champ est optionnel). */
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
  /** Instrument GM (0-127) posé sur le canal cible. */
  program?: number;
  channel?: number | null;
}

/**
 * Échantillon de geste émis par un module (1×/frame pendant un glissé).
 *
 * Chaque champ est OPTIONNEL : un module n'envoie que les dimensions qu'il
 * pilote (ex. le RISE 2 pilote bend + vibrato ; le strip pilote bend, timbre
 * et pression). Les champs absents laissent la valeur courante du cadre
 * inchangée. `lfoFreq` / `lfoDepth` pilotent le vibrato (LFO du serveur) :
 * le glissé horizontal du RISE 2 envoie l'intensité du vibrato.
 */
export interface StripGesture {
  /** Pitch bend 14-bit (0-16383, centre 8192). */
  bend?: number;
  /** Timbre CC74 (0-127). */
  timbre?: number;
  /** Pression / aftertouch (0-127). */
  pressure?: number;
  /** Fréquence du vibrato en Hz (LFO). */
  lfoFreq?: number;
  /** Profondeur du vibrato en demi-tons (LFO). */
  lfoDepth?: number;
}
