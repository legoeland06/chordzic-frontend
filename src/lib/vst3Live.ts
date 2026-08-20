/**
 * vst3Live.ts — moteur VST3 live (Surge XT) : monitoring des notes du
 * pianiste par le plugin au lieu du thru MIDI (Roland GM).
 *
 * Le serveur héberge le moteur temps réel (MIDI → Surge → audio USB →
 * haut-parleurs du Roland). Ce module expose l'API HTTP, la persistance
 * de la préférence (localStorage) et le regroupement des 637 presets
 * Surge par catégorie pour le sélecteur.
 */
import { backendUrl } from './chordUtils';

export interface LiveVst3Preset {
  name: string;
  path: string;
}

export interface LiveVst3State {
  enabled: boolean;
  preset: LiveVst3Preset | null;
  error: string | null;
}

export interface SurgePreset {
  name: string;
  path: string;
  category: string;
}

/** Préférence persistée : moteur actif ? quel preset (chemin) ? */
export interface SavedLiveVst3 {
  enabled: boolean;
  preset: string | null;
}

const STORAGE_KEY = 'chordzic_live_vst3';

/** Lit la préférence persistée (retourne un état désactivé si absente). */
export function loadSavedLiveVst3(): SavedLiveVst3 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as SavedLiveVst3;
      return { enabled: !!v.enabled, preset: typeof v.preset === 'string' ? v.preset : null };
    }
  } catch { /* stockage indisponible */ }
  return { enabled: false, preset: null };
}

/** Persiste la préférence (enabled + chemin du preset). */
export function saveLiveVst3(saved: SavedLiveVst3): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch { /* stockage indisponible */ }
}

/** État courant du moteur côté serveur. */
export async function fetchLiveVst3(): Promise<LiveVst3State> {
  const resp = await fetch(`${backendUrl()}/live-vst3`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return (await resp.json()) as LiveVst3State;
}

/**
 * Active/désactive le moteur (et change le preset au passage).
 * `preset` = chemin .fxp OU nom partiel (résolu côté serveur).
 * Retourne l'état serveur après l'opération ; lève une erreur sinon.
 */
export async function setLiveVst3(enabled: boolean, preset?: string | null): Promise<LiveVst3State> {
  const body: Record<string, unknown> = { enabled };
  if (enabled && preset) body.preset = preset;
  const resp = await fetch(`${backendUrl()}/live-vst3`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await resp.json()) as { ok: boolean; error?: string; state?: LiveVst3State };
  if (!resp.ok || !data.ok) {
    throw new Error(data.error ?? `HTTP ${resp.status}`);
  }
  return data.state ?? { enabled: false, preset: null, error: null };
}

/** Liste des 637 presets Surge (patches_factory), catégorisés. */
export async function fetchSurgePresets(): Promise<SurgePreset[]> {
  const resp = await fetch(`${backendUrl()}/vst3-presets`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return (await resp.json()) as SurgePreset[];
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
