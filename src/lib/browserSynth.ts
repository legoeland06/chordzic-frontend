/**
 * BrowserSynth — rendu audio via le backend + lecture dans le navigateur.
 *
 * Mode alternatif au MIDI live : le backend génère un fichier WAV complet
 * (via `/render-wav`), joué ensuite via l'API Web Audio.
 *
 * Les conversions de notes et l'URL backend sont importés depuis
 * lib/chordUtils.ts (partagé avec audioEngine.ts).
 */
import { ChordData, GrilleData } from '../types/chord';
import { backendUrl, chordToNoteNames } from './chordUtils';

export interface TrackCfg {
  channel: number;
  program?: number;
  volume?: number;
  mute?: boolean;
}

export interface RenderOptions {
  tempo: number;
  pattern?: string;
  walking?: boolean;
  sig?: string;
  tracks?: TrackCfg[];
  master_vol?: number;
  customNotes?: Array<{
    channel: number;
    start_time: number;
    pitch: number;
    duration: number;
    velocity: number;
  }>;
  /** Canaux en mode PianoRoll (même vides) — les autres jouent le mode classique. */
  customChannels?: number[];
}

/**
 * Synthétiseur audio navigateur — utilise le backend pour le rendu WAV
 * et l'API Web Audio pour la lecture.
 */
export class BrowserSynth {
  private audioCtx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private _playing = false;
  private _buffer: AudioBuffer | null = null;
  private ctxTimeAtStart = 0;
  private _loopTimer: ReturnType<typeof setTimeout> | null = null;
  private sources: AudioBufferSourceNode[] = [];

  get isPlaying() { return this._playing; }

  setVolume(_v: number) {
    // Le volume est géré par le rendu backend (master_vol)
  }

