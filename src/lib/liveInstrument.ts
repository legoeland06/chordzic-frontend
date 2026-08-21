/**
 * liveInstrument.ts — moteur live multi-source + instruments.
 *
 * Le pianiste joue sur le Roland et entend le son de la source choisie :
 *   - thru  : les notes reviennent au Roland (son GM interne) — défaut
 *   - vst3   : Surge XT → audio USB → haut-parleurs du Roland (637 presets)
 *   - fluid  : FluidSynth (SoundFont GM du serveur) — instrument GM au choix
 *
 * Le même sélecteur sert à l'assignation d'instruments par piste pour le
 * rendu WAV (SFZ, presets Surge, SoundFonts .sf2/.sf3, plugins VST3) — la
 * sélection est envoyée au serveur avec /render-wav au clic sur Play.
 */
import { backendUrl } from './chordUtils';

export type LiveSource = 'thru' | 'vst3' | 'fluid';

export interface LiveVst3Preset {
  name: string;
  path: string;
}

export interface LiveInstrumentState {
  source: LiveSource;
  vst3: { enabled: boolean; preset: LiveVst3Preset | null; error: string | null };
  fluid: { program: number | null; soundfont: string | null };
}

export interface SurgePreset {
  name: string;
  path: string;
  category: string;
  best: boolean;
}

export interface SoundfontInfo {
  name: string;
  path: string;
  kind: 'sf2' | 'sf3';
  size: number;
}

/** Instrument du rendu assigné à une piste. */
export interface RenderInstrument {
  engine: 'sfz' | 'vst3' | 'fluidsynth' | 'sf2';
  path: string;
}

/** Préférence persistée du moteur live. */
export interface SavedLiveInstrument {
  source: LiveSource;
  preset: string | null;
  program: number | null;
}

const STORAGE_KEY = 'chordzic_live_instrument';

/** Lit la préférence persistée (défaut : thru, rien). */
export function loadSavedLiveInstrument(): SavedLiveInstrument {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as SavedLiveInstrument;
      const source: LiveSource =
        v.source === 'vst3' || v.source === 'fluid' ? v.source : 'thru';
      return {
        source,
        preset: typeof v.preset === 'string' ? v.preset : null,
        program: typeof v.program === 'number' ? v.program : null,
      };
    }
  } catch { /* stockage indisponible */ }
  return { source: 'thru', preset: null, program: null };
}

/** Persiste la préférence du moteur live. */
export function saveLiveInstrument(saved: SavedLiveInstrument): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch { /* stockage indisponible */ }
}

