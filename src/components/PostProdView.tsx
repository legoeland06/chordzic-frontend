/**
 * PostProdView — mode PostProd : éditeur audio multipiste (type DAW).
 *
 * Design sérieux et épuré, aligné sur les conventions Pro Tools / Logic /
 * Studio One. Layout : transport (avec sélecteur de SNAP identique au mode
 * Navig) → table de mixage horizontale (ouvrable/fermable, même ordre que
 * les pistes) → rail d'outils + timeline → barre de statut.
 *
 * Édition NON destructive : les clips sont des régions sur les buffers du
 * bounce multitrack (split / déplacement / fades / gain). Les pistes AUDIO
 * importées (WAV/MP3/FLAC…) sont ajoutées comme blocs sur des pistes
 * supplémentaires avec les mêmes fonctionnalités.
 */
import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import {
  Play, Pause, Square, SkipBack, Repeat, Download,
  MousePointer2, Scissors, Eraser, Hand, MoveHorizontal, Magnet,
  Undo2, ArrowLeft, ChevronUp, ChevronDown, FileUp,
} from 'lucide-react';
import {
  PostProdSession, PostProdTrack, PostProdClip,
  PP_SNAP_UNITS, PP_DEFAULT_SNAP_UNIT, snapValueFor, createImportedTrack,
} from '../lib/postProdTypes';
import { PostProdEngine } from '../lib/postProdEngine';
import { PeakData, computePeaks } from '../lib/peaks';

// ─── Constantes d'affichage ───────────────────────────────────────────
const LANE_H = 74;
const RULER_H = 30;
const LABEL_W = 168;
const PPS_MAX = 640;
const PPS_DEFAULT = 64;
const BAR_COLOR = '#33384a';
const BAR_SUB_COLOR = '#23262e';
const SELECTED_COLOR = 'rgba(201,164,92,0.9)';
/** Seuil (px) avant qu'un clic-glisser devienne un déplacement/sélection. */
const DRAG_THRESHOLD = 4;

type Tool = 'select' | 'split' | 'erase' | 'grab' | 'trim';
type PlayState = 'idle' | 'playing' | 'paused';

interface Props {
  session: PostProdSession;
  engine: PostProdEngine;
  projectName: string | null;
  onBackToNavig: () => void;
  onSessionChange: (s: PostProdSession) => void;
  onStatus: (msg: string, color?: string) => void;
}

/** Copie légère d'une piste (clips + réglages, sans le buffer) — undo. */
type TrackSnap = { channel: number; volume: number; pan: number; mute: boolean; solo: boolean; clips: PostProdClip[] };

const snapOf = (t: PostProdTrack): TrackSnap => ({
  channel: t.channel, volume: t.volume, pan: t.pan, mute: t.mute, solo: t.solo,
  clips: t.clips.map(c => ({ ...c })),
});

