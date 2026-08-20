/**
 * DawView — vue « table de mixage + pistes » du mode Navigateur (📱 Navig.).
 *
 * Layout type DAW, destiné au travail sur les pistes instrument :
 * - Barre de transport complète : ▶ Play / ⏸ Pause / ■ Stop / ⏮ Begin
 * - TABLE DE MIXAGE : une colonne par piste (nom éditable, instrument,
 *   fader de volume, mute) — remplace le champ texte des accords
 * - PISTES HORIZONTALES : une ligne par piste, notes en petits rectangles
 *   (canvas). Fines par défaut, agrandissables/rétrécissables au chevron.
 *   Clic sur la ligne (canvas) = déplacer la tête de lecture (scrub).
 *   Clic sur l'étiquette = ouvrir le Piano Roll de la piste.
 * - LIGNE VERTICALE de lecture qui court pendant la lecture, se fige à la
 *   pause, et se déplace au clic.
 */
import React, { memo, useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Play, Pause, Square, SkipBack, Download, Upload, Save, FolderOpen, Repeat, HelpCircle, FilePlus2, ChevronUp, ChevronDown, Settings, Cable, Piano } from 'lucide-react';
import ClickControl from './ClickControl';
import LoopControl from './LoopControl';
import PianoRoll from './PianoRoll';
import PianoLivePanel from './PianoLivePanel';
import { sendPianoNote } from '../lib/pianoNote';
import LiveSettingsBar from './LiveSettingsBar';
import PlayheadLine from './PlayheadLine';
import TransportReadout from './TransportReadout';
import { getPlayheadPosition, setPlayheadPosition } from '../lib/playhead';
import { AudioEngine, TrackConfig, FX_ZERO } from '../lib/audioEngine';
import type { SampleLoopCfg } from '../lib/browserSynth';
import { getClickSig } from '../lib/clickPrefs';
import { wrapLoopPositionSec, locBeatToMes, locMesToBeat, computeStartBeats, laneTop } from '../lib/navPosition';
import { parseRepeat } from '../types/chord';
import { PIANO_KEYBOARD_WIDTH, DEFAULT_SNAP_UNIT, snapToGrid } from '../lib/pianoRollTypes';
import type { PianoNote } from '../lib/pianoRollTypes';
import type { RecognizedChord } from '../lib/chordRecognition';
import { pitchesToPianoNotes } from '../lib/pitchesToNotes';
import { RecMidiEvent, countdownClicks, recEventsToNotes } from '../lib/recMidi';
import { backendUrl } from '../lib/chordUtils';

// ─── Constantes d'affichage ────────────────────────────────────────────

/** Pixels par beat dans les lanes (zoom lecture compact, notes en pixels). */
const API_BASE = backendUrl();
const LANE_PPB = 24;
/** Zoom horizontal des lanes : plage 0.25× – 8× (6 à 192 px/beat). */
const LANE_ZOOM_MAX = LANE_PPB * 8;
/** Pixels par demi-ton quand une lane est agrandie. */
const PITCH_PX = 6;
/** Hauteur d'une lane fine (défaut). */
const LANE_COMPACT_H = 26;
/** Hauteur d'une lane agrandie : accueille le PianoRoll intégré (éditable). */
const LANE_PIANOROLL_H = 300;
/** Durée minimale affichée (beats). */
const MIN_BEATS = 16;

/** Couleur d'une piste selon son canal (cohérent avec TrackPanel). */
const trackColor = (ch: number) =>
  ch === 0 ? '#60a5fa'
  : ch === 2 ? '#fbbf24'
  : ch === 3 ? '#c084fc'
  : ch === 9 ? '#f87171'
  : ch === 4 ? '#34d399'
  : '#26d3ff';

/** Icône d'une piste selon son canal. */
const trackIcon = (ch: number) =>
  ch === 0 ? '🎹' : ch === 2 ? '🎸' : ch === 3 ? '🎻' : ch === 9 ? '🥁' : '🎼';

/** Kits de percussion du Roland JUNO-D6/D7/D8 (ZEN-Core) — banques MIDI
 * (MSB/LSB) + program. Noms par défaut : PR-A / COMMON / USER + numéro
 * (identifiables à l'oreille sur le synthé). */
const JUNO_DRUM_KITS = [
  ...Array.from({ length: 37 }, (_, i) => ({ key: `pra:${i + 1}`, label: `JUNO PR-A ${String(i + 1).padStart(2, '0')}`, msb: 70, lsb: 74, program: i + 1 })),
  ...Array.from({ length: 74 }, (_, i) => ({ key: `common:${i + 1}`, label: `JUNO COMMON ${String(i + 1).padStart(2, '0')}`, msb: 86, lsb: 65, program: i + 1 })),
  ...Array.from({ length: 16 }, (_, i) => ({ key: `user:${i + 1}`, label: `JUNO USER ${String(i + 1).padStart(2, '0')}`, msb: 70, lsb: 7, program: i + 1 })),
];

// ─── Props ─────────────────────────────────────────────────────────────

interface DawViewProps {
  tracks: TrackConfig[];
  pianoNotes: Record<number, PianoNote[]>;
  playing: boolean;
  hasWav: boolean;
  tempo: number;
  loopOn: boolean;
  /** Locators [L, R[ (beats) — intervalle de boucle du repeat. R ≤ L = pas
   * d'intervalle (boucle complète du morceau). */
  locL: number;
  locR: number;
  onLocatorsChange: (l: number, r: number) => void;
  sig: string;                          // signature rythmique (compteur de mesures)
  input: string;                        // signature du contenu (re-rendu si modifié)
  volume: number;
  onSetVolume: (v: number) => void;
  use432: boolean;
  onSet432: (v: boolean) => void;
  walkingBass: boolean;
  onSetWalkingBass: (v: boolean) => void;
  drumPattern: string;
  onSetDrumPattern: (v: string) => void;
  onSetSig: (v: string) => void;
  engine: AudioEngine;                  // lecture / pause / seek
  onPlay: (startAtBeats?: number) => void; // rend le WAV (moteur interne, silencieux) + joue — le son du synthé se fait via ▶ MIDI
  onExtractWav: () => void;
  onTempoChange: (t: number) => void;
  onSetLoop: (v: boolean) => void;
  onSetLive: () => void;
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onImport: () => void;
  /** Réinitialise le projet courant (Nouveau projet). */
  onNewProject: () => void;
  /** Boucle sample (mode Navig) : config + mise à jour (appliquée en direct). */
  sampleLoop: SampleLoopCfg;
  onSampleLoopChange: (patch: Partial<SampleLoopCfg>) => void;
  onAddTrack: () => void;
  onRemoveTrack: (channel: number) => void;
  onUpdateTrack: (channel: number, cfg: Partial<TrackConfig>) => void;
  /** Réordonne les pistes (drag & drop des lanes) — ordre partagé avec la
   * table de mixage et le mode Live. from/to = indices dans `tracks`. */
  onReorderTracks: (from: number, to: number) => void;
  /** Met à jour les notes d'une piste (édition directe dans le PianoRoll intégré). */
  onNotesChange: (channel: number, notes: PianoNote[]) => void;
  /** Lecture MIDI globale (mode Navig) : toutes les pistes sur le port MIDI choisi. */
  onPlayMidiAll: (startAtBeats?: number, excludeChannel?: number, recAfterBeats?: number) => Promise<boolean>;
  onHelp: () => void;
  /** Bounce multitrack → ouvre le mode PostProd. */
  onPostProd: () => void;
  /** Vrai pendant le bounce (le bouton est désactivé). */
  bouncing: boolean;
}

/** Coordonnées d'un point sur un cercle (pour les arcs de knob). */
function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** Chemin SVG d'un arc de cercle (pour la course d'un knob). */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** Potentiomètre circulaire (drag vertical pour régler, 0-100). */
function Knob({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  const valRef = useRef(value);
  valRef.current = value;
  const dragRef = useRef<{ y: number; v0: number } | null>(null);
  const angle = -135 + (valRef.current / 100) * 270;
  const [ix, iy] = polar(18, 18, 11, angle);
  return (
    <div className="flex flex-col items-center gap-0.5 select-none" title={`${label} — appliqué au rendu WAV (mode Navig)`}>
      <svg
        width={36} height={36} viewBox="0 0 36 36"
        className="cursor-ns-resize touch-none"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          dragRef.current = { y: e.clientY, v0: valRef.current };
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d) return;
          const dv = (d.y - e.clientY) * (100 / 110);
          onChange(Math.max(0, Math.min(100, Math.round(d.v0 + dv))));
        }}
        onPointerUp={() => { dragRef.current = null; }}
      >
        <circle cx={18} cy={18} r={15} fill="#101319" stroke="#2a2f3b" strokeWidth={1.5} />
        {/* Course (fond) */}
        <path d={arcPath(18, 18, 11, -135, 135)} stroke="#262b36" strokeWidth={3} fill="none" strokeLinecap="round" />
        {/* Course (valeur) */}
        <path d={arcPath(18, 18, 11, -135, angle)} stroke="#b8954f" strokeWidth={3} fill="none" strokeLinecap="round" />
        {/* Repère */}
        <line x1={18} y1={18} x2={ix} y2={iy} stroke="#e0b96a" strokeWidth={2} strokeLinecap="round" />
        <circle cx={18} cy={18} r={2.5} fill="#0c0e12" stroke="#8f7a4a" strokeWidth={1} />
      </svg>
      <span className="text-[8px] text-gray-500 font-mono leading-none">{label}</span>
      <span className="text-[8px] text-gray-400 font-mono leading-none">{value}</span>
    </div>
  );
}

/** Fader de volume FUSIONNÉ avec le vumètre : la course du fader est le
 * vumètre de la piste (remplissage coloré selon l'activité), le curseur
 * indique le volume. Clic/drag n'importe où sur la course = régler le volume. */
