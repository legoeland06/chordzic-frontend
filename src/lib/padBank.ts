/**
 * padBank.ts — banque de samples des 64 pads (simulation Ableton Push 3).
 *
 * Fonctions pures (testables) :
 *  - dégradés de couleurs des pads (palette + modes solide / horizontal /
 *    vertical / diagonal — l'utilisateur choisit la teinte et le mode) ;
 *  - API d'import (upload brut) et de liste des samples serveur ;
 *  - PadPlayer : déclenchement Web Audio avec RETRIGGER — chaque appui
 *    arrête la lecture précédente du pad et redéclenche sans délai
 *    (comportement drum machine / Push).
 */

import { backendUrl } from './chordUtils';

export const PAD_COUNT = 64;
export const PAD_COLS = 8;
export const PAD_ROWS = 8;

/** Mode de dégradé des 64 pads. */
export type GradientMode = 'solid' | 'h' | 'v' | 'diag';

/** Teinte de base (0-360) ; -1 = blanc (pads éteints, style Push). */
export const PAD_PALETTE: { name: string; hue: number }[] = [
  { name: 'Rouge', hue: 0 },
  { name: 'Orange', hue: 25 },
  { name: 'Jaune', hue: 50 },
  { name: 'Vert', hue: 120 },
  { name: 'Cyan', hue: 180 },
  { name: 'Bleu', hue: 220 },
  { name: 'Violet', hue: 270 },
  { name: 'Rose', hue: 320 },
  { name: 'Blanc', hue: -1 },
];

/** Contenu d'un pad : sample assigné + couleur (hue + mode de dégradé). */
export interface PadSlot {
  /** Nom du fichier côté serveur (pad_*.ext) — null = pad vide. */
  file: string | null;
  /** Nom d'origine du sample (sans extension) — pour l'affichage. */
  label: string;
}

/** Configuration de couleurs des pads. */
export interface PadColorConfig {
  /** Teinte de base (0-360) ou -1 = blanc. */
  hue: number;
  /** Mode de dégradé. */
  mode: GradientMode;
}

export const EMPTY_PAD_COLOR: PadColorConfig = { hue: 220, mode: 'diag' };

/** Crée les 64 slots vides. */
export function emptyPads(): PadSlot[] {
  return new Array(PAD_COUNT).fill(null).map(() => ({ file: null, label: '' }));
}

/**
 * Couleur d'un pad (index 0-63) selon la teinte de base et le mode de
 * dégradé : les pads s'échelonnent en luminosité sur la grille 8×8
 * (62 % en bas-gauche → 38 % en haut-droite, style Push).
 */
export function padColor(hue: number, index: number, mode: GradientMode): string {
  if (hue < 0) return '#e9e9e9'; // blanc — pad éteint
  const col = index % PAD_COLS;
  const row = Math.floor(index / PAD_COLS);
  let t = 0.5; // progression 0..1 dans le dégradé
  switch (mode) {
    case 'solid':
      t = 0.5;
      break;
    case 'h':
      t = PAD_COLS > 1 ? col / (PAD_COLS - 1) : 0.5;
      break;
    case 'v':
      t = PAD_ROWS > 1 ? row / (PAD_ROWS - 1) : 0.5;
      break;
    case 'diag':
      t = (col + row) / (PAD_COLS + PAD_ROWS - 2);
      break;
  }
  const l = 62 - t * 24;
  return `hsl(${hue}, 85%, ${Math.round(l)}%)`;
}

/** Vrai si la couleur est « éteinte » (blanc). */
export function isPadOff(hue: number): boolean {
  return hue < 0;
}

// ── API serveur ────────────────────────────────────────────────────────

/** POST /pad-sample — import brut d'un sample (wav/mp3/ogg/flac/m4a/aiff).
 *  Retourne le nom stocké (pad_*.ext), ou null en cas d'échec. */
export async function uploadPadSample(file: File): Promise<string | null> {
  try {
    const res = await fetch(`${backendUrl()}/pad-sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': file.name },
      body: file,
    });
    if (!res.ok) return null;
    const j = await res.json();
    return typeof j.name === 'string' ? j.name : null;
  } catch {
    return null;
  }
}

/** GET /pad-samples — liste des samples importés. */
export async function listPadSamples(): Promise<{ name: string; size: number; ext: string }[]> {
  try {
    const res = await fetch(`${backendUrl()}/pad-samples`);
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

/** URL de lecture d'un sample de pad. */
export function padSampleUrl(name: string): string {
  return `${backendUrl()}/pad-sample/${encodeURIComponent(name)}`;
}

/** Nom d'origine affiché : « kick.wav » → « kick ». */
export function labelFromFilename(filename: string): string {
  const base = filename.split('/').pop() ?? filename;
  return base.replace(/\.[^.]+$/, '');
}

// ── PadPlayer : déclenchement Web Audio avec retrigger ─────────────────

/**
 * Joue les samples des pads via Web Audio. RETRIGGER : chaque appui sur un
 * pad arrête la source précédente de CE pad (même s'il n'a pas fini de
 * sonner) et redéclenche immédiatement depuis le début — zéro délai.
 */
export class PadPlayer {
  private ctx: AudioContext;
  /** Buffers décodés par pad (accès public pour les tests). */
  buffers: (AudioBuffer | null)[] = new Array(PAD_COUNT).fill(null);
  /** Sources actives par pad (accès public pour les tests). */
  sources: (AudioBufferSourceNode | null)[] = new Array(PAD_COUNT).fill(null);
  private gain: GainNode;
  /** Volume global 0-1 (défaut 0.9). */
  volume = 0.9;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = this.volume;
    this.gain.connect(ctx.destination);
  }

  /** Charge le sample d'un pad (fetch + décodage). True si OK. */
  async load(index: number, url: string): Promise<boolean> {
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      const data = await res.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(data);
      this.buffers[index] = buf;
      return true;
    } catch {
      this.buffers[index] = null;
      return false;
    }
  }

  /** Déclenche un pad : stop + redéclenchement immédiat (retrigger). */
  trigger(index: number): void {
    const buf = this.buffers[index];
    if (!buf) return;
    const old = this.sources[index];
    if (old) {
      try {
        old.stop();
      } catch {
        /* déjà arrêtée */
      }
      old.disconnect();
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    src.start();
    this.sources[index] = src;
    src.onended = () => {
      if (this.sources[index] === src) this.sources[index] = null;
    };
  }

  /** Arrête tous les pads (silence immédiat). */
  stopAll(): void {
    for (let i = 0; i < PAD_COUNT; i++) {
      const s = this.sources[i];
      if (s) {
        try {
          s.stop();
        } catch {
          /* déjà arrêtée */
        }
        s.disconnect();
      }
      this.sources[i] = null;
    }
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.gain.gain.value = this.volume;
  }
}
