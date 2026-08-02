/**
 * PianoRoll — composant Canvas éditable pour une piste instrumentale.
 *
 * Affiche :
 * - Un clavier de piano statique sur la gauche (touches blanches/noires)
 * - Une grille temporelle avec lignes de mesure/beat
 * - Les notes (PianoNote) sous forme de rectangles colorés
 *
 * Interactions :
 * - Clic sur vide → créer une note (snap 1/16)
 * - Drag centre → déplacer une note
 * - Drag bord droit → redimensionner une note
 * - Double-clic → supprimer une note
 * - Clic sur note (mode édition) → joue + sélectionne, nom au curseur et en haut
 * - Undo/redo : Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (snapshots, 100 entrées max)
 *
 * Architecture data-driven : pas d'éléments DOM pour chaque note,
 * tout est dessiné sur un canvas avec rendu optimisé.
 */

import React, { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import {
  PianoNote,
  DEFAULT_PIXELS_PER_BEAT,
  SNAP_UNIT,
  SNAP_UNITS,
  DEFAULT_SNAP_UNIT,
  WHITE_KEY_HEIGHT,
  PIANO_KEYBOARD_WIDTH,
  velocityColor,
  pitchLabel,
  isBlackKey,
  noteName,
  pixelsToPitch,
} from '../lib/pianoRollTypes';
import {
  InteractionState,
  InteractionContext,
  createEmptyContext,
  startInteraction,
  updateInteraction,
  endInteraction,
  deleteNote,
  hitTest,
  MouseCoord,
} from '../lib/pianoRollEngine';
import type { AudioEngine } from '../lib/audioEngine';

// ─── Constantes ─────────────────────────────────────────────────────────

/** Nombre maximal d'entrées de l'historique undo/redo. */
const MAX_HISTORY = 100;

/** Deadzone (px) : mouvement de souris sous ce seuil = clic simple, pas de drag. */
const CLICK_DEADZONE_PX = 5;

// ─── Props ──────────────────────────────────────────────────────────────

interface PianoRollProps {
  /** Notes à afficher et éditer. */
  notes: PianoNote[];
  /** Callback quand les notes changent (édition). */
  onNotesChange: (notes: PianoNote[]) => void;
  /** Nom de la piste (affiché en haut). */
  trackLabel: string;
  /** Canal MIDI de la piste (pour le titre et la couleur). */
  channel: number;
  /** Couleur de thème (optionnel, déduite du canal si omis). */
  accentColor?: string;
  /** Pitch minimum affiché (défaut: 36 = C3). */
  minPitch?: number;
  /** Pitch maximum affiché (défaut: 96 = C7). */
  maxPitch?: number;
  /** Pixels par beat (zoom horizontal, défaut: 96). */
  pixelsPerBeat?: number;
  /** Hauteur en pixels du composant (défaut: 400). */
  height?: number;
  /** Appelé quand la modal se ferme. */
  onClose: () => void;
  /** Audition en direct : joue la note édité (création, déplacement, resize). */
  onPreviewNote?: (pitch: number) => void;
  /** Tempo courant (conversion position audio → beats pour le curseur). */
  tempo: number;
  /** Moteur audio (lecture locale de la piste ouverte : play/pause + curseur). */
  engine?: AudioEngine | null;
}

// ─── Composant ──────────────────────────────────────────────────────────

export default function PianoRoll({
  notes,
  onNotesChange,
  trackLabel,
  channel,
  accentColor,
  minPitch: userMinPitch = 36,
  maxPitch: userMaxPitch = 96,
  pixelsPerBeat = DEFAULT_PIXELS_PER_BEAT,
  height = 400,
  onClose,
  onPreviewNote,
  tempo,
  engine,
}: PianoRollProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // État machine des interactions
  const ctxRef = useRef<InteractionContext>(createEmptyContext());
  // Notes temporaires pendant le drag (pour éviter de modifier le state React à chaque frame)
  const localNotesRef = useRef<PianoNote[]>(notes);
  // Note en cours de création (encore non validée)
  const [creatingNote, setCreatingNote] = useState<PianoNote | null>(null);
  // Zoom / scroll
  const [scrollLeft, setScrollLeft] = useState(0);
  const [zoom, setZoom] = useState(1);
  const effectivePixelsPerBeat = pixelsPerBeat * zoom;
  // Largeur visible du conteneur : le canvas reste fixé à cette largeur,
  // c'est un spacer interne qui porte la largeur réelle du contenu.
  const [viewportW, setViewportW] = useState(800);

  // ── Sélection / presse-papiers / vélocité ────────────────────────
  const [tool, setTool] = useState<'edit' | 'select'>('edit');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [marquee, setMarquee] = useState<{x0:number;y0:number;x1:number;y1:number}|null>(null);
  const marqueeRef = useRef<{x0:number;y0:number;x1:number;y1:number}|null>(null);
  const dragSelRef = useRef<{startPx:number; startPy:number; orig:PianoNote[]} | null>(null);
  const clipboardRef = useRef<PianoNote[] | null>(null);
  /** Position (en beats) où coller : dernier endroit cliqué dans le piano roll. */
  const pasteAnchorRef = useRef<number | null>(null);
  const [velValue, setVelValue] = useState(100);
  /** Note survolée (tooltip) : pitch + position écran du curseur. */
  const [hoverInfo, setHoverInfo] = useState<{ pitch: number; x: number; y: number } | null>(null);

  // ── Lecture locale de la piste (play/pause + curseur) ─────────────
  const [pianoPlaying, setPianoPlaying] = useState<'idle' | 'playing' | 'paused'>('idle');
  /** Position de lecture courante en beats (lue par draw). */
  const playPosRef = useRef(0);
  // ── Subdivision de la grille (snap) : 1/16 par défaut, 1/12 pour les triolets ──
  const [snapUnit, setSnapUnit] = useState(DEFAULT_SNAP_UNIT);

  // ── Historique undo/redo (snapshots des notes) ────────────────────
  const historyRef = useRef<{ undo: PianoNote[][]; redo: PianoNote[][] }>({ undo: [], redo: [] });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  /** État des notes au début du geste souris en cours (null si aucun geste). */
  const gestureBeforeRef = useRef<PianoNote[] | null>(null);
  /** Geste slider vélocité : état avant le geste + flag d'activité. */
  const velGestureRef = useRef<PianoNote[] | null>(null);
  const velGestureActiveRef = useRef(false);
  /** Position écran du mousedown (pour distinguer clic simple vs drag). */
  const downScreenRef = useRef<{ x: number; y: number } | null>(null);
  /** Vrai dès que le mouvement dépasse la deadzone (drag engagé). */
  const dragEngagedRef = useRef(false);

  // Recalculer la hauteur totale en fonction des touches visibles
  const totalPitchRange = userMaxPitch - userMinPitch;
  const totalHeight = totalPitchRange * WHITE_KEY_HEIGHT;
  const canvasHeight = Math.max(height, totalHeight + 40);

  // NOTE : le canvas fait la largeur du viewport (pas celle du contenu) pour
  // ne jamais dépasser la limite de taille des canvas navigateurs (~32767 px)
  // qui rendait l'affichage vide à fort zoom. Le spacer scrollable peut lui
  // être très large sans limite de layout.

  // Palette de couleurs selon le canal
  const channelColor = accentColor ?? (
    channel === 0 ? '#60a5fa'
    : channel === 2 ? '#fbbf24'
    : channel === 3 ? '#c084fc'
    : channel === 9 ? '#f87171'
    : '#34d399'
  );

  // ── Synchroniser localNotesRef ──────────────────────────────────────
  useEffect(() => {
    localNotesRef.current = notes;
  }, [notes]);

  // ── Dessin du canvas ────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const ppb = effectivePixelsPerBeat;
    const currentNotes = localNotesRef.current;
    const creating = creatingNote;

    // ── Fond ──
    ctx.fillStyle = '#1a1b26';
    ctx.fillRect(0, 0, w, h);

    // ── Grille temps (lignes verticales) ──
    const gridStartBeat = Math.max(0, Math.floor(scrollLeft / ppb));
    const gridEndBeat = Math.ceil((scrollLeft + w - PIANO_KEYBOARD_WIDTH) / ppb) + 1;

    ctx.strokeStyle = '#2a2b3e';
    ctx.lineWidth = 1;

    for (let beat = gridStartBeat; beat <= gridEndBeat; beat++) {
      const x = beat * ppb - scrollLeft + PIANO_KEYBOARD_WIDTH;
      if (x < PIANO_KEYBOARD_WIDTH || x > w) continue;

      const isMeasure = beat % 4 === 0;
      ctx.strokeStyle = isMeasure ? '#3a3b5e' : '#2a2b3e';
      ctx.lineWidth = isMeasure ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();

      // Numéros de mesure
      if (isMeasure) {
        const measure = beat / 4;
        ctx.fillStyle = '#4a4b6e';
        ctx.font = '9px monospace';
        ctx.fillText(`${measure + 1}`, x + 3, 12);
      }
    }

    // ── Subdivisions du snap (lignes fines, si l'espacement est lisible) ──
    const snapPx = snapUnit * ppb;
    if (snapUnit < 1 && snapPx >= 5) {
      const steps = Math.round(1 / snapUnit);
      ctx.strokeStyle = '#22223a';
      ctx.lineWidth = 0.5;
      for (let beat = gridStartBeat; beat <= gridEndBeat; beat++) {
        for (let k = 1; k < steps; k++) {
          const x = (beat + k * snapUnit) * ppb - scrollLeft + PIANO_KEYBOARD_WIDTH;
          if (x < PIANO_KEYBOARD_WIDTH || x > w) continue;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
      }
    }

    // ── Clavier de piano (gauche) ──
    for (let pitch = userMaxPitch; pitch >= userMinPitch; pitch--) {
      const y = (userMaxPitch - pitch) * WHITE_KEY_HEIGHT;
      const isBlack = isBlackKey(pitch);

      // Fond de la touche
      ctx.fillStyle = isBlack ? '#2d2d3f' : '#3a3a4e';
      ctx.fillRect(0, y, PIANO_KEYBOARD_WIDTH - 1, WHITE_KEY_HEIGHT);

      // Bordure
      ctx.strokeStyle = '#4a4a5e';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(0, y, PIANO_KEYBOARD_WIDTH - 1, WHITE_KEY_HEIGHT);

      // Étiquette pour les Do
      if (pitch % 12 === 0) {
        ctx.fillStyle = '#8a8aae';
        ctx.font = '8px monospace';
        const label = noteName(pitch) + (Math.floor(pitch / 12) - 1);
        ctx.fillText(label, 4, y + WHITE_KEY_HEIGHT - 3);
      }
    }

    // ── Rangées de notes (lignes horizontales) ──
    ctx.strokeStyle = '#222233';
    ctx.lineWidth = 0.5;
    for (let pitch = userMinPitch; pitch <= userMaxPitch; pitch++) {
      const y = (userMaxPitch - pitch) * WHITE_KEY_HEIGHT + WHITE_KEY_HEIGHT - 0.5;
      if (pitch % 12 === 0) {
        ctx.strokeStyle = '#333355';
        ctx.lineWidth = 1;
      } else {
        ctx.strokeStyle = '#222233';
        ctx.lineWidth = 0.5;
      }
      ctx.beginPath();
      ctx.moveTo(PIANO_KEYBOARD_WIDTH, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // ── Dessiner les notes ──
    const drawNote = (note: PianoNote, isCreating: boolean) => {
      const x = note.startTime * ppb - scrollLeft + PIANO_KEYBOARD_WIDTH;
      const y = (userMaxPitch - note.pitch) * WHITE_KEY_HEIGHT;
      const noteW = Math.max(3, note.duration * ppb);
      const noteH = WHITE_KEY_HEIGHT - 1;
      const isSel = selectedIds.has(note.id);

      // Ombre
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x + 1, y + 1, noteW, noteH);

      // Rectangle principal
      ctx.fillStyle = isCreating ? velocityColor(note.velocity) : velocityColor(note.velocity);
      ctx.fillRect(x, y, noteW, noteH);

      // Bordure (plus brillante si forte vélocité, jaune si sélectionnée)
      ctx.strokeStyle = isSel ? '#fbbf24' : (note.velocity > 100 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)');
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.strokeRect(x, y, noteW, noteH);

      // Hauteur de note si assez large
      if (noteW > 20) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '9px monospace';
        ctx.fillText(pitchLabel(note.pitch), x + 3, y + WHITE_KEY_HEIGHT - 4);
      }
    };

    for (const note of currentNotes) {
      drawNote(note, false);
    }
    if (creating) {
      drawNote(creating, true);
    }

    // ── Rectangle de sélection (marquee) ──
    if (marquee) {
      const mx = Math.min(marquee.x0, marquee.x1);
      const my = Math.min(marquee.y0, marquee.y1);
      const mw = Math.abs(marquee.x1 - marquee.x0);
      const mh = Math.abs(marquee.y1 - marquee.y0);
      ctx.fillStyle = 'rgba(251,191,36,0.10)';
      ctx.fillRect(mx, my, mw, mh);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1;
      ctx.strokeRect(mx, my, mw, mh);
    }

    // ── Curseur de lecture (ligne verticale + repère en haut) ──
    if (pianoPlaying !== 'idle' || playPosRef.current > 0) {
      const playX = playPosRef.current * ppb - scrollLeft + PIANO_KEYBOARD_WIDTH;
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, h);
      ctx.stroke();
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.moveTo(playX - 5, 0);
      ctx.lineTo(playX + 5, 0);
      ctx.lineTo(playX, 8);
      ctx.closePath();
      ctx.fill();
    }

  }, [notes, creatingNote, effectivePixelsPerBeat, scrollLeft, userMinPitch, userMaxPitch, channelColor, height, selectedIds, marquee, pianoPlaying, snapUnit]);

  // ── Re-draw à chaque changement ──
  useEffect(() => {
    draw();
  }, [draw]);

  // ── Redimensionnement du canvas ──
  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  // ── Largeur du viewport (canvas fixe + spacer scrollable) ──
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setViewportW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Redessiner quand la largeur visible change (taille du canvas)
  useEffect(() => {
    draw();
  }, [draw, viewportW]);

  // ── Gestion des événements souris ──

  /** Convertit un événement souris en coordonnées canvas. */
  const getCoord = (e: React.MouseEvent<HTMLCanvasElement>): MouseCoord => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      px: e.clientX - rect.left,
      py: e.clientY - rect.top,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coord = getCoord(e);

    // Ignorer les clics sur le clavier de piano (colonne gauche)
    if (coord.px < PIANO_KEYBOARD_WIDTH) return;

    // Ajuster les coordonnées pour le scroll
    const adjustedCoord: MouseCoord = {
      px: coord.px + scrollLeft - PIANO_KEYBOARD_WIDTH,
      py: coord.py,
    };

    // Ancre de collage : mémorise l'endroit cliqué (début de la note si clic
    // sur une note, sinon position snappée) → Ctrl+V colle à cet endroit.
    const hit = hitTest(localNotesRef.current, adjustedCoord, effectivePixelsPerBeat, userMaxPitch);
    pasteAnchorRef.current = hit
      ? hit.note.startTime
      : Math.max(0, snapToGrid(adjustedCoord.px / effectivePixelsPerBeat, snapUnit));

    // Capture de l'état avant le geste (pour l'undo, si le geste mute)
    gestureBeforeRef.current = snapshotNotes(localNotesRef.current);

    // Position écran du clic : permet de distinguer clic simple vs drag
    downScreenRef.current = { x: e.clientX, y: e.clientY };
    dragEngagedRef.current = false;

    // ── Mode sélection ──
    if (tool === 'select') {
      if (hit) {
        const id = hit.note.id;
        let next = selectedIds;
        if (e.shiftKey) {
          next = new Set(selectedIds);
          if (next.has(id)) next.delete(id); else next.add(id);
        } else if (!selectedIds.has(id)) {
          next = new Set([id]);
        }
        setSelectedIds(next);
        // Préparer le déplacement de la sélection entière
        dragSelRef.current = {
          startPx: adjustedCoord.px,
          startPy: adjustedCoord.py,
          orig: localNotesRef.current.filter(n => next.has(n.id)),
        };
      } else {
        if (!e.shiftKey) setSelectedIds(new Set());
        // Début d'un rectangle de sélection (marquee)
        const rect = { x0: coord.px, y0: coord.py, x1: coord.px, y1: coord.py };
        marqueeRef.current = rect;
        setMarquee(rect);
      }
      return;
    }

    // ── Mode édition : un clic sur une note existante la sélectionne ──
    if (hit) {
      setSelectedIds(new Set([hit.note.id]));
    } else {
      setSelectedIds(new Set());
    }

    const { ctx, createdNote } = startInteraction(
      ctxRef.current,
      localNotesRef.current,
      adjustedCoord,
      effectivePixelsPerBeat,
      userMaxPitch,
      snapUnit,
    );

    ctxRef.current = ctx;

    if (createdNote) {
      setCreatingNote(createdNote);
      // Audition immédiate de la note en cours de création
      onPreviewNote?.(createdNote.pitch);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coord = getCoord(e);

    // ── Tooltip : nom de la note sous le curseur (à côté du pointeur) ──
    if (coord.px >= PIANO_KEYBOARD_WIDTH) {
      const hAdj: MouseCoord = {
        px: coord.px + scrollLeft - PIANO_KEYBOARD_WIDTH,
        py: coord.py,
      };
      const h = hitTest(localNotesRef.current, hAdj, effectivePixelsPerBeat, userMaxPitch);
      setHoverInfo(h ? { pitch: h.note.pitch, x: e.clientX, y: e.clientY } : null);
    } else {
      setHoverInfo(null);
    }

    // ── Mode sélection : marquee / déplacement de sélection ──
    if (tool === 'select') {
      if (marqueeRef.current) {
        const rect = { ...marqueeRef.current, x1: coord.px, y1: coord.py };
        marqueeRef.current = rect;
        setMarquee(rect);
        const sel = notesInRect(localNotesRef.current, rect);
        setSelectedIds(new Set(sel.map(n => n.id)));
        return;
      }
      if (dragSelRef.current) {
        // Deadzone : pas de déplacement tant que le curseur n'a pas bougé
        const down = downScreenRef.current;
        if (down && !dragEngagedRef.current) {
          if (Math.hypot(e.clientX - down.x, e.clientY - down.y) >= CLICK_DEADZONE_PX) dragEngagedRef.current = true;
          else return;
        }
        const { startPx, startPy, orig } = dragSelRef.current;
        const dBeat = (coord.px + scrollLeft - PIANO_KEYBOARD_WIDTH - startPx) / effectivePixelsPerBeat;
        // Canvas : y décroît quand le pitch monte → delta inversé
        const dPitch = -Math.round((coord.py - startPy) / WHITE_KEY_HEIGHT);
        if (dBeat !== 0 || dPitch !== 0) {
          const ids = new Set(orig.map(n => n.id));
          // Toujours repartir des notes ORIGINALES + delta total (jamais
          // des notes déjà déplacées → évite l'accumulation géométrique)
          const moved = new Map(orig.map(n => [n.id, {
            ...n,
            edited: true,
            startTime: Math.max(0, Math.round((n.startTime + dBeat) / snapUnit) * snapUnit),
            pitch: Math.min(userMaxPitch, Math.max(userMinPitch, n.pitch + dPitch)),
          }]));
          localNotesRef.current = localNotesRef.current.map(n => moved.get(n.id) ?? n);
          draw();
        }
        return;
      }
      return;
    }

    if (ctxRef.current.state === 'IDLE') return;

    const adjustedCoord: MouseCoord = {
      px: coord.px + scrollLeft - PIANO_KEYBOARD_WIDTH,
      py: coord.py,
    };

    const ctx = ctxRef.current;

    if (ctx.state === 'CREATING') {
      // Ajuster la durée de la note en création
      const endTime = Math.max(0, adjustedCoord.px / effectivePixelsPerBeat);
      const snappedEnd = Math.max(snapUnit, snapToGrid(endTime, snapUnit));
      const startTime = ctx.startTime;
      const duration = Math.max(snapUnit, snappedEnd - startTime);

      if (creatingNote) {
        setCreatingNote({
          ...creatingNote,
          duration: Math.max(snapUnit, duration),
        });
      }
      return;
    }

    // Deadzone : un clic (même avec un léger tremblement) ne doit pas
    // déclencher de déplacement/redimensionnement involontaire
    const down = downScreenRef.current;
    if (down && !dragEngagedRef.current) {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) >= CLICK_DEADZONE_PX) dragEngagedRef.current = true;
      else return;
    }

    const result = updateInteraction(ctx, adjustedCoord, effectivePixelsPerBeat, userMaxPitch, snapUnit);
    if (result.note && ctx.targetId) {
      const updated = localNotesRef.current.map(n =>
        n.id === ctx.targetId ? { ...n, ...result.note } : n
      );
      localNotesRef.current = updated;
      draw();
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coord = getCoord(e);
    // Le drag était-il engagé ? (clic simple sinon). Refs nettoyées ici pour
    // couvrir tous les chemins de sortie.
    const dragEngaged = dragEngagedRef.current;
    dragEngagedRef.current = false;
    downScreenRef.current = null;

    // ── Mode sélection : finaliser marquee / déplacement ──
    if (tool === 'select') {
      if (marqueeRef.current) {
        const rect = marqueeRef.current;
        const sel = notesInRect(localNotesRef.current, rect);
        if (e.shiftKey) {
          setSelectedIds(prev => {
            const next = new Set(prev);
            for (const n of sel) next.add(n.id);
            return next;
          });
        } else {
          setSelectedIds(new Set(sel.map(n => n.id)));
        }
        marqueeRef.current = null;
        setMarquee(null);
      }
      if (dragSelRef.current) {
        dragSelRef.current = null;
        if (dragEngaged) {
          commitGesture();
          commitNotes(localNotesRef.current);
        } else {
          // Clic simple : rien n'a bougé, rien à historiser
          gestureBeforeRef.current = null;
        }
      }
      return;
    }

    const ctx = ctxRef.current;
    if (ctx.state === 'IDLE') return;

    const adjustedCoord: MouseCoord = {
      px: coord.px + scrollLeft - PIANO_KEYBOARD_WIDTH,
      py: coord.py,
    };

    if (ctx.state === 'CREATING') {
      // Finaliser la note créée
      if (creatingNote) {
        const endTime = Math.max(0, adjustedCoord.px / effectivePixelsPerBeat);
        const snappedEnd = Math.max(snapUnit, snapToGrid(endTime, snapUnit));
        const duration = Math.max(snapUnit, snappedEnd - creatingNote.startTime);
        const finalNote = { ...creatingNote, duration, edited: true };
        const newNotes = [...localNotesRef.current, finalNote];
        localNotesRef.current = newNotes;
        commitGesture();
        commitNotes(newNotes);
        setCreatingNote(null);
      }
    } else if (ctx.state === 'DRAGGING' || ctx.state === 'RESIZING') {
      const result = endInteraction(ctx, adjustedCoord, effectivePixelsPerBeat, userMaxPitch, snapUnit);
      ctxRef.current = result.ctx;

      if (!dragEngaged) {
        // Clic simple : pas de drag → on ne mute PAS la note (évite le
        // décalage de pitch dû au re-render et les entrées undo parasites).
        // La note joue quand même.
        gestureBeforeRef.current = null;
        const target = ctx.targetId
          ? localNotesRef.current.find(n => n.id === ctx.targetId)
          : undefined;
        if (target) onPreviewNote?.(target.pitch);
      } else if (result.note && ctx.targetId) {
        const updated = localNotesRef.current.map(n =>
          n.id === ctx.targetId ? { ...n, ...result.note, edited: true } : n
        );
        localNotesRef.current = updated;
        commitGesture();
        commitNotes(updated);
        // Audition de la note après déplacement/redimensionnement
        const p = result.note?.pitch;
        if (p !== undefined) onPreviewNote?.(p);
      }
      draw();
    }

    ctxRef.current = createEmptyContext();
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // En mode sélection, la suppression passe par Suppr/Couper
    if (tool === 'select') return;
    const coord = getCoord(e);
    if (coord.px < PIANO_KEYBOARD_WIDTH) return;

    const adjustedCoord: MouseCoord = {
      px: coord.px + scrollLeft - PIANO_KEYBOARD_WIDTH,
      py: coord.py,
    };

    const hit = hitTest(
      localNotesRef.current,
      adjustedCoord,
      effectivePixelsPerBeat,
      userMaxPitch,
    );

    if (hit) {
      pushHistory(localNotesRef.current);
      const newNotes = deleteNote(localNotesRef.current, hit.note.id);
      localNotesRef.current = newNotes;
      setSelectedIds(prev => {
        if (!prev.has(hit.note.id)) return prev;
        const next = new Set(prev);
        next.delete(hit.note.id);
        return next;
      });
      commitNotes(newNotes);
      draw();
    }
  };

  // ── Sélection : ref synchronisée (pour les raccourcis clavier) ──
  const selectedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  // ── Slider vélocité : reflète la 1re note sélectionnée ──
  useEffect(() => {
    const first = notes.find(n => selectedIds.has(n.id));
    if (first) setVelValue(first.velocity);
  }, [selectedIds, notes]);

  // Clôture du geste slider vélocité (pointer relâché n'importe où)
  useEffect(() => {
    const end = () => { velGestureActiveRef.current = false; velGestureRef.current = null; };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, []);

  /** Arrête la lecture locale (curseur remis à zéro). */
  const stopPlayback = useCallback(() => {
    if (pianoPlaying === 'idle' && playPosRef.current === 0) return;
    playPosRef.current = 0;
    setPianoPlaying('idle');
    engine?.stop();
    draw();
  }, [pianoPlaying, engine, draw]);

  /** Applique un changement de notes : la lecture s'arrête immédiatement
   * si elle est active (l'édition invalide le rendu en cours). */
  const commitNotes = useCallback((newNotes: PianoNote[]) => {
    if (pianoPlaying !== 'idle') stopPlayback();
    onNotesChange(newNotes);
  }, [pianoPlaying, stopPlayback, onNotesChange]);

  // ── Historique undo/redo ──────────────────────────────────────────
  const snapshotNotes = useCallback((list: PianoNote[]): PianoNote[] => list.map(n => ({ ...n })), []);
  const notesEqual = useCallback(
    (a: PianoNote[], b: PianoNote[]) => JSON.stringify(a) === JSON.stringify(b),
    [],
  );

  /** Pousse l'état `before` (copié) dans la pile undo ; invalide le redo. */
  const pushHistory = useCallback((before: PianoNote[]) => {
    const h = historyRef.current;
    h.undo.push(snapshotNotes(before));
    if (h.undo.length > MAX_HISTORY) h.undo.shift();
    h.redo = [];
    setCanUndo(true);
    setCanRedo(false);
  }, [snapshotNotes]);

  /** Restaure un état de notes (utilisé par undo/redo). */
  const restoreHistory = useCallback((target: PianoNote[]) => {
    localNotesRef.current = target;
    setSelectedIds(new Set());
    setCreatingNote(null);
    ctxRef.current = createEmptyContext();
    commitNotes(target);
    draw();
  }, [commitNotes, draw]);

  const undo = useCallback(() => {
    // Pas d'undo pendant un geste en cours (drag, marquee, slider)
    if (ctxRef.current.state !== 'IDLE' || dragSelRef.current || marqueeRef.current || velGestureActiveRef.current) return;
    const h = historyRef.current;
    const prev = h.undo.pop();
    if (!prev) return;
    h.redo.push(snapshotNotes(localNotesRef.current));
    setCanUndo(h.undo.length > 0);
    setCanRedo(true);
    restoreHistory(prev);
  }, [snapshotNotes, restoreHistory]);

  const redo = useCallback(() => {
    if (ctxRef.current.state !== 'IDLE' || dragSelRef.current || marqueeRef.current || velGestureActiveRef.current) return;
    const h = historyRef.current;
    const next = h.redo.pop();
    if (!next) return;
    h.undo.push(snapshotNotes(localNotesRef.current));
    setCanRedo(h.redo.length > 0);
    setCanUndo(true);
    restoreHistory(next);
  }, [snapshotNotes, restoreHistory]);

  /** Valide le geste souris en cours : push uniquement si l'état a changé. */
  const commitGesture = useCallback(() => {
    const before = gestureBeforeRef.current;
    gestureBeforeRef.current = null;
    if (before && !notesEqual(before, localNotesRef.current)) {
      pushHistory(before);
    }
  }, [notesEqual, pushHistory]);

  // ── Helpers : sélection, presse-papiers, vélocité ────────────────
  const notesInRect = (list: PianoNote[], rect: {x0:number;y0:number;x1:number;y1:number}) => {
    const left = Math.min(rect.x0, rect.x1), right = Math.max(rect.x0, rect.x1);
    const top = Math.min(rect.y0, rect.y1), bottom = Math.max(rect.y0, rect.y1);
    const ppb = effectivePixelsPerBeat;
    return list.filter(n => {
      const nx = n.startTime * ppb - scrollLeft + PIANO_KEYBOARD_WIDTH;
      const nw = Math.max(3, n.duration * ppb);
      const ny = (userMaxPitch - n.pitch) * WHITE_KEY_HEIGHT;
      const nh = WHITE_KEY_HEIGHT - 1;
      return nx < right && nx + nw > left && ny < bottom && ny + nh > top;
    });
  };

  const copySelection = () => {
    const sel = localNotesRef.current.filter(n => selectedIdsRef.current.has(n.id));
    if (sel.length === 0) return;
    const minStart = Math.min(...sel.map(n => n.startTime));
    // Copie avec positions relatives au début de la sélection
    clipboardRef.current = sel.map(n => ({ ...n, startTime: Math.round((n.startTime - minStart) * 1000) / 1000 }));
  };

  const deleteSelection = () => {
    const ids = selectedIdsRef.current;
    if (ids.size === 0) {
      // Mode édition : effacer la note ciblée par le contexte
      if (ctxRef.current.targetId) {
        pushHistory(localNotesRef.current);
        const newNotes = deleteNote(localNotesRef.current, ctxRef.current.targetId);
        localNotesRef.current = newNotes;
        commitNotes(newNotes);
        ctxRef.current = createEmptyContext();
        draw();
      }
      return;
    }
    pushHistory(localNotesRef.current);
    const newNotes = localNotesRef.current.filter(n => !ids.has(n.id));
    localNotesRef.current = newNotes;
    setSelectedIds(new Set());
    commitNotes(newNotes);
    draw();
  };

  const pasteClipboard = () => {
    const clip = clipboardRef.current;
    if (!clip || clip.length === 0) return;
    // Coller à l'endroit cliqué (ancre mémorisée), sinon début de la zone visible
    const base = pasteAnchorRef.current !== null
      ? pasteAnchorRef.current
      : Math.max(0, Math.round((scrollLeft / effectivePixelsPerBeat) / snapUnit) * snapUnit);
    const stamp = Date.now();
    const newNotes = clip.map((n, i) => ({
      ...n,
      id: `pasted-${stamp}-${i}`,
      startTime: base + n.startTime,
    }));
    pushHistory(localNotesRef.current);
    const merged = [...localNotesRef.current, ...newNotes];
    localNotesRef.current = merged;
    setSelectedIds(new Set(newNotes.map(n => n.id)));
    commitNotes(merged);
    draw();
  };

  const applyVelocity = (v: number) => {
    const ids = selectedIdsRef.current;
    if (ids.size === 0) return;
    // Undo : une seule entrée par geste du slider (sinon une par tick)
    if (velGestureRef.current) {
      pushHistory(velGestureRef.current);
      velGestureRef.current = null;
    } else if (!velGestureActiveRef.current) {
      // Flèches clavier sur le slider : chaque pression = une entrée
      pushHistory(localNotesRef.current);
    }
    const updated = localNotesRef.current.map(n => ids.has(n.id) ? { ...n, velocity: v, edited: true } : n);
    localNotesRef.current = updated;
    setVelValue(v);
    commitNotes(updated);
    draw();
  };

  /** Quantisation : aligne les notes (début ET fin) sur la grille du snap
   * courant. Portée : sélection si présente, sinon toutes les notes. */
  const quantizeNotes = () => {
    const ids = selectedIdsRef.current;
    const scope = ids.size > 0
      ? new Set(ids)
      : new Set(localNotesRef.current.map(n => n.id));
    if (scope.size === 0) return;
    let changed = false;
    const updated = localNotesRef.current.map(n => {
      if (!scope.has(n.id)) return n;
      const start = snapToGrid(n.startTime, snapUnit);
      const end = snapToGrid(n.startTime + n.duration, snapUnit);
      const duration = Math.max(snapUnit, end - start);
      if (start === n.startTime && duration === n.duration) return n;
      changed = true;
      return { ...n, startTime: start, duration, edited: true };
    });
    if (!changed) return;
    pushHistory(localNotesRef.current);
    localNotesRef.current = updated;
    commitNotes(updated);
    draw();
  };

  // ── Gestion du scroll horizontal ──
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.shiftKey) {
      // Scroll horizontal avec Shift+molette
      e.preventDefault();
      setScrollLeft(prev => Math.max(0, prev + e.deltaY));
    } else if (e.ctrlKey || e.metaKey) {
      // Zoom avec Ctrl+molette
      e.preventDefault();
      setZoom(prev => Math.max(0.25, Math.min(4, prev - e.deltaY * 0.001)));
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft((e.target as HTMLDivElement).scrollLeft);
  };

  // ── Lecture locale de la piste : play/pause + curseur ────────────

  /** Bascule lecture / pause / reprise de la piste ouverte. */
  const togglePlay = useCallback(async () => {
    if (!engine) return;
    if (pianoPlaying === 'playing') {
      await engine.pausePianoRoll();
      setPianoPlaying('paused');
    } else if (pianoPlaying === 'paused') {
      await engine.resumePianoRoll();
      setPianoPlaying('playing');
    } else {
      const chNotes = localNotesRef.current;
      if (chNotes.length === 0) return;
      playPosRef.current = 0;
      setPianoPlaying('playing');
      try {
        await engine.playPianoRollChannel(channel, chNotes, tempo);
      } catch (e) {
        console.error('❌ Lecture PianoRoll:', e);
        setPianoPlaying('idle');
      }
    }
  }, [engine, pianoPlaying, channel, tempo]);

  // Boucle du curseur : position audio → beats → draw + auto-scroll
  useEffect(() => {
    if (pianoPlaying !== 'playing' || !engine) return;
    let lastBeats = -1;
    const tick = () => {
      const dur = engine.getPianoRollDuration();
      const raw = engine.getPianoRollPositionRaw();
      // Pas encore prêt (render-wav en cours) → curseur à 0
      if (dur <= 0 || raw < 0) {
        playPosRef.current = 0;
        return;
      }
      // Position atteinte la durée du buffer → fin de lecture propre
      if (raw >= dur - 0.05) {
        stopPlayback();
        return;
      }
      const beats = (raw * tempo) / 60;
      playPosRef.current = beats;
      if (Math.abs(beats - lastBeats) > 0.0005) {
        lastBeats = beats;
        draw();
        // Auto-scroll : suivre le curseur quand il sort à droite
        const el = containerRef.current;
        if (el) {
          const x = beats * effectivePixelsPerBeat - el.scrollLeft + PIANO_KEYBOARD_WIDTH;
          const margin = 80;
          if (x > el.clientWidth - margin) {
            el.scrollLeft += x - (el.clientWidth - margin);
          }
        }
      }
    };
    const id = setInterval(tick, 40);
    return () => clearInterval(id);
  }, [pianoPlaying, engine, tempo, effectivePixelsPerBeat, draw, stopPlayback]);

  // Arrêt automatique de la lecture dès qu'une note est modifiée (édition)
  useEffect(() => {
    if (pianoPlaying !== 'idle') stopPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  // ── Raccourcis clavier : sélection, copier/couper/coller, effacer ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
      else if (mod && k === 'y') { e.preventDefault(); redo(); }
      else if (mod && k === 'z') { e.preventDefault(); undo(); }
      else if (mod && k === 'c') { copySelection(); }
      else if (mod && k === 'x') { copySelection(); deleteSelection(); }
      else if (mod && k === 'v') { pasteClipboard(); }
      else if (mod && k === 'a') {
        e.preventDefault();
        setSelectedIds(new Set(localNotesRef.current.map(n => n.id)));
      }
      else if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelection(); }
      else if (e.key === ' ') {
        // Ne pas doubler le clic quand un bouton / input a le focus
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT')) return;
        e.preventDefault();
        togglePlay();
      }
      else if (e.key === 'Escape') { stopPlayback(); onClose(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitNotes, draw, onClose, scrollLeft, effectivePixelsPerBeat, undo, redo, togglePlay, stopPlayback]);

  // Nom de la première note sélectionnée (affiché dans la barre d'outils)
  const firstSelected = notes.find(n => selectedIds.has(n.id));

  // ── Barre d'outils ──
  const totalBeats = Math.max(
    16, // minimum 4 mesures
    ...notes.map(n => n.startTime + n.duration),
  );
  const contentWidth = totalBeats * effectivePixelsPerBeat + 200;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl flex flex-col max-w-[95vw] max-h-[90vh] w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-white">🎹 {trackLabel}</span>
            <span
              className="px-2 py-0.5 rounded text-[10px] font-mono"
              style={{
                backgroundColor: channelColor + '22',
                color: channelColor,
                border: `1px solid ${channelColor}44`,
              }}
            >
              Canal {channel} · {notes.length} notes
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Zoom controls */}
            <button
              onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}
              className="px-2 py-1 text-xs bg-gray-800 text-gray-400 rounded border border-gray-700 hover:bg-gray-700"
              title="Zoom arrière"
            >
              −
            </button>
            <span className="text-[10px] text-gray-500 w-8 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(4, z + 0.25))}
              className="px-2 py-1 text-xs bg-gray-800 text-gray-400 rounded border border-gray-700 hover:bg-gray-700"
              title="Zoom avant"
            >
              +
            </button>
            <button
              onClick={() => { stopPlayback(); onClose(); }}
              className="px-3 py-1.5 text-xs bg-gray-800 text-gray-400 rounded-lg border border-gray-700 hover:text-white hover:border-gray-500 transition-colors"
            >
              ✕ Fermer
            </button>
          </div>
        </div>

        {/* Barre d'outils : outils, vélocité, presse-papiers, raccourcis */}
        <div className="px-4 py-1.5 bg-gray-850 border-b border-gray-800 flex flex-wrap items-center gap-3 text-[10px] text-gray-500 shrink-0">
          {/* Outils */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTool('edit')}
              className={`px-2 py-1 rounded border transition-colors ${tool === 'edit' ? 'bg-gray-700 text-yellow-400 border-yellow-600/50' : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'}`}
              title="Mode édition : créer / déplacer / redimensionner"
            >
              {'\u270f'} Édition
            </button>
            <button
              onClick={() => setTool('select')}
              className={`px-2 py-1 rounded border transition-colors ${tool === 'select' ? 'bg-gray-700 text-yellow-400 border-yellow-600/50' : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'}`}
              title="Mode sélection : clic = sélection, drag vide = plage, drag note = déplacer la sélection"
            >
              {'\ud83d\uddb1'} Sélection
            </button>
          </div>

          {/* Vélocité de la sélection (toujours visible → layout stable :
              le canvas ne bouge pas quand une sélection apparaît) */}
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">Vel:</span>
            <input
              type="range" min={1} max={127} value={velValue}
              onChange={(e) => applyVelocity(parseInt(e.target.value))}
              onPointerDown={() => {
                velGestureActiveRef.current = true;
                velGestureRef.current = snapshotNotes(localNotesRef.current);
              }}
              disabled={selectedIds.size === 0}
              className="w-24 accent-amber-400 disabled:opacity-30"
              title="Vélocité des notes sélectionnées"
            />
            <span className="text-gray-300 w-6">{velValue}</span>
            <span className="text-gray-600">({selectedIds.size} note{selectedIds.size > 1 ? 's' : ''})</span>
          </div>

          {/* Presse-papiers */}
          <div className="flex items-center gap-1">
            <span
              className="text-yellow-300 font-mono min-w-[4.5rem] text-center"
              title={firstSelected ? `Note sélectionnée : ${pitchLabel(firstSelected.pitch)}` : undefined}
            >
              {firstSelected ? `🎵 ${pitchLabel(firstSelected.pitch)}` : ''}
            </span>
            <button onClick={copySelection} disabled={selectedIds.size === 0}
              className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700 hover:text-white disabled:opacity-30 transition-colors"
              title="Copier (Ctrl+C)">{'\ud83d\udccb'} Copier</button>
            <button onClick={() => { copySelection(); deleteSelection(); }} disabled={selectedIds.size === 0}
              className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700 hover:text-white disabled:opacity-30 transition-colors"
              title="Couper (Ctrl+X)">{'\u2702'} Couper</button>
            <button onClick={pasteClipboard} disabled={!clipboardRef.current}
              className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700 hover:text-white disabled:opacity-30 transition-colors"
              title="Coller (Ctrl+V)">{'\ud83d\udccc'} Coller</button>
          </div>

          {/* Lecture locale de la piste */}
          <div className="flex items-center gap-1">
            <button
              onClick={togglePlay}
              disabled={!engine || (pianoPlaying === 'idle' && notes.length === 0)}
              className="px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700 hover:text-white disabled:opacity-30 transition-colors"
              title={
                pianoPlaying === 'playing' ? 'Pause (Espace)'
                : pianoPlaying === 'paused' ? 'Reprendre (Espace)'
                : 'Lecture de la piste (Espace)'
              }
            >
              {pianoPlaying === 'playing' ? '⏸ Pause' : pianoPlaying === 'paused' ? '▶ Reprendre' : '▶ Lecture'}
            </button>
          </div>

          {/* Subdivision de la grille (snap) */}
          <div className="flex items-center gap-1">
            <span className="text-gray-400">Snap:</span>
            <select
              value={snapUnit}
              onChange={(e) => setSnapUnit(parseFloat(e.target.value))}
              className="bg-gray-800 text-gray-300 text-[10px] rounded border border-gray-700 px-1 py-0.5"
              title="Subdivision de la grille — 1/12 = triolets de croches, 1/6 = triolets de noires, 1/3 = triolets binaires, 1/24/1/18 = sextolets"
            >
              {SNAP_UNITS.map(u => (
                <option key={u} value={u}>1/{Math.round(1 / u)}</option>
              ))}
            </select>
            <button
              onClick={quantizeNotes}
              disabled={notes.length === 0}
              className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700 hover:text-white disabled:opacity-30 transition-colors"
              title="Quantiser : aligne les notes sélectionnées (ou toutes) sur la grille du snap courant"
            >
              🎯 Quantiser
            </button>
          </div>

          {/* Historique */}
          <div className="flex items-center gap-1">
            <button onClick={undo} disabled={!canUndo}
              className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700 hover:text-white disabled:opacity-30 transition-colors"
              title="Annuler (Ctrl+Z)">{'\u21a9'} Annuler</button>
            <button onClick={redo} disabled={!canRedo}
              className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700 hover:text-white disabled:opacity-30 transition-colors"
              title="Rétablir (Ctrl+Shift+Z / Ctrl+Y)">{'\u21aa'} Rétablir</button>
          </div>

          {/* Raccourcis contextuels */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 ml-auto">
            {tool === 'edit' ? (
              <>
                <span>{'\ud83d\uddb1'} Clic vide → créer</span>
                <span>↕ Drag → déplacer</span>
                <span>↔ Bord droit → taille</span>
                <span>{'\ud83d\udd04'} Double-clic → suppr.</span>
              </>
            ) : (
              <>
                <span>{'\ud83d\uddb1'} Clic → sélectionner</span>
                <span>⬒ Drag vide → plage</span>
                <span>↕ Drag note → déplacer la sélection</span>
                <span>⇧ Clic → ajouter/retirer</span>
              </>
            )}
            <span>⌨ Ctrl+Z/Y, Ctrl+C/X/V, Ctrl+A, Suppr</span>
            <span>{'\ud83d\udd0d'} Ctrl+molette → zoom</span>
          </div>
        </div>

        {/* Canvas container (scrollable) : le canvas reste fixé à la largeur
            visible (évite la limite de taille des canvas navigateurs à fort
            zoom) ; un spacer interne porte la largeur réelle du contenu. */}
        <div
          ref={containerRef}
          className="overflow-auto flex-1"
          style={{ maxHeight: 'calc(90vh - 100px)' }}
          onWheel={handleWheel}
          onScroll={handleScroll}
        >
          <div
            className="relative"
            style={{
              width: Math.max(contentWidth + PIANO_KEYBOARD_WIDTH, viewportW),
              height: canvasHeight,
            }}
          >
            <canvas
              ref={canvasRef}
              className="block cursor-crosshair sticky left-0 top-0"
              style={{
                width: viewportW,
                height: canvasHeight,
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={(e) => { handleMouseUp(e); setHoverInfo(null); }}
              onDoubleClick={handleDoubleClick}
            />
          </div>
        </div>

        {/* Tooltip : nom de la note survolée, à côté du curseur */}
        {hoverInfo && (
          <div
            className="fixed z-[60] pointer-events-none bg-gray-800 border border-gray-600 text-yellow-300 text-[11px] font-mono px-2 py-1 rounded shadow-lg"
            style={{ left: hoverInfo.x + 14, top: hoverInfo.y + 16 }}
          >
            🎵 {pitchLabel(hoverInfo.pitch)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helper : snapToGrid (importable localement) ────────────────────────

function snapToGrid(time: number, unit: number = SNAP_UNIT): number {
  return Math.round(time / unit) * unit;
}
