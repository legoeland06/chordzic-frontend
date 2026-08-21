/**
 * drumNames.ts — noms des percussions pour la marge du Piano Roll.
 *
 * Quand une piste drums (canal 9) est éditée, la marge rétractable du
 * Piano Roll affiche le nom de chaque percussion au lieu des notes de
 * piano. Deux sources :
 *  - kit SFZ assigné (renderInstruments[9] engine sfz) : mapping parseé
 *    par le serveur (`GET /drum-map?path=…`) — noms exacts du kit ;
 *  - sinon : table GM standard (kit FluidSynth par défaut).
 */
import { backendUrl } from './chordUtils';

/** Table GM : pitch MIDI → nom de percussion (kit GM standard). */
export const GM_DRUM_NAMES: Record<number, string> = {
  35: 'Kick', 36: 'Kick 1', 37: 'Side Stick', 38: 'Snare', 39: 'Clap',
  40: 'Snare (elec)', 41: 'Tom (floor bas)', 42: 'Hi-Hat (closed)',
  43: 'Tom (floor haut)', 44: 'Hi-Hat (pedal)', 45: 'Tom (bas)',
  46: 'Hi-Hat (open)', 47: 'Tom (mid-bas)', 48: 'Tom (mid-haut)',
  49: 'Crash 1', 50: 'Tom (haut)', 51: 'Ride', 52: 'Cymbal (chinese)',
  53: 'Ride (bell)', 54: 'Tambourine', 55: 'Splash', 56: 'Cowbell',
  57: 'Crash 2', 58: 'Vibraslap', 59: 'Ride 2', 60: 'Bongo (haut)',
  61: 'Bongo (bas)', 62: 'Conga (mute)', 63: 'Conga (haut)', 64: 'Conga (bas)',
  65: 'Timbale', 66: 'Timbale (haut)', 67: 'Agogo', 68: 'Agogo (bas)',
  69: 'Cabasa', 70: 'Maracas', 71: 'Sifflet', 72: 'Sifflet (bas)',
  73: 'Guiro', 74: 'Guiro (bas)', 75: 'Claves', 76: 'Woodblock',
  77: 'Woodblock (bas)', 78: 'Cuica', 79: 'Cuica (bas)', 80: 'Triangle',
  81: 'Triangle (ouvert)',
};

export interface DrumMapEntry {
  pitch: number;
  name: string;
}

/** Récupère le mapping pitch → nom d'un kit SFZ de batterie (serveur).
 * Retourne null si le serveur ne peut pas le parser (kit non drum). */
export async function fetchDrumMap(sfzPath: string): Promise<Record<number, string> | null> {
  try {
    const resp = await fetch(`${backendUrl()}/drum-map?path=${encodeURIComponent(sfzPath)}`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as DrumMapEntry[];
    if (!Array.isArray(data) || data.length === 0) return null;
    const map: Record<number, string> = {};
    for (const e of data) map[e.pitch] = e.name;
    return map;
  } catch {
    return null;
  }
}

/**
 * Nom d'une percussion pour un pitch : le kit SFZ assigné s'il le connaît,
 * sinon la table GM, sinon le numéro brut (« 42 »).
 */
export function drumName(pitch: number, kitMap: Record<number, string> | null): string {
  if (kitMap && kitMap[pitch] !== undefined) return kitMap[pitch];
  return GM_DRUM_NAMES[pitch] ?? String(pitch);
}