function FaderVU({ volume, level, onVolume }: {
  volume: number; level: number; onVolume: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<number | null>(null);
  const setFromY = useCallback((clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const frac = 1 - Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    onVolume(Math.max(1, Math.min(127, Math.round(frac * 127))));
  }, [onVolume]);
  return (
    <div className="flex flex-col items-center gap-1 select-none h-full">
      <div
        ref={trackRef}
        className="relative w-7 flex-1 min-h-0 rounded-md bg-[#0a0c10] border border-[#23272f] overflow-hidden cursor-pointer touch-none"
        title="Volume — la course sert aussi de vumètre (activité pendant la lecture)"
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          dragRef.current = e.clientY;
          setFromY(e.clientY);
        }}
        onPointerMove={(e) => { if (dragRef.current !== null) setFromY(e.clientY); }}
        onPointerUp={() => { dragRef.current = null; }}
      >
        {/* Vumètre : remplissage depuis le bas (vert → jaune → rouge) */}
        <div
          className="absolute inset-x-0 bottom-0 transition-[height] duration-75"
          style={{
            height: `${Math.round(level * 100)}%`,
            background: 'linear-gradient(to top, rgba(74,222,128,0.85), rgba(250,204,21,0.85) 60%, rgba(248,113,113,0.9) 85%)',
          }}
        />
        {/* Graduations fines (repères de niveau) */}
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{ background: 'repeating-linear-gradient(to top, transparent 0 9px, #1b2029 9px 10px)' }}
        />
        {/* Curseur de volume */}
        <div className="absolute inset-x-0 pointer-events-none" style={{ bottom: `${(volume / 127) * 100}%` }}>
          <div className="h-[5px] w-full bg-[#e0b96a] rounded-[2px] shadow-[0_0_4px_rgba(224,185,106,0.6)]" />
        </div>
      </div>
      <span className="text-[9px] text-gray-400 font-mono leading-none">{volume}</span>
    </div>
  );
}

/** Mini-vumètre (4 tirets superposés) pour les lanes de pistes. */
function MiniVU({ level }: { level: number }) {
  const lit = Math.round(Math.max(0, Math.min(1, level)) * 4);
  const color = (i: number) =>
    i < lit ? (i < 2 ? '#4ade80' : i < 3 ? '#facc15' : '#f87171') : '#262a34';
  return (
    <div className="flex flex-col justify-end gap-[2px] w-[7px] shrink-0" title="Activité de la piste">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="h-[3px] w-full rounded-[1px]" style={{ backgroundColor: color(i), transition: 'background-color 60ms linear' }} />
      ))}
    </div>
  );
}

// ─── Lane : une piste horizontale avec ses notes (canvas) ─────────────

/** Hauteur d'une lane selon son état (partagée entre le panneau des
 * labels et le panneau des canvas pour un alignement parfait).
 * Mode détail (défaut) : hauteur proportionnelle au registre des notes ;
 * piste vide = hauteur minimale. */
function laneHeightFor(notes: PianoNote[], detailed: boolean): number {
  if (!detailed) return LANE_COMPACT_H;
  if (notes.length === 0) return 48;
  let mn = 127, mx = 0;
  for (const n of notes) { if (n.pitch < mn) mn = n.pitch; if (n.pitch > mx) mx = n.pitch; }
  return Math.max(48, (Math.min(127, mx + 2) - Math.max(0, mn - 2) + 1) * PITCH_PX);
}

const TrackLane = memo(function TrackLane({
  track, notes, totalBeats, compact, onScrub,
}: {
  track: TrackConfig;
  notes: PianoNote[];
  totalBeats: number;
  compact: boolean;
  onScrub: (beats: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const color = trackColor(track.channel);
  /** Largeur réelle (CSS) du canvas — mesure via ResizeObserver. */
  const [width, setWidth] = useState(200);

  // Suivre la largeur réelle (zoom, redimensionnement)
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const update = () => setWidth(wrap.getBoundingClientRect().width || 200);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Plage de pitch (utilisée seulement en vue agrandie)
  const { minPitch, maxPitch } = useMemo(() => {
    if (notes.length === 0) return { minPitch: 36, maxPitch: 96 };
    let mn = 127, mx = 0;
    for (const n of notes) { if (n.pitch < mn) mn = n.pitch; if (n.pitch > mx) mx = n.pitch; }
    return { minPitch: Math.max(0, mn - 2), maxPitch: Math.min(127, mx + 2) };
  }, [notes]);

  // laneHeightFor attend `detailed` : on lui passe l'inverse de `compact`
  // (compact=true → aperçu → hauteur réduite ; compact=false → détail complet).
  const laneHeight = laneHeightFor(notes, !compact);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(laneHeight * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Échelle réelle : le canvas occupe la largeur du conteneur (totalBeats)
    const sx = totalBeats > 0 ? width / totalBeats : 1;

    // Fond
    ctx.fillStyle = '#14141d';
    ctx.fillRect(0, 0, width, laneHeight);

    // Lignes de temps (mesures) + numéros
    for (let beat = 0; beat <= totalBeats; beat++) {
      const x = beat * sx;
      ctx.strokeStyle = beat % 4 === 0 ? '#333455' : '#222233';
      ctx.lineWidth = beat % 4 === 0 ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, laneHeight);
      ctx.stroke();
      if (beat % 4 === 0 && !compact && sx > 14) {
        ctx.fillStyle = '#4a4b6e';
        ctx.font = '8px monospace';
        ctx.fillText(`${beat / 4 + 1}`, x + 2, 10);
      }
    }

    // Lignes de pitch (vue agrandie uniquement)
    if (!compact) {
      for (let p = minPitch; p <= maxPitch; p++) {
        const y = (maxPitch - p) * PITCH_PX + PITCH_PX - 0.5;
        ctx.strokeStyle = p % 12 === 0 ? '#2d2d4a' : '#1d1d2c';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    // Notes (petits rectangles)
    for (const n of notes) {
      const x = n.startTime * sx;
      const w = Math.max(2, n.duration * sx);
      if (compact) {
        // Vue fine : bande unique, pixels centrés
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.5 + (n.velocity / 127) * 0.5;
        ctx.fillRect(x, 2, w, laneHeight - 4);
        ctx.globalAlpha = 1;
      } else {
        const y = (maxPitch - n.pitch) * PITCH_PX;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.45 + (n.velocity / 127) * 0.55;
        ctx.fillRect(x, y, w, PITCH_PX - 1);
        ctx.globalAlpha = 1;
      }
    }

  }, [notes, color, width, laneHeight, minPitch, maxPitch, totalBeats, compact]);

  /** Clic sur le canvas → déplacer la tête de lecture (scrub). */
  const handleScrub = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const beats = Math.max(0, ((e.clientX - rect.left) / rect.width) * totalBeats);
    onScrub(beats);
  };

  return (
    <div
      ref={wrapRef}
      className="w-full h-full overflow-hidden rounded border border-gray-800 group-hover:border-gray-600 transition-colors relative"
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: laneHeight, display: 'block', cursor: 'copy', touchAction: 'none' }}
        onPointerDown={handleScrub}
        title="Clic : déplacer la tête de lecture · Molette : zoomer (centré sur le curseur)"
      />
      {/* Ligne de lecture animée (store playhead, sans re-render) */}
      <PlayheadLine scale={totalBeats > 0 ? width / totalBeats : 1} contentWidth={width} />
    </div>
  );
});

/** Champ locator éditable au format mesure.temps + flèches ▲▼ (±1 temps).
 * La position interne reste en beats (le backend attend des beats). */
function LocatorField({ label, color, value, beatsPerBar, min, max, onChange }: {
  label: 'L' | 'R'; color: string; value: number; beatsPerBar: number;
  min: number; max: number; onChange: (beat: number) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const clamp = (v: number) => Math.max(min, Math.min(Math.round(v), max));
  const commit = (text: string) => {
    const b = locMesToBeat(text, beatsPerBar);
    if (b !== null) onChange(clamp(b));
    setEditing(null);
  };
  return (
    <div className="flex items-center gap-0.5 shrink-0" title={`Locator ${label} — intervalle de boucle [L, R[ (format mesure.temps, snap de la grille)`}>
      <span className="text-[9px] font-bold" style={{ color }}>{label}</span>
      <div className="flex items-center bg-[#0a0c10] border border-[#1f2733] rounded overflow-hidden">
        <input
          className="w-12 bg-transparent text-[10px] font-mono text-center py-0.5 focus:outline-none focus:bg-[#10151d]"
          style={{ color }}
          value={editing ?? locBeatToMes(value, beatsPerBar)}
          onChange={(e) => setEditing(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <div className="flex flex-col border-l border-[#1f2733]">
          <button
            className="w-4 h-3 leading-none text-[7px] text-[#5c6472] hover:text-white hover:bg-[#1a2230]"
            onClick={() => onChange(clamp(value + 1))}
          >▲</button>
          <button
            className="w-4 h-3 leading-none text-[7px] text-[#5c6472] hover:text-white hover:bg-[#1a2230] border-t border-[#1f2733]"
            onClick={() => onChange(clamp(value - 1))}
          >▼</button>
        </div>
      </div>
    </div>
  );
}

// ─── Composant principal ───────────────────────────────────────────────

/** Poignée draggable d'un locator (L ou R) — composant STABLE (module-level) :
 * défini dans le corps de DawView, il serait REMONTÉ à chaque render pendant
 * le drag → perte de la capture du pointeur → déplacements par à-coups. */
function LocatorHandle({ side, beat, contentW, totalBeats, color, onMove }: {
  side: 'L' | 'R'; beat: number; contentW: number; totalBeats: number;
  color: string; onMove: (clientX: number) => void;
}) {
  return (
    <div
      className="absolute top-0 bottom-0 z-10 cursor-ew-resize select-none touch-none flex items-center justify-center"
      style={{ left: (beat * contentW) / Math.max(1, totalBeats) - 6, width: 12 }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) onMove(e.clientX);
      }}
      onPointerUp={(e) => {
        if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        }
      }}
    >
      <div className="w-[3px] h-full rounded-full" style={{ background: color }} />
      <span className="absolute top-0 left-1/2 -translate-x-1/2 text-[9px] font-bold" style={{ color }}>
        {side}
      </span>
    </div>
  );
}

