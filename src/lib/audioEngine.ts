import * as Tone from 'tone';
import { ChordData, GrilleData, NOTE_TO_MIDI } from '../types/chord';

export type AudioState = 'idle' | 'playing' | 'stopped';

export class AudioEngine {
  private synth: Tone.PolySynth | null = null;
  private bassSynth: Tone.MonoSynth | null = null;
  private drumsLoaded = false;

  private currentProgram = 0;
  private currentVelocity = 80;
  private use432Hz = true;
  private playing = false;
  private onChordHighlight?: (idx: number) => void;

  // GM Instrument names
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

  constructor() {
    // Piston réactif : initialisation au premier clic utilisateur
  }

  async init() {
    if (this.synth) return;
    await Tone.start();
    console.log('🔊 Audio context started');

    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'amsine' },
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.4, release: 0.8 },
    }).toDestination();

    this.bassSynth = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.05, decay: 0.3, sustain: 0.6, release: 0.5 },
      filterEnvelope: {
        attack: 0.05, decay: 0.2, sustain: 0.5, release: 0.5,
        baseFrequency: 100, octaves: 3,
      },
    }).toDestination();

    if (this.use432Hz) {
      Tone.getTransport().bpm.value = 120;
    }
  }

  setProgram(index: number) {
    this.currentProgram = index;
    if (this.synth && this.bassSynth) {
      this.applyInstrument(index);
    }
  }

  private applyInstrument(index: number) {
    if (!this.synth) return;
    const name = AudioEngine.INSTRUMENTS[index] || 'Acoustic Grand Piano';

    // Mapper les noms vers des paramètres Tone.js
    if (name.includes('Bass')) {
      if (this.bassSynth) {
        this.bassSynth.set({ oscillator: { type: 'sawtooth' } });
      }
    } else if (name.includes('Guitar')) {
      this.synth.set({ oscillator: { type: 'triangle' } });
    } else if (name.includes('Organ')) {
      this.synth.set({ oscillator: { type: 'square' } });
    } else if (name.includes('String') || name.includes('Violin')) {
      this.synth.set({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.1 } });
    } else if (name.includes('Flute') || name.includes('Pan')) {
      this.synth.set({ oscillator: { type: 'sine' } });
    } else {
      this.synth.set({ oscillator: { type: 'amsine' } });
    }
  }

  set432Hz(enabled: boolean) {
    this.use432Hz = enabled;
  }

  setVolume(vol: number) {
    this.currentVelocity = Math.max(10, Math.min(127, vol));
    const gain = this.currentVelocity / 127;
    if (this.synth) this.synth.volume.value = -20 + gain * 20;
    if (this.bassSynth) this.bassSynth.volume.value = -18 + gain * 20;
  }

  onHighlight(cb: (idx: number) => void) {
    this.onChordHighlight = cb;
  }

  async playGrille(grille: GrilleData) {
    if (!this.synth || !this.bassSynth) await this.init();
    if (!this.synth || !this.bassSynth) return;

    this.playing = true;
    const bpm = grille.tempo;
    const beatDuration = 60000 / bpm;

    const a432Ratio = this.use432Hz ? 432 / 440 : 1;

    try {
      for (let idx = 0; idx < grille.chords.length && this.playing; idx++) {
        const c = grille.chords[idx];

        if (this.onChordHighlight) this.onChordHighlight(idx);

        const rawValues = c.midiValues;
        if (rawValues.length === 0) continue;

        // Voicing sur 2 octaves
        const baseOctave = 48;
        const rootVal = NOTE_TO_MIDI[c.name] || 0;
        const rootMidi = baseOctave + rootVal;

        // Basse
        const bassMidi = rootMidi - 12;
        const bassFreq = midiToFreq(bassMidi) * a432Ratio;
        this.bassSynth.triggerAttackRelease(bassFreq, '4n');

        // Notes de l'accord
        const chordNotes: string[] = [];
        for (let i = 0; i < rawValues.length; i++) {
          const v = rawValues[i];
          const offset = (i % 2 === 0) ? 0 : 12;
          const note = rootMidi + v - rawValues[0] + offset;
          const freq = midiToFreq(note) * a432Ratio;
          chordNotes.push(freqToNote(freq));
        }

        // Durée
        const beats = 4.0 / c.time;
        const chordMs = Math.round(beatDuration * beats);

        if (chordNotes.length > 0) {
          this.synth.triggerAttackRelease(chordNotes, chordMs / 1000);
        }

        // Attendre la durée
        await sleep(chordMs);

        // Petit gap
        await sleep(15);
      }

      if (this.onChordHighlight) this.onChordHighlight(-1);
    } catch (e) {
      console.error('Playback error:', e);
    }
    this.playing = false;
  }

  stop() {
    this.playing = false;
    if (this.synth) this.synth.releaseAll();
    if (this.bassSynth) this.bassSynth.triggerRelease(Tone.now());
  }

  get isPlaying() { return this.playing; }
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function freqToNote(freq: number): string {
  const midi = Math.round(12 * Math.log2(freq / 440) + 69);
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  return names[midi % 12] + octave;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
