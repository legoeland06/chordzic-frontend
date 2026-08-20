/**
 * 🎹 Rise2Keywaves — zone des 49 keywaves du ROLI Seaboard RISE 2 (5D Touch).
 *
 * La surface continue du Seaboard simulée en 49 keywaves (4 octaves + 1) :
 *  - STRIKE : appui sur une keywave → note-on (vélocité 100) ;
 *  - GLIDE  : glisser horizontalement DANS la keywave → pitch bend (le
 *    centre de la keywave = bend neutre) ; traverser une keywave voisine →
 *    glissando (note-off + note-on de la nouvelle note) ;
 *  - SLIDE  : glisser verticalement → timbre (CC74) ;
 *  - PRESS  : molette → aftertouch (channel pressure) ;
 *  - LIFT   : relâchement → note-off (la vitesse de relâche est visuelle,
 *    le serveur n'horodate que note-on/off).
 *
 * PERFORMANCE : aucun state React — l'illumination des keywaves (box-shadow /
 * brightness) et les valeurs passent par des refs ; les gestes sont
 * échantillonnés à ~60 Hz (rAF) et remontés au cadre commun (ExpressionFrame).
 */
import { memo, useCallback, useEffect, useRef } from 'react';
import { BEND_CENTER, TIMBRE_CENTER, wheelToPressure, xToBend, yToTimbre } from '../../lib/mpe';
import { sendPianoNote } from '../../lib/pianoNote';
import { MpeModuleProps } from './ExpressionFrame';

/** Nombre de keywaves (le RISE 2 : 49). */
export const RISE2_KEYWAVES = 49;
/** Pitch de la première keywave (C2 = 36) — 49 notes → C2..C6. */
export const RISE2_START_PITCH = 36;
/** Vélocité du Strike (le vrai Seaboard la mesure à la frappe). */
export const RISE2_VELOCITY = 100;

