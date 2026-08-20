/**
 * 🎹 Rise2Keywaves — zone des 25 keywaves du ROLI Seaboard RISE 2 (2 octaves).
 *
 * Le Seaboard simulé représente un clavier qui « ressemble à peine à un
 * piano » : 25 keywaves (C3 → C5) de silicone mat, où les touches noires
 * (chromatiques) sont JUSTE plus foncées que les blanches (grises). Un
 * choix de couleurs (thèmes) s'applique globalement à l'instrument.
 *
 * Gestes (5D simplifiés, MULTI-TOUCH — chaque doigt tient sa note) :
 *  - STRIKE : appui sur une keywave → note-on (vélocité 100) ;
 *  - glissé VERTICAL le long de la touche → pitch bend (le centre vertical
 *    = bend neutre ; haut = aigu, bas = grave) ;
 *  - glissé HORIZONTAL (petite amplitude autour du centre de la touche) →
 *    VIBRATO : l'intensité suit |décalage| (profondeur LFO du serveur) ;
 *  - glissando : traverser une keywave voisine → note-off + note-on ;
 *  - molette → pression (aftertouch) ;
 *  - LIFT : relâchement → note-off (+ retour auto du bend si returnMode).
 *
 * Bend/vibrato sont GLOBAUX côté serveur : le doigt MAÎTRE (le plus
 * récent) pilote les valeurs ; au relâchement d'un doigt, le dernier
 * doigt restant reprend la main.
 *
 * PERFORMANCE : aucun state React pendant le glissé — illumination par
 * classList (refs), valeurs par refs, gestes échantillonnés à ~60 Hz (rAF).
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  StripGesture,
  locateKeywave,
  wheelToPressure,
  xToVibrato,
  yToBend,
} from '../../lib/mpe';
import { sendPianoNote } from '../../lib/pianoNote';
import { MpeModuleProps } from './ExpressionFrame';
import './Rise2Keywaves.css';

/** Nombre de keywaves : 2 octaves complètes (C3 → C5). */
export const RISE2_KEYWAVES = 25;
/** Pitch de la première keywave (C3 = 48) — 25 keywaves → C3..C5. */
export const RISE2_START_PITCH = 48;
/** Vélocité du Strike (le vrai Seaboard la mesure à la frappe). */
export const RISE2_VELOCITY = 100;

/** Fréquence de vibrato par défaut (Hz) — glissé horizontal. */
const DEFAULT_VIB_FREQ = 5;
/** Profondeur max de vibrato par défaut (demi-tons, bords de keywave). */
const DEFAULT_VIB_DEPTH = 2;
const LS_THEME = 'chordzic_rise2_theme';
const LS_VIB_FREQ = 'chordzic_rise2_vib_freq';
const LS_VIB_DEPTH = 'chordzic_rise2_vib_depth';

/** Classes chromatiques : les touches « noires » du Seaboard. */
const BLACK_PCS = new Set([1, 3, 6, 8, 10]);

/** Thème de couleurs appliqué GLOBALEMENT à l'instrument (touches mattes). */
interface Rise2Theme {
  id: string;
  name: string;
  /** « Blanches » (naturelles) : dégradé haut → bas, gris mat. */
  white: [string, string];
  /** « Noires » (chromatiques) : juste plus foncées. */
  black: [string, string];
  /** Repère des C (point tactile). */
  dot: string;
}

const THEMES: Rise2Theme[] = [
  { id: 'matte', name: 'Gris matte', white: ['#a3a9b1', '#6f757d'], black: ['#52575e', '#33373d'], dot: '#67e8f9' },
  { id: 'ocean', name: 'Bleu glacier', white: ['#8aa8c4', '#5d7a96'], black: ['#3c5066', '#263544'], dot: '#a5f3fc' },
  { id: 'forest', name: 'Vert forêt', white: ['#8bab96', '#5f8270'], black: ['#3a5143', '#28372c'], dot: '#86efac' },
  { id: 'ember', name: 'Ambre', white: ['#d0a76f', '#a47c49'], black: ['#6e5230', '#4a371e'], dot: '#fde68a' },
  { id: 'rose', name: 'Rose poudré', white: ['#cba0ac', '#a17581'], black: ['#6e4853', '#4c313a'], dot: '#f9a8d4' },
];

