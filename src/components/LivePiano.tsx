/**
 * LivePiano — piano 7 octaves pour la reconnaissance d'accords en mode Live.
 *
 * Portage du rendu de `rusty-chord/src/outils.rs` (app Yew) en React :
 * mêmes classes de touches (`white e`, `black cs`, …), même ordre
 * graphique, même style CSS. Les touches tenues sur le clavier MIDI
 * (Roland) s'illuminent en bleu (classe `.active`).
 *
 * Seule la partie clavier est reprise (pas le cadre bois d'origine).
 * Le piano s'adapte à la largeur du conteneur (fit scale) : la font-size
 * est recalculée à chaque redimensionnement (ResizeObserver) pour que les
 * 7 octaves tiennent toujours sur une seule ligne. La logique de
 * disposition est dans `src/lib/livePiano.ts` (testable sans DOM).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LIVE_PIANO_OCTAVES,
  activePitchSet,
  buildPianoKeys,
  computePianoFontSize,
} from '../lib/livePiano';
import './LivePiano.css';

interface LivePianoProps {
  /** Notes MIDI actuellement tenues (état `active` de /live-input). */
  activePitches: number[];
  /** Nombre d'octaves affichées (défaut 7 : C2 → B8). */
  octaves?: number;
}

export default function LivePiano({ activePitches, octaves = LIVE_PIANO_OCTAVES }: LivePianoProps) {
  const keys = useMemo(() => buildPianoKeys(octaves), [octaves]);
  const active = useMemo(() => activePitchSet(activePitches), [activePitches]);

  // Échelle du piano : la font-size est recalculée pour que le piano tienne
  // dans la largeur du conteneur (null = échelle CSS par défaut, ex. SSR).
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => setFontSize(computePianoFontSize(el.clientWidth, octaves));
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [octaves]);

  return (
    <div
      ref={wrapRef}
      className="live-piano"
      style={fontSize !== null ? { fontSize: `${fontSize}px` } : undefined}
    >
      <ul className="set">
        {keys.map(k => (
          <li
            key={k.pitch}
            className={`${k.cls}${active.has(k.pitch) ? ' active' : ''}`}
            title={k.noteName}
          />
        ))}
      </ul>
    </div>
  );
}