function Rise2Keywaves({ onGesture, onGestureEnd }: MpeModuleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const keywaveRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeIndexRef = useRef<number | null>(null);
  const activePitchRef = useRef<number | null>(null);
  const bendRef = useRef(BEND_CENTER);
  const timbreRef = useRef(TIMBRE_CENTER);
  const pressureRef = useRef(0);
  const draggingRef = useRef(false);
  const rafRef = useRef(0);
  const dirtyRef = useRef(false);

  /** Échantillonne le geste (~1×/frame) vers le cadre commun. */
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

  /** Position X → index de keywave + position 0..1 dans la keywave. */
  const locate = useCallback((clientX: number): { index: number; x: number } => {
    const el = containerRef.current!;
    const rect = el.getBoundingClientRect();
    const rel = (clientX - rect.left) / Math.max(1, rect.width);
    const index = Math.min(RISE2_KEYWAVES - 1, Math.max(0, Math.floor(rel * RISE2_KEYWAVES)));
    const x = rel * RISE2_KEYWAVES - index;
    return { index, x };
  }, []);

  /** Illumine/éteint une keywave (style direct — pas de re-render). */
  const setActive = useCallback((index: number | null) => {
    const prev = activeIndexRef.current;
    if (prev !== null) {
      const el = keywaveRefs.current[prev];
      if (el) {
        el.style.boxShadow = '';
        el.style.filter = '';
      }
    }
    activeIndexRef.current = index;
    if (index !== null) {
      const el = keywaveRefs.current[index];
      if (el) {
        el.style.boxShadow = '0 0 18px rgba(34,211,238,0.9), inset 0 0 12px rgba(34,211,238,0.5)';
        el.style.filter = 'brightness(1.7)';
      }
    }
  }, []);

  /** Applique la position du pointeur : glissando + glide + slide. */
  const apply = useCallback((clientX: number, clientY: number) => {
    const { index, x } = locate(clientX);
    // Glissando : traverser une keywave = nouvelle note (l'ancienne s'éteint)
    if (index !== activeIndexRef.current) {
      const prevPitch = activePitchRef.current;
      const newPitch = RISE2_START_PITCH + index;
      if (prevPitch !== null && prevPitch !== newPitch) void sendPianoNote(prevPitch, false);
      void sendPianoNote(newPitch, true);
      activePitchRef.current = newPitch;
      setActive(index);
    }
    // Glide : position dans la keywave → bend (centre = neutre)
    bendRef.current = xToBend(x);
    // Slide : position verticale → timbre
    const el = containerRef.current!;
    const rect = el.getBoundingClientRect();
    timbreRef.current = yToTimbre((clientY - rect.top) / Math.max(1, rect.height));
    emit();
  }, [locate, setActive, emit]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { index, x } = locate(e.clientX);
    const pitch = RISE2_START_PITCH + index;
    void sendPianoNote(pitch, true, undefined, RISE2_VELOCITY); // STRIKE
    activePitchRef.current = pitch;
    setActive(index);
    bendRef.current = xToBend(x);
    const el = containerRef.current!;
    const rect = el.getBoundingClientRect();
    timbreRef.current = yToTimbre((e.clientY - rect.top) / Math.max(1, rect.height));
    emit();
  }, [locate, setActive, emit]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (draggingRef.current) apply(e.clientX, e.clientY);
  }, [apply]);

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    // LIFT : relâchement → note-off, la keywave s'éteint
    if (activePitchRef.current !== null) void sendPianoNote(activePitchRef.current, false);
    activePitchRef.current = null;
    setActive(null);
    onGestureEnd({ bend: bendRef.current, timbre: timbreRef.current, pressure: pressureRef.current });
  }, [setActive, onGestureEnd]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    // PRESS : molette = enfoncement (aftertouch)
    pressureRef.current = wheelToPressure(pressureRef.current, e.deltaY);
    emit();
  }, [emit]);

  // Nettoyage : note-off de sécurité si la modal se ferme pendant une tenue
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (activePitchRef.current !== null) void sendPianoNote(activePitchRef.current, false);
  }, []);

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      className="relative flex-1 min-h-[45vh] rounded-xl border border-gray-700/80 bg-[#0d1420] select-none touch-none cursor-crosshair overflow-hidden p-2"
      title="Keywaves ROLI Seaboard RISE 2 : appui = Strike · glisser X = Glide (bend) · Y = Slide (timbre) · molette = Press"
    >
      {/* Surface continue des keywaves (en relief) */}
      <div className="flex h-full gap-[2px]">
        {Array.from({ length: RISE2_KEYWAVES }, (_, i) => {
          const pitch = RISE2_START_PITCH + i;
          const isC = pitch % 12 === 0;
          return (
            <div
              key={i}
              ref={(el) => { keywaveRefs.current[i] = el; }}
              className="relative flex-1 rounded-t-[45%] rounded-b-md"
              style={{
                background: isC
                  ? 'linear-gradient(180deg, #2e4260 0%, #182438 55%, #0d1420 100%)'
                  : 'linear-gradient(180deg, #1e2a40 0%, #141d2e 55%, #0d1420 100%)',
              }}
            >
              {/* Repère des notes C (comme les repères tactiles du RISE 2) */}
              {isC && <span className="absolute left-1/2 top-1.5 -translate-x-1/2 w-1 h-1 rounded-full bg-cyan-400/60" />}
            </div>
          );
        })}
      </div>

      {/* Légendes 5D */}
      <span className="absolute top-2 left-3 text-[10px] font-bold text-gray-500 select-none">
        🎹 Strike · Glide ◀▶ · Slide ▲▼ · Press (molette)
      </span>
      <span className="absolute bottom-2 right-3 text-[9px] text-gray-600 select-none">
        49 keywaves · C2 → C6 · glissando en traversant
      </span>
    </div>
  );
}

export default memo(Rise2Keywaves);
