import { ChordData, GrilleData } from '../types/chord';
import { BrowserSynth } from './browserSynth';

export type AudioState = 'idle' | 'playing' | 'stopped';

export interface TrackConfig {
  channel: number;
  label: string;
  program: number;
  volume: number;
  mute: boolean;
}

/** URL du backend (ports PC) — utilise l'hote courant pour fonctionner en reseau */
function backendUrl(): string {
  if (typeof window !== 'undefined') {
    return `http://${window.location.hostname}:4000`;
  }
  return 'http://localhost:4000';
}

export class AudioEngine {
  private playing = false;
  private playGen = 0;
  private onChordHighlight?: (idx: number) => void;
  private drumPattern = "rock";
  private walking = false;
  private tempo = 120;
  private sig = "4/4";
  private browserSynth = new BrowserSynth();
  private _browserAudio = false;

  get browserAudio() { return this._browserAudio; }
  set browserAudio(v: boolean) { this._browserAudio = v; }

  tracks: TrackConfig[] = [
    { channel: 0, label: 'Lead',  program: 51, volume: 15, mute: false },
    { channel: 2, label: 'Bass',  program: 33, volume: 40, mute: false },
    { channel: 3, label: 'Nappes', program: 48, volume: 30, mute: false },
    { channel: 4, label: 'Accent', program: 2,  volume: 20, mute: false },
    { channel: 9, label: 'Drums', program: 1,  volume: 80, mute: false },
  ];

  static readonly INSTRUMENTS = [
    'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano', 'Honky-tonk Piano',
    'Electric Piano 1', 'Electric Piano 2', 'Harpsichord', 'Clavinet',
    'Celesta', 'Glockenspiel', 'Music Box', 'Vibraphone',
    'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer',
    'Drawbar Organ', 'Percussive Organ', 'Rock Organ', 'Church Organ',
    'Reed Organ', 'Accordion', 'Harmonica', 'Tango Accordion',
    'Acoustic Guitar (nylon)', 'Acoustic Guitar (steel)', 'Electric Guitar (jazz)', 'Electric Guitar (clean)',
    'Electric Guitar (muted)', 'Overdriven Guitar', 'Distortion Guitar', 'Guitar Harmonics',
    'Acoustic Bass', 'Electric Bass (finger)', 'Electric Bass (pick)', 'Fretless Bass',
    'Slap Bass 1', 'Slap Bass 2', 'Synth Bass 1', 'Synth Bass 2',
    'Violin', 'Viola', 'Cello', 'Contrabass',
    'Tremolo Strings', 'Pizzicato Strings', 'Orchestral Harp', 'Timpani',
    'String Ensemble 1', 'String Ensemble 2', 'Synth Strings 1', 'Synth Strings 2',
    'Choir Aahs', 'Voice Oohs', 'Synth Voice', 'Orchestra Hit',
    'Trumpet', 'Trombone', 'Tuba', 'Muted Trumpet',
    'French Horn', 'Brass Section', 'Synth Brass 1', 'Synth Brass 2',
    'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax',
    'Oboe', 'English Horn', 'Bassoon', 'Clarinet',
    'Piccolo', 'Flute', 'Recorder', 'Pan Flute',
    'Blown Bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
    'Lead 1 (square)', 'Lead 2 (sawtooth)', 'Lead 3 (calliope)', 'Lead 4 (chiff)',
    'Lead 5 (charang)', 'Lead 6 (voice)', 'Lead 7 (fifths)', 'Lead 8 (bass + lead)',
    'Pad 1 (new age)', 'Pad 2 (warm)', 'Pad 3 (polysynth)', 'Pad 4 (choir)',
    'Pad 5 (bowed)', 'Pad 6 (metallic)', 'Pad 7 (halo)', 'Pad 8 (sweep)',
    'FX 1 (rain)', 'FX 2 (soundtrack)', 'FX 3 (crystal)', 'FX 4 (atmosphere)',
    'FX 5 (brightness)', 'FX 6 (goblins)', 'FX 7 (echoes)', 'FX 8 (sci-fi)',
    'Sitar', 'Banjo', 'Shamisen', 'Koto',
    'Kalimba', 'Bag pipe', 'Fiddle', 'Shanai',
    'Tinkle Bell', 'Agogo', 'Steel Drums', 'Woodblock',
    'Taiko Drum', 'Melodic Tom', 'Synth Drum', 'Reverse Cymbal',
    'Guitar Fret Noise', 'Breath Noise', 'Seashore', 'Bird Tweet',
    'Telephone Ring', 'Helicopter', 'Applause', 'Gunshot',
  ];

  setTrack(channel: number, config: Partial<TrackConfig>) {
    const t = this.tracks.find(tc => tc.channel === channel);
    if (!t) return;
    Object.assign(t, config);
    this.sendConfig();
  }

  setDrums(v: boolean) { this.setTrack(9, { mute: !v }); }
  setBass(v: boolean) { this.setTrack(2, { mute: !v }); }
  setArpeggios(v: boolean) { this.setTrack(0, { mute: !v }); }
  setNappes(v: boolean) { this.setTrack(3, { mute: !v }); }
  setPattern(p: string) { this.drumPattern = p; this.sendConfig(); }
  setSig(s: string) { this.sig = s; this.sendConfig(); }
  setTempo(t: number) { this.tempo = t; this.sendConfig({tempo: t}); }
  setWalking(v: boolean) { this.walking = v; this.sendConfig(); }

