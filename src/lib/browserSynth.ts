/** Browser audio via WAV rendu par le backend (synthé PC) */
import { ChordData, GrilleData } from '../types/chord';

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
}

function backendUrl(): string {
  if (typeof window !== 'undefined') {
    return `http://${window.location.hostname}:4000`;
  }
  return 'http://localhost:4000';
}

/** Convertit un ChordData en notes (noms) pour le backend */
function chordToNoteNames(c: ChordData): string[] {
  const rawValues = c.midiValues;
  if (rawValues.length === 0) return [];
  const noteLabels = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

  const bassName = c.bass || c.name;
  const bassOffset: Record<string,number> = {C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
  const names: string[] = [];
  names.push(`${noteLabels[(bassOffset[bassName] ?? 0) % 12]}2`);

  const baseOctave = 3;
  for (let i = 0; i < rawValues.length; i++) {
    const v = rawValues[i];
    const midiNumber = baseOctave * 12 + v;
    const oct = Math.floor(midiNumber / 12);
    names.push(`${noteLabels[midiNumber % 12]}${oct}`);
  }
  return names;
}

export class BrowserSynth {
  private audioCtx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private _playing = false;
  private _buffer: AudioBuffer | null = null;

  get isPlaying() { return this._playing; }

  setVolume(v: number) {
    // Le volume est gere par le rendu backend (master_vol)
  }

  private async getContext(): Promise<AudioContext> {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === 'suspended') {
      try { await this.audioCtx.resume(); } catch (e) { console.warn('🔊 resume failed:', e); }
    }
    return this.audioCtx;
  }

  async playChordPreview(chord: ChordData, tempo: number, opts?: RenderOptions): Promise<void> {
    const notes = chordToNoteNames(chord);
    const sequence = [{ notes, beats: 4.0 }];
    await this._playSequence(sequence, tempo, true, opts);
  }

  async playGrille(grille: GrilleData, tempo: number, loop?: boolean, opts?: RenderOptions): Promise<void> {
    const sequence = grille.chords.map(c => ({
      notes: chordToNoteNames(c),
      beats: 4.0 / c.time,
    }));
    await this._playSequence(sequence, tempo, loop || false, opts);
  }

  private async _playSequence(
    sequence: { notes: string[]; beats: number }[],
    tempo: number,
    doLoop: boolean,
    opts?: RenderOptions
  ): Promise<void> {
    try {
      const body: Record<string, unknown> = { sequence, tempo };
      if (opts) {
        if (opts.pattern) body.pattern = opts.pattern;
        if (opts.walking !== undefined) body.walking = opts.walking;
        if (opts.sig) body.sig = opts.sig;
        if (opts.tracks) body.tracks = opts.tracks;
        if (opts.master_vol !== undefined) body.master_vol = opts.master_vol;
      }

      const url = backendUrl();
      const resp = await fetch(`${url}/render-wav`, {
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
    } catch (e) {
      console.error('❌ BrowserSynth render error:', e);
      throw e;
    }
  }

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
    if (this.source) {
      try { this.source.stop(); } catch {}
      this.source.disconnect();
      this.source = null;
    }
  }
}