/** Lit un nombre persistant (défaut si absent/invalide). */
function storedNum(key: string, def: number): number {
  const n = parseFloat(localStorage.getItem(key) ?? '');
  return Number.isFinite(n) ? n : def;
}

/** État d'un doigt posé sur la surface (multitouch). */
interface TouchState {
  index: number;
  pitch: number;
  /** Position verticale dans la zone (0 = haut, 1 = bas). */
  y: number;
  /** Position dans la keywave ([-0.5, +0.5], 0 = centre). */
  xRel: number;
}

function Rise2Keywaves({ returnMode, onGesture, onGestureEnd }: MpeModuleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const keywaveRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ── Réglages de l'instrument (persistés) ───────────────────────────
  const [themeId, setThemeId] = useState(() => localStorage.getItem(LS_THEME) ?? 'matte');
  const [vibFreq, setVibFreq] = useState(() => storedNum(LS_VIB_FREQ, DEFAULT_VIB_FREQ));
  const [vibDepth, setVibDepth] = useState(() => storedNum(LS_VIB_DEPTH, DEFAULT_VIB_DEPTH));
  const vibFreqRef = useRef(vibFreq);
  const vibDepthRef = useRef(vibDepth);
  useEffect(() => { vibFreqRef.current = vibFreq; localStorage.setItem(LS_VIB_FREQ, String(vibFreq)); }, [vibFreq]);
  useEffect(() => { vibDepthRef.current = vibDepth; localStorage.setItem(LS_VIB_DEPTH, String(vibDepth)); }, [vibDepth]);
  useEffect(() => { localStorage.setItem(LS_THEME, themeId); }, [themeId]);
  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[0];

  // ── État du geste (refs — pas de re-render pendant le glissé) ──────
  const touchesRef = useRef(new Map<number, TouchState>());
  const masterRef = useRef<number | null>(null);
  const activeRef = useRef(new Set<number>());
  const bendRef = useRef(0);
  const vibRef = useRef(0);
  const pressureRef = useRef(0);
  const draggingRef = useRef(false);
  const rafRef = useRef(0);
  const dirtyRef = useRef(false);
  const returnRafRef = useRef(0);

  /** Échantillonne le geste (~1×/frame) vers le cadre commun. */
  const emit = useCallback(() => {
    dirtyRef.current = true;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      onGesture({
        bend: bendRef.current,
        lfoFreq: vibFreqRef.current,
        lfoDepth: vibRef.current,
        pressure: pressureRef.current,
      });
    });
  }, [onGesture]);

  /** Illumine/éteint une keywave (classList direct — pas de re-render). */
  const setActive = useCallback((index: number, on: boolean) => {
    const el = keywaveRefs.current[index];
    if (!el) return;
    if (on) {
      activeRef.current.add(index);
      el.classList.add('rise2-on');
    } else {
      activeRef.current.delete(index);
      el.classList.remove('rise2-on');
    }
  }, []);

  /** Applique la position d'un doigt : glissando + bend (Y) + vibrato (X). */
  const applyPointer = useCallback((pointerId: number, clientX: number, clientY: number) => {
    const touch = touchesRef.current.get(pointerId);
    const el = containerRef.current;
    if (!touch || !el) return;
    const rect = el.getBoundingClientRect();
    const { index, xRel } = locateKeywave((clientX - rect.left) / Math.max(1, rect.width), RISE2_KEYWAVES);
    // Glissando : traverser une keywave = nouvelle note (l'ancienne s'éteint)
    const prevIndex = touch.index;
    if (index !== prevIndex) {
      void sendPianoNote(touch.pitch, false);
      touch.index = index;
      touch.pitch = RISE2_START_PITCH + index;
      void sendPianoNote(touch.pitch, true);
      setActive(prevIndex, false);
      setActive(index, true);
    }
    touch.y = (clientY - rect.top) / Math.max(1, rect.height);
    touch.xRel = xRel;
    masterRef.current = pointerId;
    bendRef.current = yToBend(touch.y);
    vibRef.current = xToVibrato(xRel, vibDepthRef.current);
    emit();
  }, [setActive, emit]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    if (returnRafRef.current) cancelAnimationFrame(returnRafRef.current);
    e.currentTarget.setPointerCapture(e.pointerId);
    const el = containerRef.current!;
    const rect = el.getBoundingClientRect();
    const { index, xRel } = locateKeywave((e.clientX - rect.left) / Math.max(1, rect.width), RISE2_KEYWAVES);
    const pitch = RISE2_START_PITCH + index;
    const y = (e.clientY - rect.top) / Math.max(1, rect.height);
    void sendPianoNote(pitch, true, undefined, RISE2_VELOCITY); // STRIKE
    touchesRef.current.set(e.pointerId, { index, pitch, y, xRel });
    masterRef.current = e.pointerId;
    bendRef.current = yToBend(y);
    vibRef.current = xToVibrato(xRel, vibDepthRef.current);
    setActive(index, true);
    emit();
  }, [setActive, emit]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (touchesRef.current.has(e.pointerId)) applyPointer(e.pointerId, e.clientX, e.clientY);
  }, [applyPointer]);

  /** Fin de geste : note-off + (retour auto du bend si demandé). */
  const endGesture = useCallback(() => {
    onGestureEnd({
      bend: bendRef.current,
      lfoDepth: 0, // le vibrato s'arrête au relâchement (geste vivant)
      lfoFreq: vibFreqRef.current,
      pressure: pressureRef.current,
    });
  }, [onGestureEnd]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const touch = touchesRef.current.get(e.pointerId);
    if (!touch) return;
    void sendPianoNote(touch.pitch, false); // LIFT
    touchesRef.current.delete(e.pointerId);
    setActive(touch.index, false);
    if (touchesRef.current.size > 0) {
      // Un autre doigt tient : le dernier posé reprend la main
      const nextId = [...touchesRef.current.keys()].pop()!;
      const next = touchesRef.current.get(nextId)!;
      masterRef.current = nextId;
      bendRef.current = yToBend(next.y);
      vibRef.current = xToVibrato(next.xRel, vibDepthRef.current);
      emit();
    } else {
      masterRef.current = null;
      vibRef.current = 0;
      if (returnMode === 'center') {
        // Retour auto : le bend glisse progressivement vers le centre
        // (le silicone du Seaboard revient) — animation rAF, valeurs émises.
        const step = () => {
          const prev = bendRef.current;
          const diff = prev - 8192;
          if (Math.abs(diff) <= 90) {
            bendRef.current = 8192;
            emit();
            endGesture();
            return;
          }
          bendRef.current = prev - Math.sign(diff) * Math.max(120, Math.abs(diff) / 4);
          emit();
          returnRafRef.current = requestAnimationFrame(step);
        };
        returnRafRef.current = requestAnimationFrame(step);
      } else {
        endGesture();
      }
    }
  }, [setActive, emit, endGesture, returnMode]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    // PRESS : molette = enfoncement (aftertouch)
    pressureRef.current = wheelToPressure(pressureRef.current, e.deltaY);
    emit();
  }, [emit]);

  // Nettoyage : note-off de sécurité + arrêt des animations si la modal
  // se ferme pendant une tenue.
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (returnRafRef.current) cancelAnimationFrame(returnRafRef.current);
    for (const [, t] of touchesRef.current) void sendPianoNote(t.pitch, false);
    touchesRef.current.clear();
  }, []);

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      className="relative flex-1 min-h-[45vh] rounded-xl border border-gray-700/80 bg-[#0d1420] select-none touch-none cursor-crosshair overflow-hidden"
      title="Keywaves ROLI Seaboard RISE 2 : appui = Strike · glissé vertical = Bend · glissé horizontal (petit) = Vibrato · molette = Pression"
    >
      {/* Surface : 25 keywaves 2 octaves (blanches grises / noires plus foncées) */}
      <div className="flex h-full gap-[3px] px-[3px] pt-2 pb-1.5">
        {Array.from({ length: RISE2_KEYWAVES }, (_, i) => {
          const pitch = RISE2_START_PITCH + i;
          const isBlack = BLACK_PCS.has(pitch % 12);
          const isC = pitch % 12 === 0;
          const [c0, c1] = isBlack ? theme.black : theme.white;
          return (
            <div
              key={i}
              ref={(el) => { keywaveRefs.current[i] = el; }}
              className="rise2-keywave relative flex-1 rounded-t-[40%] rounded-b-[5px]"
              style={{ background: `linear-gradient(180deg, ${c0} 0%, ${c1} 100%)` }}
            >
              {/* Repère des notes C (comme les repères tactiles du RISE 2) */}
              {isC && (
                <span
                  className="absolute left-1/2 top-1.5 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                  style={{ background: theme.dot }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Réglages de l'instrument : vibrato + couleurs globales */}
      <div
        className="absolute top-2 right-2 z-10 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-gray-700/60 bg-[#0d1420]/85 backdrop-blur-sm px-2 py-1 select-none"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        <span className="text-[9px] font-bold uppercase tracking-wider text-pink-300/90">Vibrato</span>
        <label className="flex items-center gap-1 text-[9px] text-gray-400" title="Fréquence du vibrato (glissé horizontal)">
          Hz
          <input
            type="range" min={1} max={10} step={0.5} value={vibFreq}
            onChange={(e) => setVibFreq(parseFloat(e.target.value))}
            className="w-16 accent-pink-500 h-1"
          />
          <span className="w-8 font-mono text-pink-300 text-right">{vibFreq.toFixed(1)}</span>
        </label>
        <label className="flex items-center gap-1 text-[9px] text-gray-400" title="Profondeur max du vibrato (bords de la keywave)">
          Prof
          <input
            type="range" min={0} max={12} step={0.5} value={vibDepth}
            onChange={(e) => setVibDepth(parseFloat(e.target.value))}
            className="w-16 accent-pink-500 h-1"
          />
          <span className="w-9 font-mono text-pink-300 text-right">{vibDepth.toFixed(1)} st</span>
        </label>

        <span className="w-px h-4 bg-gray-700/60" />

        {/* Choix de couleurs appliqué globalement à l'instrument */}
        {THEMES.map(t => (
          <button
            key={t.id}
            onClick={() => setThemeId(t.id)}
            title={`Couleur de l'instrument : ${t.name}`}
            className={`w-4 h-4 rounded-full border transition-transform hover:scale-110 shrink-0 ${
              themeId === t.id ? 'ring-2 ring-cyan-400 border-white/80' : 'border-black/50'
            }`}
            style={{ background: `linear-gradient(90deg, ${t.white[0]} 50%, ${t.black[0]} 50%)` }}
          />
        ))}
      </div>

      {/* Légendes */}
      <span className="pointer-events-none absolute top-2 left-3 text-[10px] font-bold text-gray-500 select-none">
        🎹 Strike · ▲▼ = Bend · ◀▶ petit = Vibrato · molette = Pression
      </span>
      <span className="pointer-events-none absolute bottom-2 right-3 text-[9px] text-gray-600 select-none">
        25 keywaves · C3 → C5 · 2 octaves · glissando en traversant · multi-touch
      </span>
    </div>
  );
}

export default memo(Rise2Keywaves);