export default function PostProdView({ session, engine, projectName, onBackToNavig, onSessionChange, onStatus }: Props) {
  // ── Transport ─────────────────────────────────────────────────────
  const [playState, setPlayState] = useState<PlayState>('idle');
  const [posSec, setPosSec] = useState(0);
  const [loopOn, setLoopOn] = useState(false);
  const [levels, setLevels] = useState<Record<number, number>>({});
  const [masterLevel, setMasterLevel] = useState(0);

  // ── Édition ───────────────────────────────────────────────────────
  const [tool, setTool] = useState<Tool>('select');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [snapOn, setSnapOn] = useState(true);
  /** Subdivision de snap — MÊMES unités que le mode Navig (PianoRoll). */
  const [snapUnit, setSnapUnit] = useState<number>(PP_DEFAULT_SNAP_UNIT);
  const [pps, setPps] = useState(PPS_DEFAULT);
  const [region, setRegion] = useState<[number, number] | null>(null);
  const [masterVol, setMasterVol] = useState(1);
  const [mixerOpen, setMixerOpen] = useState(true);
  /** Position de coupe fantôme (outil ciseaux, au survol). */
  const [splitHover, setSplitHover] = useState<number | null>(null);
  /** Clip survolé par la gomme (highlight rouge). */
  const [eraseHover, setEraseHover] = useState<string | null>(null);

  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const scrollRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLCanvasElement>(null);
  const laneRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const undoStackRef = useRef<TrackSnap[][]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    kind: 'move' | 'trimL' | 'trimR' | 'fadeIn' | 'fadeOut' | 'region';
    trackIdx: number; clipId: string; startX: number;
    origStart: number; origOffset: number; origDuration: number; origFade: number;
    active: boolean;      // seuil franchi → le geste mute réellement
    undone: boolean;      // pushUndo déjà fait pour ce geste
  } | null>(null);

  // ── Peaks (calculés une fois par buffer) ───────────────────────────
  const peaksMap = useMemo(() => {
    const m = new Map<number, PeakData>();
    for (const t of session.tracks) m.set(t.channel, computePeaks(t.buffer));
    return m;
  }, [session]);

  // ── Géométrie ─────────────────────────────────────────────────────
  const beatsPerBar = (() => {
    const n = parseInt(session.sig.split('/')[0] ?? '4', 10);
    return Number.isFinite(n) && n > 0 ? n : 4;
  })();
  const barSec = (beatsPerBar * 60) / Math.max(40, session.tempo);
  // La timeline s'étend avec les clips (déplacement/étirement au-delà de la session)
  const totalSec = useMemo(() => {
    let max = Math.max(session.durationSec, barSec * 4);
    for (const t of session.tracks) {
      for (const c of t.clips) max = Math.max(max, c.start + c.duration);
    }
    return max;
  }, [session, barSec]);
  const contentW = Math.max(totalSec * pps, 1);
  const snapValue = useCallback(
    (x: number) => snapValueFor(x, session.tempo, snapUnit, snapOn),
    [session.tempo, snapUnit, snapOn],
  );

  // ── Zoom molette (centré curseur) ─────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const minPps = () => Math.max(1, el.clientWidth / totalSec);
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const xView = e.clientX - rect.left;
      const oldPps = ppsRef.current;
      const sec = (xView + el.scrollLeft) / oldPps;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const newPps = Math.min(PPS_MAX, Math.max(minPps(), oldPps * factor));
      if (Math.abs(newPps - oldPps) < 0.01) return;
      ppsRef.current = newPps;
      setPps(newPps);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, sec * newPps - xView);
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [totalSec]);

  // ── Synchronisation moteur (les mutations de session sont prises en
  // compte sans stopper la lecture : le graphe est rebâti à la position) ──
  useEffect(() => {
    engine.setSession(session);
    if (engine.isPlaying) {
      const p = engine.getPosition();
      engine.seek(p).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // ── Ticker de lecture + VU ────────────────────────────────────────
  useEffect(() => {
    if (playState !== 'playing') return;
    const id = setInterval(() => {
      const dur = engine.getDuration();
      const p = engine.getPosition();
      setPosSec(p);
      const { levels: lv, master } = engine.getLevels();
      setLevels(prev => {
        const cur: Record<number, number> = {};
        engine.session?.tracks.forEach((t, i) => { cur[t.channel] = lv[i] ?? 0; });
        const keys = new Set([...Object.keys(prev).map(Number), ...Object.keys(cur).map(Number)]);
        const out: Record<number, number> = {};
        for (const ch of keys) out[ch] = Math.max(cur[ch] ?? 0, (prev[ch] ?? 0) * 0.82);
        return out;
      });
      setMasterLevel(master);
      if (dur > 0 && p >= dur - 0.02) {
        if (loopOn) {
          engine.seek(0).catch(() => {});
          setPosSec(0);
        } else {
          engine.stop();
          setPlayState('idle');
          setPosSec(0);
          setLevels({});
          setMasterLevel(0);
        }
      }
    }, 40);
    return () => clearInterval(id);
  }, [playState, engine, loopOn]);

  // ── Transport ─────────────────────────────────────────────────────
  const doPlay = useCallback(() => {
    if (playState === 'paused') {
      engine.resume();
      setPlayState('playing');
      return;
    }
    engine.play(loopOn).then(() => setPlayState('playing')).catch(() => {});
  }, [playState, engine, loopOn]);
  const doPause = useCallback(() => { engine.pause(); setPlayState('paused'); }, [engine]);
  const doStop = useCallback(() => { engine.stop(); setPlayState('idle'); setPosSec(0); setLevels({}); setMasterLevel(0); }, [engine]);
  const doBegin = useCallback(() => { engine.stop(); setPlayState('idle'); setPosSec(0); setLevels({}); setMasterLevel(0); }, [engine]);
  // ── Undo ──────────────────────────────────────────────────────────
  const pushUndo = useCallback(() => {
    undoStackRef.current.push(sessionRef.current.tracks.map(snapOf));
    if (undoStackRef.current.length > 60) undoStackRef.current.shift();
  }, []);

  const doUndo = useCallback(() => {
    const snap = undoStackRef.current.pop();
    if (!snap) { onStatus('Rien à annuler'); return; }
    const nextTracks = sessionRef.current.tracks.map(t => {
      const s = snap.find(x => x.channel === t.channel);
      return s ? { ...t, volume: s.volume, pan: s.pan, mute: s.mute, solo: s.solo, clips: s.clips } : t;
    });
    onSessionChange({ ...sessionRef.current, tracks: nextTracks });
    onStatus('↩ Annulé');
  }, [onSessionChange, onStatus]);

  // ── Mutations (non destructives ; l'undo est poussé par le GESTE,
  // jamais par la mutation elle-même — pas de pollution de l'historique) ──
  const applyTracks = useCallback((next: PostProdTrack[]) => {
    onSessionChange({ ...sessionRef.current, tracks: next });
  }, [onSessionChange]);

  const splitClip = useCallback((trackIdx: number, clipId: string, atSec: number) => {
    pushUndo();
    const tracks = sessionRef.current.tracks;
    const t = tracks[trackIdx];
    if (!t) return;
    const ci = t.clips.findIndex(c => c.id === clipId);
    if (ci < 0) return;
    const clip = t.clips[ci];
    const rel = Math.min(Math.max(0, atSec - clip.start), clip.duration);
    if (rel < 0.02 || clip.duration - rel < 0.02) return;
    const micro = 0.005; // auto-fade anti-clic aux frontières de coupe
    const c1: PostProdClip = { ...clip, duration: rel, fadeOut: clip.fadeOut > 0 ? clip.fadeOut : micro };
    const c2: PostProdClip = {
      ...clip,
      id: `${clip.id}-b`,
      start: clip.start + rel,
      offset: clip.offset + rel,
      duration: clip.duration - rel,
      fadeIn: clip.fadeIn > 0 ? clip.fadeIn : micro,
    };
    const clips = [...t.clips];
    clips.splice(ci, 1, c1, c2);
    applyTracks(tracks.map((x, i) => i === trackIdx ? { ...x, clips } : x));
    onStatus(`✂️ Clip coupé à ${atSec.toFixed(2)} s`);
  }, [pushUndo, applyTracks, onStatus]);

  const deleteClips = useCallback((ids: Set<string>) => {
    if (ids.size === 0) return;
    pushUndo();
    const next = sessionRef.current.tracks.map(t => ({ ...t, clips: t.clips.filter(c => !ids.has(c.id)) }));
    applyTracks(next);
    setSelected(new Set());
    onStatus(`🗑 ${ids.size} clip${ids.size > 1 ? 's' : ''} supprimé${ids.size > 1 ? 's' : ''}`);
  }, [pushUndo, applyTracks, onStatus]);

  const moveClip = useCallback((trackIdx: number, clipId: string, newStart: number) => {
    const tracks = sessionRef.current.tracks;
    const t = tracks[trackIdx];
    if (!t) return;
    const ci = t.clips.findIndex(c => c.id === clipId);
    if (ci < 0) return;
    // Pas de limite haute par la durée du clip : la timeline s'étend (convention DAW)
    const s = Math.max(0, snapValue(newStart));
    applyTracks(tracks.map((x, i) => i === trackIdx
      ? { ...x, clips: x.clips.map((c, j) => j === ci ? { ...c, start: s } : c) } : x));
  }, [snapValue, applyTracks]);

  const trimClip = useCallback((trackIdx: number, clipId: string, edge: 'L' | 'R', newVal: number) => {
    const tracks = sessionRef.current.tracks;
    const t = tracks[trackIdx];
    if (!t) return;
    const ci = t.clips.findIndex(c => c.id === clipId);
    if (ci < 0) return;
    const clip = t.clips[ci];
    let next: PostProdClip;
    if (edge === 'L') {
      const s = Math.max(0, Math.min(snapValue(newVal), clip.start + clip.duration - 0.1));
      const dOff = s - clip.start;
      next = { ...clip, start: s, offset: clip.offset + dOff, duration: clip.duration - dOff };
    } else {
      const end = snapValue(newVal);
      next = { ...clip, duration: Math.max(0.1, end - clip.start) };
    }
    applyTracks(tracks.map((x, i) => i === trackIdx
      ? { ...x, clips: x.clips.map((c, j) => j === ci ? next : c) } : x));
  }, [snapValue, applyTracks]);

  const setClipGain = useCallback((ids: Set<string>, delta: number) => {
    if (ids.size === 0) return;
    pushUndo();
    const next = sessionRef.current.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => ids.has(c.id) ? { ...c, gain: Math.max(0.1, Math.min(4, Math.round((c.gain + delta) * 20) / 20)) } : c),
    }));
    applyTracks(next);
  }, [pushUndo, applyTracks]);

  const setFade = useCallback((trackIdx: number, clipId: string, which: 'in' | 'out', value: number) => {
    const tracks = sessionRef.current.tracks;
    const t = tracks[trackIdx];
    if (!t) return;
    const ci = t.clips.findIndex(c => c.id === clipId);
    if (ci < 0) return;
    const clip = t.clips[ci];
    const v = Math.max(0, Math.min(value, clip.duration / 2));
    applyTracks(tracks.map((x, i) => i === trackIdx
      ? { ...x, clips: x.clips.map((c, j) => j === ci ? (which === 'in' ? { ...c, fadeIn: v } : { ...c, fadeOut: v }) : c) } : x));
  }, [applyTracks]);

  // ── Hit test clip ─────────────────────────────────────────────────
  const hitClip = useCallback((track: PostProdTrack, xSec: number): PostProdClip | null => {
    for (let i = track.clips.length - 1; i >= 0; i--) {
      const c = track.clips[i];
      if (xSec >= c.start && xSec < c.start + c.duration) return c;
    }
    return null;
  }, []);

  // ── Pointer : survol (curseurs + fantômes) ────────────────────────
  const onLanePointerMove = useCallback((e: React.PointerEvent, trackIdx: number) => {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const xSec = (e.clientX - rect.left + scrollLeft) / ppsRef.current;
    const t = sessionRef.current.tracks[trackIdx];
    if (!t) return;
    const clip = hitClip(t, xSec);
    let cursor = 'crosshair';
    if (tool === 'select') {
      if (clip) {
        cursor = 'move';
        if (selected.has(clip.id)) {
          const clipX = clip.start * ppsRef.current - scrollLeft + rect.left;
          const clipW = clip.duration * ppsRef.current;
          const relX = e.clientX - clipX;
          if (relX < 12 || relX > clipW - 12) cursor = 'col-resize'; // poignées de fade
        }
      } else {
        cursor = 'crosshair';
      }
    } else if (tool === 'split') {
      cursor = 'copy';
      setSplitHover(xSec);
    } else if (tool === 'erase') {
      cursor = clip ? 'pointer' : 'crosshair';
      setEraseHover(clip ? clip.id : null);
    } else if (tool === 'grab') {
      cursor = clip ? 'grab' : 'crosshair';
    } else if (tool === 'trim') {
      if (clip) {
        const clipX = clip.start * ppsRef.current - scrollLeft + rect.left;
        const clipW = clip.duration * ppsRef.current;
        const relX = e.clientX - clipX;
        cursor = relX < 6 || relX > clipW - 6 ? 'ew-resize' : 'move';
      }
    }
    canvas.style.cursor = cursor;
  }, [tool, selected, hitClip]);

  const onLanePointerLeave = useCallback(() => {
    setSplitHover(null);
    setEraseHover(null);
  }, []);

  // ── Pointer : interactions des outils sur les lanes ───────────────
  const onLanePointerDown = useCallback((e: React.PointerEvent, trackIdx: number) => {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const xSec = (e.clientX - rect.left + scrollLeft) / ppsRef.current;
    const t = sessionRef.current.tracks[trackIdx];
    if (!t) return;

    const clip = hitClip(t, xSec);
    const isSel = clip && selected.has(clip.id);
    const base = { active: false, undone: false };

    if (tool === 'select' || tool === 'grab') {
      if (clip) {
        // Poignées de fade sur le clip sélectionné (outil sélecteur)
        if (isSel && tool === 'select') {
          const clipX = clip.start * ppsRef.current - scrollLeft + rect.left;
          const clipW = clip.duration * ppsRef.current;
          const relX = e.clientX - clipX;
          if (relX < 12) {
            pushUndo();
            dragRef.current = { kind: 'fadeIn', trackIdx, clipId: clip.id, startX: e.clientX, origStart: clip.start, origOffset: clip.offset, origDuration: clip.duration, origFade: clip.fadeIn, ...base, active: true, undone: true };
            return;
          }
          if (relX > clipW - 12) {
            pushUndo();
            dragRef.current = { kind: 'fadeOut', trackIdx, clipId: clip.id, startX: e.clientX, origStart: clip.start, origOffset: clip.offset, origDuration: clip.duration, origFade: clip.fadeOut, ...base, active: true, undone: true };
            return;
          }
        }
        // Sélection (clic simple ou shift pour multi)
        if (!e.shiftKey) setSelected(new Set([clip.id]));
        else {
          setSelected(prev => {
            const n = new Set(prev);
            if (n.has(clip.id)) n.delete(clip.id); else n.add(clip.id);
            return n;
          });
        }
        // Déplacement (seuil avant d'agir — un clic ne bouge pas le clip)
        if (tool === 'select' || tool === 'grab') {
          dragRef.current = { kind: 'move', trackIdx, clipId: clip.id, startX: e.clientX, origStart: clip.start, origOffset: clip.offset, origDuration: clip.duration, origFade: 0, ...base };
        }
      } else {
        // Sélection de région sur le fond (seuil avant d'afficher)
        setSelected(new Set());
        dragRef.current = { kind: 'region', trackIdx, clipId: '', startX: e.clientX, origStart: xSec, origOffset: 0, origDuration: 0, origFade: 0, ...base };
      }
    } else if (tool === 'split') {
      if (clip) splitClip(trackIdx, clip.id, snapValue(xSec));
    } else if (tool === 'erase') {
      if (clip) deleteClips(new Set([clip.id]));
    } else if (tool === 'trim') {
      if (clip) {
        const clipX = clip.start * ppsRef.current - scrollLeft + rect.left;
        const clipW = clip.duration * ppsRef.current;
        const relX = e.clientX - clipX;
        const edge = relX < clipW / 2 ? 'L' : 'R';
        setSelected(new Set([clip.id]));
        pushUndo();
        dragRef.current = {
          kind: edge === 'L' ? 'trimL' : 'trimR', trackIdx, clipId: clip.id,
          startX: e.clientX, origStart: clip.start, origOffset: clip.offset,
          origDuration: clip.duration, origFade: 0, ...base, active: true, undone: true,
        };
      }
    }
  }, [tool, selected, hitClip, splitClip, deleteClips, snapValue, pushUndo]);

  // Window pointermove/up (drag global avec seuil + undo par geste)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dxPx = e.clientX - d.startX;

      if (d.kind === 'region') {
        if (!d.active && Math.abs(dxPx) < DRAG_THRESHOLD) return;
        if (!d.active) { d.active = true; d.undone = true; }
        const canvas = laneRefs.current[d.trackIdx];
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const xSec = (e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0)) / ppsRef.current;
        setRegion([Math.min(d.origStart, xSec), Math.max(d.origStart, xSec)]);
        return;
      }

      const dx = dxPx / ppsRef.current;
      if (d.kind === 'move') {
        if (!d.active && Math.abs(dxPx) < DRAG_THRESHOLD) return;
        if (!d.active) { d.active = true; pushUndo(); d.undone = true; }
        moveClip(d.trackIdx, d.clipId, d.origStart + dx);
      } else if (d.kind === 'trimL') {
        trimClip(d.trackIdx, d.clipId, 'L', d.origStart + dx);
      } else if (d.kind === 'trimR') {
        trimClip(d.trackIdx, d.clipId, 'R', d.origStart + d.origDuration + dx);
      } else if (d.kind === 'fadeIn' || d.kind === 'fadeOut') {
        setFade(d.trackIdx, d.clipId, d.kind === 'fadeIn' ? 'in' : 'out', Math.max(0, d.origFade + dx));
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      if (d?.kind === 'region' && d.active) {
        const r = regionRef.current;
        if (r) {
          const [a, b] = [Math.min(r[0], r[1]), Math.max(r[0], r[1])];
          const ids = new Set<string>();
          for (const t of sessionRef.current.tracks) {
            for (const c of t.clips) {
              if (c.start < b && c.start + c.duration > a) ids.add(c.id);
            }
          }
          setSelected(ids);
        }
      }
      dragRef.current = null;
      setRegion(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [moveClip, trimClip, setFade, pushUndo]);

  // Ref miroir de `region` pour le handler window
  const regionRef = useRef(region);
  regionRef.current = region;

  // ── Raccourcis clavier ────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); playState === 'playing' ? doPause() : doPlay(); return; }
      if (e.key === 'v' || e.key === 'V') setTool('select');
      if (e.key === 'b' || e.key === 'B') setTool('split');
      if (e.key === 'e' || e.key === 'E') setTool('erase');
      if (e.key === 'g' || e.key === 'G') setTool('grab');
      if (e.key === 't' || e.key === 'T') setTool('trim');
      if (e.key === 's' || e.key === 'S') { setSnapOn(v => !v); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { deleteClips(selected); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); doUndo(); return; }
      if (e.key === 'ArrowUp') { setClipGain(selected, 0.1); return; }
      if (e.key === 'ArrowDown') { setClipGain(selected, -0.1); return; }
      if (e.key === 'Escape') { setSelected(new Set()); return; }
      if (e.key === 'Enter') { doStop(); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playState, doPlay, doPause, doStop, deleteClips, doUndo, setClipGain, selected]);

  // ── Import de fichiers audio ──────────────────────────────────────
  const handleImportFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    onStatus(`⏳ Import de ${files.length} fichier${files.length > 1 ? 's' : ''} audio…`);
    try {
      const s = sessionRef.current;
      let tracks = [...s.tracks];
      let dur = s.durationSec;
      let importedCount = 0;
      for (const f of files) {
        const data = await f.arrayBuffer();
        const buffer = await engine.decodeArrayBuffer(data);
        const name = (f.name.replace(/\.[^.]+$/, '').slice(0, 24)) || 'Audio';
        const idx = s.tracks.length + importedCount;
        tracks = [...tracks, createImportedTrack(buffer, idx, name)];
        dur = Math.max(dur, buffer.duration);
        importedCount += 1;
      }
      onSessionChange({ ...s, durationSec: dur, tracks });
      onStatus(`✅ ${importedCount} piste${importedCount > 1 ? 's' : ''} audio importée${importedCount > 1 ? 's' : ''}`, 'text-green-400');
    } catch (err) {
      onStatus(`❌ Import impossible : ${(err as Error).message}`, 'text-red-400');
    }
  }, [engine, onSessionChange, onStatus]);

  // ── Export WAV ────────────────────────────────────────────────────
  const doExport = useCallback(async () => {
    onStatus('⏳ Rendu offline du mix…');
    try {
      const blob = await engine.exportWav();
      const base = (projectName ?? 'projet').replace(/[^\w\-]+/g, '_') || 'projet';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${base}_postprod.wav`;
      a.click();
      URL.revokeObjectURL(url);
      onStatus(`📥 Export terminé (${(blob.size / 1048576).toFixed(1)} Mo)`, 'text-green-400');
    } catch (err) {
      onStatus(`❌ Export impossible : ${(err as Error).message}`, 'text-red-400');
    }
  }, [engine, onStatus, projectName]);

  // ── Afficheurs ────────────────────────────────────────────────────
  const fmtTime = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const d = Math.floor((sec % 1) * 10);
    return `${m}:${String(s).padStart(2, '0')}.${d}`;
  };
  const measure = Math.floor(posSec / barSec) + 1;
  const beatInBar = Math.floor((posSec % barSec) / (barSec / beatsPerBar)) + 1;
  const snapLabel = `1/${Math.round(1 / snapUnit)}`;

  // ── Styles transport (tons sobres / studio) ───────────────────────
  const tBtn = 'w-8 h-8 flex items-center justify-center rounded-md bg-[#1d212b] text-[#9aa3b2] border border-[#2c313d] hover:text-white hover:bg-[#2a2f3b] transition-colors disabled:opacity-30 shrink-0';
  const tBtnPlay = 'w-9 h-9 flex items-center justify-center rounded-md bg-[#2f6ba8] text-white border border-[#3a7ab8] hover:bg-[#3a7ab8] transition-colors disabled:opacity-40 shrink-0';
  const tSep = 'w-px h-6 bg-[#262a34] shrink-0';
  const tLcd = 'flex flex-col items-center justify-center px-2 py-0.5 bg-[#0a0c10] border border-[#23272f] rounded-md min-w-[3.6rem] shrink-0';
  const tLcdLabel = 'text-[8px] uppercase tracking-widest text-[#5c6472] leading-none';
  const tLcdVal = 'font-mono text-[13px] text-[#d9b25f] leading-tight';

  const toolBtn = (t: Tool, label: string, key: string, icon: React.ReactNode) => (
    <button
      onClick={() => setTool(t)}
      className={`w-9 h-9 flex flex-col items-center justify-center rounded-md border transition-colors shrink-0 ${tool === t
        ? 'bg-[#1d2118] border-[#c9a45c]/40 text-[#c9a45c]'
        : 'bg-[#171a21] border-[#262a34] text-[#6b7280] hover:text-[#c9cdd6] hover:bg-[#1d212b]'}`}
      title={`${label} (${key})`}
    >
      {icon}
      <span className="text-[7px] leading-none mt-0.5 font-mono opacity-70">{key}</span>
    </button>
  );

  // ── Dessin : ruler + lanes (redessinés à chaque changement) ───────
  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;

    // Ruler
    const rCanvas = rulerRef.current;
    if (rCanvas) {
      rCanvas.width = Math.max(1, Math.round(contentW * dpr));
      rCanvas.height = Math.max(1, Math.round(RULER_H * dpr));
      const ctx = rCanvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, contentW, RULER_H);
        ctx.font = '9px monospace';
        const nBars = Math.ceil(totalSec / barSec);
        for (let b = 0; b <= nBars; b++) {
          const x = b * barSec * pps;
          ctx.strokeStyle = b === nBars ? 'rgba(201,164,92,0.5)' : BAR_COLOR;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, RULER_H); ctx.stroke();
          if (b < nBars) {
            ctx.fillStyle = '#4a4f63';
            ctx.fillText(String(b + 1), x + 4, 11);
            for (let q = 1; q < beatsPerBar; q++) {
              const xq = x + (q / beatsPerBar) * barSec * pps;
              ctx.strokeStyle = BAR_SUB_COLOR;
              ctx.beginPath(); ctx.moveTo(xq, RULER_H - 6); ctx.lineTo(xq, RULER_H); ctx.stroke();
            }
          }
        }
      }
    }

    // Lanes
    session.tracks.forEach((t, i) => {
      const canvas = laneRefs.current[i];
      if (!canvas) return;
      canvas.width = Math.max(1, Math.round(contentW * dpr));
      canvas.height = Math.max(1, Math.round(LANE_H * dpr));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, contentW, LANE_H);

      // Fond
      ctx.fillStyle = '#0f1016';
      ctx.fillRect(0, 0, contentW, LANE_H);

      // Lignes de mesures
      const nBars = Math.ceil(totalSec / barSec);
      for (let b = 0; b <= nBars; b++) {
        const x = b * barSec * pps;
        ctx.strokeStyle = b % 4 === 0 ? 'rgba(51,56,74,0.9)' : 'rgba(35,38,46,0.9)';
        ctx.lineWidth = b % 4 === 0 ? 1 : 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, LANE_H); ctx.stroke();
      }

      const peaks = peaksMap.get(t.channel);
      const mid = LANE_H / 2;

      // Normalisation d'affichage : le pic du buffer remplit ~85 % de la lane
      let pk = 0;
      if (peaks) {
        for (let k = 0; k < peaks.max.length; k++) pk = Math.max(pk, Math.abs(peaks.max[k]), Math.abs(peaks.min[k]));
      }
      if (pk < 1e-6) pk = 1; // buffer silencieux → échelle neutre
      const scale = (LANE_H / 2 - 7) / pk;

      // Région de sélection (fond)
      if (region) {
        const [a, b] = [Math.min(region[0], region[1]) * pps, Math.max(region[0], region[1]) * pps];
        ctx.fillStyle = 'rgba(201,164,92,0.10)';
        ctx.fillRect(a, 0, b - a, LANE_H);
      }

      // Clips
      for (const c of t.clips) {
        const x = c.start * pps;
        const w = c.duration * pps;
        if (x > contentW || x + w < 0) continue;
        const isSel = selected.has(c.id);

        // Fond du clip : teinte de la piste
        ctx.fillStyle = isSel ? 'rgba(201,164,92,0.10)' : `${t.color}14`;
        ctx.fillRect(x + 1, 1, w - 2, LANE_H - 2);

        // Waveform (peaks → buckets), échelle normalisée au pic du buffer
        if (peaks) {
          const amp = scale * Math.min(Math.max(c.gain, 0.1), 4);
          const bps = peaks.bucketsPerSec;
          const x0 = Math.max(0, Math.floor(x));
          const x1 = Math.min(contentW, Math.ceil(x + w));
          ctx.fillStyle = t.color;
          for (let px = x0; px < x1; px++) {
            const tClip = (px - x) / pps;
            const tBuf = c.offset + tClip;
            const bk = Math.floor(tBuf * bps);
            if (bk < 0 || bk >= peaks.buckets) continue;
            const mn = peaks.min[bk] * amp;
            const mx = peaks.max[bk] * amp;
            const yTop = Math.max(0, mid - Math.abs(mx));
            const h = Math.max(0.5, Math.min(mx - mn, LANE_H - 2 - yTop));
            ctx.fillRect(px, yTop, 1, h);
          }
        }

        // Fades (courbes)
        const fadeAmp = LANE_H / 2 - 8;
        if (c.fadeIn > 0.001) {
          const fw = c.fadeIn * pps;
          ctx.strokeStyle = 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let k = 0; k <= 16; k++) {
            const p = k / 16;
            ctx.lineTo(x + fw * p, mid - fadeAmp * Math.sin((p * Math.PI) / 2));
          }
          ctx.stroke();
        }
        if (c.fadeOut > 0.001) {
          const fw = c.fadeOut * pps;
          ctx.strokeStyle = 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let k = 0; k <= 16; k++) {
            const p = k / 16;
            ctx.lineTo(x + w - fw * (1 - p), mid - fadeAmp * Math.sin(((1 - p) * Math.PI) / 2));
          }
          ctx.stroke();
        }

        // Ligne de gain si ≠ 1
        if (Math.abs(c.gain - 1) > 0.01) {
          const gy = Math.max(2, Math.min(LANE_H - 2, mid - scale * c.gain * (LANE_H / 2 - 7)));
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x, gy);
          ctx.lineTo(x + w, gy);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Highlight gomme (survol)
        if (eraseHover === c.id) {
          ctx.strokeStyle = 'rgba(248,113,113,0.9)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 0.5, 1.5, w - 1, LANE_H - 3);
        }

        // Contour + poignées de fade du clip sélectionné
        if (isSel) {
          ctx.strokeStyle = SELECTED_COLOR;
          ctx.lineWidth = 1.2;
          ctx.strokeRect(x + 0.5, 1.5, w - 1, LANE_H - 3);
          ctx.fillStyle = SELECTED_COLOR;
          const grip = 10;
          ctx.beginPath();
          ctx.moveTo(x, LANE_H - 1); ctx.lineTo(x + grip, LANE_H - 1); ctx.lineTo(x, LANE_H - 1 - grip);
          ctx.closePath(); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(x + w, LANE_H - 1); ctx.lineTo(x + w - grip, LANE_H - 1); ctx.lineTo(x + w, LANE_H - 1 - grip);
          ctx.closePath(); ctx.fill();
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, 1.5, w - 1, LANE_H - 3);
        }
      }
    });
  }, [session, contentW, totalSec, barSec, beatsPerBar, pps, selected, region, peaksMap, eraseHover]);

  // ── Rendu ─────────────────────────────────────────────────────────
  return (
    <div className="bg-[#0e0f14] rounded-xl border border-[#23262e] overflow-hidden select-none">
      {/* ── Barre de transport ── */}
      <div className="flex flex-wrap items-center gap-1.5 py-1.5 px-2 bg-[#12141a] border-b border-[#262a34]">
        <button onClick={doBegin} title="Revenir au début" className={tBtn}><SkipBack className="w-3.5 h-3.5" /></button>
        <button onClick={doPlay} disabled={playState === 'playing'} className={playState === 'paused' ? `${tBtn} bg-amber-800/70 border-amber-700 text-amber-100 hover:bg-amber-700` : tBtnPlay} title="Lire depuis la tête (Espace)">
          <Play className="w-4 h-4" />
        </button>
        <button onClick={doStop} title="Arrêter" className={`${tBtn} hover:bg-[#8f3b3b] hover:border-[#a84a4a] hover:text-white`}><Square className="w-3 h-3" /></button>
        <button onClick={doPause} disabled={playState !== 'playing'} title="Pause" className={tBtn}><Pause className="w-3.5 h-3.5" /></button>

        <div className={tSep} />

        <span className={`w-2 h-2 rounded-full shrink-0 ${playState === 'playing' ? 'bg-red-500 animate-pulse' : playState === 'paused' ? 'bg-amber-400' : 'bg-gray-700'}`} />
        <div className={tLcd} title="Mesure courante"><span className={tLcdLabel}>Mes.</span><span className={tLcdVal}>{String(measure).padStart(3, '0')}.{beatInBar}</span></div>
        <div className={tLcd} title="Position"><span className={tLcdLabel}>Temps</span><span className={tLcdVal}>{fmtTime(posSec)}</span></div>
        <div className={tLcd} title="Durée"><span className={tLcdLabel}>Durée</span><span className={tLcdVal}>{fmtTime(totalSec)}</span></div>
        <div className={tLcd} title="Tempo"><span className={tLcdLabel}>BPM</span><span className={tLcdVal}>{session.tempo}</span></div>
        <div className={tLcd} title="Signature"><span className={tLcdLabel}>Sig.</span><span className={tLcdVal}>{session.sig}</span></div>

        <div className={tSep} />

        <button onClick={() => setLoopOn(v => !v)} className={loopOn ? `${tBtn} bg-[#2f4a6e] border-[#3f5f8f] text-[#a8c8e8]` : tBtn} title="Lecture en boucle"><Repeat className="w-3.5 h-3.5" /></button>
        <button onClick={doUndo} title="Annuler (Ctrl+Z)" className={tBtn}><Undo2 className="w-3.5 h-3.5" /></button>

        {/* Subdivision du snap — identique au mode Navig (PianoRoll) */}
        <div className="flex items-center gap-1 px-1.5 h-8 rounded-md bg-[#0a0c10] border border-[#23272f] shrink-0" title="Subdivision du snap : mêmes valeurs que le mode Navig. 1/12 = triolets de croches, 1/6 = triolets de noires, 1/24/1/18 = sextolets.">
          <span className="text-[8px] uppercase tracking-widest text-[#5c6472]">Snap</span>
          <select
            value={snapUnit}
            onChange={(e) => setSnapUnit(parseFloat(e.target.value))}
            className="bg-transparent text-[#d9b25f] font-mono text-[11px] outline-none cursor-pointer"
          >
            {PP_SNAP_UNITS.map(u => (
              <option key={u} value={u} className="bg-[#171a21] text-[#c9cdd6]">1/{Math.round(1 / u)}</option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={onBackToNavig}
            className="px-2.5 h-8 flex items-center gap-1.5 rounded-md bg-[#223a5a] text-[#8fb8e8] border border-[#2f4a6e] hover:bg-[#2a4a70] text-[11px] font-semibold transition-colors shrink-0"
            title="Revenir au mode Navig (MIDI)"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Navig
          </button>
          <button
            onClick={doExport}
            className="px-3 h-8 flex items-center gap-1.5 rounded-md bg-[#c9a45c]/15 text-[#e0c98a] border border-[#c9a45c]/40 hover:bg-[#c9a45c]/25 text-[11px] font-bold transition-colors shrink-0"
            title="Exporter le mix final en WAV stéréo (rendu offline exact)"
          >
            <Download className="w-3.5 h-3.5" /> Exporter WAV
          </button>
        </div>
      </div>

      {/* ── Table de mixage horizontale (ouvrable/fermable, même ordre que les pistes) ── */}
      <div className="border-b border-[#262a34] bg-[#12141a]">
        <div className="flex items-center gap-2 px-2 py-1">
          <button onClick={() => setMixerOpen(v => !v)} className={tBtn} title={mixerOpen ? 'Fermer la table de mixage' : 'Ouvrir la table de mixage'}>
            {mixerOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <span className="text-[9px] uppercase tracking-widest text-[#4a4f63]">🎚 Table de mixage</span>
          <span className="text-[9px] text-[#5c6472] font-mono">— même ordre que les pistes</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 h-7 flex items-center gap-1.5 rounded-md bg-[#171a21] text-[#9fb8d8] border border-[#2c3a4a] hover:bg-[#1f2b3a] text-[10.5px] font-semibold transition-colors"
              title="Importer un fichier audio (WAV, MP3, FLAC, OGG…) : ajoute une piste avec les mêmes fonctionnalités"
            >
              <FileUp className="w-3.5 h-3.5" /> Importer audio
            </button>
            <input ref={fileInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={handleImportFiles} />
          </div>
        </div>
        {mixerOpen && (
          <div className="flex gap-2 overflow-x-auto px-2 pb-2 items-stretch">
            {session.tracks.map((t, i) => (
              <div
                key={t.channel}
                className={`shrink-0 w-[118px] rounded-lg border flex flex-col overflow-hidden ${t.mute ? 'border-[#262a34] bg-[#0c0d11] opacity-60' : 'border-[#2c313d] bg-[#171a21]'}`}
              >
                {/* Nom */}
                <div className="px-1.5 pt-1.5 pb-1 border-b border-[#262a34] bg-black/20">
                  <div className="text-[10px] font-bold truncate text-center leading-tight" style={{ color: t.color }} title={t.label}>
                    {t.source === 'import' ? '🎧 ' : ''}{t.label}
                  </div>
                </div>
                {/* Pan */}
                <div className="flex items-center gap-1 px-2 pt-1.5">
                  <span className="text-[7px] text-[#4a4f63] font-mono">L</span>
                  <input
                    type="range" min={-1} max={1} step={0.05} value={t.pan}
                    onPointerDown={() => pushUndo()}
                    onChange={(e) => applyTracks(sessionRef.current.tracks.map((x, j) => j === i ? { ...x, pan: parseFloat(e.target.value) } : x))}
                    className="flex-1 accent-[#6ea8d8] h-1 min-w-0"
                    title="Pan"
                  />
                  <span className="text-[7px] text-[#4a4f63] font-mono">R</span>
                </div>
                {/* Fader-VU */}
                <div
                  className="relative w-full flex-1 min-h-[64px] mx-2 my-1.5 rounded-md bg-[#0a0c10] border border-[#23272f] overflow-hidden cursor-pointer touch-none"
                  onPointerDown={(e) => {
                    const el = e.currentTarget;
                    el.setPointerCapture(e.pointerId);
                    pushUndo();
                    const setFromY = (y: number) => {
                      const r = el.getBoundingClientRect();
                      const frac = 1 - Math.max(0, Math.min(1, (y - r.top) / r.height));
                      applyTracks(sessionRef.current.tracks.map((x, j) => j === i ? { ...x, volume: Math.max(0, Math.min(1.5, frac * 1.5)) } : x));
                    };
                    setFromY(e.clientY);
                    const onMove = (ev: PointerEvent) => setFromY(ev.clientY);
                    const onUp = () => {
                      el.removeEventListener('pointermove', onMove);
                      el.removeEventListener('pointerup', onUp);
                    };
                    el.addEventListener('pointermove', onMove);
                    el.addEventListener('pointerup', onUp);
                  }}
                  title="Fader volume — la course sert aussi de vumètre"
                >
                  <div
                    className="absolute inset-x-0 bottom-0"
                    style={{
                      height: `${Math.round((levels[t.channel] ?? 0) * 100)}%`,
                      background: 'linear-gradient(to top, rgba(74,222,128,0.7), rgba(250,204,21,0.7) 60%, rgba(248,113,113,0.8) 85%)',
                    }}
                  />
                  <div className="absolute inset-0 opacity-40 pointer-events-none" style={{ background: 'repeating-linear-gradient(to top, transparent 0 9px, #1b2029 9px 10px)' }} />
                  <div className="absolute inset-x-0 pointer-events-none" style={{ bottom: `${(t.volume / 1.5) * 100}%` }}>
                    <div className="h-[4px] w-full bg-[#e0b96a] rounded-[2px] shadow-[0_0_4px_rgba(224,185,106,0.6)]" />
                  </div>
                </div>
                {/* Mute / Solo / valeur */}
                <div className="flex items-center justify-center gap-1 pb-1.5">
                  <button
                    onClick={() => { pushUndo(); applyTracks(sessionRef.current.tracks.map((x, j) => j === i ? { ...x, mute: !x.mute } : x)); }}
                    className={`h-5 w-6 rounded text-[9px] font-bold border transition-colors ${t.mute ? 'bg-[#3a2320] border-[#6b3a36] text-[#ffb3a8]' : 'bg-[#0c0d11] border-[#262a34] text-[#5c6472] hover:text-[#ffb3a8]'}`}
                  >M</button>
                  <button
                    onClick={() => { pushUndo(); applyTracks(sessionRef.current.tracks.map((x, j) => j === i ? { ...x, solo: !x.solo } : x)); }}
                    className={`h-5 w-6 rounded text-[9px] font-bold border transition-colors ${t.solo ? 'bg-[#3a3220] border-[#6b5a2e] text-[#ffe9a8]' : 'bg-[#0c0d11] border-[#262a34] text-[#5c6472] hover:text-[#ffe9a8]'}`}
                  >S</button>
                  <span className="text-[8px] text-[#5c6472] font-mono ml-0.5">{(t.volume * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
            {/* Master */}
            <div className="shrink-0 w-[110px] rounded-lg border border-[#2c313d] bg-[#171a21] flex flex-col items-center gap-1 py-1.5 px-1.5">
              <div className="text-[9px] uppercase tracking-widest text-[#4a4f63]">Master</div>
              <div className="relative w-full h-5 rounded bg-[#0a0c10] border border-[#23272f] overflow-hidden">
                <div className="absolute inset-0" style={{ width: `${Math.round(masterLevel * 100)}%`, background: 'linear-gradient(to right, rgba(74,222,128,0.5), rgba(250,204,21,0.5) 70%, rgba(248,113,113,0.65) 92%)' }} />
                <div className="absolute inset-y-0 pointer-events-none" style={{ left: `${masterVol * 100}%` }}>
                  <div className="w-[2.5px] h-full bg-[#e0b96a]" />
                </div>
              </div>
              <div
                className="relative w-full h-1.5 rounded bg-[#23272f] cursor-pointer touch-none"
                onPointerDown={(e) => {
                  const el = e.currentTarget;
                  el.setPointerCapture(e.pointerId);
                  const setFromX = (x: number) => {
                    const r = el.getBoundingClientRect();
                    const frac = Math.max(0, Math.min(1, (x - r.left) / r.width));
                    setMasterVol(frac);
                    engine.setMasterVolume(frac);
                  };
                  setFromX(e.clientX);
                  const onMove = (ev: PointerEvent) => setFromX(ev.clientX);
                  const onUp = () => {
                    el.removeEventListener('pointermove', onMove);
                    el.removeEventListener('pointerup', onUp);
                  };
                  el.addEventListener('pointermove', onMove);
                  el.addEventListener('pointerup', onUp);
                }}
                title="Volume master"
              />
              <div className="text-[8px] text-[#5c6472] font-mono">{(masterVol * 100).toFixed(0)}%</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Corps : outils + timeline ── */}
      <div className="flex items-stretch">
        {/* Rail d'outils */}
        <div className="w-12 shrink-0 bg-[#12141a] border-r border-[#262a34] flex flex-col items-center gap-1 py-2">
          {toolBtn('select', 'Sélecteur', 'V', <MousePointer2 className="w-4 h-4" />)}
          {toolBtn('split', 'Ciseaux — couper', 'B', <Scissors className="w-4 h-4" />)}
          {toolBtn('erase', 'Gomme — supprimer', 'E', <Eraser className="w-4 h-4" />)}
          {toolBtn('grab', 'Main — déplacer', 'G', <Hand className="w-4 h-4" />)}
          {toolBtn('trim', 'Trimmer — étirer', 'T', <MoveHorizontal className="w-4 h-4" />)}
          <div className="w-6 h-px bg-[#262a34] my-1" />
          <button
            onClick={() => setSnapOn(v => !v)}
            className={`w-9 h-9 rounded-md border flex flex-col items-center justify-center gap-0.5 transition-colors ${snapOn
              ? 'bg-[#1d2118] border-[#c9a45c]/40 text-[#c9a45c]'
              : 'bg-[#171a21] border-[#262a34] text-[#5c6472]'}`}
            title={`Snap magnétique (S) — ${snapOn ? 'ON' : 'OFF'}`}
          >
            <Magnet className="w-4 h-4" />
            <span className="text-[7px] leading-none font-mono">S</span>
          </button>
        </div>

        {/* Timeline : panneau gauche fixe (labels) + panneau droit scrollable */}
        <div className="flex-1 min-w-0 bg-[#0c0d11]">
          <div className="flex">
            {/* Labels fixes (header + une ligne par piste) */}
            <div className="shrink-0 border-r border-[#262a34] bg-[#12141a]" style={{ width: LABEL_W }}>
              <div className="flex items-center px-2.5 border-b border-[#262a34]" style={{ height: RULER_H }}>
                <span className="text-[9px] uppercase tracking-widest text-[#4a4f63]">Pistes audio</span>
              </div>
              {session.tracks.map((t, i) => (
                <div key={t.channel} className="flex items-center gap-2 px-2.5 border-b border-[#191c24]" style={{ height: LANE_H }}>
                  <div className="w-2 h-2 rounded-[2px] shrink-0" style={{ backgroundColor: t.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-[#c9cdd6] truncate leading-tight">
                      {t.source === 'import' ? '🎧 ' : ''}{t.label}
                    </div>
                    <div className="text-[9px] text-[#5c6472] font-mono leading-tight">
                      {t.clips.length} clip{t.clips.length > 1 ? 's' : ''} · vol {(t.volume * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => { pushUndo(); applyTracks(session.tracks.map((x, j) => j === i ? { ...x, mute: !x.mute } : x)); }}
                      className={`h-5 w-6 rounded text-[9px] font-bold border transition-colors ${t.mute ? 'bg-[#3a2320] border-[#6b3a36] text-[#ffb3a8]' : 'bg-[#171a21] border-[#262a34] text-[#5c6472] hover:text-[#ffb3a8]'}`}
                      title="Mute"
                    >M</button>
                    <button
                      onClick={() => { pushUndo(); applyTracks(session.tracks.map((x, j) => j === i ? { ...x, solo: !x.solo } : x)); }}
                      className={`h-5 w-6 rounded text-[9px] font-bold border transition-colors ${t.solo ? 'bg-[#3a3220] border-[#6b5a2e] text-[#ffe9a8]' : 'bg-[#171a21] border-[#262a34] text-[#5c6472] hover:text-[#ffe9a8]'}`}
                      title="Solo"
                    >S</button>
                  </div>
                </div>
              ))}
            </div>
            {/* Contenu scrollable UNIQUE : ruler + canvas des lanes + overlays */}
            <div className="flex-1 min-w-0 overflow-hidden">
              <div ref={scrollRef} className="overflow-x-auto">
                <div className="relative" style={{ width: contentW }}>
                  <canvas ref={rulerRef} style={{ display: 'block', width: contentW, height: RULER_H }} />
                  {session.tracks.map((t, i) => (
                    <canvas
                      key={t.channel}
                      ref={(el) => { laneRefs.current[i] = el; }}
                      onPointerDown={(e) => onLanePointerDown(e, i)}
                      onPointerMove={(e) => onLanePointerMove(e, i)}
                      onPointerLeave={onLanePointerLeave}
                      style={{ display: 'block', width: contentW, height: LANE_H, cursor: 'crosshair', touchAction: 'none' }}
                      title="Clic : selon l'outil actif · Molette : zoom temporel"
                    />
                  ))}
                  {/* Ligne de coupe fantôme (ciseaux) */}
                  {tool === 'split' && splitHover !== null && (
                    <div
                      className="absolute top-0 bottom-0 w-[1px] bg-[#c9a45c]/70 pointer-events-none z-10"
                      style={{ left: splitHover * pps, top: RULER_H }}
                    />
                  )}
                  {/* Playhead */}
                  <div
                    className="absolute w-[1.5px] bg-[#d9534f] pointer-events-none z-10 shadow-[0_0_6px_rgba(217,83,79,0.5)]"
                    style={{ left: posSec * pps, top: RULER_H, height: session.tracks.length * LANE_H }}
                  >
                    <div className="absolute -top-[6px] -left-[4px] w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-[#d9534f]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Barre de statut ── */}
      <div className="flex items-center gap-4 px-3 h-6 bg-[#12141a] border-t border-[#262a34] text-[10px] font-mono text-[#5c6472]">
        <span>PostProd · <span className="text-[#c9a45c]">{Math.ceil(totalSec / barSec)} mesures</span> · {fmtTime(totalSec)}</span>
        <span className="text-[#2c313d]">|</span>
        <span>Snap : <span className="text-[#c9a45c]">{snapOn ? snapLabel : 'OFF'}</span></span>
        <span className="text-[#2c313d]">|</span>
        <span>Sélection : <span className="text-[#c9a45c]">{selected.size > 0 ? `${selected.size} clip${selected.size > 1 ? 's' : ''}` : '—'}</span></span>
        <span className="ml-auto hidden sm:block text-[#3f4551]">
          <span className="text-[#5c6472]">↑↓</span> gain clip · <span className="text-[#5c6472]">B</span> couper · <span className="text-[#5c6472]">E</span> gomme · <span className="text-[#5c6472]">V</span> sélecteur
        </span>
      </div>
    </div>
  );
}
