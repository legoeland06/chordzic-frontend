import { ChordData, GrilleData, NOTE_TO_MIDI } from '../types/chord';

export type AudioState = 'idle' | 'playing' | 'stopped';

const BACKEND_URL = 'http://localhost:4000';

export class AudioEngine {
  private playing = false;
  private onChordHighlight?: (idx: number) => void;
  private drumsEnabled = true;
  private bassEnabled = true;
  private arpeggiosEnabled = true;
  private drumPattern = "rock";
  private sig = "4/4";
  private instrument = 51;

  static readonly INSTRUMENTS = [
    'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano',

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
  setDrums(v: boolean) { this.drumsEnabled = v; this.sendConfig(); }
  setBass(v: boolean) { this.bassEnabled = v; this.sendConfig(); }
  setArpeggios(v: boolean) { this.arpeggiosEnabled = v; this.sendConfig(); }
  setPattern(p: string) { this.drumPattern = p; this.sendConfig(); }
  setSig(s: string) { this.sig = s; this.sendConfig(); }
  setTempo(t: number) { this.sendConfig({tempo: t}); }

  private sendConfig(extra: any = {}) {
    fetch(`${BACKEND_URL}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        drums: this.drumsEnabled,
        bass: this.bassEnabled,
        arpeggios: this.arpeggiosEnabled,
        pattern: this.drumPattern,
        sig: this.sig,
        ...extra,
      }),
    }).catch(() => {});
  }

  async init() {
    try {
      const resp = await fetch(BACKEND_URL);
      if (resp.ok) console.log('🔌 Backend MIDI', BACKEND_URL);
    } catch {
      console.warn('⚠️ Backend MIDI indisponible');
    }
  }

  setProgram(index: number) { this.instrument = index; this.sendConfig({instrument: index}); }
  set432Hz(_enabled: boolean) {}
  setVolume(_vol: number) {}
  onHighlight(cb: (idx: number) => void) { this.onChordHighlight = cb; }

  private chordToNoteNames(c: ChordData): string[] {
    const rawValues = c.midiValues;
    if (rawValues.length === 0) return [];
    const rootOffset = NOTE_TO_MIDI[c.name] || 0;
    const noteLabels = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const names: string[] = [];

    // Note de basse: utilise c.bass si different de la fondamentale
    const bassName = c.bass || c.name;
    const bassOffset = NOTE_TO_MIDI[bassName] || 0;
    // Basse 2 octaves plus bas que la fondamentale
    const bassOctave = 2;
    names.push(`${noteLabels[bassOffset % 12]}${bassOctave}`);

    // Notes de l'accord (chanter a partir de l'octave 4)
    const baseOctave = 4;
    for (let i = 0; i < rawValues.length; i++) {
      const v = rawValues[i];
      const midiNumber = baseOctave * 12 + rootOffset + v;
      const octave = Math.floor(midiNumber / 12) - 1;
      names.push(`${noteLabels[midiNumber % 12]}${octave}`);
    }
    return names;
  }

  async playGrille(grille: GrilleData) {
    this.playing = true;

    const sequence: Array<{ notes: string[]; beats: number }> = [];
    for (let idx = 0; idx < grille.chords.length; idx++) {
      const c = grille.chords[idx];
      const noteNames = this.chordToNoteNames(c);
      if (noteNames.length > 0) {
        sequence.push({ notes: noteNames, beats: 4.0 / c.time });
      }
    }

    try {
      const resp = await fetch(`${BACKEND_URL}/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sequence,
          tempo: grille.tempo,
          drums: this.drumsEnabled,
          bass: this.bassEnabled,
          arpeggios: this.arpeggiosEnabled,
          pattern: this.drumPattern,
          sig: this.sig,
          inst_val: this.instrument,
        }),
      });

      if (!resp.ok) {
        console.error('⚠️ Erreur backend');
        this.playing = false;
        return;
      }

      const beatDuration = 60000 / grille.tempo;
      for (let idx = 0; idx < grille.chords.length && this.playing; idx++) {
        if (this.onChordHighlight) this.onChordHighlight(idx);
        const c = grille.chords[idx];
        const beats = 4.0 / c.time;
        const chordMs = Math.round(beatDuration * beats);
        await new Promise(r => setTimeout(r, chordMs));
      }

      if (this.onChordHighlight) this.onChordHighlight(-1);
    } catch (e) {
      console.error('Erreur:', e);
    }
    this.playing = false;
  }

  async stop() {
    this.playing = false;
    try {
      await fetch(`${BACKEND_URL}/stop`, { method: 'POST' });
    } catch {}
  }

  get isPlaying() { return this.playing; }
}
