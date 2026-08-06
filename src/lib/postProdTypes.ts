/**
 * postProdTypes — types du mode PostProd (édition audio non destructive).
 *
 * Un clip est une RÉGION de lecture sur un buffer : position sur la timeline
 * (`start`), début dans le buffer source (`offset`) et durée lue (`duration`).
 * Couper / déplacer / effacer ne touche jamais aux données audio.
 */
import { SNAP_UNITS, DEFAULT_SNAP_UNIT } from './pianoRollTypes';

/** Clip audio : fenêtre de lecture sur le buffer d'une piste. */
export interface PostProdClip {
  id: string;
  /** Position du clip sur la timeline (secondes). */
  start: number;
  /** Début dans le buffer source (secondes). */
  offset: number;
  /** Durée lue (secondes). */
  duration: number;
  /** Gain du clip (linéaire, 0.1 – 4). */
  gain: number;
  /** Fade in (secondes). */
  fadeIn: number;
  /** Fade out (secondes). */
  fadeOut: number;
}

/** Piste audio PostProd : un buffer + sa liste de clips + réglages de mix. */
export interface PostProdTrack {
  /** Canal MIDI d'origine (bounce) OU identifiant négatif (piste importée). */
  channel: number;
  label: string;
  program: number;
  color: string;
  buffer: AudioBuffer;
  /** Fader (linéaire, 0 – 1.5). */
  volume: number;
  /** Pan (stéréo, -1 = gauche, 1 = droite). */
  pan: number;
  mute: boolean;
  solo: boolean;
  clips: PostProdClip[];
  /** Origine de la piste : bounce MIDI ou fichier audio importé. */
  source?: 'bounce' | 'import';
}

/** Session PostProd : le « projet audio » en cours d'édition. */
export interface PostProdSession {
  projectName: string;
  tempo: number;
  sig: string;
  /** Durée totale de la timeline (secondes). */
  durationSec: number;
  /** Gain master par défaut (normalisation au pic du mix Navig, renvoyé par
   * le backend) — fidélité au niveau du mode Navig au premier Play. */
  masterGain: number;
  tracks: PostProdTrack[];
}

/** Couleurs de pistes — cohérentes avec le mode Navig (DawView). */
export const PP_TRACK_COLORS: Record<number, string> = {
  0: '#60a5fa',   // Lead
  2: '#fbbf24',   // Bass
  3: '#c084fc',   // Nappes
  9: '#f87171',   // Drums
  4: '#34d399',   // Accent
};

/** Palette pour les pistes AUDIO IMPORTÉES (canaux négatifs). */
export const PP_IMPORT_COLORS = [
  '#22d3ee', '#f472b6', '#a3e635', '#fb923c',
  '#818cf8', '#facc15', '#2dd4bf', '#e879f9',
];

export function trackColorForChannel(ch: number): string {
  if (ch >= 0) return PP_TRACK_COLORS[ch] ?? '#26d3ff';
  return PP_IMPORT_COLORS[((-ch) - 1) % PP_IMPORT_COLORS.length];
}

let clipSeq = 0;
/** Crée un clip couvrant TOUT le buffer (état initial d'un bounce). */
export function createFullClip(channel: number, duration: number): PostProdClip {
  clipSeq += 1;
  return {
    id: `clip-${channel}-${Date.now()}-${clipSeq}`,
    start: 0,
    offset: 0,
    duration,
    gain: 1,
    fadeIn: 0,
    fadeOut: 0,
  };
}

/** Subdivisions de snap disponibles — MÊMES que le mode Navig (PianoRoll) :
 * fractions de TEMPS (beat), du plus fin au plus grossier. 1/12 = triolets de
 * croches, 1/6 = triolets de noires, 1/3 = triolets de blanches, 1/24/1/18 =
 * sextolets. */
export const PP_SNAP_UNITS: number[] = SNAP_UNITS;
export const PP_DEFAULT_SNAP_UNIT = DEFAULT_SNAP_UNIT;

/** Pas de snap en SECONDES : unité (fraction de beat) × durée d'un beat. */
export function snapStepFor(tempo: number, unit: number): number {
  const spb = 60 / Math.max(40, tempo);
  return unit * spb;
}

/** Snap d'une position (secondes) au plus proche multiple du pas. */
export function snapValueFor(x: number, tempo: number, unit: number, enabled: boolean): number {
  if (!enabled) return x;
  const step = snapStepFor(tempo, unit);
  if (step <= 0) return x;
  return Math.round(x / step) * step;
}

/** Crée une piste AUDIO IMPORTÉE (canal négatif, source 'import'). */
export function createImportedTrack(buffer: AudioBuffer, index: number, name: string): PostProdTrack {
  const channel = -(index + 1);
  return {
    channel,
    label: name,
    program: 0,
    color: trackColorForChannel(channel),
    buffer,
    volume: 1,
    pan: 0,
    mute: false,
    solo: false,
    source: 'import',
    clips: [createFullClip(channel, buffer.duration)],
  };
}
