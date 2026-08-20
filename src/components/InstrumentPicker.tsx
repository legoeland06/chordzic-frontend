/**
 * InstrumentPicker — sélecteur d'instruments pour le rendu WAV + moteur
 * VST3 live (Surge XT).
 *
 * Rendu : charge `/instruments-list` (banques SFZ + plugins VST3 natifs) et
 * permet d'affecter un instrument à chaque piste. Piste sans instrument →
 * FluidSynth (GM). Persisté en localStorage.
 *
 * Live : charge `/vst3-presets` (les 637 presets Surge XT, catégorisés) et
 * pilote le moteur temps réel du serveur (`/live-vst3`) : quand il est actif,
 * les notes du pianiste passent par Surge → audio USB → haut-parleurs du
 * Roland au lieu du thru MIDI (Roland GM).
 */
import { useEffect, useMemo, useState } from 'react';
import { backendUrl } from '../lib/chordUtils';
import {
  fetchSurgePresets,
  filterPresets,
  groupPresets,
  LiveVst3State,
  SurgePreset,
} from '../lib/vst3Live';

export interface RenderInstrument {
  engine: 'sfz' | 'vst3' | 'fluidsynth';
  path: string;
}

interface Props {
  /** Pistes : {canal, label} — ordre d'affichage. */
  channels: { channel: number; label: string }[];
  /** Sélection courante : canal → instrument (fluidsynth = vide/absent). */
  value: Record<number, RenderInstrument>;
  onChange: (v: Record<number, RenderInstrument>) => void;
  /** État du moteur VST3 live (serveur). */
  liveVst3: LiveVst3State;
  /** Change le moteur live : (activé, preset optionnel = chemin .fxp ou nom). */
  onLiveVst3Change: (enabled: boolean, preset?: string | null) => void;
  onClose: () => void;
}

interface CatalogItem {
  name: string;
  path: string;
  kind: 'sfz' | 'vst3';
}

/** Nom d'affichage lisible : "CelloEnsSusVib" → "Cello Ens Sus Vib". */
function prettyName(name: string): string {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\.sfz$/i, '')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

