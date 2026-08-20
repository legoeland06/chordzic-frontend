/**
 * MpeStrip — zone tactile type Seaboard de la modal MPE.
 *
 * PERFORMANCE (exigence : « pendant le glissé, seuls les éléments devant
 * bouger doivent être rendus ») :
 * - AUCUN state React : le curseur bouge en transform CSS (translate3d, GPU)
 *   et les valeurs en textContent, tous deux via des refs → le glissé ne
 *   déclenche AUCUN re-render du composant ;
 * - les gestes sont ÉCHANTILLONNÉS à la fréquence de rafraîchissement (rAF,
 *   ~60 Hz) et remontés au parent (`onGesture`) : aucune valeur intermédiaire
 *   n'est perdue (contrairement au throttle qui ne gardait que la dernière) —
 *   le bend évolue par pas fins au lieu de sauter ;
 * - le retour auto au centre (mode Seaboard) est une animation rAF locale.
 */
import { memo, useCallback, useEffect, useRef } from 'react';
import {
  BEND_CENTER,
  StripGesture,
  TIMBRE_CENTER,
  wheelToPressure,
  xToBend,
  yToTimbre,
} from '../../lib/mpe';

interface MpeStripProps {
  /** Retour auto du bend au centre au relâchement (Seaboard) vs maintien. */
  returnMode: 'center' | 'hold';
  /** Échantillon de geste (appelé ~1×/frame pendant le glissé). */
  onGesture: (g: StripGesture) => void;
  /** Fin du geste (relâchement) — synchronise les sliders du parent. */
  onGestureEnd: (g: StripGesture) => void;
}

/** Taille du curseur (px) — pour centrer le translate3d. */
const CURSOR = 36;
const HALF = CURSOR / 2;

function MpeStrip({ returnMode, onGesture, onGestureEnd }: MpeStripProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const valuesRef = useRef<HTMLSpanElement>(null);

  // Valeurs courantes (refs — pas de re-render)
  const bendRef = useRef(BEND_CENTER);
  const timbreRef = useRef(TIMBRE_CENTER);
  const pressureRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0, left: 0, top: 0 });
  const draggingRef = useRef(false);

  // Échantillonnage rAF : un seul envoi par frame, avec la position la plus
  // récente (les pointermove intermédiaires sont coalescés, aucune perte).
  const rafRef = useRef(0);
  const dirtyRef = useRef(false);
  const returnRafRef = useRef(0);

  // Taille du strip (ResizeObserver — pas de getBoundingClientRect par frame)
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      sizeRef.current = { w: r.width, h: r.height, left: r.left, top: r.top };
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const moveCursor = useCallback(() => {
    const cur = cursorRef.current;
    const val = valuesRef.current;
    if (!cur) return;
    const { w, h } = sizeRef.current;
    const xPx = (bendRef.current / 16383) * w - HALF;
    const yPx = (1 - timbreRef.current / 127) * h - HALF;
    cur.style.transform = `translate3d(${xPx}px, ${yPx}px, 0)`;
    if (val) {
      val.textContent = `bend ${bendRef.current} · timbre ${timbreRef.current} · at ${pressureRef.current}`;
    }
  }, []);

  const emit = useCallback(() => {
    dirtyRef.current = true;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      onGesture({ bend: bendRef.current, timbre: timbreRef.current, pressure: pressureRef.current });
    });
  }, [onGesture]);

  const applyPointer = useCallback((clientX: number, clientY: number) => {
    const { w, h, left, top } = sizeRef.current;
    if (w <= 0 || h <= 0) return;
    bendRef.current = xToBend((clientX - left) / w);
    timbreRef.current = yToTimbre((clientY - top) / h);
    moveCursor();
    emit();
  }, [moveCursor, emit]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (returnRafRef.current) cancelAnimationFrame(returnRafRef.current);
    applyPointer(e.clientX, e.clientY);
  }, [applyPointer]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (draggingRef.current) applyPointer(e.clientX, e.clientY);
  }, [applyPointer]);

  const endGesture = useCallback(() => {
    draggingRef.current = false;
    onGestureEnd({ bend: bendRef.current, timbre: timbreRef.current, pressure: pressureRef.current });
  }, [onGestureEnd]);

  const onPointerUp = useCallback(() => {
    if (returnMode === 'center') {
      // Retour auto : le bend glisse progressivement vers le centre (le
      // silicone du Seaboard revient) — animation rAF locale, valeurs émises.
      const step = () => {
        const prev = bendRef.current;
        const diff = prev - BEND_CENTER;
        if (Math.abs(diff) <= 90) {
          bendRef.current = BEND_CENTER;
          moveCursor();
          emit();
          endGesture();
          return;
        }
        bendRef.current = prev - Math.sign(diff) * Math.max(120, Math.abs(diff) / 4);
        moveCursor();
        emit();
        returnRafRef.current = requestAnimationFrame(step);
      };
      returnRafRef.current = requestAnimationFrame(step);
    } else {
      endGesture();
    }
  }, [returnMode, moveCursor, emit, endGesture]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    pressureRef.current = wheelToPressure(pressureRef.current, e.deltaY);
    moveCursor(); // met à jour le texte des valeurs
    emit();
  }, [moveCursor, emit]);

  // Position initiale + nettoyage des animations
  useEffect(() => { moveCursor(); }, [moveCursor]);
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (returnRafRef.current) cancelAnimationFrame(returnRafRef.current);
  }, []);

  return (
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
      {/* Repères statiques (ne bougent jamais) */}
      <div className="absolute top-0 bottom-0 left-1/2 w-px border-l border-dashed border-gray-600/40" />
      <div className="absolute left-0 right-0 top-1/2 h-px border-t border-dashed border-gray-600/30" />
      <span className="absolute top-2 left-3 text-[10px] font-bold text-gray-500 select-none">◀ Bend ▶</span>
      <span className="absolute bottom-2 left-3 text-[10px] font-bold text-gray-500 select-none">▼ Timbre ▲</span>
      <span className="absolute top-2 right-3 text-[10px] font-bold text-gray-500 select-none">Pression : molette 🖱</span>

      {/* Valeurs en direct (textContent via ref — zéro re-render) */}
      <span ref={valuesRef} className="absolute bottom-2 right-3 text-[10px] font-mono text-cyan-300/80 select-none">
        bend {BEND_CENTER} · timbre {TIMBRE_CENTER} · at 0
      </span>

      {/* Curseur (transform CSS — zéro re-render) */}
      <div
        ref={cursorRef}
        className="absolute left-0 top-0 w-9 h-9 rounded-full border-2 border-cyan-300 bg-cyan-400/30 shadow-[0_0_18px_rgba(34,211,238,0.7)] pointer-events-none will-change-transform"
        style={{ transform: 'translate3d(-1000px, -1000px, 0)' }}
      />
    </div>
  );
}

export default memo(MpeStrip);