  /** Retourne ou crée le AudioContext (et le resume si suspendu). */
  private async getContext(): Promise<AudioContext> {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === 'suspended') {
      try { await this.audioCtx.resume(); } catch (e) { console.warn('🔊 resume failed:', e); }
    }
    return this.audioCtx;
  }

  /** Joue un aperçu d'un seul accord (boucle). */
  async playChordPreview(chord: ChordData, tempo: number, opts?: RenderOptions): Promise<void> {
    const notes = chordToNoteNames(chord);
    await this._playSequence([{ notes, beats: 4.0 }], tempo, true, opts);
  }

  /** Joue une grille complète, avec ou sans boucle. */
  async playGrille(grille: GrilleData, tempo: number, loop?: boolean, opts?: RenderOptions): Promise<void> {
    const sequence = grille.chords.map(c => ({
      notes: chordToNoteNames(c), beats: 4.0 / c.time,
    }));
    await this._playSequence(sequence, tempo, loop || false, opts);
  }

  /** 1. Appelle /render-wav → 2. décode → 3. joue. */
  private async _playSequence(
    sequence: { notes: string[]; beats: number }[],
    tempo: number, doLoop: boolean, opts?: RenderOptions,
  ): Promise<void> {
    const body: Record<string, unknown> = { sequence, tempo };
    if (opts) {
      if (opts.pattern) body.pattern = opts.pattern;
      if (opts.walking !== undefined) body.walking = opts.walking;
      if (opts.sig) body.sig = opts.sig;
      if (opts.tracks) body.tracks = opts.tracks;
      if (opts.master_vol !== undefined) body.master_vol = opts.master_vol;
      if (opts.customNotes && opts.customNotes.length > 0) {
        body.custom_notes = opts.customNotes;
      }
      if (opts.customChannels && opts.customChannels.length > 0) {
        body.custom_channels = opts.customChannels;
      }
    }
    await this._renderAndPlay(body, doLoop);
  }

  /** Joue un rendu WAV personnalisé : uniquement les notes PianoRoll d'un canal
   * (tous les canaux passés en mode custom, les autres vides → seuls les notes
   * fournies sont rendues). */
  async playPianoRollChannel(
    customNotes: NonNullable<RenderOptions['customNotes']>,
    customChannels: number[],
    tempo: number,
    opts?: RenderOptions,
  ): Promise<void> {
    const body: Record<string, unknown> = {
      sequence: [], tempo,
      custom_notes: customNotes,
      custom_channels: customChannels,
    };
    if (opts) {
      if (opts.pattern) body.pattern = opts.pattern;
      if (opts.walking !== undefined) body.walking = opts.walking;
      if (opts.sig) body.sig = opts.sig;
      if (opts.tracks) body.tracks = opts.tracks;
      if (opts.master_vol !== undefined) body.master_vol = opts.master_vol;
    }
    await this._renderAndPlay(body, false);
  }

  /** Appelle /render-wav puis décode et joue le buffer. */
  private async _renderAndPlay(body: Record<string, unknown>, doLoop: boolean): Promise<void> {
    const resp = await fetch(`${backendUrl()}/render-wav`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`render failed: ${resp.status}`);

    const wavData = await resp.arrayBuffer();
    const ctx = await this.getContext();
    const buffer = await ctx.decodeAudioData(wavData);
    this._buffer = buffer;
    this._playBuffer(buffer, doLoop);
  }

  /** Récupère les notes générées par le mode classique (base PianoRoll).
   * Appelle /render-notes avec la séquence et la configuration courantes.
   */
  async getPianoNotes(
    sequence: { notes: string[]; beats: number }[],
    tempo: number,
    opts?: RenderOptions,
  ): Promise<RenderOptions['customNotes']> {
    const body: Record<string, unknown> = { sequence, tempo };
    if (opts) {
      if (opts.pattern) body.pattern = opts.pattern;
      if (opts.walking !== undefined) body.walking = opts.walking;
      if (opts.sig) body.sig = opts.sig;
      if (opts.tracks) body.tracks = opts.tracks;
    }
    const resp = await fetch(`${backendUrl()}/render-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`render-notes failed: ${resp.status}`);
    const data = await resp.json();
    return data.notes ?? [];
  }

  /** Position de lecture courante dans le buffer (0..duration), boucle comprise. */
  getPosition(): number {
    if (!this.source || !this.audioCtx || !this._buffer) return 0;
    const elapsed = this.audioCtx.currentTime - this.ctxTimeAtStart;
    return ((elapsed % this._buffer.duration) + this._buffer.duration) % this._buffer.duration;
  }

  /** Durée du buffer audio courant (secondes). */
  getDuration(): number {
    return this._buffer?.duration ?? 0;
  }

  /** Pause : gèle le contexte audio → le son et le curseur se figent,
   * la reprise est exacte (le currentTime ne bouge pas). */
  async pause(): Promise<void> {
    if (this.audioCtx && this.audioCtx.state === 'running') {
      try { await this.audioCtx.suspend(); } catch { /* silencieux */ }
    }
  }

  /** Reprend après une pause. */
  async resume(): Promise<void> {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try { await this.audioCtx.resume(); } catch { /* silencieux */ }
    }
  }

  /** Lance la lecture d'un AudioBuffer. En boucle : `source.loop` simple
   * (durée exacte du buffer → timing métronomique strict). Le fade-out
   * backend (30 ms réels) évite le clic à la frontière. */
  private _playBuffer(buffer: AudioBuffer, loop: boolean) {
    try {
      this.stop();
      const ctx = this.audioCtx!;
      const gainNode = ctx.createGain();
      gainNode.gain.value = 1.0;
      gainNode.connect(ctx.destination);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = loop;
      source.connect(gainNode);
      this.ctxTimeAtStart = ctx.currentTime;
      source.start();
      this.source = source;
      this._playing = true;
      source.onended = () => {
        if (this.source === source) { this._playing = false; this.source = null; }
      };
    } catch (e) { console.error('❌ _playBuffer error:', e); }
  }

  stop() {
    this._playing = false;
    if (this._loopTimer) { clearTimeout(this._loopTimer); this._loopTimer = null; }
    // Arrêter TOUTES les sources actives (boucle crossfade inclus)
    for (const s of this.sources) {
      try { s.stop(); } catch {}
      s.disconnect();
    }
    this.sources = [];
    if (this.source) {
      try { this.source.stop(); } catch {}
      this.source.disconnect();
      this.source = null;
    }
  }
}
