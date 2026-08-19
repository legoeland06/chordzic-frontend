/**
 * LiveSettingsBar — réglages musicaux compacts, partagés entre les deux
 * modes (Live et Navig) : volume master, 432Hz, Loop, Walking Bass, Pattern
 * drums et signature. Style affiné (finesse des lignes, états colorés
 * discrets) cohérent avec le mode Navig.
 *
 * En mode Navig, `showLoop` est à false (le Loop y est déjà géré par
 * LoopControl + les locators).
 */
import { memo } from 'react';
import { Gauge, Volume2 } from 'lucide-react';

interface LiveSettingsBarProps {
  volume: number;
  onSetVolume: (v: number) => void;
  use432: boolean;
  onSet432: (v: boolean) => void;
  loopOn: boolean;
  onSetLoop: (v: boolean) => void;
  walkingBass: boolean;
  onSetWalkingBass: (v: boolean) => void;
  drumPattern: string;
  onSetDrumPattern: (v: string) => void;
  sig: string;
  onSetSig: (v: string) => void;
  playing: boolean;
  /** Affiche le toggle Loop (false en Navig — LoopControl s'en charge). */
  showLoop?: boolean;
  /** Tempo (spinner + slider) — à droite de la Mesure. */
  tempo?: number;
  onTempoChange?: (t: number) => void;
}

const PATTERNS = [
  { value: 'rock', label: '🎸 Rock' },
  { value: 'pop', label: '🎤 Pop' },
  { value: 'reggae', label: '🌴 Reggae' },
  { value: 'onedrop', label: '⏬ OneDrop' },
  { value: 'bossa', label: '🌊 Bossa' },
  { value: 'jazz', label: '🎷 Jazz' },
];

/** Style des boutons toggle (fins, comme le mode Navig). */
function toggleCls(active: boolean, activeCls: string): string {
  return `px-2 py-1 text-[10px] font-bold rounded-md border transition-colors shrink-0 ${
    active
      ? activeCls
      : 'bg-gray-800/60 border-gray-700/60 text-gray-500 hover:text-gray-300 hover:border-gray-600'
  }`;
}

const selectCls = 'bg-gray-800/60 text-[10px] px-1.5 py-1 rounded-md border border-gray-700/60 outline-none shrink-0 focus:border-gray-500';

function LiveSettingsBar({
  volume, onSetVolume, use432, onSet432, loopOn, onSetLoop,
  walkingBass, onSetWalkingBass, drumPattern, onSetDrumPattern,
  sig, onSetSig, playing, showLoop = true,
  tempo, onTempoChange,
}: LiveSettingsBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[10px] text-gray-500">
      {/* Volume master */}
      <div className="flex items-center gap-1 shrink-0">
        <Volume2 className="w-3 h-3 text-gray-500" />
        <span className="shrink-0">Vol</span>
        <input
          type="range" min={10} max={127} value={volume}
          onChange={(e) => onSetVolume(parseInt(e.target.value))}
          className="w-16 sm:w-20 accent-green-500 shrink-0"
          title="Volume master"
        />
        <span className="w-5 text-right text-gray-400 font-mono shrink-0">{volume}</span>
      </div>

      <div className="w-px h-4 bg-gray-700/60 shrink-0" />

      {/* 432Hz */}
      <button
        onClick={() => onSet432(!use432)}
        className={toggleCls(use432, 'bg-yellow-900/40 border-yellow-600/50 text-yellow-300')}
        title="Accordage A=432 Hz (au lieu de 440 Hz)"
      >
        432Hz {use432 ? '●' : '○'}
      </button>

      {/* Loop */}
      {showLoop && (
        <button
          onClick={() => onSetLoop(!loopOn)}
          disabled={playing}
          className={`${toggleCls(loopOn, 'bg-purple-900/40 border-purple-500/50 text-purple-300')} disabled:opacity-40`}
          title="Répéter la grille en boucle (désactivé pendant la lecture)"
        >
          🔁 Loop {loopOn ? '●' : '○'}
        </button>
      )}

      {/* Walking Bass */}
      <button
        onClick={() => onSetWalkingBass(!walkingBass)}
        className={toggleCls(walkingBass, 'bg-pink-900/40 border-pink-500/50 text-pink-300')}
        title="Walking bass : la basse joue 4 notes par mesure au lieu d'une tenue"
      >
        🎵 WB {walkingBass ? '●' : '○'}
      </button>

      <div className="w-px h-4 bg-gray-700/60 shrink-0" />

      {/* Pattern drums */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="shrink-0">Pattern:</span>
        <select
          value={drumPattern}
          onChange={(e) => onSetDrumPattern(e.target.value)}
          className={selectCls}
          title="Style de batterie"
        >
          {PATTERNS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {/* Signature rythmique */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="shrink-0">Mesure:</span>
        <select
          value={sig}
          onChange={(e) => onSetSig(e.target.value)}
          className={selectCls}
          title="Signature rythmique"
        >
          <option value="4/4">4/4</option>
          <option value="3/4">3/4</option>
          <option value="6/8">6/8</option>
        </select>
      </div>

      {/* Tempo (spinner + slider) — à droite de la Mesure */}
      {tempo !== undefined && onTempoChange && (
        <>
          <div className="w-px h-4 bg-gray-700/60 shrink-0" />
          <div className="flex items-center gap-1 shrink-0">
            <Gauge className="w-3 h-3 text-gray-500" />
            <span className="shrink-0">Tempo:</span>
            <input
              type="range" min={40} max={220} value={tempo}
              onChange={(e) => onTempoChange(parseInt(e.target.value))}
              className="w-16 sm:w-20 accent-blue-500 shrink-0"
              title="Tempo (40-220 BPM)"
            />
            <input
              type="number"
              value={tempo}
              onChange={(e) => onTempoChange(parseInt(e.target.value))}
              className="w-10 bg-transparent text-[10px] font-bold text-blue-400 outline-none shrink-0"
              title="Tempo en BPM (40-220)"
            />
          </div>
        </>
      )}
    </div>
  );
}


export default memo(LiveSettingsBar);
