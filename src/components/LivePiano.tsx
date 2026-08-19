/**
 * LivePiano — piano aligné sur le clavier MIDI pour la reconnaissance
 * d'accords en mode Live.
 *
 * Portage du rendu de `rusty-chord/src/outils.rs` (app Yew) en React :
 * mêmes classes de touches (`white e`, `black cs`, …), même ordre
 * graphique, même style CSS. Les touches tenues sur le clavier MIDI
 * (Roland) s'illuminent en bleu (classe `.active`).
 *
 * Seule la partie clavier est reprise (pas le cadre bois d'origine).
 * La plage couvre par défaut l'étendue d'un clavier 88 touches
 * (A0 → C8) — alignée sur le Roland. Le piano s'adapte à la largeur du
 * conteneur (fit scale) : la font-size est recalculée à chaque
 * redimensionnement (ResizeObserver) pour tenir sur une seule ligne.
 * La logique est dans `src/lib/livePiano.ts` (testable sans DOM).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LIVE_PIANO_MAX_PITCH,
  LIVE_PIANO_MIN_PITCH,
  activePitchSet,
  buildPianoKeys,
  computePianoFontSize,
  pianoWidthEm,
} from '../lib/livePiano';
import './LivePiano.css';

interface LivePianoProps {
  /** Notes MIDI actuellement tenues (état `active` de /live-input). */
  activePitches: number[];
  /** Note la plus grave dessinée (défaut A0 = 21). */
  pitchMin?: number;
  /** Note la plus aiguë dessinée (défaut C8 = 108). */
  pitchMax?: number;
}

export default function LivePiano({
  activePitches,
  pitchMin = LIVE_PIANO_MIN_PITCH,
  pitchMax = LIVE_PIANO_MAX_PITCH,
}: LivePianoProps) {
  const keys = useMemo(() => buildPianoKeys(pitchMin, pitchMax), [pitchMin, pitchMax]);
  const active = useMemo(() => activePitchSet(activePitches, pitchMin, pitchMax), [activePitches, pitchMin, pitchMax]);
  const widthEm = useMemo(() => pianoWidthEm(pitchMin, pitchMax), [pitchMin, pitchMax]);

  // Échelle du piano : la font-size est recalculée pour que le piano tienne
  // dans la largeur du conteneur (null = échelle CSS par défaut, ex. SSR).
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => setFontSize(computePianoFontSize(el.clientWidth, widthEm));
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [widthEm]);

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