/** État courant du moteur live côté serveur. */
export async function fetchLiveInstrument(): Promise<LiveInstrumentState> {
  const resp = await fetch(`${backendUrl()}/live-instrument`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return (await resp.json()) as LiveInstrumentState;
}

/** Options d'un changement de source. */
export interface LiveChangeOptions {
  /** Source vst3 : preset (chemin .fxp ou nom partiel). */
  preset?: string | null;
  /** Source fluid : instrument GM (0-127). */
  program?: number | null;
  /** Source fluid : SoundFont (chemin, None = celle du serveur). */
  soundfont?: string | null;
}

/**
 * Change la source du moteur live. Retourne l'état serveur ; lève une
 * erreur sinon (Roland débranché, FluidSynth absent, preset inconnu…).
 */
export async function setLiveInstrument(
  source: LiveSource,
  opts: LiveChangeOptions = {},
): Promise<LiveInstrumentState> {
  const body: Record<string, unknown> = { source };
  if (source === 'vst3' && opts.preset) body.preset = opts.preset;
  if (source === 'fluid') {
    if (opts.program != null) body.program = opts.program;
    if (opts.soundfont != null) body.soundfont = opts.soundfont;
  }
  const resp = await fetch(`${backendUrl()}/live-instrument`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await resp.json()) as { ok: boolean; error?: string; state?: LiveInstrumentState };
  if (!resp.ok || !data.ok) {
    throw new Error(data.error ?? `HTTP ${resp.status}`);
  }
  return data.state ?? { source: 'thru', vst3: { enabled: false, preset: null, error: null }, fluid: { program: null, soundfont: null } };
}

/** Liste des presets Surge (patches_factory), `best` pour le best-of ⭐. */
export async function fetchSurgePresets(): Promise<SurgePreset[]> {
  const resp = await fetch(`${backendUrl()}/vst3-presets`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return (await resp.json()) as SurgePreset[];
}

/** Liste des SoundFonts .sf2/.sf3 disponibles. */
export async function fetchSoundfonts(): Promise<SoundfontInfo[]> {
  const resp = await fetch(`${backendUrl()}/soundfonts-list`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return (await resp.json()) as SoundfontInfo[];
}

/** Regroupe les presets par catégorie (ordre du serveur conservé). */
export function groupPresets(presets: SurgePreset[]): { category: string; items: SurgePreset[] }[] {
  const map = new Map<string, SurgePreset[]>();
  for (const p of presets) {
    const list = map.get(p.category) ?? [];
    list.push(p);
    map.set(p.category, list);
  }
  return [...map.entries()].map(([category, items]) => ({ category, items }));
}

/** Filtre les presets par recherche (nom OU catégorie, insensible à la casse). */
export function filterPresets(presets: SurgePreset[], query: string): SurgePreset[] {
  const q = query.trim().toLowerCase();
  if (!q) return presets;
  return presets.filter(
    p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
  );
}

/**
 * Pas de navigation dans une liste (flèches ↑/↓) : retourne l'index du
 * prochain élément, avec rebouclage (wrap). `null` courant → premier/dernier.
 * Fonction pure (testable).
 */
export function stepInList(list: unknown[], current: unknown | null, delta: 1 | -1): number {
  if (list.length === 0) return -1;
  if (current === null) return delta === 1 ? 0 : list.length - 1;
  const idx = list.indexOf(current);
  if (idx === -1) return delta === 1 ? 0 : list.length - 1;
  return (idx + delta + list.length) % list.length;
}

/** Ordre de navigation des sources (flèches ←/→). */
export const SOURCES: LiveSource[] = ['thru', 'vst3', 'fluid'];

export function nextSource(s: LiveSource, delta: 1 | -1): LiveSource {
  const idx = SOURCES.indexOf(s);
  return SOURCES[(idx + delta + SOURCES.length) % SOURCES.length];
}

/** Noms des 128 instruments GM (program change FluidSynth). */
export const GM_PROGRAMS: string[] = [
  'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano', 'Honky-Tonk Piano',
  'Electric Piano 1', 'Electric Piano 2', 'Harpsichord', 'Clavinet', 'Celesta', 'Glockenspiel',
  'Music Box', 'Vibraphone', 'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer', 'Drawbar Organ',
  'Percussive Organ', 'Rock Organ', 'Church Organ', 'Reed Organ', 'Accordion', 'Harmonica',
  'Tango Accordion', 'Acoustic Guitar (nylon)', 'Acoustic Guitar (steel)', 'Electric Guitar (jazz)',
  'Electric Guitar (clean)', 'Electric Guitar (muted)', 'Overdriven Guitar', 'Distortion Guitar',
  'Guitar Harmonics', 'Acoustic Bass', 'Electric Bass (finger)', 'Electric Bass (pick)', 'Fretless Bass',
  'Slap Bass 1', 'Slap Bass 2', 'Synth Bass 1', 'Synth Bass 2', 'Violin', 'Viola', 'Cello',
  'Contrabass', 'Tremolo Strings', 'Pizzicato Strings', 'Orchestral Harp', 'Timpani', 'String Ensemble 1',
  'String Ensemble 2', 'Synth Strings 1', 'Synth Strings 2', 'Choir Aahs', 'Voice Oohs', 'Synth Voice',
  'Orchestra Hit', 'Trumpet', 'Trombone', 'Tuba', 'Muted Trumpet', 'French Horn', 'Brass Section',
  'Synth Brass 1', 'Synth Brass 2', 'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax', 'Oboe',
  'English Horn', 'Bassoon', 'Clarinet', 'Piccolo', 'Flute', 'Recorder', 'Pan Flute', 'Blown Bottle',
  'Shakuhachi', 'Whistle', 'Ocarina', 'Lead 1 (square)', 'Lead 2 (sawtooth)', 'Lead 3 (calliope)',
  'Lead 4 (chiff)', 'Lead 5 (charang)', 'Lead 6 (voice)', 'Lead 7 (fifths)', 'Lead 8 (bass + lead)',
  'Pad 1 (new age)', 'Pad 2 (warm)', 'Pad 3 (polysynth)', 'Pad 4 (choir)', 'Pad 5 (bowed)',
  'Pad 6 (metallic)', 'Pad 7 (halo)', 'Pad 8 (sweep)', 'FX 1 (rain)', 'FX 2 (soundtrack)',
  'FX 3 (crystal)', 'FX 4 (atmosphere)', 'FX 5 (brightness)', 'FX 6 (goblins)', 'FX 7 (echoes)',
  'FX 8 (sci-fi)', 'Sitar', 'Banjo', 'Shamisen', 'Koto', 'Kalimba', 'Bagpipe', 'Fiddle', 'Shanai',
  'Tinkle Bell', 'Agogo', 'Steel Drums', 'Woodblock', 'Taiko Drum', 'Melodic Tom', 'Synth Drum',
  'Reverse Cymbal', 'Guitar Fret Noise', 'Breath Noise', 'Seashore', 'Bird Tweet', 'Telephone Ring',
  'Helicopter', 'Applause', 'Gunshot',
];

/** Formatte une taille de fichier en Ko/Mo lisible. */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} Mo`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${bytes} o`;
}

/**
 * Libellé lisible du son actuel du moteur live (affiché sur le LivePiano
 * en mode Live) : la source + l'instrument choisi.
 */
export function liveInstrumentLabel(state: LiveInstrumentState): string {
  if (state.source === 'thru') return '🔌 Roland GM';
  if (state.source === 'vst3') {
    const p = state.vst3.preset;
    return `🎸 Surge — ${p ? p.name : 'preset par défaut'}`;
  }
  const prog = state.fluid.program ?? 0;
  return `🎹 FluidSynth — ${GM_PROGRAMS[prog] ?? 'GM'}`;
}
