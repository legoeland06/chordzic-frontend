/**
 * InstrumentPicker — sélecteur d'instruments par piste pour le rendu WAV.
 *
 * Charge la liste des instruments disponibles via `/instruments-list`
 * (banques SFZ + plugins VST3 natifs) et permet d'affecter un instrument
 * à chaque piste. Une piste sans instrument → FluidSynth (GM), le moteur
 * historique. La sélection est persistée côté application (localStorage).
 */
import { useEffect, useMemo, useState } from 'react';
import { backendUrl } from '../lib/chordUtils';

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

export default function InstrumentPicker({ channels, value, onChange, onClose }: Props) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

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

  const sfz = useMemo(() => catalog.filter(i => i.kind === 'sfz'), [catalog]);
  const vst3 = useMemo(() => catalog.filter(i => i.kind === 'vst3'), [catalog]);

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
          <h2 className="text-white font-bold text-lg">🎛️ Instruments du rendu</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-800 text-gray-400 border border-gray-700 hover:text-white transition-colors"
            title="Fermer"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-gray-400 mb-4 leading-relaxed">
          Choisis un instrument par piste pour le rendu WAV. Les banques{' '}
          <span className="text-cyan-300">SFZ</span> (libres) et les plugins{' '}
          <span className="text-emerald-300">VST3</span> natifs sont détectés
          automatiquement. Piste sans instrument → <b>FluidSynth (GM)</b>.
        </p>

        {loading ? (
          <p className="text-gray-500 text-sm py-6 text-center">Chargement des instruments…</p>
        ) : catalog.length === 0 ? (
          <p className="text-red-400 text-sm py-6 text-center">
            Aucun instrument détecté — vérifie que le serveur tourne et que des
            banques SFZ / plugins VST3 sont installés.
          </p>
        ) : (
          <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
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
