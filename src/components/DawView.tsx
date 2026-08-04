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
import { AudioEngine, TrackConfig } from '../lib/audioEngine';
import type { PianoNote } from '../lib/pianoRollTypes';

// ─── Constantes d'affichage ────────────────────────────────────────────

/** Pixels par beat dans les lanes (zoom lecture compact, notes en pixels). */
const LANE_PPB = 24;
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
  const color = trackColor(track.channel);

  // Plage de pitch (utilisée seulement en vue agrandie)
  const { minPitch, maxPitch } = useMemo(() => {
    if (notes.length === 0) return { minPitch: 36, maxPitch: 96 };
    let mn = 127, mx = 0;
    for (const n of notes) { if (n.pitch < mn) mn = n.pitch; if (n.pitch > mx) mx = n.pitch; }
    return { minPitch: Math.max(0, mn - 2), maxPitch: Math.min(127, mx + 2) };
  }, [notes]);

  const laneHeight = compact ? LANE_COMPACT_H : Math.max(48, (maxPitch - minPitch + 1) * PITCH_PX);
  const canvasW = Math.max(totalBeats * LANE_PPB, 200);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasW * dpr;
    canvas.height = laneHeight * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Fond
    ctx.fillStyle = '#14141d';
    ctx.fillRect(0, 0, canvasW, laneHeight);

    // Lignes de temps (mesures) + numéros
    for (let beat = 0; beat <= totalBeats; beat++) {
      const x = beat * LANE_PPB;
      ctx.strokeStyle = beat % 4 === 0 ? '#333455' : '#222233';
      ctx.lineWidth = beat % 4 === 0 ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, laneHeight);
      ctx.stroke();
      if (beat % 4 === 0 && !compact) {
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
        ctx.lineTo(canvasW, y);
        ctx.stroke();
      }
    }

    // Notes (petits rectangles)
    for (const n of notes) {
      const x = n.startTime * LANE_PPB;
      const w = Math.max(2, n.duration * LANE_PPB);
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
    const px = posBeats * LANE_PPB;
    if (px >= 0 && px <= canvasW) {
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
  }, [notes, color, canvasW, laneHeight, minPitch, maxPitch, totalBeats, posBeats, compact]);

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
      {/* Canvas des notes (clic = déplacer la tête de lecture) */}
      <div className="flex-1 overflow-hidden rounded border border-gray-800 group-hover:border-gray-600 transition-colors relative">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: laneHeight, display: 'block', cursor: 'copy', touchAction: 'none' }}
          onPointerDown={handleScrub}
          title="Cliquer : déplacer la tête de lecture"
        />
      </div>
    </div>
  );
}

// ─── Composant principal ───────────────────────────────────────────────

