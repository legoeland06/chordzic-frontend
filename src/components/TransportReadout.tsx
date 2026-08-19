/**
 * TransportReadout — afficheurs Mesure / Temps / Durée du transport.
 *
 * S'abonne au store `playhead` (~10 fps) et se re-rend SEUL : pendant la
 * lecture, le transport et le DAW ne re-rendent plus à chaque tick
 * (optimisation performance B).
 */
import { useEffect, useState } from 'react';
import { getPlayheadPosition } from '../lib/playhead';

const tLcd = 'flex flex-col items-center justify-center px-2 py-0.5 bg-[#0a0c10] border border-[#1f2733] rounded-md min-w-[3.2rem] shrink-0';
const tLcdLabel = 'text-[8px] uppercase tracking-widest text-[#5c6472] leading-none';
const tLcdVal = 'font-mono text-[12px] text-[#d9b25f] leading-tight';

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const d = Math.floor((sec % 1) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${d}`;
}

export default function TransportReadout({ beatsPerBar, tempo, durSec }: {
  beatsPerBar: number;
  tempo: number;
  durSec: number;
}) {
  const [pos, setPos] = useState(0);

  useEffect(() => {
    setPos(getPlayheadPosition());
    const id = setInterval(() => setPos(getPlayheadPosition()), 100);
    return () => clearInterval(id);
  }, []);

  const measure = Math.floor(pos / beatsPerBar) + 1;
  const beatInBar = Math.floor(pos % beatsPerBar) + 1;
  const elapsedSec = (pos * 60) / Math.max(40, tempo);

  return (
    <>
      <div className={tLcd} title="Mesure courante · temps dans la mesure">
        <span className={tLcdLabel}>Mes.</span>
        <span className={tLcdVal}>{String(measure).padStart(3, '0')}.{beatInBar}</span>
      </div>
      <div className={tLcd} title="Temps écoulé depuis le début">
        <span className={tLcdLabel}>Temps</span>
        <span className={tLcdVal}>{fmtTime(elapsedSec)}</span>
      </div>
      <div className={tLcd} title="Durée totale du morceau">
        <span className={tLcdLabel}>Durée</span>
        <span className={tLcdVal}>{fmtTime(durSec)}</span>
      </div>
    </>
  );
}
