/** Browser audio via WAV rendu par le backend (synthé PC) */
import { ChordData, GrilleData } from '../types/chord';

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
      console.log('🔊 AudioContext created, state:', this.audioCtx.state);
    }
    if (this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
        console.log('🔊 AudioContext resumed');
      } catch (e) {
        console.warn('🔊 AudioContext resume failed:', e);
      }
    }
    return this.audioCtx;
  }

  /** Rend un accord via le backend et le joue en boucle */
  async playChordPreview(chord: ChordData, tempo: number): Promise<void> {
    const notes = chordToNoteNames(chord);
    const sequence = [{ notes, beats: 4.0 }];
    await this._playSequence(sequence, tempo, true);
  }

  /** Rend une grille via le backend et la joue */
  async playGrille(grille: GrilleData, tempo: number, loop?: boolean): Promise<void> {
    const sequence = grille.chords.map(c => ({
      notes: chordToNoteNames(c),
      beats: 4.0 / c.time,
    }));
    await this._playSequence(sequence, tempo, loop || false);
  }

  private async _playSequence(
    sequence: { notes: string[]; beats: number }[],
    tempo: number,
    doLoop: boolean
  ): Promise<void> {
    try {
      const url = backendUrl();
      const body = JSON.stringify({ sequence, tempo });
      console.log('🔊 Render WAV:', url + '/render-wav', body.slice(0, 120));
      const resp = await fetch(`${url}/render-wav`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!resp.ok) throw new Error(`render failed: ${resp.status}`);

      const wavData = await resp.arrayBuffer();
      console.log('🔊 WAV received:', (wavData.byteLength / 1024).toFixed(0), 'KB');

      const ctx = await this.getContext();
      const buffer = await ctx.decodeAudioData(wavData);
      console.log('🔊 Decoded:', buffer.duration.toFixed(2), 's');

      this._buffer = buffer;
      this._playBuffer(buffer, doLoop);
    } catch (e) {
      console.error('❌ BrowserSynth render error:', e);
      throw e; // propager l'erreur pour que audioEngine la voie
    }
  }

  private _playBuffer(buffer: AudioBuffer, loop: boolean) {
    try {
      this.stop();

      const ctx = this.audioCtx!;
      console.log('🔊 Playing buffer:', buffer.duration.toFixed(2), 's,',
        buffer.numberOfChannels, 'ch,', buffer.sampleRate, 'Hz');

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
        console.log('🔊 Audio ended, loop:', loop);
        if (this.source === source) {
          this._playing = false;
          this.source = null;
        }
      };
    } catch (e) {
      console.error('❌ _playBuffer error:', e);
    }
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
