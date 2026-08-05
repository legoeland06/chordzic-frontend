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
import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Play, Pause, Square, SkipBack, Download, Upload, Save, FolderOpen, Repeat, HelpCircle, Monitor } from 'lucide-react';
import { AudioEngine, TrackConfig, FX_ZERO } from '../lib/audioEngine';
import type { PianoNote } from '../lib/pianoRollTypes';

// ─── Constantes d'affichage ────────────────────────────────────────────

/** Pixels par beat dans les lanes (zoom lecture compact, notes en pixels). */
const LANE_PPB = 24;
/** Largeur de l'étiquette d'une piste (w-32 = 128 px) — pour le zoom centré. */
const TRACK_LABEL_W = 128;
/** Zoom horizontal des lanes : plage 0.25× – 8× (6 à 192 px/beat). */
const LANE_ZOOM_MIN = LANE_PPB * 0.25;
const LANE_ZOOM_MAX = LANE_PPB * 8;
/** Pixels par demi-ton quand une lane est agrandie. */
const PITCH_PX = 6;
/** Hauteur d'une lane fine (défaut). */
const LANE_COMPACT_H = 26;
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

// ─── Props ─────────────────────────────────────────────────────────────

interface DawViewProps {
  tracks: TrackConfig[];
  pianoNotes: Record<number, PianoNote[]>;
  playing: boolean;
  hasWav: boolean;
  tempo: number;
  loopOn: boolean;
  sig: string;                          // signature rythmique (compteur de mesures)
  input: string;                        // signature du contenu (re-rendu si modifié)
  engine: AudioEngine;                  // lecture / pause / seek
  onPlay: () => void;                   // rend le WAV + joue depuis 0 (via ChordApp)
  onStop: () => void;
  onExtractWav: () => void;
  onTempoChange: (t: number) => void;
  onSetLoop: (v: boolean) => void;
  onSetLive: () => void;
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onImport: () => void;
  onAddTrack: () => void;
  onRemoveTrack: (channel: number) => void;
  onUpdateTrack: (channel: number, cfg: Partial<TrackConfig>) => void;
  onOpenPianoRoll: (channel: number) => void;
  onHelp: () => void;
}

