import { ChordData, GrilleData, NOTE_TO_MIDI } from '../types/chord';

export type AudioState = 'idle' | 'playing' | 'stopped';

const BACKEND_URL = 'http://localhost:4000';

export class AudioEngine {
  private playing = false;
  private onChordHighlight?: (idx: number) => void;
  private drumsEnabled = true;
  private bassEnabled = true;
  private arpeggiosEnabled = true;
  private drumPattern = 'rock';

  static readonly INSTRUMENTS = [
    'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano',
    'Violin', 'Viola', 'Cello', 'Contrabass',
  ];

  constructor() {}

  setDrums(v: boolean) { this.drumsEnabled = v; this.sendConfig(); }
  setBass(v: boolean) { this.bassEnabled = v; this.sendConfig(); }
  setArpeggios(v: boolean) { this.arpeggiosEnabled = v; this.sendConfig(); }
  setPattern(p: string) { this.drumPattern = p; this.sendConfig(); }
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

  setProgram(_index: number) {}
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