export default function DawView({
  tracks, pianoNotes, playing, hasWav, tempo, loopOn, locL, locR, onLocatorsChange, sig, input, engine,
  volume, onSetVolume, use432, onSet432, walkingBass, onSetWalkingBass, drumPattern, onSetDrumPattern,
  onSetSig,
  onPlay, onExtractWav, onTempoChange, onSetLoop, onSetLive,
  onSave, onLoad, onExport, onImport, onNewProject,
  sampleLoop, onSampleLoopChange,
  onAddTrack, onRemoveTrack, onUpdateTrack, onReorderTracks, onNotesChange, onPlayMidiAll, onHelp,
  onPostProd, bouncing,
}: DawViewProps) {
  // ── Transport local (Play/Pause/Stop/Begin + tête de lecture) ──
  type PlayState = 'idle' | 'playing' | 'paused';
  const [playState, setPlayState] = useState<PlayState>('idle');
  /** Canal dont la lane est AGRANDIE (PianoRoll intégré). Une seule à la
   * fois : la barre d'outils (dans la zone transport) pilote cette piste. */
  const [expandedCh, setExpandedCh] = useState<number | null>(null);
  /** Canal ouvert dans le Piano Roll MODAL (grande échelle) — ouvert depuis
   * le bouton ⛶ de la toolbar du PianoRoll intégré. Les deux partagent les
   * MÊMES notes (pianoNotes) : cohérence totale et instantanée. */
  const [modalPianoRoll, setModalPianoRoll] = useState<number | null>(null);
  /** Clavier de piano vertical en marge (portal keys-slot) — rétractable par
   * l'utilisateur (bouton 🎹 de la toolbar), préférence persistée. */
  const [keysVisible, setKeysVisible] = useState(() => {
    try { return localStorage.getItem('chordzic_pr_keys') !== 'off'; } catch { return true; }
  });
  const toggleKeys = useCallback(() => {
    setKeysVisible(v => {
      const nv = !v;
      try { localStorage.setItem('chordzic_pr_keys', nv ? 'on' : 'off'); } catch { /* stockage indisponible */ }
      return nv;
    });
  }, []);
  /** Index de la piste agrandie (pour aligner le slot clavier sur sa lane). */
  const expandedIndex = tracks.findIndex(t => t.channel === expandedCh);
  /** Panneau supérieur : rétractable, deux onglets — 🎹 Piano (défaut, à la
   * place de la table de mixage) ou 🎚 Mixer. */
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<'piano' | 'mixer'>('piano');
  /** Index de la piste en cours de drag (réordonnancement des lanes). */
  const [dragTrackIdx, setDragTrackIdx] = useState<number | null>(null);
  /** Signature du dernier rendu : si le contenu change → re-rendu au Play. */
  const renderSigRef = useRef('');
  /** Signature de la config du clic au moment du dernier rendu. */
  const renderClickSigRef = useRef('');

  // ── Durée totale à afficher : la grille (input) + les notes, minimum 4 mesures
  const totalBeats = useMemo(() => {
    let max = MIN_BEATS;
    // Durée TOTALE de la grille : SOMME des durées des accords (chaque
    // accord de durée t dure 4/t beats) — l'ancien calcul prenait le MAX
    // d'un seul accord (4/t) → totalBeats ≈ 1 ou MIN_BEATS → le ticker MIDI
    // stoppait/enroulait la tête à MI-MORCEAU (son coupé au mauvais moment).
    let sum = 0;
    for (const tok of input.split(/\s+/)) {
      const { base, repeat } = parseRepeat(tok);
      const m = base.match(/^(\d+):/);
      if (m) sum += (4 / parseInt(m[1], 10)) * repeat;
    }
    if (sum > 0) max = Math.max(max, sum);
    for (const list of Object.values(pianoNotes)) {
      for (const n of list) max = Math.max(max, n.startTime + n.duration);
    }
    return Math.ceil(max);
  }, [input, pianoNotes]);

  // ── Zoom molette des lanes (centré sur le curseur, tête de lecture intacte) ──
  const [lanePpb, setLanePpb] = useState(LANE_PPB);
  const lanePpbRef = useRef(LANE_PPB);
  const lanesScrollRef = useRef<HTMLDivElement>(null);

  // ── Locators [L, R[ : barre de boucle au-dessus des lanes, synchronisée
  // au scroll horizontal (même échelle beats→px que la zone de contenu). ──
  const LOC_BAR_H = 20; // hauteur de la barre des locators (px)
  const [lanesScrollLeft, setLanesScrollLeft] = useState(0);
  const locBarRef = useRef<HTMLDivElement>(null);
  const [locBarW, setLocBarW] = useState(0);
  /** Contenu TRANSLATÉ de la barre (pour la conversion pointeur→beat : son
   * rect inclut le translate → la position dans le contenu est exacte,
   * scroll horizontal compris). */
  const locContentRef = useRef<HTMLDivElement>(null);
  /** Largeur RÉELLE du contenu des lanes (mesurée) : la barre doit être sur
   * la MÊME échelle que les lanes, quel que soit le zoom/l'étirement. */
  const lanesContentRef = useRef<HTMLDivElement>(null);
  const [lanesContentW, setLanesContentW] = useState(0);
  useEffect(() => {
    const el = lanesContentRef.current;
    if (!el) return;
    const measure = () => setLanesContentW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  // Snap des locators : celui du PianoRoll intégré (même snap que les notes
  // insérées) — remonté via onSnapChange. Défaut : snap du PianoRoll.
  const [locSnapUnit, setLocSnapUnit] = useState(DEFAULT_SNAP_UNIT);
  const [locSnapEnabled, setLocSnapEnabled] = useState(true);
  const handleLocSnap = useCallback((unit: number, enabled: boolean) => {
    setLocSnapUnit(unit);
    setLocSnapEnabled(enabled);
  }, []);
  useEffect(() => {
    const el = locBarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLocBarW(el.clientWidth));
    ro.observe(el);
    setLocBarW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  /** Largeur réelle du contenu des lanes (étiré si plus court que le
   * viewport) — MESURÉE pour rester pile sur l'échelle des lanes après zoom. */
  const locContentW = lanesContentW || Math.max(totalBeats * lanePpb, locBarW || 1);
  /** Échelle effective des lanes (px/beat) : les lanes compactes dessinent
   * avec largeur_réelle/totalBeats (étirées) — le PianoRoll intégré doit
   * utiliser la MÊME échelle, sinon sa grille est décalée des autres pistes
   * (et les locators ne tombent plus sur sa grille). */
  const laneEffectivePpb = lanesContentW > 0 ? lanesContentW / Math.max(1, totalBeats) : lanePpb;

  // Initialisation : locators jamais touchés (0/0) → R = fin du morceau
  // (zone [0, totalBeats[ = boucle complète, poignées aux extrémités).
  useEffect(() => {
    if (locR <= locL && totalBeats > 0) {
      onLocatorsChange(0, totalBeats);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalBeats]);

  /** Déplace un locator (drag) : pointeur → beat avec snap-to-grid (entier).
   * Le contenu translaté : getBoundingClientRect inclut le translate →
   * clientX − rect.left = position dans le contenu, sans gérer le scroll. */
  const moveLocator = (side: 'L' | 'R', clientX: number) => {
    const el = locContentRef.current;
    if (!el) return;
    // Rect du contenu TRANSLATÉ : clientX − rect.left = position dans le
    // contenu (le translate −scrollLeft est inclus) → aucun décalage au drag
    // même après un scroll horizontal.
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const raw = ((clientX - rect.left) * Math.max(1, totalBeats)) / Math.max(1, rect.width);
    // Snap-to-grid : le MÊME snap que les notes insérées (PianoRoll intégré),
    // pas seulement le temps entier.
    const snapped = locSnapEnabled ? snapToGrid(raw, locSnapUnit) : raw;
    if (side === 'L') {
      const v = Math.max(0, Math.min(snapped, locR - 1));
      if (v !== locL) onLocatorsChange(v, locR);
    } else {
      const v = Math.max(locL + 1, Math.min(snapped, Math.ceil(totalBeats)));
      if (v !== locR) onLocatorsChange(locL, v);
    }
  };

  /** Ppb minimum pour montrer TOUTE la piste (fit-to-width). Le panneau
   * de scroll ne contient que le CONTENU (labels séparés, fixes à gauche). */
  const minPpbFor = (el: HTMLElement) =>
    Math.max(0.25, el.clientWidth / Math.max(1, totalBeats));

  useEffect(() => {
    const el = lanesScrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      // La molette sur le Piano Roll INTÉGRÉ est gérée par le composant
      // (scroll vertical du registre / zoom Ctrl / scroll horizontal Shift) —
      // ne PAS zoomer les lanes par-dessus (bug « le scroll zoome aussi »).
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest('[data-pr-scroll]')) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const xView = e.clientX - rect.left;              // souris dans le viewport
      const oldPpb = lanePpbRef.current;
      // Largeur réelle de la zone des notes (étirée si < viewport)
      const contentW = Math.max(el.scrollWidth, 1);
      // Beat pointé par la souris
      const beat = ((xView + el.scrollLeft) * totalBeats) / contentW;
      // Zoom exponentiel nuancé : fin au geste doux, rapide au geste fort
      const factor = Math.exp(-e.deltaY * 0.0015);
      const minPpb = minPpbFor(el);
      const newPpb = Math.min(LANE_ZOOM_MAX, Math.max(minPpb, oldPpb * factor));
      if (Math.abs(newPpb - oldPpb) < 0.01) return;
      lanePpbRef.current = newPpb;
      setLanePpb(newPpb);
      // Le beat pointé reste sous le curseur après le zoom
      requestAnimationFrame(() => {
        if (lanesScrollRef.current) {
          const el2 = lanesScrollRef.current;
          const newContentW = Math.max(totalBeats * newPpb, el2.clientWidth);
          el2.scrollLeft = Math.max(0, (beat * newContentW) / totalBeats - xView);
        }
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [totalBeats]);

  // Re-clamp quand la durée change (grille chargée) ou à la redimension
  useEffect(() => {
    const el = lanesScrollRef.current;
    if (!el) return;
    const clamp = () => {
      const minPpb = minPpbFor(el);
      if (lanePpbRef.current < minPpb) {
        lanePpbRef.current = minPpb;
        setLanePpb(minPpb);
      }
    };
    clamp();
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [totalBeats]);

  const contentSig = useMemo(
    () => JSON.stringify({
      input, tempo,
      notes: pianoNotes,
      tracks: tracks.map(t => `${t.channel}:${t.program}:${t.volume}:${t.mute}:${t.label}:${JSON.stringify(t.fx ?? FX_ZERO)}`),
    }),
    [input, tempo, pianoNotes, tracks],
  );

  // ── Afficheurs (compteurs) ─────────────────────────────────────
  const beatsPerBar = (() => {
    const n = parseInt(sig.split('/')[0] ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : 4;
  })();

  // ── Vumètres par piste (énergie des notes actives à la position courante) ──
  const [levels, setLevels] = useState<Record<number, number>>({});
  /** Vumètres à ~10 fps (imperceptible) : le setLevels re-rend le DAW — on
   * l évite à chaque tick de lecture (optimisation C). */
  const lastLevelsRef = useRef(0);
  const refreshLevels = useCallback((beats: number) => {
    const now = Date.now();
    if (now - lastLevelsRef.current < 100) return;
    lastLevelsRef.current = now;
    const cur: Record<number, number> = {};
    for (const t of tracks) {
      const notes = pianoNotes[t.channel] ?? [];
      let maxV = 0, sumV = 0;
      for (const n of notes) {
        if (beats >= n.startTime && beats < n.startTime + n.duration) {
          if (n.velocity > maxV) maxV = n.velocity;
          sumV += n.velocity;
        }
      }
      cur[t.channel] = Math.min(1, (maxV + 0.25 * sumV) / 127);
    }
    setLevels(prev => {
      const keys = new Set([...Object.keys(prev).map(Number), ...Object.keys(cur).map(Number)]);
      const out: Record<number, number> = {};
      for (const ch of keys) out[ch] = Math.max(cur[ch] ?? 0, (prev[ch] ?? 0) * 0.85);
      return out;
    });
  }, [tracks, pianoNotes]);

  // ── Lecture MIDI globale (transport) : état, tête de lecture, stop ──
  const [midiPlaying, setMidiPlaying] = useState(false);
  const midiTimerRef = useRef<number | null>(null);
  const midiStartRef = useRef(0);
  const midiFromRef = useRef(0);

  const stopMidi = useCallback(async () => {
    setMidiPlaying(false);
    if (midiTimerRef.current !== null) {
      clearInterval(midiTimerRef.current);
      midiTimerRef.current = null;
    }
    try { await fetch(`${API_BASE}/navig-stop-midi`, { method: 'POST' }); } catch { /* ignore */ }
  }, []);

  const startMidi = useCallback((fromBeats = 0, excludeChannel?: number, recAfterBeats?: number): Promise<boolean> => {
    // Toggle exclusif : la lecture MIDI remplace la lecture WAV (sinon le
    // WAV — et son clic mixé — continue de tourner par-dessus le MIDI).
    if (playState === 'playing') {
      engine.stop();
      setPlayState('idle');
      setLevels({});
    }
    const result = onPlayMidiAll(fromBeats, excludeChannel, recAfterBeats);
    setMidiPlaying(true);
    midiStartRef.current = performance.now();
    midiFromRef.current = fromBeats;
    setPlayheadPosition(fromBeats);
    if (midiTimerRef.current !== null) clearInterval(midiTimerRef.current);
    midiTimerRef.current = window.setInterval(() => {
      const elapsedSec = (performance.now() - midiStartRef.current) / 1000;
      const beats = midiFromRef.current + (elapsedSec * tempo) / 60;
      // Intervalle de boucle (locators) : la tête wrappe dans [L, R[ —
      // même référentiel que le backend (navig-play-midi boucle [L, R[).
      const loopEnd = locR > locL ? locR : totalBeats;
      const loopStart = locR > locL ? locL : 0;
      if (beats >= loopEnd) {
        if (loopOn) {
          // BOUCLE (repeat) : la tête repart au début de l'intervalle et la
          // lecture CONTINUE — le backend boucle déjà ; NE PAS appeler
          // stopMidi() ici (ça tuait la boucle à la fin du 1er passage).
          setPlayheadPosition(loopStart + ((beats - loopStart) % (loopEnd - loopStart)));
          return;
        }
        setPlayheadPosition(totalBeats);
        stopMidi();
        return;
      }
      setPlayheadPosition(beats);
    }, 50);
    return result;
  }, [onPlayMidiAll, tempo, totalBeats, stopMidi, engine, playState, loopOn, locL, locR]);

  /** Bascule la lecture MIDI globale (bouton ▶ MIDI et raccourci
   * Shift+Espace du PianoRoll) : démarre à la position courante (respectant
   * la boucle) ou arrête si elle tourne déjà. */
  const toggleMidiPlay = useCallback(() => {
    if (midiPlaying) stopMidi();
    else startMidi(computeStartBeats(loopOn, locL, locR, getPlayheadPosition()));
  }, [midiPlaying, stopMidi, startMidi, loopOn, locL, locR]);

  const doStop = useCallback(() => {
    stopMidi();
    engine.stop();
    setPlayState('idle');
    setPlayheadPosition(0);
    setLevels({});
  }, [engine, stopMidi]);

  const doBegin = useCallback(() => {
    stopMidi();
    engine.stop();
    setPlayState('idle');
    setPlayheadPosition(0);
    setLevels({});
  }, [engine, stopMidi]);

  const doPlay = useCallback(() => {
    if (playState === 'paused') {
      engine.resumePianoRoll();
      setPlayState('playing');
      return;
    }
    // Re-rendre si le CONTENU a changé OU si la config du clic a changé
    // (la case « Dans le rendu », la sortie, le son, le volume…). Sans ça,
    // Play rejouait l'ancien buffer (rendu avant l'activation du clic).
    // En mode SÉPARÉ (sortie dédiée), on re-rend TOUJOURS : la lecture est
    // serveur (double canaux), il n'y a pas de buffer local à rejouer.
    const clickSig = getClickSig();
    let clickSeparated = false;
    try { clickSeparated = !!(JSON.parse(clickSig) as { out_device?: string | null }).out_device; } catch { /* ignore */ }
    // Démarrage : si le repeat boucle [L, R[ et que la tête est AU-DELÀ de
    // l'intervalle, la lecture revient au locator gauche. Une tête avant L
    // (dont 0 par défaut) joue depuis la tête — le premier Play doit
    // entendre le début du morceau, pas sauter à L (bug locator L ≠ 001.1).
    const startBeats = computeStartBeats(loopOn, locL, locR, getPlayheadPosition());
    if (clickSeparated || contentSig !== renderSigRef.current || clickSig !== renderClickSigRef.current) {
      renderSigRef.current = contentSig;
      renderClickSigRef.current = clickSig;
      setPlayheadPosition(startBeats);
      onPlay(startBeats);
    } else {
      // Buffer déjà rendu → jouer depuis la position de la tête
      engine.playNavigFrom((startBeats * 60) / tempo, loopOn);
    }
    setPlayState('playing');
  }, [playState, contentSig, engine, onPlay, tempo, loopOn, locL, locR]);

  const doPause = useCallback(() => {
    engine.pausePianoRoll();
    setPlayState('paused');
  }, [engine]);

  /** Scrub : clic sur une lane → déplace la tête. En lecture MIDI, relance
   * la lecture MIDI depuis la position cliquée. */
  const doScrub = useCallback(async (beats: number) => {
    setPlayheadPosition(beats);
    if (midiPlaying) {
      await stopMidi();
      startMidi(beats);
      return;
    }
    if (playState === 'playing' || playState === 'paused') {
      engine.seekNavig((beats * 60) / tempo);
    }
  }, [playState, engine, tempo, midiPlaying, stopMidi, startMidi]);

  // Ticker : position de lecture → ligne verticale (+ détection de fin)
  const doStopRef = useRef(doStop);
  doStopRef.current = doStop;
  useEffect(() => {
    if (playState !== 'playing') return;
    const id = setInterval(() => {
      const raw = engine.getPianoRollPositionRaw();
      const dur = engine.getPianoRollDuration();
      if (raw < 0 || dur <= 0) return;
      // Intervalle de boucle (locators) : la tête wrappe dans [L, R[ — même
      // comportement que la lecture serveur (mode séparé) et le loop Web
      // Audio (mode « Dans le rendu »).
      const loopStartSec = locR > locL ? (locL * 60) / Math.max(40, tempo) : 0;
      const loopEndSec = locR > locL ? (locR * 60) / Math.max(40, tempo) : dur;
      if (loopOn && loopEndSec > loopStartSec && raw >= loopEndSec - 0.05) {
        const wrapped = wrapLoopPositionSec(raw, loopStartSec, loopEndSec);
        const b = (wrapped * tempo) / 60;
        setPlayheadPosition(b);
        refreshLevels(b);
        return;
      }
      if (raw >= dur - 0.05) {
        // Fin naturelle du buffer (hors boucle)
        if (!loopOn) { doStopRef.current(); return; }
        const b = ((raw % dur) * tempo) / 60;
        setPlayheadPosition(b);
        refreshLevels(b);
        return;
      }
      const b = (raw * tempo) / 60;
      setPlayheadPosition(b);
      refreshLevels(b);
    }, 40);
    return () => clearInterval(id);
  }, [playState, engine, tempo, loopOn, refreshLevels, locL, locR]);

  // Intervalle de boucle (locators) → moteur Web Audio : loopStart/loopEnd
  // des sources locales (mode « Dans le rendu ») + wrap de position.
  useEffect(() => {
    const secL = (locL * 60) / Math.max(40, tempo);
    const secR = (locR * 60) / Math.max(40, tempo);
    engine.setLoopInterval(locR > locL ? secL : 0, locR > locL ? secR : 0);
  }, [engine, locL, locR, tempo]);

  // Quand ChordApp arrête la lecture (stop externe, édition…)
  useEffect(() => {
    if (!playing && playState !== 'idle') {
      setPlayState('idle');
      setPlayheadPosition(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const toggleExpanded = (ch: number) => {
    setExpandedCh(prev => (prev === ch ? null : ch));
  };

  // ── Panneau piano (mode Navig) ─────────────────────────────────────
  /** Piste cible du panneau : celle dont la lane est AGRANDIE (PianoRoll
   * intégré) — « sélectionnée en amont » par l'utilisateur. */
  const targetTrackLabel = expandedCh !== null
    ? tracks.find(t => t.channel === expandedCh)?.label ?? null
    : null;

  /** LivePiano cliquable (mode Navig) : la note part sur le CANAL de la
   * piste cible → elle sonne avec l'instrument de la piste (le serveur
   * applique aussi le mapping drums natif). */
  const navigPlayNote = useCallback((pitch: number, on: boolean) => {
    void sendPianoNote(pitch, on, expandedCh ?? undefined);
  }, [expandedCh]);

  /** Illumination du piano par la piste jouée (activable/désactivable,
   * préférence persistée). */
  const [illumOn, setIllumOn] = useState(() => {
    try { return localStorage.getItem('chordzic_piano_illum') !== 'off'; } catch { return true; }
  });
  const toggleIllum = useCallback(() => {
    setIllumOn(v => {
      const nv = !v;
      try { localStorage.setItem('chordzic_piano_illum', nv ? 'on' : 'off'); } catch { /* stockage indisponible */ }
      return nv;
    });
  }, []);

  /** Pitchs ACTIFS de la piste sélectionnée à la position de lecture —
   * même tête pour la lecture WAV et MIDI → illumination fidèle au contenu
   * joué. Figée à la pause (position courante), vide à l'arrêt. */
  /** Notes de la piste cible (illumination) — stables ; le panneau calcule
   * les pitchs actifs via le store playhead (sans re-render du DAW). */
  const trackNotes = expandedCh !== null ? (pianoNotes[expandedCh] ?? []) : [];

  /** Insère l'accord reconnu en NOTES dans la piste sélectionnée : fin de
   * la piste (beat entier), durée = une mesure de la signature courante.
   * Les notes insérées sont les pitchs RÉELLEMENT joués, dans l'ordre
   * d'appui (pas de réordonnancement par le dictionnaire d'harmonie). */
  const handlePianoInsert = useCallback((_chord: RecognizedChord, pitches: number[]) => {
    if (expandedCh === null || pitches.length === 0) return;
    const existing = pianoNotes[expandedCh] ?? [];
    const lastEnd = existing.reduce((m, n) => Math.max(m, n.startTime + n.duration), 0);
    const start = Math.ceil(lastEnd);
    const beatsPerBar = sig === '3/4' ? 3 : sig === '6/8' ? 6 : 4;
    onNotesChange(expandedCh, [...existing, ...pitchesToPianoNotes(pitches, start, beatsPerBar)]);
  }, [expandedCh, pianoNotes, onNotesChange, sig]);

  // ── Enregistrement MIDI (Rec) — mode Navig ───────────────────────────
  /** État : off / décompte de 4 temps / enregistrement en cours. */
  const [recState, setRecState] = useState<'off' | 'countdown' | 'on'>('off');
  /** Canal cible (la piste du piano roll où le bouton REC a été cliqué). */
  const [recTarget, setRecTarget] = useState<number | null>(null);
  /** Ref synchronisée : le setTimeout du décompte capture la startRecSession
   * du render du CLIC (recTarget pas encore à jour — setState asynchrone).
   * Sans ref, la garde `recTarget !== null` du play-along échouait TOUJOURS
   * → les autres pistes ne démarraient jamais (bug signalé 03:00). */
  const recTargetRef = useRef<number | null>(null);
  recTargetRef.current = recTarget;
  /** Vrai si le décompte + le play-along sont portés par le SERVEUR (rec_after_beats)
   * : le métronome Web Audio est alors inutile (le clic serveur continue). */
  const recServerModeRef = useRef(false);
  /** Position de la tête de lecture au début de l'enregistrement. */
  const [recStartPos, setRecStartPos] = useState(0);
  /** Notes en cours (affichage direct, cyan). */
  const [recNotes, setRecNotes] = useState<PianoNote[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recAudioRef = useRef<AudioContext | null>(null);
  const recMetronomeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Ref de l'état (pour le cleanup de démontage sans fermer la session à
   * chaque transition — bug « rec ne démarre pas » : le cleanup de l'effet
   * [recState] envoyait enabled:false juste après enabled:true). */
  const recStateRef = useRef<'off' | 'countdown' | 'on'>('off');
  recStateRef.current = recState;

  /** Joue un clic de métronome immédiat (Web Audio). */
  const playClick = useCallback((ctx: AudioContext, freq: number) => {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }, []);

  /** Arrête la session : récupère les notes, les insère dans la piste cible
   * (à la position de la tête au démarrage + offsets), remet l'état à zéro. */
  const stopRecSession = useCallback(async () => {
    if (recTimerRef.current) { clearTimeout(recTimerRef.current); recTimerRef.current = null; }
    if (recMetronomeRef.current) { clearInterval(recMetronomeRef.current); recMetronomeRef.current = null; }
    try { recAudioRef.current?.close(); } catch { /* ignore */ }
    recAudioRef.current = null;
    try {
      const resp = await fetch(`${API_BASE}/rec-midi`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
      const j = await resp.json();
      const events = Array.isArray(j.notes) ? (j.notes as RecMidiEvent[]) : [];
      if (recTarget !== null && events.length > 0) {
        const notes = recEventsToNotes(events, recStartPos, tempo);
        const existing = pianoNotes[recTarget] ?? [];
        onNotesChange(recTarget, [...existing, ...notes]);
      }
    } catch { /* backend injoignable */ }
    setRecNotes([]);
    setRecState('off');
    setRecTarget(null);
  }, [recTarget, recStartPos, tempo, pianoNotes, onNotesChange]);

  /** Démarre la session serveur (l'enregistrement commence réellement) et
   * poursuit le MÉTRONOME pendant l'enregistrement (clic par temps). */
  const startRecSession = useCallback(() => {
    fetch(`${API_BASE}/rec-midi`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    }).catch(() => { /* backend injoignable */ });
    setRecStartPos(getPlayheadPosition());
    setRecState('on');
    // Métronome continu : UNIQUEMENT en mode secours (pas de play-along
    // serveur) — le clic du serveur prend le relais sinon (même horloge que
    // le décompte et le play-along, aucun décalage).
    if (!recServerModeRef.current) {
      const ctx = recAudioRef.current;
      if (ctx) {
        playClick(ctx, 800);
        const intervalMs = 60000 / Math.max(40, tempo);
        if (recMetronomeRef.current) clearInterval(recMetronomeRef.current);
        recMetronomeRef.current = setInterval(() => playClick(ctx, 800), intervalMs);
      }
    }
  }, [tempo, playClick]);

  /** Métronome de pré-roll : 4 clics (1er accentué) au tempo courant. */
  const playCountdown = useCallback((bpm: number) => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      recAudioRef.current = ctx;
      countdownClicks(bpm, 4).forEach((ms, i) => {
        const t = ctx.currentTime + ms / 1000;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = i === 0 ? 1200 : 800;
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.1);
      });
      void ctx.resume();
    } catch { /* audio indisponible */ }
  }, []);

  /** Décompte REC en beats (voie serveur : clic + activation intégrés). */
const REC_COUNTDOWN_BEATS = 4;

/** Bascule Rec : off → décompte (4 temps) puis enregistrement ; sinon arrêt. */
  const toggleRec = useCallback((channel: number) => {
    if (recState === 'off') {
      setRecTarget(channel);
      setRecState('countdown');
      recServerModeRef.current = false;
      // VOIE SERVEUR (par défaut) : le play-along démarre immédiatement avec
      // le DÉCOMPTE intégré (rec_after_beats = 4) — le serveur joue le clic
      // puis active l'enregistrement sur la MÊME horloge (aucun décalage
      // entre le décompte et les notes d'accompagnement).
      void startMidi(getPlayheadPosition(), channel, REC_COUNTDOWN_BEATS).then(ok => {
        if (!ok) {
          // SECOURS : rien à jouer (pas d'accompagnement possible) → décompte
          // Web Audio classique + enregistrement simple.
          stopMidi();
          playCountdown(tempo);
        } else {
          recServerModeRef.current = true;
        }
        const clicks = countdownClicks(tempo, 4);
        const afterLast = clicks[clicks.length - 1] + 60000 / tempo;
        recTimerRef.current = setTimeout(() => startRecSession(), afterLast);
      });
    } else {
      void stopRecSession();
    }
  }, [recState, tempo, playCountdown, startRecSession, stopRecSession, startMidi, stopMidi]);

  /** Polling : notes jouées en direct → affichage temps réel (cyan). */
  useEffect(() => {
    if (recState !== 'on') return;
    const id = setInterval(async () => {
      try {
        const resp = await fetch(`${API_BASE}/rec-midi-state`);
        const j = await resp.json();
        const events = Array.isArray(j.notes) ? (j.notes as RecMidiEvent[]) : [];
        setRecNotes(recEventsToNotes(events, recStartPos, tempo));
      } catch { /* ignore */ }
    }, 40);
    return () => clearInterval(id);
  }, [recState, recStartPos, tempo]);

  /** Sécurité : ferme la session serveur et le métronome au DÉMONTAGE
   * uniquement (via la ref — pas à chaque transition d'état, ce qui tuait
   * la session dès son démarrage). */
  useEffect(() => () => {
    if (recMetronomeRef.current) clearInterval(recMetronomeRef.current);
    if (recAudioRef.current) { try { recAudioRef.current.close(); } catch { /* ignore */ } }
    if (recStateRef.current !== 'off') {
      fetch(`${API_BASE}/rec-midi`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      }).catch(() => { /* ignore */ });
    }
  }, []);

  /** Piste sélectionnée (objet complet — pour le son à renvoyer au Roland). */
  const selTrack = expandedCh !== null
    ? tracks.find(t => t.channel === expandedCh)
    : undefined;

  /** Écho MIDI (mode Navig, ✨ ON + piste sélectionnée) : le Roland reçoit
   * le program change de la piste et les notes du pianiste lui sont
   * renvoyées sur son canal → il sonne avec l'instrument de la piste.
   * Désactivé dès qu'on quitte Navig / la piste / ✨ (cleanup). */
  useEffect(() => {
    const active = illumOn && expandedCh !== null;
    const body = JSON.stringify({ enabled: active, channel: active ? expandedCh : null });
    fetch(`${API_BASE}/live-echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => { /* serveur indisponible */ });
    return () => {
      fetch(`${API_BASE}/live-echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false, channel: null }),
      }).catch(() => { /* serveur indisponible */ });
    };
  }, [illumOn, expandedCh, selTrack?.program, selTrack?.bankMsb, selTrack?.bankLsb]);

  // ── Ports MIDI / Audio (réglages) ───────────────────────────────────
  const [showPorts, setShowPorts] = useState(false);
  const [midiPorts, setMidiPorts] = useState<string[]>([]);
  const [midiCurrent, setMidiCurrent] = useState('');
  const [audioDevices, setAudioDevices] = useState<{ name: string; channels: number }[]>([]);
  const [audioCurrent, setAudioCurrent] = useState('');

  const refreshPorts = useCallback(async () => {
    try {
      const mp = await (await fetch(`${API_BASE}/midi-ports`)).json();
      setMidiPorts(mp.ports ?? []);
      setMidiCurrent(mp.current ?? '');
      const ad = await (await fetch(`${API_BASE}/audio-devices`)).json();
      setAudioDevices(ad.devices ?? []);
      setAudioCurrent(ad.current ?? '');
    } catch (e) {
      console.error('Ports indisponibles :', e);
    }
  }, []);

  useEffect(() => {
    if (showPorts) refreshPorts();
  }, [showPorts, refreshPorts]);

  const changeMidiPort = async (index: number) => {
    try {
      await fetch(`${API_BASE}/midi-port`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index }),
      });
    } catch (e) { console.error(e); }
    refreshPorts();
  };

  const changeAudioDevice = async (device: string) => {
    try {
      await fetch(`${API_BASE}/audio-device`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device }),
      });
    } catch (e) { console.error(e); }
    refreshPorts();
  };

  /** Lecture MIDI : envoie les notes (même fraîchement insérées) sur le port
   * MIDI choisi, via /note (note-on → durée → note-off côté serveur). */
  const playMidiViaPort = useCallback((notes: PianoNote[], channel: number) => {
    if (!notes.length) return;
    const tempoMs = (60 / tempo) * 1000;
    const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
    const t0 = sorted[0].startTime;
    for (const n of sorted) {
      const delay = Math.max(0, (n.startTime - t0) * tempoMs);
      const dur = Math.max(80, Math.round(n.duration * tempoMs));
      setTimeout(() => {
        fetch(`${API_BASE}/note`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, pitch: n.pitch, velocity: n.velocity || 100, duration_ms: dur }),
        }).catch(() => {});
      }, delay);
    }
  }, [tempo]);


  // ── Styles transport (style « studio » harmonisé avec la toolbar PianoRoll) ──
  const tBtn = 'w-7 h-7 flex items-center justify-center rounded-md text-[#9aa3b2] hover:text-white hover:bg-[#1a2230] transition-colors disabled:opacity-30 shrink-0';
  const tBtnPlay = 'w-8 h-8 flex items-center justify-center rounded-md bg-[#2f6ba8] text-white border border-[#3a7ab8] hover:bg-[#3a7ab8] transition-colors disabled:opacity-40 shrink-0';
  const tSep = 'w-px h-5 bg-[#242c3a] shrink-0';
  const tLcd = 'flex flex-col items-center justify-center px-2 py-0.5 bg-[#0a0c10] border border-[#1f2733] rounded-md min-w-[3.2rem] shrink-0';
  const tLcdLabel = 'text-[8px] uppercase tracking-widest text-[#5c6472] leading-none';
  const tLcdVal = 'font-mono text-[12px] text-[#d9b25f] leading-tight';

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-2 sm:p-3">
      {/* ── Barre de transport (compacte, style studio) ── */}
      <div className="flex flex-col gap-1.5 mb-3 py-1.5 px-2 bg-[#0d1117] border border-[#1f2733] rounded-lg">
        {/* Rangée 1 — transport & position */}
        <div className="flex flex-wrap items-center gap-1.5">
        {/* Transport : begin / play / stop / pause */}
        <button onClick={doBegin} title="Revenir au début (Begin)" className={tBtn}><SkipBack className="w-3.5 h-3.5" /></button>
        <button
          onClick={doPlay}
          disabled={playState === 'playing'}
          className={playState === 'paused' ? `${tBtn} bg-amber-800/70 border-amber-700 text-amber-100 hover:bg-amber-700` : tBtnPlay}
          title={playState === 'paused' ? 'Reprendre la lecture' : 'Lire depuis la tête de lecture (Play)'}
        >
          <Play className="w-4 h-4" />
        </button>
        <button onClick={doStop} title="Arrêter (Stop)" className={`${tBtn} hover:bg-[#8f3b3b] hover:border-[#a84a4a] hover:text-white`}><Square className="w-3 h-3" /></button>
        <button onClick={doPause} disabled={playState !== 'playing'} title="Pause (la tête se fige)" className={tBtn}><Pause className="w-3.5 h-3.5" /></button>

        {/* Lecture MIDI : toutes les pistes sur le port choisi (ex. Roland) */}
        <button
          onClick={toggleMidiPlay}
          className={`h-7 px-2 flex items-center gap-1 rounded-md border transition-colors shrink-0 text-[9px] font-bold ${
            midiPlaying
              ? 'bg-[#8f3b3b] text-white border-[#a84a4a] hover:bg-[#a84a4a]'
              : 'bg-[#2a4a2f] text-[#8fd8a8] border-[#2f5a3a] hover:bg-[#335a3a] hover:text-white'
          }`}
          title={midiPlaying
            ? 'Arrêter la lecture MIDI'
            : 'Lecture MIDI — toutes les pistes sur le port MIDI choisi (ex. Roland), comme le mode Live (réglage : ⚙)'}
        >
          {midiPlaying ? <Square className="w-3.5 h-3.5" /> : <Cable className="w-3.5 h-3.5" />} {midiPlaying ? 'STOP' : 'MIDI'}
        </button>

        <div className={tSep} />

        {/* LED de statut */}
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${playState === 'playing' ? 'bg-red-500 animate-pulse' : playState === 'paused' ? 'bg-amber-400' : 'bg-gray-700'}`}
          title={playState === 'playing' ? 'Lecture en cours' : playState === 'paused' ? 'En pause' : 'Arrêté'}
        />

        {/* Compteurs (afficheurs LCD) — s'abonnent au store playhead (~10 fps),
            sans re-render du transport/DAW pendant la lecture */}
        <TransportReadout
          beatsPerBar={beatsPerBar}
          tempo={tempo}
          durSec={engine.getPianoRollDuration() || (totalBeats * 60) / Math.max(40, tempo)}
        />
        {/* Locators [L, R[ — au format mesure.temps (comme le compteur MES),
            flèches ▲▼ = ±1 temps, édition directe au format MMM.T */}
        <LocatorField
          label="L" color="#7dd3fc" value={locL} beatsPerBar={beatsPerBar}
          min={0} max={Math.max(0, locR - 1)}
          onChange={(v) => onLocatorsChange(v, locR)}
        />
        <LocatorField
          label="R" color="#fbbf24" value={locR} beatsPerBar={beatsPerBar}
          min={locL + 1} max={Math.max(locL + 1, Math.ceil(totalBeats))}
          onChange={(v) => onLocatorsChange(locL, v)}
        />
        <div className={tLcd} title="Tempo (BPM)">
          <span className={tLcdLabel}>BPM</span>
          <span className={tLcdVal}>{tempo}</span>
        </div>
        <div className={tLcd} title="Signature rythmique">
          <span className={tLcdLabel}>Sig.</span>
          <span className={tLcdVal}>{sig}</span>
        </div>

        {/* Tempo (réglage) */}
        <input
          type="range" min={40} max={220} value={tempo}
          onChange={(e) => onTempoChange(parseInt(e.target.value))}
          className="w-16 accent-[#6ea8d8] shrink-0"
          title="Tempo (40-220 BPM)"
        />

        <div className={tSep} />

        </div>
        {/* Rangée 2 — clic & boucles */}
        <div className="flex flex-wrap items-center gap-1.5">
        {/* Piste de clic (métronome + sortie dédiée + rendu) */}
        <ClickControl />

        {/* Boucle sample (répétée pendant la lecture, offset en direct) */}
        <LoopControl tempo={tempo} sig={sig} cfg={sampleLoop} onChange={onSampleLoopChange} />

        <div className={tSep} />

        {/* Boucle + extraction WAV */}
        <button
          onClick={() => {
            onSetLoop(!loopOn);
            // La lecture MIDI tourne déjà avec l'ancien réglage → relance à
            // la position courante pour appliquer le repeat immédiatement
            // (le serveur n'applique loop_enabled qu'au démarrage).
            if (midiPlaying) startMidi(getPlayheadPosition());
          }}
          disabled={playState === 'playing'}
          className={loopOn ? `${tBtn} bg-purple-900/40 border-purple-500 text-purple-400` : tBtn}
          title="Lecture en boucle"
        >
          <Repeat className="w-3.5 h-3.5" />
        </button>
        <button onClick={onExtractWav} disabled={!hasWav} title="Extraire le dernier rendu WAV" className={tBtn}>
          <Download className="w-3.5 h-3.5" />
        </button>

        <div className={tSep} />

        </div>
        {/* Rangée 2b — réglages musicaux (volume master, 432Hz, WB, pattern,
            mesure) — partagés avec le mode Live, style affiné */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 mt-1 border-t border-[#1c2430]/80">
          <LiveSettingsBar
            volume={volume} onSetVolume={onSetVolume}
            use432={use432} onSet432={onSet432}
            loopOn={loopOn} onSetLoop={onSetLoop}
            walkingBass={walkingBass} onSetWalkingBass={onSetWalkingBass}
            drumPattern={drumPattern} onSetDrumPattern={onSetDrumPattern}
            sig={sig} onSetSig={onSetSig}
            playing={playState === 'playing'}
            showLoop={false}
          />
        </div>
        {/* Rangée 3 — fichiers & vues */}
        <div className="flex flex-wrap items-center gap-1.5">
        {/* Fichiers */}
        <button onClick={onSave} title="Sauvegarder la grille (Save)" className={tBtn}><Save className="w-3.5 h-3.5" /></button>
        <button onClick={onLoad} title="Charger une grille (Load)" className={tBtn}><FolderOpen className="w-3.5 h-3.5" /></button>
        <button onClick={onExport} title="Exporter en JSON" className={tBtn}><Upload className="w-3.5 h-3.5" /></button>
        <button onClick={onImport} title="Importer un fichier JSON" className={tBtn}><Download className="w-3.5 h-3.5" /></button>
        <button onClick={onNewProject} title="Nouveau projet — repartir de zéro" className={tBtn}><FilePlus2 className="w-3.5 h-3.5" /></button>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={onPostProd}
            disabled={bouncing}
            className="px-2.5 h-7 flex items-center gap-1.5 rounded-md bg-[#1d2118] text-[#c9a45c] border border-[#c9a45c]/40 hover:bg-[#2a2a1e] text-[10.5px] font-semibold transition-colors shrink-0 disabled:opacity-50"
            title="Bouncer les pistes MIDI en audio (WAV, avec leurs effets) et ouvrir le mode PostProd"
          >
            {bouncing ? '⏳ Bounce…' : '🎚 PostProd'}
          </button>
          <button onClick={() => setShowPorts(true)} title="Ports MIDI & Audio — choisir vers quoi brancher l'application" className={tBtn}><Settings className="w-3.5 h-3.5" /></button>
          <button onClick={onHelp} title="Aide" className={tBtn}><HelpCircle className="w-3.5 h-3.5" /></button>
        </div>
        </div>
      </div>

      {/* Slot de la barre d'outils du PianoRoll intégré (rempli par portal
          quand une piste est agrandie) — au-dessus de la table de mixage */}
      <div
        id="pianoroll-toolbar-slot"
        className={expandedCh !== null ? 'border-b border-gray-800 bg-[#0e1016]' : 'hidden'}
      />

      {/* ── Panneau supérieur rétractable : 🎹 Piano (défaut, à la place de
          la table de mixage) ou 🎚 Mixer — deux onglets ── */}
      <div className="mb-3 pb-3 border-b border-gray-800">
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setPanelOpen(v => !v)}
            className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
            title={panelOpen ? 'Rétracter le panneau' : 'Déployer le panneau'}
          >
            {panelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <div className="flex gap-1">
            <button
              onClick={() => setPanelTab('piano')}
              className={`text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider transition-colors ${panelTab === 'piano' ? 'bg-sky-900/50 text-sky-300 border border-sky-700/50' : 'text-gray-500 hover:text-gray-300 border border-transparent'}`}
              title="Piano Live : reconnaissance d'accords + insertion dans la piste sélectionnée"
            >
              🎹 Piano
            </button>
            <button
              onClick={() => setPanelTab('mixer')}
              className={`text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider transition-colors ${panelTab === 'mixer' ? 'bg-gray-700 text-gray-100 border border-gray-600' : 'text-gray-500 hover:text-gray-300 border border-transparent'}`}
              title="Table de mixage : faders, instruments, mute"
            >
              🎚 Mixer
            </button>
          </div>
        </div>
        {panelOpen && panelTab === 'piano' && (
          <PianoLivePanel
            mode="navig"
            onInsert={handlePianoInsert}
            targetTrackLabel={targetTrackLabel}
            trackNotes={trackNotes}
            illuminationEnabled={illumOn}
            onToggleIllumination={toggleIllum}
            onGoLive={onSetLive}
            onPlayNote={navigPlayNote}
          />
        )}
        {panelOpen && panelTab === 'mixer' && (
        <div className="flex gap-2 overflow-x-auto pb-1 items-stretch">
          {tracks.map(t => (
            <div
              key={t.channel}
              className={`shrink-0 w-40 h-[320px] rounded-xl border flex flex-col overflow-hidden ${t.mute ? 'border-gray-800 bg-gray-900/40 opacity-60' : 'border-gray-700/80 bg-gradient-to-b from-gray-800/70 to-gray-900/80'}`}
            >
              {/* En-tête : nom + instrument */}
              <div className="px-2 pt-2 pb-1.5 border-b border-gray-800/80 flex flex-col gap-1.5 bg-black/20">
                <input
                  value={t.label}
                  onChange={(e) => onUpdateTrack(t.channel, { label: e.target.value })}
                  className="w-full bg-transparent text-center text-xs font-bold outline-none border-b border-transparent focus:border-gray-500 truncate"
                  style={{ color: trackColor(t.channel) }}
                  title="Renommer la piste"
                  spellCheck={false}
                />
                {t.channel === 9 || !!t.drums ? (
                  <select
                    value={(() => {
                      const m = t.bankMsb ?? 0, l = t.bankLsb ?? 0, p = t.program;
                      const k = JUNO_DRUM_KITS.find(x => x.msb === m && x.lsb === l && x.program === p);
                      return k ? k.key : 'default';
                    })()}
                    onChange={(e) => {
                      if (e.target.value === 'default') {
                        onUpdateTrack(t.channel, { bankMsb: 0, bankLsb: 0, program: 1 });
                        return;
                      }
                      const k = JUNO_DRUM_KITS.find(x => x.key === e.target.value);
                      if (k) onUpdateTrack(t.channel, { bankMsb: k.msb, bankLsb: k.lsb, program: k.program });
                    }}
                    className="w-full bg-gray-900 text-[10px] rounded border border-gray-700 outline-none px-1 py-0.5 text-gray-300"
                    title="Kit de percussion — banque (MSB/LSB) + program envoyés au synthé MIDI (ex. JUNO-D)"
                  >
                    <option value="default">🥁 Kit standard</option>
                    {JUNO_DRUM_KITS.map(k => (
                      <option key={k.key} value={k.key}>{k.label}</option>
                    ))}
                  </select>
                ) : (
                <select
                  value={t.program}
                  onChange={(e) => onUpdateTrack(t.channel, { program: parseInt(e.target.value) })}
                  className="w-full bg-gray-900 text-[10px] rounded border border-gray-700 outline-none px-1 py-0.5 text-gray-300"
                  title="Instrument GM"
                >
                  {AudioEngine.INSTRUMENTS.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>
                )}
              </div>

              {/* Fader-vumètre pleine hauteur, entouré des potards FX */}
              <div className="flex-1 min-h-0 flex items-stretch justify-center gap-1 py-2 bg-black/10">
                <div className="flex flex-col items-center justify-center gap-1">
                  <Knob label="Rv" value={t.fx?.reverb ?? 0} onChange={(v) => onUpdateTrack(t.channel, { fx: { ...(t.fx ?? FX_ZERO), reverb: v } })} />
                  <Knob label="Ch" value={t.fx?.chorus ?? 0} onChange={(v) => onUpdateTrack(t.channel, { fx: { ...(t.fx ?? FX_ZERO), chorus: v } })} />
                </div>
                <FaderVU
                  volume={t.volume}
                  level={levels[t.channel] ?? 0}
                  onVolume={(v) => onUpdateTrack(t.channel, { volume: v })}
                />
                <div className="flex flex-col items-center justify-center gap-1">
                  <Knob label="Dl" value={t.fx?.delay ?? 0} onChange={(v) => onUpdateTrack(t.channel, { fx: { ...(t.fx ?? FX_ZERO), delay: v } })} />
                  <Knob label="Dr" value={t.fx?.drive ?? 0} onChange={(v) => onUpdateTrack(t.channel, { fx: { ...(t.fx ?? FX_ZERO), drive: v } })} />
                </div>
              </div>

              {/* Bas : mute / supprimer */}
              <div className="px-2 pb-2 pt-1.5 border-t border-gray-800/80 bg-black/20 flex flex-col gap-1.5">
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => toggleExpanded(t.channel)}
                    className={`text-[10px] px-2 py-0.5 rounded font-bold ${expandedCh === t.channel ? 'bg-yellow-900/40 text-yellow-300' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    title={expandedCh === t.channel ? 'Réduire la piste (fermer le Piano Roll intégré)' : 'Ouvrir le Piano Roll intégré de cette piste'}
                  >
                    🎹 Roll
                  </button>
                  <button
                    onClick={() => onUpdateTrack(t.channel, { mute: !t.mute })}
                    className={`text-[10px] px-2 py-0.5 rounded font-bold ${t.mute ? 'bg-red-900/40 text-red-400' : 'bg-gray-700 text-gray-400'}`}
                  >
                    {t.mute ? 'MUTE' : 'On'}
                  </button>
                  <button
                    onClick={() => onRemoveTrack(t.channel)}
                    className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-gray-800 text-gray-500 hover:bg-red-900/30 hover:text-red-400"
                    title="Supprimer cette piste"
                  >
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
          {/* Ajouter une piste */}
          <button
            onClick={onAddTrack}
            className="shrink-0 w-24 h-[320px] rounded-xl border border-dashed border-gray-700 hover:border-gray-500 hover:bg-gray-800/40 text-gray-500 hover:text-gray-300 text-xs font-bold flex flex-col items-center justify-center gap-1"
            title="Ajouter une piste instrument (canal MIDI libre)"
          >
            <span className="text-lg">➕</span>
            Piste
          </button>
        </div>
        )}
      </div>

      {/* ── Pistes horizontales (lanes) ── */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1 flex items-center gap-2">
          <span>🎹 Pistes</span>
          <span className="text-gray-700 normal-case">— clic sur la piste : tête de lecture · clic sur le nom : Piano Roll intégré · chevron : hauteur · glisser le nom : réordonner</span>
        </div>
        <div className="flex items-stretch">
          {/* Panneau GAUCHE fixe : chevron + nom + mini-vumètre (jamais déplacé par le zoom) */}
          <div className="shrink-0 w-[168px] border-r border-gray-800/80">
            {/* Espace de tête = hauteur de la barre des locators : sans lui,
                les NOMS de pistes seraient alignés sur la barre des locators
                (colonne droite) au lieu de leur lane (bug « locators sur la
                ligne de la piste Lead »). */}
            <div className="border-b border-gray-800/60" style={{ height: LOC_BAR_H }} />
            {tracks.map((t, i) => {
              const isExpanded = expandedCh === t.channel;
              const h = isExpanded ? LANE_PIANOROLL_H : LANE_COMPACT_H;
              const isDragging = dragTrackIdx === i;
              return (
                <div
                  key={t.channel}
                  className={`flex items-center gap-1 pl-1 pr-1 border-b border-gray-800/40 select-none group ${isDragging ? 'opacity-40' : ''}`}
                  style={{ height: h + 4 }}
                  draggable
                  onDragStart={(e) => {
                    setDragTrackIdx(i);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDragEnter={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragTrackIdx !== null && dragTrackIdx !== i) onReorderTracks(dragTrackIdx, i);
                    setDragTrackIdx(null);
                  }}
                  onDragEnd={() => setDragTrackIdx(null)}
                  title="Glisser pour réordonner la piste (table de mixage et pistes synchronisées)"
                >
                  {/* Chevron agrandir/réduire */}
                  <button
                    onClick={() => toggleExpanded(t.channel)}
                    className="w-5 h-5 shrink-0 text-[10px] text-gray-500 hover:text-yellow-300 rounded"
                    title={isExpanded ? 'Réduire la piste (mode aperçu)' : 'Agrandir la piste (mode détail, hauteur complète)'}
                  >
                    {isExpanded ? '▼' : '▶'}
                  </button>
                  {/* Nom + mini-vumètre (clic sur le nom = Piano Roll intégré) */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer hover:opacity-80"
                    onClick={() => toggleExpanded(t.channel)}
                    title={`${isExpanded ? 'Réduire' : 'Agrandir'} : Piano Roll intégré de ${t.label}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold truncate flex-1" style={{ color: trackColor(t.channel) }}>
                        {trackIcon(t.channel)} {t.label}
                      </span>
                      <MiniVU level={levels[t.channel] ?? 0} />
                    </div>
                    {/* Mention notes/état : seulement quand le PianoRoll intégré
                        de CETTE piste est ouvert (sinon : noms épurés) */}
                    {isExpanded && (
                      <span className="text-[9px] text-gray-600">
                        {(pianoNotes[t.channel] ?? []).length} note{(pianoNotes[t.channel] ?? []).length > 1 ? 's' : ''} · {t.mute ? 'MUTE' : 'On'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {tracks.length === 0 && (
              <div className="text-center text-gray-600 text-xs py-8">
                Aucune piste — utilisez « ➕ Piste » pour en créer une.
              </div>
            )}
          </div>
          {/* Panneau DROIT : contenu des pistes (seul le contenu est zoomé/défilé) */}
          <div className="relative flex-1 min-w-0">
            {/* Barre des LOCATORS [L, R[ — au-dessus de la zone de contenu :
                intervalle de boucle du repeat, draggable avec snap-to-grid,
                synchronisée au scroll horizontal des lanes. */}
            <div ref={locBarRef} className="relative z-30 overflow-hidden border-b border-gray-800/60 select-none" style={{ height: LOC_BAR_H }}>
              <div
                ref={locContentRef}
                className="absolute inset-y-0 left-0"
                style={{ width: locContentW, transform: `translateX(${-lanesScrollLeft}px)` }}
              >
                {locR > locL && (
                  <div
                    className="absolute inset-y-0 bg-sky-500/15 border-x border-sky-400/40"
                    style={{ left: (locL * locContentW) / Math.max(1, totalBeats), width: ((locR - locL) * locContentW) / Math.max(1, totalBeats) }}
                  />
                )}
                <LocatorHandle side="L" beat={locL} contentW={locContentW} totalBeats={totalBeats} color="#7dd3fc" onMove={(x) => moveLocator('L', x)} />
                <LocatorHandle side="R" beat={locR} contentW={locContentW} totalBeats={totalBeats} color="#fbbf24" onMove={(x) => moveLocator('R', x)} />
              </div>
            </div>
            <div ref={lanesScrollRef} className="overflow-x-auto" onScroll={(e) => setLanesScrollLeft(e.currentTarget.scrollLeft)}>
              <div ref={lanesContentRef} style={{ width: Math.max(totalBeats * lanePpb, 1), minWidth: '100%' }}>
                {tracks.map(t => {
                  const isExpanded = expandedCh === t.channel;
                  const h = isExpanded ? LANE_PIANOROLL_H : LANE_COMPACT_H;
                  return (
                    <div key={t.channel} className="border-b border-gray-800/40" style={{ height: h + 4 }}>
                      {isExpanded ? (
                        <PianoRoll
                          embedded
                          notes={pianoNotes[t.channel] ?? []}
                          onNotesChange={onNotesChange}
                          trackLabel={t.label}
                          channel={t.channel}
                          isDrum={t.channel === 9 || !!t.drums}
                          pixelsPerBeat={laneEffectivePpb}
                          totalBeats={totalBeats}
                          height={LANE_PIANOROLL_H}
                          tempo={tempo}
                          engine={engine}
                          onPreviewNote={(pitch) => engine.playPreviewNote(t.channel, pitch)}
                          onPlayMidi={(notes) => playMidiViaPort(notes, t.channel)}
                          onSnapChange={handleLocSnap}
                          onExpand={() => setModalPianoRoll(t.channel)}
                          keysVisible={keysVisible}
                          onToggleKeys={toggleKeys}
                          recState={recState}
                          onToggleRec={toggleRec}
                          recordingNotes={recNotes}
                          locL={locL}
                          locR={locR}
                          onGoToBeats={doScrub}
                          onPlayAudio={doPlay}
                          onToggleMidi={toggleMidiPlay}
                        />
                      ) : (
                        <TrackLane
                          track={t}
                          notes={pianoNotes[t.channel] ?? []}
                          totalBeats={totalBeats}
                          compact
                          onScrub={doScrub}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Slot du CLAVIER de piano (rempli par portal depuis le PianoRoll
                agrandi) : calque fixe à droite de l'ÉCRAN — immobile au scroll
                horizontal, aligné sur la piste agrandie. TOUJOURS rendu (la
                marge ne sort jamais du cadre) : replié, il ne garde que le
                bouton 🎹 (rétracter/réafficher). */}
            {expandedCh !== null && (
              <div
                id="pianoroll-keys-slot"
                className="absolute right-0 z-20 border-l border-gray-800/60"
                style={{
                  top: laneTop(expandedIndex, LANE_COMPACT_H, 4, LOC_BAR_H),
                  width: keysVisible ? PIANO_KEYBOARD_WIDTH : 20,
                  height: LANE_PIANOROLL_H + 4,
                }}
              >
                {/* Bouton toggle SUR la marge — toujours visible */}
                <button
                  onClick={toggleKeys}
                  className="absolute top-1 left-1/2 -translate-x-1/2 z-30 p-0.5 rounded bg-[#0d1117]/90 border border-[#1f2733] text-[#9aa3b2] hover:text-white"
                  title={keysVisible ? 'Masquer le clavier de piano (marge)' : 'Afficher le clavier de piano (marge)'}
                >
                  <Piano className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal réglages : ports MIDI & Audio ── */}
      {showPorts && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60"
          onClick={() => setShowPorts(false)}
        >
          <div
            className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl p-5 w-[460px] max-w-[92vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><Settings className="w-4 h-4 text-gray-400" /> Ports MIDI & Audio</h3>
              <button onClick={() => setShowPorts(false)} className="text-gray-500 hover:text-white text-xs px-2 py-1 rounded hover:bg-gray-800">✕ Fermer</button>
            </div>

            {/* Sortie MIDI */}
            <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Sortie MIDI — instrument branché</label>
            <select
              value={midiCurrent}
              onChange={(e) => changeMidiPort(midiPorts.indexOf(e.target.value))}
              className="w-full bg-gray-800 text-gray-200 text-xs rounded border border-gray-700 px-2 py-2 mb-4"
              title="Port MIDI vers lequel l'application envoie les notes (FluidSynth, Roland, …)"
            >
              {midiPorts.length === 0 && <option value="">Aucun port MIDI disponible</option>}
              {midiPorts.map((p, i) => (
                <option key={i} value={p}>{p.split(':')[0]}</option>
              ))}
            </select>

            {/* Sortie audio */}
            <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Sortie Audio — device de lecture</label>
            <select
              value={audioCurrent}
              onChange={(e) => changeAudioDevice(e.target.value)}
              className="w-full bg-gray-800 text-gray-200 text-xs rounded border border-gray-700 px-2 py-2 mb-4"
              title="Device de sortie audio (lecture du rendu, clic)"
            >
              <option value="">Défaut système</option>
              {audioDevices.map((d) => (
                <option key={d.name} value={d.name}>{d.name}{d.channels > 2 ? ` (${d.channels} ch)` : ''}</option>
              ))}
            </select>

            <p className="text-[10px] text-gray-600 leading-relaxed">
              💡 Le port MIDI est utilisé par la <b className="text-gray-400">lecture « ▶ MIDI »</b> du PianoRoll intégré :
              les notes (même les dernières insérées) partent sur l'instrument choisi. Le changement est appliqué immédiatement.
            </p>
          </div>
        </div>
      )}

      {/* ── Piano Roll MODAL (grande échelle) — ouvert depuis ⛶ de la
          toolbar du PianoRoll intégré. Partage les MÊMES notes (pianoNotes)
          → cohérence totale et instantanée entre intégré et modal. ── */}
      {modalPianoRoll !== null && (() => {
        const track = tracks.find(t => t.channel === modalPianoRoll);
        const channelNotes = pianoNotes[modalPianoRoll] ?? [];
        const label = track?.label ?? `Canal ${modalPianoRoll}`;
        return (
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3 sm:p-6"
            onClick={() => setModalPianoRoll(null)}
          >
            <div
              className="bg-[#0d1117] rounded-xl border border-gray-800 shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* En-tête */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 shrink-0">
                <div className="text-xs font-bold flex items-center gap-2" style={{ color: trackColor(modalPianoRoll) }}>
                  🎹 {label} — Piano Roll
                  <span className="text-[9px] text-gray-500 font-normal">(synchronisé avec le Piano Roll intégré)</span>
                </div>
                <button
                  onClick={() => setModalPianoRoll(null)}
                  className="px-2 py-1 text-[10px] font-bold rounded-md bg-gray-800 text-gray-400 border border-gray-700 hover:text-white transition-colors"
                  title="Fermer (Échap)"
                >
                  ✕ Fermer
                </button>
              </div>
              {/* Piano Roll plein format */}
              <div className="flex-1 min-h-0">
                <PianoRoll
                  notes={channelNotes}
                  onNotesChange={onNotesChange}
                  trackLabel={label}
                  channel={modalPianoRoll}
                  isDrum={track?.channel === 9 || !!track?.drums}
                  totalBeats={totalBeats}
                  tempo={tempo}
                  engine={engine}
                  onClose={() => setModalPianoRoll(null)}
                  onPreviewNote={(pitch) => engine.playPreviewNote(modalPianoRoll, pitch)}
                  onPlayMidi={(notes) => playMidiViaPort(notes, modalPianoRoll)}
                  keysVisible={keysVisible}
                  onToggleKeys={toggleKeys}
                  recState={recState}
                  onToggleRec={toggleRec}
                  recordingNotes={recNotes}
                  locL={locL}
                  locR={locR}
                  onGoToBeats={doScrub}
                  onPlayAudio={doPlay}
                  onToggleMidi={toggleMidiPlay}
                />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
