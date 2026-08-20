/**
 * 🎹 SeaboardModal — module « Seaboard (strip) » du système MPE.
 *
 * Un contrôleur MPE (MIDI Polyphonic Expression) simulé : bande tactile
 * plein écran (X = pitch bend, Y = timbre, molette = pression) dont les
 * gestes sont envoyés au serveur, qui les injecte en direct dans le flux
 * MIDI renvoyé au clavier (Roland / FluidSynth) ou les horodate pendant
 * un Rec. Ce module est listé dans `MPE_MODULES` (registry) et ouvert via
 * le menu du bouton « 🎛 MPE ».
 *
 * PERFORMANCE : la zone de manipulation (MpeStrip) est isolée — zéro
 * re-render pendant le glissé (curseur en transform CSS, gestes
 * échantillonnés à ~60 Hz en rAF).
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  BEND_CENTER,
  EMPTY_MPE_STATE,
  GM_PROGRAMS,
  LfoShapeName,
  MpeState,
  MpeTargetName,
  StripGesture,
  TIMBRE_CENTER,
  fetchMpeState,
  resetMpe,
  sendMpe,
} from '../../lib/mpe';
import MpeStrip from './MpeStrip';

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

interface SeaboardModalProps {
  onClose: () => void;
}

function SeaboardModal({ onClose }: SeaboardModalProps) {
  const [bend, setBend] = useState(BEND_CENTER);
  const [pressure, setPressure] = useState(0);
  const [timbre, setTimbre] = useState(TIMBRE_CENTER);
  const [pitchRange, setPitchRange] = useState(2);
  const [lfoFreq, setLfoFreq] = useState(0);
  const [lfoDepth, setLfoDepth] = useState(0);
  const [lfoShape, setLfoShape] = useState<LfoShapeName>('sin');
  const [target, setTarget] = useState<MpeTargetName>('auto');
  const [program, setProgram] = useState(0);
  /** Retour auto au centre au relâchement (style Seaboard) vs maintien. */
  const [returnMode, setReturnMode] = useState<'center' | 'hold'>('center');
  /** État serveur (notes tenues, canal cible, rec…) — poll temps réel. */
  const [server, setServer] = useState<MpeState>({ ...EMPTY_MPE_STATE });

  // Activation au montage, désactivation + reset au démontage.
  useEffect(() => {
    void sendMpe({ enabled: true });
    void fetchMpeState().then(setServer);
    return () => {
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

  // Persistance du module choisi — supprimée : le choix se fait via le
  // menu du bouton MPE (les onglets ont été retirés).

  // Geste du module actif : envoi IMMÉDIAT (échantillonné à ~60 Hz par le
  // module — aucune valeur perdue). Aucun setState ici : le parent ne
  // re-render pas pendant le glissé.
  const handleGesture = useCallback((g: StripGesture) => {
    void sendMpe({ bend: g.bend, timbre: g.timbre, pressure: g.pressure });
  }, []);

  // Fin de geste : synchronise les sliders avec les valeurs finales.
  const handleGestureEnd = useCallback((g: StripGesture) => {
    setBend(g.bend);
    setTimbre(g.timbre);
    setPressure(g.pressure);
  }, []);

  const effBend = server.effective_bend ?? bend;

  const sendRange = (r: number) => { setPitchRange(r); void sendMpe({ pitch_range_st: r }); };
  const sendLfo = (patch: { lfo_freq?: number; lfo_depth_st?: number; lfo_shape?: LfoShapeName }) => {
    if (patch.lfo_freq !== undefined) setLfoFreq(patch.lfo_freq);
    if (patch.lfo_depth_st !== undefined) setLfoDepth(patch.lfo_depth_st);
    if (patch.lfo_shape !== undefined) setLfoShape(patch.lfo_shape);
    void sendMpe(patch);
  };
  const doReset = () => {
    setBend(BEND_CENTER);
    setPressure(0);
    setTimbre(TIMBRE_CENTER);
    void resetMpe();
  };
  const sendTarget = (t: MpeTargetName) => { setTarget(t); void sendMpe({ target: t }); };
  const sendProgram = (p: number) => { setProgram(p); void sendMpe({ program: p }); };

  // Route PC : cible fluid explicite, OU sortie principale FluidSynth
  // (pas de Roland branché → le mode Auto passe par le PC).
  const isPcRoute = server.route === 'fluid' || (server.route === 'main' && server.main_is_fluid);
  const routeLabel = isPcRoute ? 'PC' : server.route === 'main' ? (server.echo_active ? '✨ piste' : 'Roland') : '—';

  return (
    <div className="fixed inset-1 sm:inset-2 z-50 flex items-stretch bg-black/70 backdrop-blur-sm p-1 sm:p-2">
      <div className="w-full max-w-[1400px] mx-auto bg-[#141a24] border border-gray-700 rounded-2xl shadow-2xl p-2 sm:p-3 flex flex-col gap-2 max-h-full">
        {/* ── Titre + badge du son ── */}
        <div className="flex items-center justify-between gap-2 shrink-0 flex-wrap">
          <h2 className="text-sm font-bold text-gray-200 tracking-wide">
            🎹 Seaboard — Expression{' '}
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

        {/* ── Zone de manipulation (plein écran) ── */}
        <MpeStrip returnMode={returnMode} onGesture={handleGesture} onGestureEnd={handleGestureEnd} />

        {/* ── Réglages fins (barres compactes, communes à tous les modules) ── */}
        <div className="shrink-0 space-y-1">
          {/* Rangée 1 : sliders bend / pression / timbre */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <span className={labelCls}>Bend</span>
              <input
                type="range" min={0} max={16383} value={bend}
                onChange={(e) => { const v = parseInt(e.target.value); setBend(v); void sendMpe({ bend: v }); }}
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
                onChange={(e) => { const v = parseInt(e.target.value); setPressure(v); void sendMpe({ pressure: v }); }}
                className="flex-1 accent-cyan-500 h-1.5 cursor-pointer"
                title="Aftertouch (channel pressure)"
              />
              <span className={valueCls}>{pressure}</span>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-[160px]">
              <span className={labelCls}>Timbre</span>
              <input
                type="range" min={0} max={127} value={timbre}
                onChange={(e) => { const v = parseInt(e.target.value); setTimbre(v); void sendMpe({ timbre: v }); }}
                className="flex-1 accent-cyan-500 h-1.5 cursor-pointer"
                title="Timbre / brightness (CC74)"
              />
              <span className={valueCls}>{timbre}</span>
            </div>
          </div>

          {/* Rangée 2 : LFO + cible + instrument + retour auto + état + boutons */}
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

            {/* Instrument GM (mode PC) */}
            {isPcRoute && (
              <div className="flex items-center gap-1 shrink-0" title="Instrument joué par le PC (program GM)">
                <span className="text-[9px] text-gray-500">Inst</span>
                <select
                  value={program}
                  onChange={(e) => sendProgram(parseInt(e.target.value))}
                  className="bg-gray-800/60 text-[10px] px-1 py-0.5 rounded-md border border-gray-700/60 outline-none focus:border-gray-500 max-w-[180px]"
                >
                  {GM_PROGRAMS.map((name, i) => <option key={i} value={i}>{i} · {name}</option>)}
                </select>
              </div>
            )}

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

export default memo(SeaboardModal);
