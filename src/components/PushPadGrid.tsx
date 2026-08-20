/**
 * 🥁 PushPadGrid — simulation Ableton Push 3 : 64 pads (8×8) déclenchables.
 *
 * - Chaque pad joue un sample importé (wav/mp3/ogg/flac/m4a/aiff) ; un appui
 *   ARRÊTE la lecture précédente du pad et REDÉCLENCHE sans délai (retrigger,
 *   comportement drum machine).
 * - Import par pad (bouton 🎵 ou clic droit) ou global (bouton « Import »),
 *   uploadé sur le serveur (~/samples/pads/) et joué via Web Audio.
 * - Couleurs : palette + mode de dégradé (solide / horizontal / vertical /
 *   diagonal) — l'utilisateur choisit la teinte, les 64 pads s'échelonnent.
 * - Persistance locale (localStorage `chordzic_pads`) : slots, couleurs,
 *   volume — retrouvés au prochain chargement.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Upload, X, Volume2 } from 'lucide-react';
import {
  EMPTY_PAD_COLOR,
  PAD_COLS,
  PAD_COUNT,
  PAD_PALETTE,
  PadColorConfig,
  PadPlayer,
  PadSlot,
  GradientMode,
  emptyPads,
  labelFromFilename,
  padColor,
  padSampleUrl,
  uploadPadSample,
} from '../lib/padBank';

const LS_KEY = 'chordzic_pads';

interface StoredPads {
  slots: PadSlot[];
  color: PadColorConfig;
  volume: number;
}

const DEFAULT_STORED: StoredPads = {
  slots: emptyPads(),
  color: { ...EMPTY_PAD_COLOR },
  volume: 0.9,
};

function loadStored(): StoredPads {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_STORED;
    const j = JSON.parse(raw);
    const slots = Array.isArray(j.slots) && j.slots.length === PAD_COUNT
      ? j.slots.map((s: PadSlot) => ({ file: s.file ?? null, label: s.label ?? '' }))
      : emptyPads();
    return {
      slots,
      color: {
        hue: typeof j.color?.hue === 'number' ? j.color.hue : EMPTY_PAD_COLOR.hue,
        mode: (['solid', 'h', 'v', 'diag'] as const).includes(j.color?.mode) ? j.color.mode : EMPTY_PAD_COLOR.mode,
      },
      volume: typeof j.volume === 'number' ? Math.max(0, Math.min(1, j.volume)) : 0.9,
    };
  } catch {
    return DEFAULT_STORED;
  }
}

interface PushPadGridProps {
  onClose: () => void;
}

function PushPadGrid({ onClose }: PushPadGridProps) {
  const [stored] = useState(loadStored);
  const [slots, setSlots] = useState<PadSlot[]>(stored.slots);
  const [color, setColor] = useState<PadColorConfig>(stored.color);
  const [volume, setVolume] = useState(stored.volume);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  // Lecteur Web Audio (créé au montage — déclenché par un clic → autoplay OK)
  const playerRef = useRef<PadPlayer | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingIndexRef = useRef<number | null>(null);

  useEffect(() => {
    const ctx = new AudioContext();
    void ctx.resume();
    const player = new PadPlayer(ctx);
    player.setVolume(stored.volume);
    playerRef.current = player;
    setPlayerReady(true);
    // Recharge les buffers des pads déjà assignés
    stored.slots.forEach((s, i) => {
      if (s.file) void player.load(i, padSampleUrl(s.file));
    });
    return () => {
      player.stopAll();
      void ctx.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persistance à chaque changement
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ slots, color, volume }));
    } catch {
      /* stockage plein — ignoré */
    }
  }, [slots, color, volume]);

  const setStatusFlash = useCallback((msg: string) => {
    setStatus(msg);
    window.setTimeout(() => setStatus(''), 2500);
  }, []);

  // ── Déclenchement (retrigger) ──
  const trigger = useCallback((index: number) => {
    playerRef.current?.trigger(index);
  }, []);

  // ── Import ──
  const pickFile = useCallback((index: number) => {
    pendingIndexRef.current = index;
    fileRef.current?.click();
  }, []);

  const onFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // Pad ciblé (clic droit / 🎵), sinon import global → premier pad libre
    const target = pendingIndexRef.current;
    let index = target;
    if (index === null) {
      index = slots.findIndex(s => !s.file);
      if (index < 0) index = 0;
    }
    setBusy(true);
    const name = await uploadPadSample(file);
    setBusy(false);
    if (!name) {
      setStatusFlash('❌ Import échoué (format non supporté ou trop gros)');
      return;
    }
    const ok = await playerRef.current?.load(index, padSampleUrl(name));
    setSlots(prev => {
      const next = [...prev];
      next[index] = { file: name, label: labelFromFilename(file.name) };
      return next;
    });
    setStatusFlash(ok ? `✅ ${file.name} → pad ${index + 1}` : '⚠️ Sample illisible');
    pendingIndexRef.current = null;
  }, [slots, setStatusFlash]);

  const clearPad = useCallback((index: number) => {
    setSlots(prev => {
      const next = [...prev];
      next[index] = { file: null, label: '' };
      return next;
    });
    playerRef.current?.stopAll();
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    pickFile(index); // clic droit = assigner
  }, [pickFile]);

  const setHue = (hue: number) => setColor(prev => ({ ...prev, hue }));
  const setMode = (mode: GradientMode) => setColor(prev => ({ ...prev, mode }));
  const onVolume = (v: number) => {
    const vol = v / 100;
    setVolume(vol);
    playerRef.current?.setVolume(vol);
  };

  const MODES: { value: GradientMode; label: string }[] = [
    { value: 'solid', label: '■' },
    { value: 'h', label: '▶' },
    { value: 'v', label: '▼' },
    { value: 'diag', label: '⤡' },
  ];

  return (
    <div className="fixed inset-1 sm:inset-2 z-50 flex items-stretch bg-black/70 backdrop-blur-sm p-1 sm:p-2">
      <div className="w-full max-w-[1100px] mx-auto bg-[#141a24] border border-gray-700 rounded-2xl shadow-2xl p-2 sm:p-3 flex flex-col gap-2 max-h-full">
        {/* ── Titre ── */}
        <div className="flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold text-gray-200 tracking-wide">
            🥁 Push 3 — Pads <span className="text-gray-500 font-normal">(64 · retrigger immédiat)</span>
          </h2>
          <div className="flex items-center gap-2">
            {status && <span className="text-[10px] text-cyan-300">{status}</span>}
            <button
              onClick={() => {
                pendingIndexRef.current = null; // import global
                fileRef.current?.click();
              }}
              disabled={busy}
              className="px-2.5 py-1 text-[10px] font-bold rounded-md bg-[#2f6ba8] border border-[#3a7ab8] text-white hover:bg-[#3a7ab8] transition-colors disabled:opacity-40"
              title="Importer un sample audio (wav/mp3/ogg/flac/m4a/aiff) vers le premier pad libre"
            >
              <Upload className="w-3 h-3 inline mr-1" /> Importer
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              title="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Grille 8×8 ── */}
        <div className="flex-1 min-h-0 grid grid-cols-8 gap-1 sm:gap-1.5 rounded-xl p-1.5 border border-gray-800 bg-[#0d1420]">
          {slots.map((slot, i) => {
            const bg = padColor(color.hue, i, color.mode);
            const has = !!slot.file;
            return (
              <button
                key={i}
                onClick={() => trigger(i)}
                onContextMenu={(e) => onContextMenu(e, i)}
                className={`relative rounded-lg border transition-transform active:scale-95 hover:brightness-110 select-none ${
                  has ? 'border-black/40' : 'border-gray-700/40'
                }`}
                style={{ background: bg, opacity: has ? 1 : 0.28 }}
                title={`Pad ${i + 1}${has ? ` — ${slot.label} (clic = jouer, clic droit = remplacer)` : ' (clic droit = assigner un sample)'}`}
              >
                {has ? (
                  <span className="absolute inset-x-0 bottom-0.5 text-center text-[8px] sm:text-[9px] font-bold text-black/70 truncate px-0.5">
                    {slot.label}
                  </span>
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] text-black/40 font-bold">
                    {i + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Barre d'outils : couleurs, dégradé, volume, astuces ── */}
        <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500 shrink-0">Couleur</span>
          <div className="flex items-center gap-1 shrink-0">
            {PAD_PALETTE.map(p => (
              <button
                key={p.name}
                onClick={() => setHue(p.hue)}
                className={`w-5 h-5 rounded-md border transition-transform hover:scale-110 ${
                  color.hue === p.hue ? 'border-white ring-1 ring-white' : 'border-black/40'
                }`}
                style={{ background: p.hue < 0 ? '#e9e9e9' : `hsl(${p.hue}, 85%, 55%)` }}
                title={p.name}
              />
            ))}
          </div>
          <div className="w-px h-4 bg-gray-700/60 shrink-0" />
          <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500 shrink-0">Dégradé</span>
          <div className="flex items-center gap-1 shrink-0">
            {MODES.map(m => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors ${
                  color.mode === m.value
                    ? 'bg-cyan-900/40 border-cyan-500/50 text-cyan-300'
                    : 'bg-gray-800/60 border-gray-700/60 text-gray-500 hover:text-gray-300'
                }`}
                title={m.value === 'solid' ? 'Solide' : m.value === 'h' ? 'Horizontal' : m.value === 'v' ? 'Vertical' : 'Diagonal'}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="w-px h-4 bg-gray-700/60 shrink-0" />
          <div className="flex items-center gap-1.5 shrink-0">
            <Volume2 className="w-3 h-3 text-gray-500" />
            <input
              type="range" min={0} max={100} value={Math.round(volume * 100)}
              onChange={(e) => onVolume(parseInt(e.target.value))}
              className="w-24 accent-green-500"
              title="Volume des pads"
            />
          </div>
          <div className="flex-1" />
          <span className="text-[9px] text-gray-500 shrink-0">
            Clic = jouer (retrigger) · Clic droit / 🎵 = assigner · {PAD_COUNT} pads
          </span>
        </div>

        {/* Input fichier caché (assignation pad ou import global) */}
        <input
          ref={fileRef}
          type="file"
          accept=".wav,.mp3,.ogg,.flac,.m4a,.aiff,audio/*"
          className="hidden"
          onChange={onFileSelected}
        />
      </div>
    </div>
  );
}

export default memo(PushPadGrid);
