/**
 * InstrumentPicker — 🎛️ Instruments : moteur live (ce que le pianiste
 * entend en jouant) + assignation d'instruments par piste (rendu WAV).
 *
 * Moteur live (3 sources) :
 *   🔌 thru      → les notes reviennent au Roland (son GM interne)
 *   🎸 vst3      → Surge XT → audio USB → haut-parleurs du Roland (637 presets)
 *   🎹 fluid     → FluidSynth (SoundFont GM) — instrument GM au choix
 * Navigation : ←/→ change de source, ↑/↓ change d'instrument (incrément
 * facile), le choix s'applique immédiatement.
 *
 * Assignation par piste : glisser-déposé d'un instrument (ou <select>) vers
 * une piste → l'instrument est utilisé par le serveur au rendu WAV (Play).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { backendUrl } from '../lib/chordUtils';
import {
  fetchLiveInstrument, fetchSoundfonts, fetchSurgePresets,
  filterPresets, formatSize, GM_PROGRAMS, groupPresets,
  LiveInstrumentState, LiveSource, nextSource, RenderInstrument,
  setLiveInstrument, SoundfontInfo, stepInList, SurgePreset,
} from '../lib/liveInstrument';

interface Props {
  /** Pistes : {canal, label} — ordre d'affichage. */
  channels: { channel: number; label: string }[];
  /** Sélection courante : canal → instrument (fluidsynth = vide/absent). */
  value: Record<number, RenderInstrument>;
  onChange: (v: Record<number, RenderInstrument>) => void;
  /** État du moteur live (serveur). */
  live: LiveInstrumentState;
  /** Change le moteur live : (source, {preset|program}). */
  onLiveChange: (source: LiveSource, preset?: string | null, program?: number | null) => void;
  onClose: () => void;
  /** Mode Live : masque l'assignation par piste (rendu WAV) et l'onglet
   * SFZ — seul le choix du son du moteur live reste utile au pianiste. */
  liveOnly?: boolean;
  /** Changement du moteur live en cours (désactive les boutons, le badge
   * du LivePiano affiche « ⏳ ») — géré par le parent (source de vérité). */
  liveBusy?: boolean;
  /** Dernière erreur du moteur live (affichée dans le modal + sur le
   * badge du LivePiano). */
  liveError?: string | null;
}

interface CatalogItem {
  name: string;
  path: string;
  kind: 'sfz' | 'vst3';
}

type Tab = 'best' | 'surge' | 'sfz' | 'sf2';

/** Nom d'affichage lisible : "CelloEnsSusVib" → "Cello Ens Sus Vib". */
function prettyName(name: string): string {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\.sfz$/i, '')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

const SOURCE_META: Record<LiveSource, { icon: string; label: string; hint: string }> = {
  thru: { icon: '🔌', label: 'Roland GM', hint: 'Son interne du Roland (thru MIDI)' },
  vst3: { icon: '🎸', label: 'Surge XT', hint: 'Preset Surge → audio USB → haut-parleurs du Roland' },
  fluid: { icon: '🎹', label: 'FluidSynth', hint: 'SoundFont GM du serveur (son PC)' },
};

