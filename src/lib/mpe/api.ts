/**
 * api.ts — communication serveur du système MPE (routes /mpe*).
 *
 * Tous les modules envoient leurs gestes par ici : le serveur injecte les
 * modulations (bend / aftertouch / timbre / LFO) en direct dans le flux MIDI
 * renvoyé au clavier (Roland ou FluidSynth) et horodate les gestes pendant
 * une session Rec MIDI.
 */
import { backendUrl } from '../chordUtils';
import { EMPTY_MPE_STATE, MpePatch, MpeState } from './types';

const API_BASE = backendUrl();

/** POST /mpe — applique un geste (ou active/désactive la modal). */
export async function sendMpe(patch: MpePatch): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/mpe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** GET /mpe-state — état courant (notes tenues, canal résolu, rec…). */
export async function fetchMpeState(): Promise<MpeState> {
  try {
    const res = await fetch(`${API_BASE}/mpe-state`);
    if (!res.ok) return { ...EMPTY_MPE_STATE };
    const j = await res.json();
    return {
      enabled: !!j.enabled,
      bend: typeof j.bend === 'number' ? j.bend : EMPTY_MPE_STATE.bend,
      pressure: typeof j.pressure === 'number' ? j.pressure : 0,
      timbre: typeof j.timbre === 'number' ? j.timbre : EMPTY_MPE_STATE.timbre,
      pitch_range_st: typeof j.pitch_range_st === 'number' ? j.pitch_range_st : 2,
      lfo_freq: typeof j.lfo_freq === 'number' ? j.lfo_freq : 0,
      lfo_depth_st: typeof j.lfo_depth_st === 'number' ? j.lfo_depth_st : 0,
      lfo_shape: (['sin', 'triangle', 'square'] as const).includes(j.lfo_shape) ? j.lfo_shape : 'sin',
      target: (['auto', 'roland', 'fluid'] as const).includes(j.target) ? j.target : 'auto',
      program: typeof j.program === 'number' ? j.program : 0,
      channel: typeof j.channel === 'number' ? j.channel : null,
      target_channel: typeof j.target_channel === 'number' ? j.target_channel : 0,
      route: (['main', 'fluid', 'none'] as const).includes(j.route) ? j.route : 'none',
      echo_active: !!j.echo_active,
      fluid_ok: !!j.fluid_ok,
      main_is_fluid: !!j.main_is_fluid,
      notes: Array.isArray(j.notes) ? j.notes : [],
      rec_active: !!j.rec_active,
      effective_bend: typeof j.effective_bend === 'number' ? j.effective_bend : EMPTY_MPE_STATE.bend,
    };
  } catch {
    return { ...EMPTY_MPE_STATE };
  }
}

/** POST /mpe-reset — remet l'expression à zéro (bend centre, AT 0, CC74 neutre). */
export async function resetMpe(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/mpe-reset`, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Les 128 instruments GM (program 0-127) — pour le sélecteur du mode PC. */
export const GM_PROGRAMS: string[] = [
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
