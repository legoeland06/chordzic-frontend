import { ChordData, GrilleData } from '../types/chord';
import * as Tone from 'tone';

/** Frequence MIDI -> Hz */
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Nom de note (ex: C4, Eb3) -> MIDI */
function noteNameToMidi(note: string): number {
  const noteMap: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4,
    'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8,
    'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
  };
  const m = note.match(/^([A-G][#b]?)(\d+)$/);
  if (!m) return 69;
  return (parseInt(m[2]) + 1) * 12 + (noteMap[m[1]] ?? 0);
}

/** Nom de note (ex: C4) -> Hz */
function noteToFreq(note: string): number {
  return midiToFreq(noteNameToMidi(note));
}

// ─── Synthesiseur navigateur ───

export class BrowserSynth {
  private started = false;
  private gainNode!: Tone.Gain;
  private leadSynth!: Tone.PolySynth;
  private bassSynth!: Tone.Synth;
  private padSynth!: Tone.PolySynth;
  private accentSynth!: Tone.PolySynth;
  private playing = false;

  async start(): Promise<void> {
    if (this.started) return;
    await Tone.start();
    this.gainNode = new Tone.Gain(0.5).toDestination();

    // Lead : triangle doux
    this.leadSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.7, release: 0.3 },
    }).connect(this.gainNode);

    // Bass : sawtooth doux
    this.bassSynth = new Tone.Synth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.4 },
      volume: -6,
    }).connect(this.gainNode);

    // Pads : sine suave
    this.padSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.1, decay: 0.3, sustain: 0.8, release: 1.0 },
      volume: -12,
    }).connect(this.gainNode);

    // Accent : piano-like
    this.accentSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.15 },
      volume: -8,
    }).connect(this.gainNode);

    this.started = true;
  }

  get isPlaying() { return this.playing; }
  setVolume(v: number) { if (this.gainNode) this.gainNode.gain.value = v / 127; }

  /** Convertit un ChordData en notes (noms) pour Tone.js */
  private chordToToneNotes(c: ChordData): string[] {
    const rawValues = c.midiValues;
    if (rawValues.length === 0) return [];
    const noteLabels = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const notes: string[] = [];

    // Basse (octave 2)
    const bassName = c.bass || c.name;
    const bassOffset: Record<string,number> = {C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
    const bo = bassOffset[bassName] ?? 0;
    notes.push(`${noteLabels[bo % 12]}2`);

    // Notes de l'accord (octave 3-4)
    const baseOctave = 3;
    for (let i = 0; i < rawValues.length; i++) {
      const v = rawValues[i];
      const midiNumber = baseOctave * 12 + v;
      const oct = Math.floor(midiNumber / 12);
      notes.push(`${noteLabels[midiNumber % 12]}${oct}`);
    }
    return notes;
  }

  /** Joue un accord en boucle sur une mesure */
  async playChordPreview(chord: ChordData, tempo: number): Promise<void> {
    await this.start();
    this.playing = true;
    const msPerChord = (60000 / tempo) * 4;
    const notes = this.chordToToneNotes(chord);
    // notes[0] = basse, notes[1..] = accord

    const bassNote = notes[0];
    const chordNotes = notes.slice(1);

    while (this.playing) {
      const now = Tone.now();

      // Lead : accord tenu
      if (chordNotes.length > 0) {
        this.leadSynth.triggerAttackRelease(chordNotes, `${4}n`, now);
      }

      // Basse : note grave tenue
      if (bassNote) {
        this.bassSynth.triggerAttackRelease(bassNote, `${4}n`, now);
      }

      // Pads : accord tenu plus doux
      if (chordNotes.length > 0) {
        this.padSynth.triggerAttackRelease(chordNotes, `${4}n`, now);
      }

      // Attendre la fin de la mesure
      await new Promise(r => setTimeout(r, msPerChord));
    }
  }

  /** Joue une grille complete */
  async playGrille(grille: GrilleData, tempo: number, loop?: boolean): Promise<void> {
    await this.start();
    this.playing = true;

    do {
      for (const c of grille.chords) {
        if (!this.playing) break;
        const beats = 4.0 / c.time;
        const msPerChord = (60000 / tempo) * beats;
        const notes = this.chordToToneNotes(c);
        const bassNote = notes[0];
        const chordNotes = notes.slice(1);

        const now = Tone.now();

        // Lead : accord
        if (chordNotes.length > 0) {
          this.leadSynth.triggerAttackRelease(chordNotes, `${beats}n`, now);
        }

        // Basse
        if (bassNote) {
          this.bassSynth.triggerAttackRelease(bassNote, `${beats}n`, now);
        }

        // Pads
        if (chordNotes.length > 0) {
          this.padSynth.triggerAttackRelease(chordNotes, `${beats}n`, now);
        }

        await new Promise(r => setTimeout(r, msPerChord));
      }
    } while (loop && this.playing);

    this.playing = false;
  }

  stop() {
    this.playing = false;
    if (this.leadSynth) this.leadSynth.releaseAll();
    if (this.bassSynth) this.bassSynth.triggerRelease();
    if (this.padSynth) this.padSynth.releaseAll();
    if (this.accentSynth) this.accentSynth.releaseAll();
  }
}