export default function InstrumentPicker({
  channels, value, onChange, liveVst3, onLiveVst3Change, onClose,
}: Props) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [surgePresets, setSurgePresets] = useState<SurgePreset[]>([]);
  const [surgeLoading, setSurgeLoading] = useState(true);
  /** Recherche dans les presets Surge (nom ou catégorie). */
  const [surgeQuery, setSurgeQuery] = useState('');
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${backendUrl()}/instruments-list`);
        const data = (await resp.json()) as CatalogItem[];
        if (!cancelled) setCatalog(data);
      } catch {
        /* serveur injoignable — liste vide */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchSurgePresets();
        if (!cancelled) setSurgePresets(data);
      } catch {
        /* serveur injoignable — liste vide */
      } finally {
        if (!cancelled) setSurgeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const sfz = useMemo(() => catalog.filter(i => i.kind === 'sfz'), [catalog]);
  const vst3 = useMemo(() => catalog.filter(i => i.kind === 'vst3'), [catalog]);
  const surgeGroups = useMemo(
    () => groupPresets(filterPresets(surgePresets, surgeQuery)),
    [surgePresets, surgeQuery],
  );
  const surgeCount = useMemo(() => filterPresets(surgePresets, surgeQuery).length, [surgePresets, surgeQuery]);

  /** Sélection d'une piste : vide → FluidSynth ; sinon engine déduit du catalogue. */
  const pick = (channel: number, path: string) => {
    const next = { ...value };
    if (!path) {
      delete next[channel];
    } else {
      const item = catalog.find(i => i.path === path);
      next[channel] = { engine: item?.kind ?? 'sfz', path };
    }
    onChange(next);
  };

  const selected = (channel: number) => value[channel]?.path ?? '';

  /** Bascule le moteur live. À l'activation sans preset : le preset courant
   * s'il existe, sinon le premier de la liste (ou erreur claire du serveur). */
  const toggleLive = async (enabled: boolean) => {
    setLiveBusy(true);
    setLiveError(null);
    try {
      const preset = enabled
        ? liveVst3.preset?.path ?? surgePresets[0]?.path ?? null
        : null;
      await onLiveVst3Change(enabled, preset);
    } catch (e) {
      setLiveError(e instanceof Error ? e.message : String(e));
    } finally {
      setLiveBusy(false);
    }
  };

  /** Choix d'un preset : active le moteur avec ce preset. */
  const pickLivePreset = async (path: string) => {
    if (!path) return;
    setLiveBusy(true);
    setLiveError(null);
    try {
      await onLiveVst3Change(true, path);
    } catch (e) {
      setLiveError(e instanceof Error ? e.message : String(e));
    } finally {
      setLiveBusy(false);
    }
  };

  const toggleBtn = liveVst3.enabled
    ? 'bg-emerald-600 text-white border-emerald-400'
    : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-gray-900 border border-gray-700 shadow-2xl p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-lg">🎛️ Instruments</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-800 text-gray-400 border border-gray-700 hover:text-white transition-colors"
            title="Fermer"
          >
            ✕
          </button>
        </div>

        {/* ── Moteur live VST3 (Surge XT → haut-parleurs du Roland) ── */}
        <div className="mb-4 rounded-lg bg-gray-800/60 border border-gray-700 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="min-w-0">
              <p className="text-sm text-white font-semibold">🎸 Moteur live (Surge XT)</p>
              <p className="text-[11px] text-gray-400 leading-snug">
                {liveVst3.enabled
                  ? <>Le piano sonne <span className="text-emerald-300">Surge</span> par les haut-parleurs du Roland</>
                  : <>Thru MIDI (Roland GM) — active un preset pour sonner Surge</>}
              </p>
            </div>
            <button
              onClick={() => toggleLive(!liveVst3.enabled)}
              disabled={liveBusy}
              className={`shrink-0 px-3 h-7 rounded-lg border text-xs font-bold transition-colors disabled:opacity-50 ${toggleBtn}`}
              title={liveVst3.enabled ? 'Arrêter le moteur Surge (retour thru MIDI)' : 'Démarrer le moteur Surge'}
            >
              {liveBusy ? '…' : liveVst3.enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {surgeLoading ? (
            <p className="text-xs text-gray-500 py-1">Chargement des presets Surge…</p>
          ) : surgePresets.length === 0 ? (
            <p className="text-xs text-red-400 py-1">
              Aucun preset Surge détecté — Surge XT installé sur le serveur ?
            </p>
          ) : (
            <>
              <input
                type="text"
                value={surgeQuery}
                onChange={e => setSurgeQuery(e.target.value)}
                placeholder={`Recherche parmi ${surgePresets.length} presets…`}
                className="w-full mb-1.5 rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1.5 focus:outline-none focus:border-emerald-500"
              />
              <select
                value={liveVst3.preset?.path ?? ''}
                onChange={e => pickLivePreset(e.target.value)}
                disabled={liveBusy}
                className="w-full rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1.5 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                size={4}
              >
                {liveVst3.preset && !surgePresets.some(p => p.path === liveVst3.preset?.path) && (
                  <option value={liveVst3.preset.path}>✱ {liveVst3.preset.name}</option>
                )}
                {surgeGroups.map(g => (
                  <optgroup key={g.category} label={`${g.category} (${g.items.length})`}>
                    {g.items.map(p => (
                      <option key={p.path} value={p.path}>{p.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-[10px] text-gray-500 mt-1">
                {surgeQuery ? `${surgeCount} preset(s) — ` : ''}
                Le choix d'un preset démarre le moteur (notes → Surge → audio USB).
              </p>
            </>
          )}
          {(liveError || liveVst3.error) && (
            <p className="text-[11px] text-red-400 mt-1.5">
              ⚠️ {liveError ?? liveVst3.error}
            </p>
          )}
        </div>

        {/* ── Instruments du rendu par piste ── */}
        <p className="text-xs text-gray-400 mb-2 leading-relaxed">
          Instrument par piste pour le rendu WAV. Les banques{' '}
          <span className="text-cyan-300">SFZ</span> et les plugins{' '}
          <span className="text-emerald-300">VST3</span> natifs sont détectés
          automatiquement. Piste sans instrument → <b>FluidSynth (GM)</b>.
        </p>

        {loading ? (
          <p className="text-gray-500 text-sm py-4 text-center">Chargement des instruments…</p>
        ) : catalog.length === 0 ? (
          <p className="text-red-400 text-sm py-4 text-center">
            Aucun instrument détecté — vérifie que le serveur tourne et que des
            banques SFZ / plugins VST3 sont installés.
          </p>
        ) : (
          <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
            {channels.map(({ channel, label }) => (
              <div key={channel} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-xs text-gray-300 font-medium">
                  {label}
                  <span className="text-gray-600"> (ch {channel})</span>
                </span>
                <select
                  value={selected(channel)}
                  onChange={e => pick(channel, e.target.value)}
                  className="flex-1 min-w-0 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm px-2 py-1.5 focus:outline-none focus:border-cyan-500"
                >
                  <option value="">FluidSynth (GM)</option>
                  {sfz.length > 0 && (
                    <optgroup label={`SFZ (${sfz.length})`}>
                      {sfz.map(i => (
                        <option key={i.path} value={i.path}>
                          {prettyName(i.name)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {vst3.length > 0 && (
                    <optgroup label={`VST3 (${vst3.length})`}>
                      {vst3.map(i => (
                        <option key={i.path} value={i.path}>
                          {i.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => onChange({})}
            className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 border border-gray-700 hover:text-white transition-colors text-sm"
            title="Revenir au rendu FluidSynth (GM) pour toutes les pistes"
          >
            ↺ Tout FluidSynth
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition-colors text-sm font-semibold"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
