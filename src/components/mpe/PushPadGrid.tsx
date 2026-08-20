/**
 * 🥁 PushPadGrid — simulation Ableton Push 3 : 64 pads (8×8) déclenchables.
 *
 * - Chaque pad joue un sample importé (wav/mp3/ogg/flac/m4a/aiff) ; un appui
 *   ARRÊTE la lecture précédente du pad et REDÉCLENCHE sans délai (retrigger,
 *   comportement drum machine).
 * - Import par pad (bouton 🎵 ou clic droit) ou global (bouton « Import »),
 *   uploadé sur le serveur (~/samples/pads/) et joué via Web Audio.
 * - Couleurs : chaque pad peut recevoir la couleur de son choix (mode
 *   🎨 Peindre : on sélectionne une teinte puis on clique sur les pads) ;
 *   « Appliquer à tous » ramène tous les pads au dégradé global (hue +
 *   mode). Les cases ont un dégradé interne qui leur donne un relief
 *   légèrement convexe.
 * - Tempo & métronome : l'audio importé initialise le tempo du pad
 *   (détection automatique, ajustable). Le premier déclenchement démarre
 *   un MÉTRONOME qui tourne en parallèle (audible si désiré 🔉) ; tous les
 *   appuis suivants sont quantifiés sur le prochain battement (synchronisés
 *   métronomiquement). Le bouton ■ Stop arrête pads + métronome.
 * - 🔁 Mode LOOP par défaut : les samples bouclent en continu jusqu'au
 *   ■ Stop (toggle global persistant ; un nouvel appui redéclenche la
 *   boucle depuis le début — retrigger).
 * - Persistance locale (localStorage `chordzic_pads`) : slots (samples +
 *   couleurs + tempos par pad), couleur globale, volume, mode de lecture,
 *   loop — au chargement.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Upload, X, Volume2 } from 'lucide-react';
import {
  EMPTY_PAD_COLOR,
  PAD_COUNT,
  PAD_PALETTE,
  PadColorConfig,
  PadPlayer,
  PadSlot,
  GradientMode,
  clearPadColors,
  detectTempo,
  emptyPads,
  labelFromFilename,
  padSampleUrl,
  paintPad,
  setPadTempo,
  slotColor,
  stopPadServer,
  triggerPadServer,
  uploadPadSample,
} from '../../lib/padBank';
import './PushPadGrid.css';

const LS_KEY = 'chordzic_pads';

/** Anticipation (s) des déclenchements serveur : la commande part AVANT le
 *  battement pour compenser la latence réseau + démarrage ffplay. */
const SERVER_PLAY_LEAD_S = 0.06;

/** Chemin de lecture des samples. */
type PlayMode = 'browser' | 'server';

interface StoredPads {
  slots: PadSlot[];
  color: PadColorConfig;
  volume: number;
  /** Lecture des samples : navigateur (Web Audio) ou serveur (ffplay). */
  playMode: PlayMode;
  /** Mode loop (défaut : vrai — les samples bouclent jusqu'au Stop). */
  loop: boolean;
}

const DEFAULT_STORED: StoredPads = {
  slots: emptyPads(),
  color: { ...EMPTY_PAD_COLOR },
  volume: 0.9,
  playMode: 'browser',
  loop: true,
};

