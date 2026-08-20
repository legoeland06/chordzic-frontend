/**
 * 🎛 MpeModal — modal de simulation de contrôleur MPE (MIDI Polyphonic
 * Expression).
 *
 * Reproduit les gestes des contrôleurs populaires (ROLI Seaboard :
 * strip tactile X = pitch bend / Y = timbre ; Osmose : pression =
 * aftertouch) pour « jouer sur le son » EN DIRECT pendant que l'utilisateur
 * joue sur le Roland (Local Control OFF → le serveur relaie les notes et
 * injecte les modulations) ou pendant un enregistrement (Rec MIDI : les
 * gestes sont horodatés et réappliqués au rendu).
 *
 * Le strip tactile occupe la quasi-totalité de l'écran (l'espace de
 * manipulation du curseur est la priorité) ; les réglages fins tiennent en
 * barres compactes sous le strip (jamais de scroll — 2ᵉ ligne plutôt).
 *
 * - Strip : glisser X = pitch bend (range réglable via RPN 0), glisser
 *   Y = timbre CC74, molette = aftertouch. Retour auto (Seaboard) ou
 *   maintien (Osmose).
 * - Cible du son : Auto (écho ✨ de la piste sinon Roland) / Roland /
 *   PC (FluidSynth — les modulations y sont TOUJOURS audibles, certains
 *   pianos numériques ignorent le bend sur les sons acoustiques).
 *
 * Communication : POST /mpe throttlé ~30 ms ; poll /mpe-state ~250 ms.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  BEND_CENTER,
  EMPTY_MPE_STATE,
  LfoShapeName,
  MpeState,
  MpeTargetName,
  TIMBRE_CENTER,
  fetchMpeState,
  resetMpe,
  sendMpe,
  throttleTrailing,
  wheelToPressure,
  xToBend,
  yToTimbre,
} from '../lib/mpe';

/** Nom de note MIDI (pour l'affichage des notes tenues). */
function noteName(pitch: number): string {
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

const SHAPES: { value: LfoShapeName; label: string }[] = [
  { value: 'sin', label: 'Sin' },
  { value: 'triangle', label: 'Tri' },
  { value: 'square', label: 'Carré' },
];

const TARGETS: { value: MpeTargetName; label: string; title: string }[] = [
  { value: 'auto', label: 'Auto', title: 'Écho ✨ de la piste si actif, sinon Roland (canal de jeu)' },
  { value: 'roland', label: 'Roland', title: 'Sortie principale (le Roland sonne)' },
  { value: 'fluid', label: 'PC', title: 'FluidSynth — le son sort du PC, modulations toujours audibles' },
];

const RANGES = [2, 7, 12, 24, 48];

const labelCls = 'text-[9px] font-bold uppercase tracking-wider text-gray-500 shrink-0 w-14';
const valueCls = 'text-[10px] font-mono text-cyan-300 w-9 text-right shrink-0';

interface MpeModalProps {
  onClose: () => void;
}

function MpeModal({ onClose }: MpeModalProps) {
  const [bend, setBend] = useState(BEND_CENTER);
  const [pressure, setPressure] = useState(0);
  const [timbre, setTimbre] = useState(TIMBRE_CENTER);
  const [pitchRange, setPitchRange] = useState(48);
  const [lfoFreq, setLfoFreq] = useState(0);
  const [lfoDepth, setLfoDepth] = useState(0);
  const [lfoShape, setLfoShape] = useState<LfoShapeName>('sin');
  const [target, setTarget] = useState<MpeTargetName>('auto');
  /** Retour auto au centre au relâchement (style Seaboard) vs maintien. */
  const [returnMode, setReturnMode] = useState<'center' | 'hold'>('center');
  /** État serveur (notes tenues, canal cible, rec…) — poll temps réel. */
  const [server, setServer] = useState<MpeState>({ ...EMPTY_MPE_STATE });

  const stripRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const rafRef = useRef(0);
  const bendRef = useRef(bend);
  useEffect(() => { bendRef.current = bend; }, [bend]);

  /** Envoi throttlé des gestes (~30 ms) — le dernier de la fenêtre part. */
  const sendThrottled = useRef(
    throttleTrailing((patch: Parameters<typeof sendMpe>[0]) => { void sendMpe(patch); }, 30),
  ).current;

  // Activation au montage, désactivation + reset au démontage.
  useEffect(() => {
    void sendMpe({ enabled: true });
    void fetchMpeState().then(setServer);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      void sendMpe({ enabled: false }); // le serveur remet l'expression à zéro
    };
  }, []);

  // Poll temps réel : notes tenues, canal résolu, session Rec, bend effectif.
  useEffect(() => {
    const id = setInterval(() => {
      void fetchMpeState().then(setServer);
    }, 250);
    return () => clearInterval(id);
  }, []);

  // ── Strip tactile type Seaboard (plein écran) ────────────────────
  const applyPointer = useCallback((e: React.PointerEvent) => {
    const el = stripRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const b = xToBend(x);
    const t = yToTimbre(y);
    setBend(b);
    setTimbre(t);
    sendThrottled({ bend: b, timbre: t });
  }, [sendThrottled]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    applyPointer(e);
  }, [applyPointer]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (draggingRef.current) applyPointer(e);
  }, [applyPointer]);

  const returnToCenter = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = () => {
      const prev = bendRef.current;
      const diff = prev - BEND_CENTER;
      if (Math.abs(diff) <= 90) {
        setBend(BEND_CENTER);
        sendThrottled({ bend: BEND_CENTER });
        return;
      }
      const next = prev - Math.sign(diff) * Math.max(90, Math.abs(diff) / 9);
      setBend(next);
      sendThrottled({ bend: next });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [sendThrottled]);

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    if (returnMode === 'center') returnToCenter();
  }, [returnMode, returnToCenter]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    // Molette sur le strip = enfoncement (aftertouch) — « presser » le son.
    setPressure(prev => {
      const next = wheelToPressure(prev, e.deltaY);
      sendThrottled({ pressure: next });
      return next;
    });
  }, [sendThrottled]);

  // Position du curseur visuel sur le strip (bend → X, timbre → Y).
  const cursorX = (bend / 16383) * 100;
  const cursorY = (1 - timbre / 127) * 100;
  const effBend = server.effective_bend ?? bend;

  const sendRange = (r: number) => { setPitchRange(r); void sendMpe({ pitch_range_st: r }); };
  const sendLfo = (patch: { lfo_freq?: number; lfo_depth_st?: number; lfo_shape?: LfoShapeName }) => {
    if (patch.lfo_freq !== undefined) setLfoFreq(patch.lfo_freq);
    if (patch.lfo_depth_st !== undefined) setLfoDepth(patch.lfo_depth_st);
    if (patch.lfo_shape !== undefined) setLfoShape(patch.lfo_shape);
    sendThrottled(patch);
  };
  const doReset = () => {
    setBend(BEND_CENTER);
    setPressure(0);
    setTimbre(TIMBRE_CENTER);
    void resetMpe();
  };
  const sendTarget = (t: MpeTargetName) => { setTarget(t); void sendMpe({ target: t }); };

  const routeLabel = server.route === 'fluid' ? 'PC' : server.route === 'main' ? (server.echo_active ? '✨ piste' : 'Roland') : '—';

  return (
    <div className="fixed inset-1 sm:inset-2 z-50 flex items-stretch bg-black/70 backdrop-blur-sm p-1 sm:p-2">
      <div className="w-full max-w-[1400px] mx-auto bg-[#141a24] border border-gray-700 rounded-2xl shadow-2xl p-2 sm:p-3 flex flex-col gap-2 max-h-full">
        {/* ── Titre (compact) ── */}
        <div className="flex items-center justify-between shrink-0">
          <h2 className="text-sm font-bold text-gray-200 tracking-wide">
            🎛 MPE — Expression{' '}
            <span className="text-gray-500 font-normal">
              · son : <b className={server.route === 'fluid' ? 'text-green-400' : 'text-cyan-300'}>{routeLabel}</b>
              {server.fluid_ok === false && <span className="text-amber-400"> · FluidSynth indisponible</span>}
            </span>
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            title="Fermer (remet l'expression à zéro)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Strip tactile type Seaboard — presque tout l'écran ── */}
        <div
          ref={stripRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          className="relative flex-1 min-h-[45vh] rounded-xl border border-gray-700/80 bg-gradient-to-b from-[#0d1420] via-[#16202f] to-[#0d1420] select-none touch-none cursor-crosshair overflow-hidden"
          title="Glisser : X = pitch bend, Y = timbre · molette = pression"
        >
          {/* Repère central (bend neutre) */}
          <div className="absolute top-0 bottom-0 left-1/2 w-px border-l border-dashed border-gray-600/40" />
          {/* Repère mi-hauteur (timbre neutre) */}
          <div className="absolute left-0 right-0 top-1/2 h-px border-t border-dashed border-gray-600/30" />

          {/* Légendes */}
          <span className="absolute top-2 left-3 text-[10px] font-bold text-gray-500 select-none">◀ Bend ▶</span>
          <span className="absolute bottom-2 left-3 text-[10px] font-bold text-gray-500 select-none">▼ Timbre ▲</span>
          <span className="absolute top-2 right-3 text-[10px] font-bold text-gray-500 select-none">Pression : molette 🖱</span>

          {/* Valeurs en direct (coins) */}
          <span className="absolute bottom-2 right-3 text-[10px] font-mono text-cyan-300/80 select-none">
            bend {bend} · timbre {timbre} · at {pressure}
          </span>

          {/* Curseur */}
          <div
            className="absolute w-9 h-9 -ml-[18px] -mt-[18px] rounded-full border-2 border-cyan-300 bg-cyan-400/30 shadow-[0_0_18px_rgba(34,211,238,0.7)] pointer-events-none"
            style={{ left: `${cursorX}%`, top: `${cursorY}%` }}
          />
        </div>

        {/* ── Réglages fins (barres compactes, jamais de scroll) ── */}
        <div className="shrink-0 space-y-1">
          {/* Rangée 1 : sliders bend / pression / timbre */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <span className={labelCls}>Bend</span>
              <input
                type="range" min={0} max={16383} value={bend}
                onChange={(e) => { const v = parseInt(e.target.value); setBend(v); sendThrottled({ bend: v }); }}
                className="flex-1 accent-cyan-500 h-1.5 cursor-pointer"
                title="Pitch bend (0-16383, centre 8192)"
              />
              <span className={valueCls}>{bend}</span>
              <select
                value={pitchRange}
                onChange={(e) => sendRange(parseInt(e.target.value))}
                className="bg-gray-800/60 text-[10px] px-1 py-0.5 rounded-md border border-gray-700/60 outline-none focus:border-gray-500 shrink-0"
                title="Range de bend (RPN 0)"
              >
                {RANGES.map(r => <option key={r} value={r}>±{r} st</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-[160px]">
              <span className={labelCls}>Pression</span>
              <input
                type="range" min={0} max={127} value={pressure}
                onChange={(e) => { const v = parseInt(e.target.value); setPressure(v); sendThrottled({ pressure: v }); }}
                className="flex-1 accent-cyan-500 h-1.5 cursor-pointer"
                title="Aftertouch (channel pressure)"
              />
              <span className={valueCls}>{pressure}</span>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-[160px]">
              <span className={labelCls}>Timbre</span>
              <input
                type="range" min={0} max={127} value={timbre}
                onChange={(e) => { const v = parseInt(e.target.value); setTimbre(v); sendThrottled({ timbre: v }); }}
                className="flex-1 accent-cyan-500 h-1.5 cursor-pointer"
                title="Timbre / brightness (CC74)"
              />
              <span className={valueCls}>{timbre}</span>
            </div>
          </div>

          {/* Rangée 2 : LFO + cible + retour auto + état + boutons */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500 shrink-0">LFO</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[9px] text-gray-500">Fréq</span>
              <input
                type="range" min={0} max={10} step={0.1} value={lfoFreq}
                onChange={(e) => sendLfo({ lfo_freq: parseFloat(e.target.value) })}
                className="w-20 accent-pink-500"
                title="Fréquence du vibrato (0 = off)"
              />
              <span className="text-[10px] font-mono text-pink-300 w-8 text-right">{lfoFreq.toFixed(1)} Hz</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[9px] text-gray-500">Prof</span>
              <input
                type="range" min={0} max={24} step={0.5} value={lfoDepth}
                onChange={(e) => sendLfo({ lfo_depth_st: parseFloat(e.target.value) })}
                className="w-20 accent-pink-500"
                title="Profondeur du vibrato en demi-tons"
              />
              <span className="text-[10px] font-mono text-pink-300 w-8 text-right">{lfoDepth.toFixed(1)} st</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {SHAPES.map(s => (
                <button
                  key={s.value}
                  onClick={() => sendLfo({ lfo_shape: s.value })}
                  className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors ${
                    lfoShape === s.value
                      ? 'bg-pink-900/40 border-pink-500/50 text-pink-300'
                      : 'bg-gray-800/60 border-gray-700/60 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="w-px h-4 bg-gray-700/60 shrink-0" />

            {/* Cible du son */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[9px] text-gray-500">Son</span>
              <select
                value={target}
                onChange={(e) => sendTarget(e.target.value as MpeTargetName)}
                className="bg-gray-800/60 text-[10px] px-1 py-0.5 rounded-md border border-gray-700/60 outline-none focus:border-gray-500"
                title="Où le son est renvoyé pendant le monitoring MPE"
              >
                {TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <button
              onClick={() => setReturnMode(m => m === 'center' ? 'hold' : 'center')}
              className={`px-2 py-0.5 text-[9px] font-bold rounded border transition-colors shrink-0 ${
                returnMode === 'center'
                  ? 'bg-blue-900/40 border-blue-500/50 text-blue-300'
                  : 'bg-gray-800/60 border-gray-700/60 text-gray-500 hover:text-gray-300'
              }`}
              title="Au relâchement : retour du bend au centre (Seaboard) ou maintien (Osmose)"
            >
              {returnMode === 'center' ? '🔄 Retour auto' : '📌 Maintien'}
            </button>

            <div className="flex-1" />

            {/* État temps réel */}
            <span className="text-[10px] text-gray-400 shrink-0">
              🎹 {server.notes.length === 0 ? <span className="text-gray-600">—</span> : server.notes.map(n => noteName(n)).join(' ')}
            </span>
            <span className="text-[10px] text-gray-400 shrink-0">
              canal <span className="font-mono text-cyan-300">{server.target_channel + 1}</span>
            </span>
            <span className={`text-[10px] font-bold shrink-0 ${server.rec_active ? 'text-red-400' : 'text-gray-600'}`}>
              {server.rec_active ? '● REC' : 'Rec off'}
            </span>
            <button
              onClick={doReset}
              className="px-2 py-1 text-[10px] font-bold rounded-md border border-gray-700/60 bg-gray-800/60 text-gray-400 hover:text-white hover:border-gray-500 transition-colors shrink-0"
              title="Remettre l'expression à zéro (bend centre, pression 0, timbre neutre)"
            >
              ↺ Reset
            </button>
            <button
              onClick={onClose}
              className="px-2.5 py-1 text-[10px] font-bold rounded-md bg-[#2f6ba8] border border-[#3a7ab8] text-white hover:bg-[#3a7ab8] transition-colors shrink-0"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(MpeModal);
