/**
 * LivePiano — piano 7 octaves pour la reconnaissance d'accords en mode Live.
 *
 * Portage du rendu de `rusty-chord/src/outils.rs` (app Yew) en React :
 * mêmes classes de touches (`white e`, `black cs`, …), même ordre
 * graphique, même style CSS. Les touches tenues sur le clavier MIDI
 * (Roland) s'illuminent en bleu (classe `.active`).
 *
 * Seule la partie clavier est reprise (pas le cadre bois d'origine) :
 * la logique de disposition est dans `src/lib/livePiano.ts` (testable).
 */
import React, { useMemo } from 'react';
import {
  LIVE_PIANO_OCTAVES,
  activePitchSet,
  buildPianoKeys,
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

  return (
    <div className="live-piano">
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