export default function InstrumentPicker({
  channels, value, onChange, live, onLiveChange, onClose, liveOnly = false,
  liveBusy = false, liveError = null,
}: Props) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [surgePresets, setSurgePresets] = useState<SurgePreset[]>([]);
  const [surgeLoading, setSurgeLoading] = useState(true);
  const [soundfonts, setSoundfonts] = useState<SoundfontInfo[]>([]);
  const [sfLoading, setSfLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('best');
  const [query, setQuery] = useState('');
  /** Piste survolée par un drag (highlight). */
  const [dragOverCh, setDragOverCh] = useState<number | null>(null);
  /** Index de l'élément sélectionné dans la liste plate (clavier ↑/↓). */
  const [selIndex, setSelIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${backendUrl()}/instruments-list`);
        const data = (await resp.json()) as CatalogItem[];
        if (!cancelled) setCatalog(data);
      } catch { /* serveur injoignable */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [surge, sfs] = await Promise.all([fetchSurgePresets(), fetchSoundfonts()]);
        if (!cancelled) { setSurgePresets(surge); setSoundfonts(sfs); }
      } catch { /* serveur injoignable */ }
      finally { if (!cancelled) { setSurgeLoading(false); setSfLoading(false); } }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Listes visibles (onglet + recherche) ──
  const bestSurge = useMemo(() => surgePresets.filter(p => p.best), [surgePresets]);
  const surgeFiltered = useMemo(() => filterPresets(surgePresets, query), [surgePresets, query]);
  const bestFiltered = useMemo(() => filterPresets(bestSurge, query), [bestSurge, query]);
  const sfzItems = useMemo(() => catalog.filter(i => i.kind === 'sfz'), [catalog]);
  const sfzFiltered = useMemo(
    () => sfzItems.filter(i => !query || prettyName(i.name).toLowerCase().includes(query.toLowerCase())),
    [sfzItems, query],
  );
  const sf2Filtered = useMemo(
    () => soundfonts.filter(s => !query || s.name.toLowerCase().includes(query.toLowerCase())),
    [soundfonts, query],
  );

  /** Liste plate d'items pour l'onglet courant (navigation ↑/↓ + rendu). */
  type FlatItem =
    | { kind: 'surge'; preset: SurgePreset }
    | { kind: 'sfz'; item: CatalogItem }
    | { kind: 'sf2'; sf: SoundfontInfo };
  const flatList: FlatItem[] = useMemo(() => {
    if (tab === 'best') return bestFiltered.map(preset => ({ kind: 'surge' as const, preset }));
    if (tab === 'surge') return surgeFiltered.map(preset => ({ kind: 'surge' as const, preset }));
    if (tab === 'sfz') return sfzFiltered.map(item => ({ kind: 'sfz' as const, item }));
    return sf2Filtered.map(sf => ({ kind: 'sf2' as const, sf }));
  }, [tab, bestFiltered, surgeFiltered, sfzFiltered, sf2Filtered]);

  const itemKey = (i: FlatItem) =>
    i.kind === 'surge' ? i.preset.path : i.kind === 'sfz' ? i.item.path : i.sf.path;

  // Sélection courante dans la liste plate : l'instrument live si présent.
  const livePath = live.source === 'vst3' ? live.vst3.preset?.path ?? null : null;
  useEffect(() => {
    const idx = flatList.findIndex(i => itemKey(i) === livePath);
    setSelIndex(idx >= 0 ? idx : 0);
  }, [tab, query, livePath, flatList]);

  // ── Application au live ──
  const applyLive = useCallback(async (source: LiveSource, preset?: string | null, program?: number | null) => {
    // L'état busy/erreur est géré par le parent (handleLiveChange) : c'est la
    // source de vérité partagée avec le badge du LivePiano.
    await onLiveChange(source, preset, program);
  }, [onLiveChange]);

  /** Applique un item au live (seuls les presets Surge sont live-compatibles). */
  const applyItemLive = useCallback((item: FlatItem) => {
    if (item.kind === 'surge') {
      void applyLive('vst3', item.preset.path);
    }
  }, [applyLive]);

  // ── Navigation clavier (le modal entier écoute) ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const delta = e.key === 'ArrowLeft' ? -1 : 1;
      const ns = nextSource(live.source, delta);
      const firstSurge = flatList.find(i => i.kind === 'surge');
      const vst3Preset =
        live.vst3.preset?.path ?? (firstSurge && firstSurge.kind === 'surge' ? firstSurge.preset.path : undefined);
      void applyLive(
        ns,
        ns === 'vst3' ? vst3Preset : null,
        ns === 'fluid' ? (live.fluid.program ?? 0) : null,
      );
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const next = stepInList(flatList, flatList[selIndex] ?? null, delta);
      if (next >= 0) {
        setSelIndex(next);
        const item = flatList[next];
        if (item) applyItemLive(item);
        listRef.current?.querySelector(`[data-idx="${next}"]`)?.scrollIntoView({ block: 'nearest' });
      }
      return;
    }
    if (e.key === 'Enter' && flatList[selIndex]) {
      e.preventDefault();
      applyItemLive(flatList[selIndex]);
    }
  }, [live, flatList, selIndex, applyLive, applyItemLive, onClose]);

  // ── Drag & drop vers les pistes ──
  const startDrag = (e: React.DragEvent, item: FlatItem) => {
    const engine = item.kind === 'surge' ? 'vst3' as const : item.kind === 'sfz' ? 'sfz' as const : 'sf2' as const;
    e.dataTransfer.setData('application/x-chordzic-instrument', JSON.stringify({ engine, path: itemKey(item) }));
    e.dataTransfer.effectAllowed = 'copy';
  };
  const dropOnChannel = (e: React.DragEvent, channel: number) => {
    e.preventDefault();
    setDragOverCh(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/x-chordzic-instrument')) as RenderInstrument;
      if (data.path) onChange({ ...value, [channel]: data });
    } catch { /* drop invalide */ }
  };

  // ── Sélection par piste (select) ──
  const pick = (channel: number, path: string) => {
    const next = { ...value };
    if (!path) {
      delete next[channel];
    } else {
      // L'engine est déduit de la provenance : preset Surge → vst3,
      // SoundFont → sf2, sinon catalogue (sfz/vst3 plugin).
      const surge = surgePresets.find(p => p.path === path);
      const sf = soundfonts.find(s => s.path === path);
      const item = catalog.find(i => i.path === path);
      next[channel] = surge
        ? { engine: 'vst3', path }
        : sf
          ? { engine: 'sf2', path }
          : item
            ? { engine: item.kind, path }
            : { engine: 'sfz', path };
    }
    onChange(next);
  };
  const selected = (channel: number) => value[channel]?.path ?? '';

  // ── Infos de l'instrument courant (live) ──
  const currentPreset = live.source === 'vst3' && live.vst3.preset
    ? surgePresets.find(p => p.path === live.vst3.preset?.path)
    : undefined;
  const currentName = live.source === 'thru'
    ? 'Roland GM'
    : live.source === 'vst3'
      ? (live.vst3.preset?.name ?? '—')
      : (live.fluid.program != null ? GM_PROGRAMS[live.fluid.program] ?? `GM ${live.fluid.program}` : 'GM (défaut)');
  const currentSub = live.source === 'thru'
    ? 'Son interne du piano — thru MIDI'
    : live.source === 'vst3'
      ? `${currentPreset?.category ?? 'Surge XT'} · Surge XT`
      : 'FluidSynth · MuseScore General';

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'best', label: '⭐ Best-of', count: bestSurge.length },
    { id: 'surge', label: '🎸 Surge', count: surgePresets.length },
    ...(liveOnly
      ? []
      : [{ id: 'sfz' as Tab, label: '🎻 SFZ', count: sfzItems.length }]),
    { id: 'sf2', label: '🗂 SF2/SF3', count: soundfonts.length },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-gray-900 border border-gray-700 shadow-2xl p-5 max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-bold text-lg">🎛️ Instruments</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-800 text-gray-400 border border-gray-700 hover:text-white transition-colors"
            title="Fermer (Échap)"
          >
            ✕
          </button>
        </div>

        {/* ── 🎹 Ce que tu entends en jouant ── */}
        <div className="mb-4 rounded-xl bg-gray-800/60 border border-gray-700 p-3">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">
            🎹 Ce que tu entends en jouant
          </p>

          {/* Sources */}
          <div className="flex gap-1.5 mb-3">
            {(Object.keys(SOURCE_META) as LiveSource[]).map(src => {
              const meta = SOURCE_META[src];
              const active = live.source === src;
              return (
                <button
                  key={src}
                  onClick={() => void applyLive(src, src === 'vst3' ? (live.vst3.preset?.path ?? undefined) : null, src === 'fluid' ? (live.fluid.program ?? 0) : null)}
                  disabled={liveBusy}
                  title={meta.hint}
                  className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50 ${
                    active
                      ? src === 'vst3'
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                        : src === 'fluid'
                          ? 'bg-sky-600/20 border-sky-500 text-sky-300'
                          : 'bg-amber-600/20 border-amber-500 text-amber-300'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {meta.icon} {meta.label}
                </button>
              );
            })}
          </div>

          {/* Instrument courant */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const next = stepInList(flatList, flatList[selIndex] ?? null, -1);
                if (next >= 0) { setSelIndex(next); applyItemLive(flatList[next]); }
              }}
              disabled={liveBusy}
              className="shrink-0 w-9 h-9 rounded-lg bg-gray-900 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors text-lg disabled:opacity-40"
              title="Instrument précédent (↑)"
            >
              ◀
            </button>
            <div className="flex-1 min-w-0 text-center">
              <p className={`text-xl font-bold truncate ${live.source === 'vst3' ? 'text-emerald-300' : live.source === 'fluid' ? 'text-sky-300' : 'text-amber-300'}`}>
                {live.source === 'vst3' && currentPreset?.best ? '⭐ ' : ''}{currentName}
              </p>
              <p className="text-[11px] text-gray-500 truncate">{currentSub}</p>
            </div>
            <button
              onClick={() => {
                const next = stepInList(flatList, flatList[selIndex] ?? null, 1);
                if (next >= 0) { setSelIndex(next); applyItemLive(flatList[next]); }
              }}
              disabled={liveBusy}
              className="shrink-0 w-9 h-9 rounded-lg bg-gray-900 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors text-lg disabled:opacity-40"
              title="Instrument suivant (↓)"
            >
              ▶
            </button>
          </div>

          {/* Instrument GM (source FluidSynth) */}
          {live.source === 'fluid' && (
            <select
              value={live.fluid.program ?? 0}
              onChange={e => void applyLive('fluid', null, Number(e.target.value))}
              disabled={liveBusy}
              className="mt-2 w-full rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-xs px-2 py-1.5 focus:outline-none focus:border-sky-500"
            >
              {GM_PROGRAMS.map((name, i) => (
                <option key={i} value={i}>{i + 1}. {name}</option>
              ))}
            </select>
          )}

          <p className="text-[10px] text-gray-500 mt-2">
            ←/→ source · ↑/↓ instrument · le choix s'applique immédiatement
          </p>
          {(liveError || live.vst3.error) && (
            <p className="text-[11px] text-red-400 mt-1">⚠️ {liveError ?? live.vst3.error}</p>
          )}
        </div>

        {/* ── Liste d'instruments ── */}
        <div className="mb-4">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="🔍 Recherche (nom, catégorie…)"
            className="w-full mb-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-xs px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
          />
          <div className="flex gap-1 mb-1.5 flex-wrap">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                  tab === t.id
                    ? 'bg-cyan-600/20 border-cyan-500 text-cyan-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'
                }`}
              >
                {t.label} <span className="text-gray-600">{t.count}</span>
              </button>
            ))}
          </div>

          <div
            ref={listRef}
            className="max-h-[26vh] overflow-y-auto rounded-lg bg-gray-950/60 border border-gray-800 divide-y divide-gray-800/60"
          >
            {surgeLoading || loading || sfLoading ? (
              <p className="text-gray-500 text-xs py-4 text-center">Chargement…</p>
            ) : flatList.length === 0 ? (
              <p className="text-gray-500 text-xs py-4 text-center">Aucun instrument — vérifie le serveur.</p>
            ) : (
              flatList.map((item, idx) => {
                const key = itemKey(item);
                const isSel = idx === selIndex;
                const isLive = key === livePath;
                const label = item.kind === 'surge' ? item.preset.name : item.kind === 'sfz' ? prettyName(item.item.name) : item.sf.name;
                const sub = item.kind === 'surge'
                  ? item.preset.category
                  : item.kind === 'sfz' ? 'SFZ' : `${item.sf.kind.toUpperCase()} · ${formatSize(item.sf.size)}`;
                return (
                  <div
                    key={key}
                    data-idx={idx}
                    draggable={!liveOnly}
                    onDragStart={e => startDrag(e, item)}
                    onClick={() => { setSelIndex(idx); applyItemLive(item); }}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 cursor-pointer transition-colors ${
                      isSel ? 'bg-cyan-600/15' : isLive ? 'bg-emerald-600/10' : 'hover:bg-gray-800/60'
                    }`}
                    title={item.kind === 'surge' ? 'Clic : entendre ce son · Glisser : assigner à une piste' : liveOnly ? 'Clic : entendre ce son' : 'Glisser : assigner à une piste (rendu WAV)'}
                  >
                    <span className="text-xs text-gray-200 truncate">
                      {item.kind === 'surge' && item.preset.best ? '⭐ ' : ''}{label}
                    </span>
                    <span className="shrink-0 text-[10px] text-gray-500">
                      {isLive ? '🔊 ' : ''}{sub}
                    </span>
                  </div>
                );
              })
            )}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            {liveOnly
              ? 'Clic : le son s\'applique immédiatement à ce que tu joues'
              : 'Glisse un instrument sur une piste ci-dessous pour l\'assigner au rendu WAV.'}
          </p>
        </div>

        {/* ── 📦 Assignation par piste (rendu WAV) — masquée en mode Live ── */}
        {!liveOnly && (
          <div className="rounded-xl bg-gray-800/40 border border-gray-700 p-3">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">
            📦 Par piste — utilisé au rendu WAV (▶ Play)
          </p>
          <div className="space-y-1.5">
            {channels.map(({ channel, label }) => (
              <div
                key={channel}
                onDragOver={e => { e.preventDefault(); setDragOverCh(channel); }}
                onDragLeave={() => setDragOverCh(ch => ch === channel ? null : ch)}
                onDrop={e => dropOnChannel(e, channel)}
                className={`flex items-center gap-2 rounded-lg border px-2 py-1 transition-colors ${
                  dragOverCh === channel
                    ? 'border-cyan-400 bg-cyan-600/10'
                    : value[channel]
                      ? 'border-cyan-700/60 bg-gray-900'
                      : 'border-gray-800 bg-gray-900/60'
                }`}
              >
                <span className="w-20 shrink-0 text-[11px] text-gray-300 font-medium">
                  {label}
                  <span className="text-gray-600"> ch{channel}</span>
                </span>
                <select
                  value={selected(channel)}
                  onChange={e => pick(channel, e.target.value)}
                  className="flex-1 min-w-0 rounded-md bg-gray-800 border border-gray-700 text-gray-200 text-[11px] px-1.5 py-1 focus:outline-none focus:border-cyan-500"
                >
                  <option value="">FluidSynth (GM)</option>
                  {bestSurge.length > 0 && (
                    <optgroup label={`⭐ Surge best-of (${bestSurge.length})`}>
                      {bestSurge.map(p => (
                        <option key={p.path} value={p.path}>{p.name} ({p.category})</option>
                      ))}
                    </optgroup>
                  )}
                  {surgePresets.length > 0 && (
                    <optgroup label={`🎸 Surge (${surgePresets.length})`}>
                      {surgePresets.map(p => (
                        <option key={p.path} value={p.path}>{p.name} ({p.category})</option>
                      ))}
                    </optgroup>
                  )}
                  {sfzItems.length > 0 && (
                    <optgroup label={`🎻 SFZ (${sfzItems.length})`}>
                      {sfzItems.map(i => (
                        <option key={i.path} value={i.path}>{prettyName(i.name)}</option>
                      ))}
                    </optgroup>
                  )}
                  {soundfonts.length > 0 && (
                    <optgroup label={`🗂 SoundFonts (${soundfonts.length})`}>
                      {soundfonts.map(s => (
                        <option key={s.path} value={s.path}>{s.name} ({s.kind.toUpperCase()})</option>
                      ))}
                    </optgroup>
                  )}
                  {catalog.filter(i => i.kind === 'vst3').length > 0 && (
                    <optgroup label={`🔌 VST3 plugins (${catalog.filter(i => i.kind === 'vst3').length})`}>
                      {catalog.filter(i => i.kind === 'vst3').map(i => (
                        <option key={i.path} value={i.path}>{i.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {value[channel] && (
                  <button
                    onClick={() => pick(channel, '')}
                    className="shrink-0 text-gray-500 hover:text-white text-xs px-1"
                    title="Revenir à FluidSynth (GM)"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          {!liveOnly && (
            <button
              onClick={() => onChange({})}
              className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 border border-gray-700 hover:text-white transition-colors text-sm"
              title="Revenir au rendu FluidSynth (GM) pour toutes les pistes"
            >
              ↺ Tout GM
            </button>
          )}
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