/** Vumètre à segments (LED) : 10 segments, vert → jaune → rouge. */
function VUMeter({ level, height = 64 }: { level: number; height?: number }) {
  const segs = 10;
  const lit = Math.max(0, Math.min(segs, Math.round(level * segs)));
  return (
    <div className="flex flex-col-reverse gap-[2px] shrink-0" style={{ height }}>
      {Array.from({ length: segs }).map((_, i) => {
        const on = i < lit;
        const color = i / segs < 0.6 ? '#4ade80' : i / segs < 0.85 ? '#facc15' : '#f87171';
        return (
          <div
            key={i}
            className="w-1.5 rounded-sm"
            style={{
              height: (height - 2 * (segs - 1)) / segs,
              backgroundColor: on ? color : '#262a34',
              transition: 'background-color 45ms linear',
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Lane : une piste horizontale avec ses notes (canvas) ─────────────

function TrackLane({
  track, notes, totalBeats, posBeats, compact, onScrub, onOpenPianoRoll,
}: {
  track: TrackConfig;
  notes: PianoNote[];
  totalBeats: number;
  posBeats: number;
  compact: boolean;
  onScrub: (beats: number) => void;
  onOpenPianoRoll: (channel: number) => void;
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

  const laneHeight = compact ? LANE_COMPACT_H : Math.max(48, (maxPitch - minPitch + 1) * PITCH_PX);

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

    // Ligne de lecture verticale (rouge, pleine hauteur)
    const px = posBeats * sx;
    if (px >= 0 && px <= width) {
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, laneHeight);
      ctx.stroke();
      // Repère triangulaire en haut
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.moveTo(px - 4, 0);
      ctx.lineTo(px + 4, 0);
      ctx.lineTo(px, 6);
      ctx.closePath();
      ctx.fill();
    }
  }, [notes, color, width, laneHeight, minPitch, maxPitch, totalBeats, posBeats, compact]);

  /** Clic sur le canvas → déplacer la tête de lecture (scrub). */
  const handleScrub = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const beats = Math.max(0, ((e.clientX - rect.left) / rect.width) * totalBeats);
    onScrub(beats);
  };

  return (
    <div className="flex items-stretch gap-2 py-0.5 group">
      {/* Étiquette piste (clic → Piano Roll) */}
      <div
        className="w-32 shrink-0 flex flex-col justify-center pl-1 cursor-pointer hover:opacity-80"
        onClick={() => onOpenPianoRoll(track.channel)}
        title={`Ouvrir le Piano Roll de ${track.label}`}
      >
        <span className="text-xs font-bold truncate" style={{ color }}>
          {trackIcon(track.channel)} {track.label}
        </span>
        <span className="text-[9px] text-gray-600">
          {notes.length} note{notes.length > 1 ? 's' : ''} · {track.mute ? 'MUTE' : 'On'}
        </span>
      </div>
      {/* Canvas des notes (clic = déplacer la tête, molette = zoom centré) */}
      <div
        ref={wrapRef}
        className="flex-1 min-w-0 overflow-hidden rounded border border-gray-800 group-hover:border-gray-600 transition-colors relative"
      >
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: laneHeight, display: 'block', cursor: 'copy', touchAction: 'none' }}
          onPointerDown={handleScrub}
          title="Clic : déplacer la tête de lecture · Molette : zoomer (centré sur le curseur)"
        />
      </div>
    </div>
  );
}

// ─── Composant principal ───────────────────────────────────────────────

export default function DawView({
  tracks, pianoNotes, playing, hasWav, tempo, loopOn, sig, input, engine,
  onPlay, onStop, onExtractWav, onTempoChange, onSetLoop, onSetLive,
  onSave, onLoad, onExport, onImport,
  onAddTrack, onRemoveTrack, onUpdateTrack, onOpenPianoRoll, onHelp,
}: DawViewProps) {
  // ── Transport local (Play/Pause/Stop/Begin + tête de lecture) ──
  type PlayState = 'idle' | 'playing' | 'paused';
  const [playState, setPlayState] = useState<PlayState>('idle');
  const [posBeats, setPosBeats] = useState(0);
  /** Canaux dont la lane est agrandie (défaut : fines). */
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  /** Signature du dernier rendu : si le contenu change → re-rendu au Play. */
  const renderSigRef = useRef('');

  // ── Durée totale à afficher : la grille (input) + les notes, minimum 4 mesures
  const totalBeats = useMemo(() => {
    let max = MIN_BEATS;
    // Durée de la grille d'accords (chaque accord de durée t dure 4/t beats)
    for (const tok of input.split(/\s+/)) {
      const m = tok.match(/^(\d+):/);
      if (m) max = Math.max(max, 4 / parseInt(m[1], 10));
    }
    for (const list of Object.values(pianoNotes)) {
      for (const n of list) max = Math.max(max, n.startTime + n.duration);
    }
    return Math.ceil(max);
  }, [input, pianoNotes]);

  // ── Zoom molette des lanes (centré sur le curseur, tête de lecture intacte) ──
  const [lanePpb, setLanePpb] = useState(LANE_PPB);
  const lanePpbRef = useRef(LANE_PPB);
  const lanesScrollRef = useRef<HTMLDivElement>(null);

  /** Ppb minimum pour montrer TOUTE la piste (fit-to-width). */
  const minPpbFor = (el: HTMLElement) =>
    Math.max(0.25, (el.clientWidth - TRACK_LABEL_W) / Math.max(1, totalBeats));

  useEffect(() => {
    const el = lanesScrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const xView = e.clientX - rect.left;              // souris dans le viewport
      const oldPpb = lanePpbRef.current;
      // Largeur réelle de la zone des notes (étirée si < viewport)
      const contentW = Math.max(el.scrollWidth - TRACK_LABEL_W, 1);
      // Beat pointé par la souris
      const beat = ((xView + el.scrollLeft - TRACK_LABEL_W) * totalBeats) / contentW;
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
          const newContentW = Math.max(totalBeats * newPpb, el2.clientWidth - TRACK_LABEL_W);
          el2.scrollLeft = Math.max(0, (beat * newContentW) / totalBeats - xView + TRACK_LABEL_W);
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
  const measure = Math.floor(posBeats / beatsPerBar) + 1;
  const beatInBar = Math.floor(posBeats % beatsPerBar) + 1;
  const durSec = engine.getPianoRollDuration() || (totalBeats * 60) / Math.max(40, tempo);
  const fmtTime = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const d = Math.floor((sec % 1) * 10);
    return `${m}:${String(s).padStart(2, '0')}.${d}`;
  };
  const elapsedSec = (posBeats * 60) / Math.max(40, tempo);

  // ── Vumètres par piste (énergie des notes actives à la position courante) ──
  const [levels, setLevels] = useState<Record<number, number>>({});
  const refreshLevels = useCallback((beats: number) => {
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

  const doStop = useCallback(() => {
    engine.stop();
    setPlayState('idle');
    setPosBeats(0);
    setLevels({});
  }, [engine]);

  const doBegin = useCallback(() => {
    engine.stop();
    setPlayState('idle');
    setPosBeats(0);
    setLevels({});
  }, [engine]);

  const doPlay = useCallback(() => {
    if (playState === 'paused') {
      engine.resumePianoRoll();
      setPlayState('playing');
      return;
    }
    if (contentSig !== renderSigRef.current) {
      // Contenu modifié → re-rendre le WAV (joue depuis 0)
      renderSigRef.current = contentSig;
      setPosBeats(0);
      onPlay();
    } else {
      // Buffer déjà rendu → jouer depuis la position de la tête
      engine.playNavigFrom((posBeats * 60) / tempo, loopOn);
    }
    setPlayState('playing');
  }, [playState, contentSig, engine, onPlay, posBeats, tempo, loopOn]);

  const doPause = useCallback(() => {
    engine.pausePianoRoll();
    setPlayState('paused');
  }, [engine]);

  /** Scrub : clic sur une lane → déplace la tête (lecture, pause ou arrêt). */
  const doScrub = useCallback((beats: number) => {
    setPosBeats(beats);
    if (playState === 'playing' || playState === 'paused') {
      engine.seekNavig((beats * 60) / tempo);
    }
  }, [playState, engine, tempo]);

  // Ticker : position de lecture → ligne verticale (+ détection de fin)
  const doStopRef = useRef(doStop);
  doStopRef.current = doStop;
  useEffect(() => {
    if (playState !== 'playing') return;
    const id = setInterval(() => {
      const raw = engine.getPianoRollPositionRaw();
      const dur = engine.getPianoRollDuration();
      if (raw < 0 || dur <= 0) return;
      if (raw >= dur - 0.05) {
        // Fin naturelle du buffer (hors boucle)
        if (!loopOn) { doStopRef.current(); return; }
        const b = ((raw % dur) * tempo) / 60;
        setPosBeats(b);
        refreshLevels(b);
        return;
      }
      const b = (raw * tempo) / 60;
      setPosBeats(b);
      refreshLevels(b);
    }, 40);
    return () => clearInterval(id);
  }, [playState, engine, tempo, loopOn, refreshLevels]);

  // Quand ChordApp arrête la lecture (stop externe, édition…)
  useEffect(() => {
    if (!playing && playState !== 'idle') {
      setPlayState('idle');
      setPosBeats(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const toggleExpanded = (ch: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch); else next.add(ch);
      return next;
    });
  };

  // ── Styles transport (tons sobres / studio) ─────────────────────
  const tBtn = 'w-8 h-8 flex items-center justify-center rounded-md bg-[#1d212b] text-[#9aa3b2] border border-[#2c313d] hover:text-white hover:bg-[#2a2f3b] transition-colors disabled:opacity-30 shrink-0';
  const tBtnPlay = 'w-9 h-9 flex items-center justify-center rounded-md bg-[#2f6ba8] text-white border border-[#3a7ab8] hover:bg-[#3a7ab8] transition-colors disabled:opacity-40 shrink-0';
  const tSep = 'w-px h-6 bg-[#262a34] shrink-0';
  const tLcd = 'flex flex-col items-center justify-center px-2 py-0.5 bg-[#0a0c10] border border-[#23272f] rounded-md min-w-[3.6rem] shrink-0';
  const tLcdLabel = 'text-[8px] uppercase tracking-widest text-[#5c6472] leading-none';
  const tLcdVal = 'font-mono text-[13px] text-[#d9b25f] leading-tight';

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-2 sm:p-3">
      {/* ── Barre de transport (compacte, style studio) ── */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3 py-1.5 px-2 bg-[#12141a] border border-[#262a34] rounded-lg">
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

        <div className={tSep} />

        {/* LED de statut */}
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${playState === 'playing' ? 'bg-red-500 animate-pulse' : playState === 'paused' ? 'bg-amber-400' : 'bg-gray-700'}`}
          title={playState === 'playing' ? 'Lecture en cours' : playState === 'paused' ? 'En pause' : 'Arrêté'}
        />

        {/* Compteurs (afficheurs LCD) */}
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

        {/* Boucle + extraction WAV */}
        <button
          onClick={() => onSetLoop(!loopOn)}
          disabled={playState === 'playing'}
          className={loopOn ? `${tBtn} bg-[#2f4a6e] border-[#3f5f8f] text-[#a8c8e8]` : tBtn}
          title="Lecture en boucle"
        >
          <Repeat className="w-3.5 h-3.5" />
        </button>
        <button onClick={onExtractWav} disabled={!hasWav} title="Extraire le dernier rendu WAV" className={tBtn}>
          <Download className="w-3.5 h-3.5" />
        </button>

        <div className={tSep} />

        {/* Fichiers */}
        <button onClick={onSave} title="Sauvegarder la grille (Save)" className={tBtn}><Save className="w-3.5 h-3.5" /></button>
        <button onClick={onLoad} title="Charger une grille (Load)" className={tBtn}><FolderOpen className="w-3.5 h-3.5" /></button>
        <button onClick={onExport} title="Exporter en JSON" className={tBtn}><Upload className="w-3.5 h-3.5" /></button>
        <button onClick={onImport} title="Importer un fichier JSON" className={tBtn}><Download className="w-3.5 h-3.5" /></button>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={onSetLive}
            className="px-2.5 h-8 flex items-center gap-1.5 rounded-md bg-[#223a5a] text-[#8fb8e8] border border-[#2f4a6e] hover:bg-[#2a4a70] text-[11px] font-semibold transition-colors shrink-0"
            title="Revenir au mode Live (MIDI temps réel)"
          >
            <Monitor className="w-3.5 h-3.5" /> Live
          </button>
          <button onClick={onHelp} title="Aide" className={tBtn}><HelpCircle className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* ── Table de mixage ── */}
      <div className="mb-3 pb-3 border-b border-gray-800">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">🎚 Table de mixage</div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tracks.map(t => (
            <div
              key={t.channel}
              className={`shrink-0 w-32 rounded-lg border px-2 pt-2 pb-2 flex flex-col items-center gap-1.5 ${t.mute ? 'border-gray-800 bg-gray-900/40 opacity-60' : 'border-gray-700 bg-gray-800/50'}`}
            >
              {/* Nom éditable */}
              <input
                value={t.label}
                onChange={(e) => onUpdateTrack(t.channel, { label: e.target.value })}
                className="w-full bg-transparent text-center text-xs font-bold outline-none border-b border-transparent focus:border-gray-500 truncate"
                style={{ color: trackColor(t.channel) }}
                title="Renommer la piste"
                spellCheck={false}
              />
              {/* Instrument */}
              <select
                value={t.program}
                onChange={(e) => onUpdateTrack(t.channel, { program: parseInt(e.target.value) })}
                disabled={t.channel === 9 || !!t.drums}
                className="w-full bg-gray-900 text-[10px] rounded border border-gray-700 outline-none px-1 py-0.5 text-gray-300 disabled:opacity-40"
                title={t.channel === 9 || t.drums ? 'Kit drums fixe' : 'Instrument GM'}
              >
                {AudioEngine.INSTRUMENTS.map((name, i) => (
                  <option key={i} value={i}>{name}</option>
                ))}
              </select>
              {/* Fader de volume (vertical) + vumètre */}
              <div className="flex items-center gap-1.5">
                <input
                  type="range" min={1} max={127} value={t.volume}
                  onChange={(e) => onUpdateTrack(t.channel, { volume: parseInt(e.target.value) })}
                  className="h-16 accent-blue-500"
                  style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                  title="Volume de la piste"
                />
                {/* Vumètre : activité des notes à la position de lecture */}
                <VUMeter level={levels[t.channel] ?? 0} height={64} />
                <span className="text-[10px] text-gray-500 w-5 text-center">{t.volume}</span>
              </div>
              {/* Mute + supprimer */}
              <div className="flex items-center gap-1">
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
              {/* Modules d'effets (appliqués avant le rendu WAV) */}
              <div className="w-full flex flex-col gap-0.5 mt-1 pt-1.5 border-t border-gray-800">
                <span className="text-[8px] text-gray-600 uppercase tracking-widest text-center">FX</span>
                {([['Rv', 'reverb'], ['Ch', 'chorus'], ['Dl', 'delay'], ['Dr', 'drive']] as const).map(([label, key]) => (
                  <div key={key} className="flex items-center gap-1 min-w-0">
                    <span className="text-[8px] text-gray-500 w-4 shrink-0 font-mono">{label}</span>
                    <input
                      type="range" min={0} max={100} value={t.fx?.[key] ?? 0}
                      onChange={(e) => onUpdateTrack(t.channel, { fx: { ...(t.fx ?? FX_ZERO), [key]: parseInt(e.target.value) } })}
                      className="flex-1 min-w-0 h-1 accent-[#8f7a4a]"
                      title={`${label} — appliqué au rendu WAV (mode Navig)`}
                    />
                    <span className="text-[8px] text-gray-500 w-4 shrink-0 text-right font-mono">{t.fx?.[key] ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {/* Ajouter une piste */}
          <button
            onClick={onAddTrack}
            className="shrink-0 w-24 rounded-lg border border-dashed border-gray-700 hover:border-gray-500 hover:bg-gray-800/40 text-gray-500 hover:text-gray-300 text-xs font-bold flex flex-col items-center justify-center gap-1"
            title="Ajouter une piste instrument (canal MIDI libre)"
          >
            <span className="text-lg">➕</span>
            Piste
          </button>
        </div>
      </div>

      {/* ── Pistes horizontales (lanes) ── */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1 flex items-center gap-2">
          <span>🎹 Pistes</span>
          <span className="text-gray-700 normal-case">— clic sur la piste : tête de lecture · clic sur le nom : Piano Roll · chevron : hauteur</span>
        </div>
        <div ref={lanesScrollRef} className="overflow-x-auto">
          <div style={{ width: TRACK_LABEL_W + totalBeats * lanePpb, minWidth: '100%' }}>
            {tracks.map(t => {
              const isExpanded = expanded.has(t.channel);
              return (
                <div key={t.channel} className="flex items-center gap-1.5">
                  {/* Chevron agrandir/rétrécir */}
                  <button
                    onClick={() => toggleExpanded(t.channel)}
                    className="w-5 h-5 shrink-0 text-[10px] text-gray-500 hover:text-yellow-300 rounded"
                    title={isExpanded ? 'Rétrécir la piste' : 'Agrandir la piste'}
                  >
                    {isExpanded ? '▼' : '▶'}
                  </button>
                  <div className="flex-1 min-w-0">
                    <TrackLane
                      track={t}
                      notes={pianoNotes[t.channel] ?? []}
                      totalBeats={totalBeats}
                      posBeats={posBeats}
                      compact={!isExpanded}
                      onScrub={doScrub}
                      onOpenPianoRoll={onOpenPianoRoll}
                    />
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
        </div>
      </div>
    </div>
  );
}
