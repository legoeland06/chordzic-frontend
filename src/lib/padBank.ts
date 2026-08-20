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

/** Contenu d'un pad : sample assigné + couleur (hue par pad). */
export interface PadSlot {
  /** Nom du fichier côté serveur (pad_*.ext) — null = pad vide. */
  file: string | null;
  /** Nom d'origine du sample (sans extension) — pour l'affichage. */
  label: string;
  /**
   * Teinte propre au pad (0-360, -1 = blanc éteint) ou null = « auto » :
   * le pad suit alors le dégradé global (hue + mode de la barre d'outils).
   */
  hue: number | null;
  /**
   * Tempo importé du sample (BPM 40-240) — initialisé à l'import par
   * détection automatique, ajustable. Utilisé par le métronome quand ce
   * pad est déclenché (null = 120 par défaut).
   */
  tempo: number | null;
}

/** Configuration de couleurs des pads. */
export interface PadColorConfig {
  /** Teinte de base (0-360) ou -1 = blanc. */
  hue: number;
  /** Mode de dégradé. */
  mode: GradientMode;
}

export const EMPTY_PAD_COLOR: PadColorConfig = { hue: 220, mode: 'diag' };

/** Crée les 64 slots vides (couleur auto → dégradé global). */
export function emptyPads(): PadSlot[] {
  return new Array(PAD_COUNT).fill(null).map(() => ({ file: null, label: '', hue: null, tempo: null }));
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

/**
 * Couleur EFFECTIVE d'un pad : sa propre teinte (solide) si elle est posée,
 * sinon le dégradé global (hue + mode de la barre d'outils).
 */
export function slotColor(slot: PadSlot, index: number, global: PadColorConfig): string {
  if (slot.hue === null) return padColor(global.hue, index, global.mode);
  return padColor(slot.hue, index, 'solid');
}

/**
 * Pose la couleur de son choix sur UN pad (mode peinture) — retourne une
 * copie des slots (fonction pure).
 */
export function paintPad(slots: PadSlot[], index: number, hue: number): PadSlot[] {
  const next = [...slots];
  next[index] = { ...next[index], hue };
  return next;
}

/**
 * Remet tous les pads au dégradé global (hue → null) — « Appliquer à tous ».
 */
export function clearPadColors(slots: PadSlot[]): PadSlot[] {
  return slots.map(s => ({ ...s, hue: null }));
}

/**
 * Pose le tempo (BPM) d'un pad (fonction pure — copie des slots).
 */
export function setPadTempo(slots: PadSlot[], index: number, tempo: number): PadSlot[] {
  const next = [...slots];
  next[index] = { ...next[index], tempo: Math.max(40, Math.min(240, Math.round(tempo))) };
  return next;
}

/**
 * Détecte le tempo (BPM) d'un échantillon audio par autocorrélation de son
 * enveloppe d'énergie (fenêtres de 10 ms, 8 s max). Retourne un entier
 * 40-240 (le tempo importé du pad), ou null si aucune périodicité claire
 * (bruit, drone, silence…).
 */
export function detectTempo(samples: Float32Array, sampleRate: number): number | null {
  const hop = Math.max(1, Math.floor(sampleRate * 0.01));
  const maxFrames = Math.min(samples.length, Math.floor(sampleRate * 8));
  const env: number[] = [];
  for (let i = 0; i < maxFrames; i += hop) {
    const end = Math.min(i + hop, maxFrames);
    let sum = 0;
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    env.push(Math.sqrt(sum / (end - i)));
  }
  if (env.length < 32) return null;
  const minBpm = 40;
  const maxBpm = 240;
  const minLag = Math.max(2, Math.floor(((60 / maxBpm) * sampleRate) / hop));
  const maxLag = Math.min(env.length - 2, Math.ceil(((60 / minBpm) * sampleRate) / hop));
  let bestLag = -1;
  let bestScore = -Infinity;
  let scoreSum = 0;
  let scoreCount = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let num = 0;
    let e1 = 0;
    let e2 = 0;
    const n = env.length - lag;
    for (let i = 0; i < n; i++) {
      const a = env[i];
      const b = env[i + lag];
      num += a * b;
      e1 += a * a;
      e2 += b * b;
    }
    const den = Math.sqrt(e1 * e2);
    const score = den > 1e-9 ? num / den : 0;
    scoreSum += score;
    scoreCount++;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || bestScore < 0.25) return null;
  // Le pic doit être PROÉMINENT : un signal plat (drone, souffle constant)
  // corrèle partout (score ≈ 1 sur tous les lags) sans périodicité réelle.
  const mean = scoreCount > 0 ? scoreSum / scoreCount : 0;
  if (bestScore < mean * 1.2 + 0.05) return null;
  const bpm = 60 / ((bestLag * hop) / sampleRate);
  const rounded = Math.round(bpm);
  return rounded >= minBpm && rounded <= maxBpm ? rounded : null;
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

/**
 * POST /pad-trigger — joue un sample côté SERVEUR (ffplay, retrigger).
 * `loop` : boucle le sample en continu (ffplay -loop 0) jusqu'au Stop.
 * Retourne true si le serveur a accepté (200).
 */
export async function triggerPadServer(file: string, volume: number, loop: boolean): Promise<boolean> {
  try {
    const res = await fetch(`${backendUrl()}/pad-trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file,
        volume: Math.max(0, Math.min(100, Math.round(volume))),
        loop,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** POST /pad-stop — coupe toutes les lectures serveur en cours. */
export async function stopPadServer(): Promise<boolean> {
  try {
    const res = await fetch(`${backendUrl()}/pad-stop`, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
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

  // ── Métronome (scheduler lookahead, tourne en parallèle des pads) ──
  private metroGain: GainNode;
  private clickBuf: AudioBuffer | null = null;
  private accentBuf: AudioBuffer | null = null;
  private metroTimer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private beatIdx = 0;
  private running = false;
  /** Tempo courant du métronome (BPM, 40-240). */
  bpm = 120;
  /** Le clic du métronome est-il audible ? (toggle utilisateur) */
  metroAudible = false;
  /** Pads armés : joueront au prochain beat (quantification). */
  private armed = new Set<number>();
  /** Mode loop appliqué aux pads armés (le toggle est global). */
  private armedLoop = true;
  /** Appelé à chaque beat planifié (1-4 Hz) : (beatIdx, bpm). */
  onBeat: ((beat: number, bpm: number) => void) | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = this.volume;
    this.gain.connect(ctx.destination);
    this.metroGain = ctx.createGain();
    this.metroGain.gain.value = 0.55;
    this.metroGain.connect(ctx.destination);
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

  /** Joue un pad à un temps audio donné (0 = maintenant). `loop` : boucle
   *  le sample en continu jusqu'au ■ Stop (défaut : OFF, one-shot). */
  playAt(index: number, when: number, loop = false): void {
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
    src.loop = loop;
    src.connect(this.gain);
    src.start(when);
    this.sources[index] = src;
    src.onended = () => {
      if (this.sources[index] === src) this.sources[index] = null;
    };
  }

  /** Déclenche un pad : stop + redéclenchement immédiat (retrigger). */
  trigger(index: number): void {
    this.playAt(index, 0);
  }

  // ── Métronome ───────────────────────────────────────────────────────

  isMetronomeRunning(): boolean {
    return this.running;
  }

  isArmed(index: number): boolean {
    return this.armed.has(index);
  }

  setMetroAudible(audible: boolean): void {
    this.metroAudible = audible;
  }

  /** Temps audio courant (pour l'anticipation des déclenchements serveur). */
  currentTime(): number {
    return this.ctx.currentTime;
  }

  /** Temps audio du PROCHAIN battement à venir (jamais dans le passé). */
  nextBeatTime(): number {
    if (!this.running) return this.ctx.currentTime;
    return Math.max(this.ctx.currentTime, this.nextBeat);
  }

  /** Change le tempo du métronome en cours de route (borne 40-240). */
  setBpm(bpm: number): void {
    this.bpm = Math.max(40, Math.min(240, bpm));
  }

  /**
   * Démarre le métronome (ancre = maintenant, premier clic immédiat).
   * Un battement toutes les noires ; l'accent tombe sur le temps 1 (4/4).
   */
  startMetronome(bpm: number): void {
    if (this.running) {
      this.setBpm(bpm);
      return;
    }
    this.setBpm(bpm);
    this.running = true;
    this.nextBeat = this.ctx.currentTime + 0.04;
    this.beatIdx = 0;
    this.scheduleBeat();
    this.metroTimer = setInterval(() => {
      const horizon = this.ctx.currentTime + 0.12;
      while (this.nextBeat < horizon) this.scheduleBeat();
    }, 25);
  }

  /** Arrête le métronome (et désarme les pads en attente). */
  stopMetronome(): void {
    if (this.metroTimer !== null) {
      clearInterval(this.metroTimer);
      this.metroTimer = null;
    }
    this.running = false;
    this.armed.clear();
  }

  /**
   * Déclenchement métronomiquement synchronisé d'un pad :
   * - métronome à l'arrêt → il démarre au tempo du pad et le sample joue
   *   IMMÉDIATEMENT (coup d'ancre) ; retour 'immediate' ;
   * - métronome en route → le pad est ARMÉ et jouera au prochain beat
   *   (quantification) ; retour 'armed'.
   * `loop` : le sample boucle en continu jusqu'au Stop (défaut : vrai —
   * le mode loop est le fonctionnement par défaut du 64-pad).
   */
  playQuantized(index: number, tempo: number, loop = true): 'immediate' | 'armed' {
    if (!this.running) {
      this.startMetronome(tempo);
      this.playAt(index, 0, loop);
      return 'immediate';
    }
    this.armed.add(index);
    this.armedLoop = loop;
    return 'armed';
  }

  /** Programme le prochain beat : clic métronome + pads armés. */
  private scheduleBeat(): void {
    const when = this.nextBeat;
    if (this.metroAudible) this.playClick(when, this.beatIdx % 4 === 0);
    for (const i of this.armed) this.playAt(i, when, this.armedLoop);
    this.armed.clear();
    this.nextBeat += 60 / this.bpm;
    this.beatIdx++;
    this.onBeat?.(this.beatIdx, this.bpm);
  }

  /** Clic du métronome (aigu 2 kHz accentué sur le temps 1, sinon 1 kHz). */
  private playClick(when: number, accent: boolean): void {
    if (!this.clickBuf) {
      const sr = this.ctx.sampleRate;
      const make = (freq: number) => {
        const buf = this.ctx.createBuffer(1, Math.floor(sr * 0.06), sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          d[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 55);
        }
        return buf;
      };
      this.clickBuf = make(1000);
      this.accentBuf = make(2000);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = accent ? this.accentBuf : this.clickBuf;
    src.connect(this.metroGain);
    src.start(when);
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