function loadStored(): StoredPads {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_STORED;
    const j = JSON.parse(raw);
    const slots = Array.isArray(j.slots) && j.slots.length === PAD_COUNT
      ? j.slots.map((s: PadSlot) => ({
          file: s.file ?? null,
          label: s.label ?? '',
          // Migration : les anciens slots sans couleur suivent le dégradé global
          hue: typeof s.hue === 'number' ? s.hue : null,
          tempo: typeof s.tempo === 'number' ? s.tempo : null,
        }))
      : emptyPads();
    return {
      slots,
      color: {
        hue: typeof j.color?.hue === 'number' ? j.color.hue : EMPTY_PAD_COLOR.hue,
        mode: (['solid', 'h', 'v', 'diag'] as const).includes(j.color?.mode) ? j.color.mode : EMPTY_PAD_COLOR.mode,
      },
      volume: typeof j.volume === 'number' ? Math.max(0, Math.min(1, j.volume)) : 0.9,
      playMode: j.playMode === 'server' ? 'server' : 'browser',
      loop: j.loop === false ? false : true, // défaut : loop ON
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
  /** Mode peinture : le clic sur un pad lui applique la couleur choisie. */
  const [painting, setPainting] = useState(false);
  /** État du métronome (badge temps réel). */
  const [metro, setMetro] = useState({ running: false, beat: 0, bpm: 120 });
  /** Pads ARMÉS (en attente du prochain battement — quantification). */
  const [armed, setArmed] = useState<ReadonlySet<number>>(new Set());
  /** Pad survolé (cible de l'édition du tempo). */
  const [hoverPad, setHoverPad] = useState<number | null>(null);
  /** Le clic du métronome est-il audible ? */
  const [metroAudible, setMetroAudible] = useState(false);
  /** Chemin de lecture : navigateur (Web Audio) ou serveur (ffplay). */
  const [playMode, setPlayModeState] = useState<PlayMode>(stored.playMode);
  /** Mode loop : les samples bouclent jusqu'au Stop (défaut : vrai). */
  const [loop, setLoop] = useState(stored.loop);
  /** Timers serveur en attente (quantification) — annulés au Stop. */
  const serverTimersRef = useRef(new Map<number, number>());

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
    // Le métronome prévient l'UI à chaque battement (badge + désarmement)
    player.onBeat = (beat, bpm) => {
      setMetro({ running: true, beat: beat % 4, bpm });
      setArmed(new Set()); // le beat est passé : les pads armés ont joué
    };
    playerRef.current = player;
    setPlayerReady(true);
    // Recharge les buffers des pads déjà assignés
    stored.slots.forEach((s, i) => {
      if (s.file) void player.load(i, padSampleUrl(s.file));
    });
    return () => {
      for (const [, t] of serverTimersRef.current) window.clearTimeout(t);
      serverTimersRef.current.clear();
      player.stopMetronome();
      player.stopAll();
      void stopPadServer();
      void ctx.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persistance à chaque changement
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ slots, color, volume, playMode, loop }));
    } catch {
      /* stockage plein — ignoré */
    }
  }, [slots, color, volume, playMode, loop]);

  const setStatusFlash = useCallback((msg: string) => {
    setStatus(msg);
    window.setTimeout(() => setStatus(''), 2500);
  }, []);

  // ── Déclenchement (retrigger) ──

  /** Change le chemin de lecture (annule les armements serveur en attente). */
  const setPlayMode = useCallback((m: PlayMode) => {
    setPlayModeState(m);
    if (m === 'browser') {
      for (const [, t] of serverTimersRef.current) window.clearTimeout(t);
      serverTimersRef.current.clear();
      setArmed(new Set());
    }
  }, []);

  /**
   * Déclenche un pad selon le chemin de lecture :
   * - navigateur : Web Audio local (métronome + quantification exacte) ;
   * - serveur : ffplay côté backend — le métronome local reste le maestro,
   *   la commande part ANTICIPÉE (SERVER_PLAY_LEAD_S) pour arriver au beat.
   */
  const playPad = useCallback((index: number) => {
    const player = playerRef.current;
    const slot = slots[index];
    if (!player || !slot?.file) return;
    const tempo = slot.tempo ?? 120;
    if (playMode === 'server') {
      if (!player.isMetronomeRunning()) {
        player.startMetronome(tempo);
        void triggerPadServer(slot.file, volume * 100, loop); // coup d'ancre
        return;
      }
      setArmed(prev => {
        const n = new Set(prev);
        n.add(index);
        return n;
      });
      const delayMs = Math.max(0, (player.nextBeatTime() - player.currentTime() - SERVER_PLAY_LEAD_S) * 1000);
      const timer = window.setTimeout(() => {
        serverTimersRef.current.delete(index);
        void triggerPadServer(slot.file!, volume * 100, loop);
      }, delayMs);
      serverTimersRef.current.set(index, timer);
      return;
    }
    const res = player.playQuantized(index, tempo, loop);
    if (res === 'armed') {
      setArmed(prev => {
        const n = new Set(prev);
        n.add(index);
        return n;
      });
    }
  }, [playMode, slots, volume, loop]);

  // ── Clic sur un pad : peinture, tempo ou déclenchement ──
  const onPadClick = useCallback((index: number) => {
    if (painting) {
      // Pose la couleur choisie sur CE pad (mode peinture)
      setSlots(prev => paintPad(prev, index, color.hue));
      return;
    }
    playPad(index);
  }, [painting, color.hue, playPad]);

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
    // tempo_imported : détection automatique sur l'échantillon décodé
    let tempo: number | null = null;
    if (ok) {
      const buf = playerRef.current?.buffers[index];
      if (buf) tempo = detectTempo(buf.getChannelData(0), buf.sampleRate);
    }
    setSlots(prev => {
      const next = [...prev];
      next[index] = { file: name, label: labelFromFilename(file.name), hue: null, tempo }; // nouveau pad → auto
      return next;
    });
    setStatusFlash(ok ? `✅ ${file.name} → pad ${index + 1}${tempo ? ` · ${tempo} BPM` : ''}` : '⚠️ Sample illisible');
    pendingIndexRef.current = null;
  }, [slots, setStatusFlash]);

  const clearPad = useCallback((index: number) => {
    setSlots(prev => {
      const next = [...prev];
      next[index] = { file: null, label: '', hue: null, tempo: null };
      return next;
    });
    playerRef.current?.stopAll();
  }, []);

  const onContextMenu = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    pickFile(index); // clic droit = assigner
  }, [pickFile]);

  /** Tempo affiché/éditable : pad survolé (tempo importé) sinon métronome. */
  const tempoTarget = hoverPad !== null && slots[hoverPad]?.tempo !== null
    ? { pad: hoverPad, bpm: slots[hoverPad]?.tempo ?? 120 }
    : { pad: null, bpm: metro.bpm };

  const onTempoChange = (v: number) => {
    if (tempoTarget.pad !== null) {
      setSlots(prev => setPadTempo(prev, tempoTarget.pad!, v));
    } else {
      playerRef.current?.setBpm(v);
      setMetro(m => ({ ...m, bpm: v }));
    }
  };

  /** ■ Stop : arrête tous les pads + le métronome + les lectures serveur. */
  const onStop = useCallback(() => {
    for (const [, t] of serverTimersRef.current) window.clearTimeout(t);
    serverTimersRef.current.clear();
    playerRef.current?.stopAll();
    playerRef.current?.stopMetronome();
    void stopPadServer();
    setArmed(new Set());
    setMetro(m => ({ ...m, running: false }));
  }, []);

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
            const bg = slotColor(slot, i, color);
            const has = !!slot.file;
            const isArmed = armed.has(i);
            return (
              <button
                key={i}
                onClick={() => onPadClick(i)}
                onContextMenu={(e) => onContextMenu(e, i)}
                onMouseEnter={() => setHoverPad(i)}
                onMouseLeave={() => setHoverPad(h => (h === i ? null : h))}
                className={`push-pad relative rounded-lg border transition-transform active:scale-95 hover:brightness-110 select-none ${isArmed ? 'push-pad-armed' : ''} ${
                  has ? 'border-black/40' : 'border-gray-700/40'
                }`}
                style={{ background: bg, opacity: has ? 1 : 0.3 }}
                title={`Pad ${i + 1}${has ? ` — ${slot.label}${slot.tempo ? ` · ${slot.tempo} BPM` : ''}` : ''} (clic = jouer calé, clic droit = remplacer)${painting ? ' — 🎨 clic = peindre' : ''}${isArmed ? ' — ⏳ en attente du prochain temps' : ''}`}
              >
                {has ? (
                  <>
                    <span className="push-pad-label absolute inset-x-0 bottom-0.5 text-center text-[8px] sm:text-[9px] font-bold text-black/70 truncate px-0.5">
                      {slot.label}
                    </span>
                    {slot.tempo !== null && (
                      <span className="push-pad-label absolute top-0.5 right-1 text-[7px] font-mono font-bold text-black/60">
                        ⚡{slot.tempo}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="push-pad-label absolute inset-0 flex items-center justify-center text-[10px] text-black/40 font-bold">
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
          <button
            onClick={() => setPainting(p => !p)}
            className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors shrink-0 ${
              painting
                ? 'bg-pink-900/50 border-pink-500/60 text-pink-200'
                : 'bg-gray-800/60 border-gray-700/60 text-gray-500 hover:text-gray-300'
            }`}
            title="Mode peinture : clique sur les pads pour leur poser la couleur choisie (le clic ne joue plus le sample)"
          >
            🎨 Peindre {painting ? '●' : ''}
          </button>
          <button
            onClick={() => setSlots(prev => clearPadColors(prev))}
            className="px-2 py-0.5 text-[10px] font-bold rounded border border-gray-700/60 bg-gray-800/60 text-gray-500 hover:text-gray-300 transition-colors shrink-0"
            title="Tous les pads suivent le dégradé global (hue + mode) — les couleurs posées pad par pad sont effacées"
          >
            Appliquer à tous
          </button>

          <div className="w-px h-4 bg-gray-700/60 shrink-0" />
          <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500 shrink-0">Tempo</span>
          <input
            type="range" min={40} max={240} value={tempoTarget.bpm}
            onChange={(e) => onTempoChange(parseInt(e.target.value))}
            className="w-20 accent-cyan-500"
            title={tempoTarget.pad !== null
              ? `Tempo importé du pad ${tempoTarget.pad + 1} (métronome au déclenchement de ce pad)`
              : 'Tempo du métronome (survole un pad pour régler SON tempo)'}
          />
          <span className="text-[10px] font-mono text-cyan-300 w-9 text-right shrink-0">{tempoTarget.bpm} BPM</span>
          {tempoTarget.pad !== null && (
            <span className="text-[9px] text-gray-500 shrink-0">pad {tempoTarget.pad + 1}</span>
          )}
          <button
            onClick={() => {
              const a = !metroAudible;
              setMetroAudible(a);
              playerRef.current?.setMetroAudible(a);
            }}
            className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors shrink-0 ${
              metroAudible
                ? 'bg-green-900/40 border-green-500/50 text-green-300'
                : 'bg-gray-800/60 border-gray-700/60 text-gray-500 hover:text-gray-300'
            }`}
            title="Métronome audible / muet (il tourne dès le premier appui sur un pad ; tu peux l'écouter ou non)"
          >
            🔉 {metroAudible ? 'Son' : 'Muet'}
          </button>
          <span className={`text-[10px] font-mono shrink-0 ${metro.running ? 'text-green-400' : 'text-gray-600'}`}>
            {metro.running ? `● ${metro.bpm} BPM · ${metro.beat + 1}` : '● —'}
          </span>
          <button
            onClick={onStop}
            className="px-2.5 py-1 text-[10px] font-bold rounded-md bg-red-900/60 border border-red-500/60 text-red-200 hover:bg-red-800/70 transition-colors shrink-0"
            title="■ Stop : arrête tous les pads et le métronome"
          >
            ■ Stop
          </button>
          <div className="w-px h-4 bg-gray-700/60 shrink-0" />
          <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500 shrink-0">Lecture</span>
          <button
            onClick={() => setPlayMode('browser')}
            className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors shrink-0 ${
              playMode === 'browser'
                ? 'bg-cyan-900/40 border-cyan-500/50 text-cyan-300'
                : 'bg-gray-800/60 border-gray-700/60 text-gray-500 hover:text-gray-300'
            }`}
            title="Les samples sont joués par le NAVIGATEUR (Web Audio) — synchronisation exacte avec le métronome"
          >
            🖥 Navig.
          </button>
          <button
            onClick={() => setPlayMode('server')}
            className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors shrink-0 ${
              playMode === 'server'
                ? 'bg-cyan-900/40 border-cyan-500/50 text-cyan-300'
                : 'bg-gray-800/60 border-gray-700/60 text-gray-500 hover:text-gray-300'
            }`}
            title="Les samples sont joués par le SERVEUR (ffplay — sortie audio du PC). Le métronome reste local ; les déclenchements sont anticipés pour arriver sur le battement"
          >
            🖧 Serveur
          </button>
          <button
            onClick={() => setLoop(l => !l)}
            className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors shrink-0 ${
              loop
                ? 'bg-emerald-900/40 border-emerald-500/50 text-emerald-300'
                : 'bg-gray-800/60 border-gray-700/60 text-gray-500 hover:text-gray-300'
            }`}
            title="Mode LOOP (défaut : ON) : les samples bouclent en continu jusqu'au ■ Stop — désactive pour un déclenchement one-shot"
          >
            🔁 Loop {loop ? 'ON' : 'OFF'}
          </button>
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
            Clic = jouer (calé métronome) · 🖥/🖧 = lecture navigateur ou serveur · 🎨 Peindre = couleur par pad · Clic droit / 🎵 = assigner · {PAD_COUNT} pads
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