  private sendConfig(extra: any = {}) {
    fetch(`${backendUrl()}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tracks: this.tracks.map(t => ({
          channel: t.channel,
          program: t.program,
          volume: t.volume,
          mute: t.mute,
        })),
        pattern: this.drumPattern,
        walking: this.walking,
        sig: this.sig,
        ...extra,
      }),
    }).catch(() => {});
  }

  async init() {
    try {
      const resp = await fetch(backendUrl());
      if (resp.ok) console.log('🔌 Backend MIDI', backendUrl());
    } catch {
      console.warn('⚠️ Backend MIDI indisponible');
    }
  }

  setProgram(index: number) { this.setTrack(0, { program: index }); }
  set432Hz(enabled: boolean) {
    this.sendConfig({ use432: enabled });
  }
  setVolume(vol: number) {
    this.sendConfig({ master_vol: vol });
  }
  onHighlight(cb: (idx: number) => void) { this.onChordHighlight = cb; }

  private chordToNoteNames(c: ChordData): string[] {
    const rawValues = c.midiValues;
    if (rawValues.length === 0) return [];
    const noteLabels = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const names: string[] = [];

    const bassName = c.bass || c.name;
    const bassOffset = {C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11}[bassName] ?? 0;
    names.push(`${noteLabels[bassOffset % 12]}2`);

    const baseOctave = 3;
    for (let i = 0; i < rawValues.length; i++) {
      const v = rawValues[i];
      const midiNumber = baseOctave * 12 + v;
      const oct = Math.floor(midiNumber / 12);
      names.push(`${noteLabels[midiNumber % 12]}${oct}`);
    }
    return names;
  }

  async playChordPreview(chord: ChordData): Promise<void> {
    await this.stop();
    const gen = this.playGen;
    this.playing = true;

    if (this._browserAudio) {
      // Audio navigateur : rendu WAV via backend synthé
      await this.browserSynth.playChordPreview(chord, this.tempo);
    } else {
      // Backend MIDI
      const noteNames = this.chordToNoteNames(chord);
      const sequence = [{ notes: noteNames, beats: 4.0 }];
      try {
        const resp = await fetch(`${backendUrl()}/play`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sequence,
            tempo: this.tempo,
            sig: this.sig,
            pattern: this.drumPattern,
            walking: this.walking,
            loop_enabled: true,
            tracks: this.tracks.map(t => ({
              channel: t.channel, program: t.program, volume: t.volume, mute: t.mute,
            })),
          }),
        });
        if (!resp.ok) { this.playing = false; return; }
      } catch { this.playing = false; return; }
    }

    // Highlight loop
    const startTime = performance.now();
    let cumulativeExpected = 0;
    const msPerChord = (60000.0 / this.tempo) * 4;

    while (this.playing) {
      if (this.onChordHighlight) this.onChordHighlight(0);
      cumulativeExpected += msPerChord;
      const elapsed = performance.now() - startTime;
      const waitMs = Math.max(0, cumulativeExpected - elapsed);
      if (waitMs > 1) await new Promise(r => setTimeout(r, waitMs));
    }

    // Arret : highlight -1 + playing = false (si pas de nouveau playback)
    if (this.playGen === gen) {
      if (this.onChordHighlight) this.onChordHighlight(-1);
      this.playing = false;
    }
  }

  async playGrille(grille: GrilleData, loop?: boolean): Promise<void> {
    await this.stop();
    const gen = this.playGen;
    this.playing = true;

    if (grille.chords.length === 0) { this.playing = false; return; }

    if (this._browserAudio) {
      // Audio navigateur : rendu WAV via backend synthé
      await this.browserSynth.playGrille(grille, this.tempo, loop);
    } else {
      // Backend MIDI
      const sequence = grille.chords.map(c => ({
        notes: this.chordToNoteNames(c),
        beats: 4.0 / c.time,
      }));
      try {
        const resp = await fetch(`${backendUrl()}/play`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sequence,
            tempo: this.tempo,
            sig: this.sig,
            pattern: this.drumPattern,
            walking: this.walking,
            loop_enabled: loop || false,
            tracks: this.tracks.map(t => ({
              channel: t.channel, program: t.program, volume: t.volume, mute: t.mute,
            })),
          }),
        });
        if (!resp.ok) { this.playing = false; return; }
      } catch { this.playing = false; return; }
    }

    // Boucle de highlight locale — avec compensation de drift
    const startTime = performance.now();
    let cumulativeExpected = 0;

    while (this.playing) {
      for (let idx = 0; idx < grille.chords.length && this.playing; idx++) {
        if (this.onChordHighlight) this.onChordHighlight(idx);
        const c = grille.chords[idx];
        const beats = 4.0 / c.time;
        const chordMs = (60000.0 / this.tempo) * beats;
        cumulativeExpected += chordMs;

        const elapsed = performance.now() - startTime;
        const waitMs = Math.max(0, cumulativeExpected - elapsed);
        if (waitMs > 1) await new Promise(r => setTimeout(r, waitMs));
      }
      if (!loop) break;
    }

    if (this.playGen === gen) {
      if (this.onChordHighlight) this.onChordHighlight(-1);
      this.playing = false;
    }
  }

  async stop() {
    this.playing = false;
    this.playGen++;
    if (this.onChordHighlight) this.onChordHighlight(-1);
    this.browserSynth.stop();
    try { await fetch(`${backendUrl()}/stop`, { method: 'POST' }); } catch {}
  }

  get isPlaying() { return this.playing; }
}
