/**
 * LivePiano — piano aligné sur le clavier MIDI pour la reconnaissance
 * d'accords en mode Live.
 *
 * Portage du rendu de `rusty-chord/src/outils.rs` (app Yew) en React :
 * mêmes classes de touches (`white e`, `black cs`, …), même ordre
 * graphique, même style CSS. Les touches tenues sur le clavier MIDI
 * (Roland) s'illuminent en bleu (classe `.active`).
 *
 * Le piano est **cliquable** (onPlayNote) : un appui (souris ou doigt)
 * envoie note-on, le relâchement note-off — comme un vrai clavier. La
 * touche tenue s'illumine aussi localement. Pointer capture : la note
 * est coupée même si le curseur sort de la touche (multi-touch OK).
 *
 * Seule la partie clavier est reprise (pas le cadre bois d'origine).
 * La plage couvre par défaut l'étendue d'un clavier 88 touches
 * (A0 → C8) — alignée sur le Roland. Le piano s'adapte à la largeur du
 * conteneur (fit scale) : la font-size est recalculée à chaque
 * redimensionnement (ResizeObserver) pour tenir sur une seule ligne.
 * La logique est dans `src/lib/livePiano.ts` (testable sans DOM).
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
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
  /**
   * Touche cliquée : `onPlayNote(pitch, true)` à l'appui, `(pitch, false)`
   * au relâchement — le parent l'envoie au Roland (POST /piano-note).
   * Stable (useCallback) pour préserver le memo.
   */
  onPlayNote?: (pitch: number, on: boolean) => void;
}

function LivePiano({
  activePitches,
  pitchMin = LIVE_PIANO_MIN_PITCH,
  pitchMax = LIVE_PIANO_MAX_PITCH,
  onPlayNote,
}: LivePianoProps) {
  const keys = useMemo(() => buildPianoKeys(pitchMin, pitchMax), [pitchMin, pitchMax]);
  const active = useMemo(() => activePitchSet(activePitches, pitchMin, pitchMax), [activePitches, pitchMin, pitchMax]);
  const widthEm = useMemo(() => pianoWidthEm(pitchMin, pitchMax), [pitchMin, pitchMax]);

  // Touches tenues AU CLIC (note-on envoyée, en attente du relâchement).
  const [held, setHeld] = useState<ReadonlySet<number>>(new Set());

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

  // Nettoyage de sécurité : si le composant est démonté avec des touches
  // tenues (ex. changement de mode), couper toutes les notes.
  const heldRef = useRef(held);
  heldRef.current = held;
  const onPlayNoteRef = useRef(onPlayNote);
  onPlayNoteRef.current = onPlayNote;
  useEffect(() => {
    const cb = onPlayNoteRef.current;
    if (!cb) return;
    for (const p of heldRef.current) cb(p, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDown = (e: React.PointerEvent<HTMLLIElement>, pitch: number) => {
    if (!onPlayNote) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* déjà capturé */ }
    setHeld(prev => {
      if (prev.has(pitch)) return prev;
      const n = new Set(prev);
      n.add(pitch);
      return n;
    });
    onPlayNote(pitch, true);
  };

  const handleUp = (e: React.PointerEvent<HTMLLIElement>, pitch: number) => {
    if (!onPlayNote) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setHeld(prev => {
      if (!prev.has(pitch)) return prev;
      const n = new Set(prev);
      n.delete(pitch);
      return n;
    });
    onPlayNote(pitch, false);
  };

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
            className={`${k.cls}${active.has(k.pitch) || held.has(k.pitch) ? ' active' : ''}`}
            title={k.noteName}
            onPointerDown={onPlayNote ? (e) => handleDown(e, k.pitch) : undefined}
            onPointerUp={onPlayNote ? (e) => handleUp(e, k.pitch) : undefined}
            onPointerCancel={onPlayNote ? (e) => handleUp(e, k.pitch) : undefined}
          />
        ))}
      </ul>
    </div>
  );
}


export default memo(LivePiano);
