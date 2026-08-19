/**
 * PlayheadLine — ligne de lecture animée SANS re-render React.
 *
 * S'abonne au store `playhead` (position hors React) et se positionne par
 * `transform: translateX` dans une frame d'animation : pendant la lecture,
 * AUCUN re-render n'est déclenché (le canvas des notes n'est plus redessiné
 * pour la ligne rouge — optimisation performance A+B).
 *
 * Positionnée dans le repère du CONTENU (le scroll horizontal la déplace
 * naturellement) : `scale` = pixels par beat de la zone.
 */
import { useEffect, useRef } from 'react';
import { getPlayheadPosition, subscribePlayhead } from '../lib/playhead';

interface PlayheadLineProps {
  /** Pixels par beat (échelle de la zone). */
  scale: number;
  /** Largeur du contenu (px) — la ligne est masquée hors champ. */
  contentWidth?: number;
  /** Couleur de la ligne (défaut : rouge lecture). */
  color?: string;
}

export default function PlayheadLine({ scale, contentWidth, color = '#f87171' }: PlayheadLineProps) {
  const lineRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(scale);
  const cwRef = useRef(contentWidth ?? 0);
  scaleRef.current = scale;
  cwRef.current = contentWidth ?? 0;

  useEffect(() => {
    const el = lineRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      const x = getPlayheadPosition() * scaleRef.current;
      el.style.transform = `translateX(${x}px)`;
      // Masquer la ligne hors du contenu visible (évite un scroll induit)
      const cw = cwRef.current;
      const hidden = x < -2 || (cw > 0 && x > cw + 2);
      el.style.visibility = hidden ? 'hidden' : 'visible';
    };
    update();
    const unsub = subscribePlayhead(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    });
    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, []);

  return (
    <div
      ref={lineRef}
      className="absolute top-0 bottom-0 z-20 pointer-events-none"
      style={{ left: 0, width: 2, backgroundColor: color }}
    >
      {/* Repère triangulaire en haut */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: -4,
          width: 0,
          height: 0,
          borderLeft: '4px solid transparent',
          borderRight: '4px solid transparent',
          borderTop: `6px solid ${color}`,
        }}
      />
    </div>
  );
}