export default function DawView({
  tracks, pianoNotes, playing, hasWav, tempo, loopOn, input, engine,
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

  const sig = useMemo(
    () => JSON.stringify({
      input, tempo,
      notes: pianoNotes,
      tracks: tracks.map(t => `${t.channel}:${t.program}:${t.volume}:${t.mute}:${t.label}`),
    }),
    [input, tempo, pianoNotes, tracks],
  );

  // Durée totale à afficher (notes + minimum 4 mesures)
  const totalBeats = useMemo(() => {
    let max = MIN_BEATS;
    for (const list of Object.values(pianoNotes)) {
      for (const n of list) max = Math.max(max, n.startTime + n.duration);
    }
    return Math.ceil(max);
  }, [pianoNotes]);

  const doStop = useCallback(() => {
    engine.stop();
    setPlayState('idle');
    setPosBeats(0);
  }, [engine]);

  const doBegin = useCallback(() => {
    engine.stop();
    setPlayState('idle');
    setPosBeats(0);
  }, [engine]);

  const doPlay = useCallback(() => {
    if (playState === 'paused') {
      engine.resumePianoRoll();
      setPlayState('playing');
      return;
    }
    if (sig !== renderSigRef.current) {
      // Contenu modifié → re-rendre le WAV (joue depuis 0)
      renderSigRef.current = sig;
      setPosBeats(0);
      onPlay();
    } else {
      // Buffer déjà rendu → jouer depuis la position de la tête
      engine.playNavigFrom((posBeats * 60) / tempo, loopOn);
    }
    setPlayState('playing');
  }, [playState, sig, engine, onPlay, posBeats, tempo, loopOn]);

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
        setPosBeats(((raw % dur) * tempo) / 60);
        return;
      }
      setPosBeats((raw * tempo) / 60);
    }, 40);
    return () => clearInterval(id);
  }, [playState, engine, tempo, loopOn]);

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

  const btn = 'px-3 py-2 text-xs font-bold rounded-lg border transition-colors shrink-0';

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-2 sm:p-3">
      {/* ── Barre de transport (play / pause / stop / begin) ── */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-3 pb-3 border-b border-gray-800">
        <button
          onClick={doPlay}
          disabled={playState === 'playing'}
          className={`${btn} ${playState === 'paused' ? 'bg-amber-800 hover:bg-amber-700 text-white' : 'bg-green-700 hover:bg-green-600 disabled:bg-gray-800 disabled:text-gray-600 text-white'}`}
          title={playState === 'paused' ? 'Reprendre la lecture' : 'Lire depuis la tête de lecture'}
        >
          {playState === 'paused' ? '▶ Reprendre' : '▶ Play'}
        </button>
        <button
          onClick={doPause}
          disabled={playState !== 'playing'}
          className={`${btn} bg-gray-800 text-yellow-300 hover:bg-gray-700 disabled:opacity-30`}
          title="Pause (la tête de lecture se fige)"
        >
          ⏸ Pause
        </button>
        <button
          onClick={doStop}
          className={`${btn} bg-red-800 hover:bg-red-700 text-white`}
          title="Arrêter et revenir au début"
        >
          ■ Stop
        </button>
        <button
          onClick={doBegin}
          className={`${btn} bg-gray-800 text-gray-300 hover:bg-gray-700`}
          title="Revenir au début (tête de lecture à 0)"
        >
          ⏮ Begin
        </button>
        <button
          onClick={onExtractWav}
          disabled={!hasWav}
          className={`${btn} bg-gray-800 text-amber-400 hover:bg-gray-700 disabled:opacity-30`}
          title="Télécharge le dernier rendu WAV en fichier .wav"
        >
          ⬇ Extract Wav
        </button>
        <button
          onClick={() => onSetLoop(!loopOn)}
          disabled={playState === 'playing'}
          className={`${btn} ${loopOn ? 'bg-purple-900/40 border-purple-500 text-purple-400' : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'}`}
        >
          🔁 Loop
        </button>
        <span className="text-xs text-gray-500">Tempo:</span>
        <input
          type="range" min={40} max={220} value={tempo}
          onChange={(e) => onTempoChange(parseInt(e.target.value))}
          className="w-20 accent-blue-500"
        />
        <input
          type="number" value={tempo}
          onChange={(e) => onTempoChange(parseInt(e.target.value))}
          className="text-xs font-bold text-blue-400 w-10 bg-gray-800 rounded border border-gray-700 px-1 py-1"
        />
        <div className="w-px h-5 bg-gray-700 mx-1 shrink-0" />
        <button onClick={onSave} className={`${btn} bg-gray-800 text-emerald-400 hover:bg-gray-700`}>💾 Save</button>
        <button onClick={onLoad} className={`${btn} bg-gray-800 text-cyan-400 hover:bg-gray-700`}>📂 Load</button>
        <button onClick={onExport} className={`${btn} bg-gray-800 text-orange-400 hover:bg-gray-700`} title="Exporter en JSON">📤</button>
        <button onClick={onImport} className={`${btn} bg-gray-800 text-orange-400 hover:bg-gray-700`} title="Importer un JSON">📥</button>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={onSetLive}
            className={`${btn} bg-blue-900/40 border-blue-600 text-blue-400 hover:bg-blue-800/40`}
            title="Revenir au mode Live (MIDI temps réel)"
          >
            🖥 Live
          </button>
          <button onClick={onHelp} className={`${btn} bg-gray-800 text-gray-400 hover:text-yellow-300`} title="Aide">❓</button>
        </div>
      </div>

      {/* ── Table de mixage ── */}
      <div className="mb-3 pb-3 border-b border-gray-800">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">🎚 Table de mixage</div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tracks.map(t => (
            <div
              key={t.channel}
              className={`shrink-0 w-28 rounded-lg border px-2 pt-2 pb-2 flex flex-col items-center gap-1.5 ${t.mute ? 'border-gray-800 bg-gray-900/40 opacity-60' : 'border-gray-700 bg-gray-800/50'}`}
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
                disabled={t.channel === 9}
                className="w-full bg-gray-900 text-[10px] rounded border border-gray-700 outline-none px-1 py-0.5 text-gray-300 disabled:opacity-40"
                title={t.channel === 9 ? 'Kit drums fixe' : 'Instrument GM'}
              >
                {AudioEngine.INSTRUMENTS.map((name, i) => (
                  <option key={i} value={i}>{name}</option>
                ))}
              </select>
              {/* Fader de volume (vertical) */}
              <div className="flex items-center gap-1.5">
                <input
                  type="range" min={1} max={127} value={t.volume}
                  onChange={(e) => onUpdateTrack(t.channel, { volume: parseInt(e.target.value) })}
                  className="h-16 accent-blue-500"
                  style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                  title="Volume de la piste"
                />
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
        <div className="overflow-x-auto">
          <div style={{ minWidth: '100%' }}>
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
