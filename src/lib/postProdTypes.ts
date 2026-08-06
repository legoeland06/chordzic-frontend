/**
 * postProdTypes — types du mode PostProd (édition audio non destructive).
 *
 * Un clip est une RÉGION de lecture sur un buffer : position sur la timeline
 * (`start`), début dans le buffer source (`offset`) et durée lue (`duration`).
 * Couper / déplacer / effacer ne touche jamais aux données audio.
 */

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

export function trackColorForChannel(ch: number): string {
  return PP_TRACK_COLORS[ch] ?? '#26d3ff';
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

/** Pas de snap par défaut : 1/16 de mesure (≈ 0.125 s à 120 BPM 4/4). */
export function snapStepFor(tempo: number, sig: string): number {
  const beatsPerBar = parseInt(sig.split('/')[0] ?? '4', 10) || 4;
  const barSec = (beatsPerBar * 60) / Math.max(40, tempo);
  return barSec / 4;
}
