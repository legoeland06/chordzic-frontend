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
 *
 * Architecture data-driven : pas d'éléments DOM pour chaque note,
 * tout est dessiné sur un canvas avec rendu optimisé.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  PianoNote,
  DEFAULT_PIXELS_PER_BEAT,
  SNAP_UNIT,
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

  // Recalculer la hauteur totale en fonction des touches visibles
  const totalPitchRange = userMaxPitch - userMinPitch;
  const totalHeight = totalPitchRange * WHITE_KEY_HEIGHT;
  const canvasHeight = Math.max(height, totalHeight + 40);

  // Durée totale visible (en beats) pour les lignes de la grille
  const visibleBeats = (canvasRef.current?.width ?? 800 - PIANO_KEYBOARD_WIDTH) / effectivePixelsPerBeat;

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

      // Ombre
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x + 1, y + 1, noteW, noteH);

      // Rectangle principal
      ctx.fillStyle = isCreating ? velocityColor(note.velocity) : velocityColor(note.velocity);
      ctx.fillRect(x, y, noteW, noteH);

      // Bordure (plus brillante si forte vélocité)
      ctx.strokeStyle = note.velocity > 100 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
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

  }, [notes, creatingNote, effectivePixelsPerBeat, scrollLeft, userMinPitch, userMaxPitch, channelColor, height]);

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

    const { ctx, createdNote } = startInteraction(
      ctxRef.current,
      localNotesRef.current,
      adjustedCoord,
      effectivePixelsPerBeat,
      userMaxPitch,
    );

    ctxRef.current = ctx;

    if (createdNote) {
      setCreatingNote(createdNote);
      // Audition immédiate de la note en cours de création
      onPreviewNote?.(createdNote.pitch);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (ctxRef.current.state === 'IDLE') return;

    const coord = getCoord(e);
    const adjustedCoord: MouseCoord = {
      px: coord.px + scrollLeft - PIANO_KEYBOARD_WIDTH,
      py: coord.py,
    };

    const ctx = ctxRef.current;

    if (ctx.state === 'CREATING') {
      // Ajuster la durée de la note en création
      const endTime = Math.max(0, adjustedCoord.px / effectivePixelsPerBeat);
      const snappedEnd = Math.max(SNAP_UNIT, snapToGrid(endTime));
      const startTime = ctx.startTime;
      const duration = Math.max(SNAP_UNIT, snappedEnd - startTime);

      if (creatingNote) {
        setCreatingNote({
          ...creatingNote,
          duration: Math.max(SNAP_UNIT, duration),
        });
      }
      return;
    }

    const result = updateInteraction(ctx, adjustedCoord, effectivePixelsPerBeat, userMaxPitch);
    if (result.note && ctx.targetId) {
      const updated = localNotesRef.current.map(n =>
        n.id === ctx.targetId ? { ...n, ...result.note } : n
      );
      localNotesRef.current = updated;
      draw();
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const ctx = ctxRef.current;
    if (ctx.state === 'IDLE') return;

    const coord = getCoord(e);
    const adjustedCoord: MouseCoord = {
      px: coord.px + scrollLeft - PIANO_KEYBOARD_WIDTH,
      py: coord.py,
    };

    if (ctx.state === 'CREATING') {
      // Finaliser la note créée
      if (creatingNote) {
        const endTime = Math.max(0, adjustedCoord.px / effectivePixelsPerBeat);
        const snappedEnd = Math.max(SNAP_UNIT, snapToGrid(endTime));
        const duration = Math.max(SNAP_UNIT, snappedEnd - creatingNote.startTime);
        const finalNote = { ...creatingNote, duration };
        const newNotes = [...localNotesRef.current, finalNote];
        localNotesRef.current = newNotes;
        onNotesChange(newNotes);
        setCreatingNote(null);
      }
    } else if (ctx.state === 'DRAGGING' || ctx.state === 'RESIZING') {
      const result = endInteraction(ctx, adjustedCoord, effectivePixelsPerBeat, userMaxPitch);
      ctxRef.current = result.ctx;

      if (result.note && ctx.targetId) {
        const updated = localNotesRef.current.map(n =>
          n.id === ctx.targetId ? { ...n, ...result.note } : n
        );
        localNotesRef.current = updated;
        onNotesChange(updated);
        // Audition de la note après déplacement/redimensionnement
        const p = result.note?.pitch;
        if (p !== undefined) onPreviewNote?.(p);
      }
      draw();
    }

    ctxRef.current = createEmptyContext();
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
      const newNotes = deleteNote(localNotesRef.current, hit.note.id);
      localNotesRef.current = newNotes;
      onNotesChange(newNotes);
      draw();
    }
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

  // ── Touche Suppr pour effacer ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Chercher une note sélectionnée (targetId dans le contexte)
        if (ctxRef.current.targetId) {
          const newNotes = deleteNote(localNotesRef.current, ctxRef.current.targetId);
          localNotesRef.current = newNotes;
          onNotesChange(newNotes);
          draw();
          ctxRef.current = createEmptyContext();
        }
      }
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNotesChange, draw, onClose]);

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
              onClick={onClose}
              className="px-3 py-1.5 text-xs bg-gray-800 text-gray-400 rounded-lg border border-gray-700 hover:text-white hover:border-gray-500 transition-colors"
            >
              ✕ Fermer
            </button>
          </div>
        </div>

        {/* Légende des contrôles */}
        <div className="px-4 py-1 bg-gray-850 border-b border-gray-800 flex gap-4 text-[10px] text-gray-600 shrink-0">
          <span>🖱 Clic vide → créer note</span>
          <span>↕ Drag centre → déplacer</span>
          <span>↔ Drag bord droit → redimensionner</span>
          <span>🔄 Double-clic → supprimer</span>
          <span>⌨ Suppr → effacer</span>
          <span>🔍 Ctrl+molette → zoom</span>
        </div>

        {/* Canvas container (scrollable) */}
        <div
          ref={containerRef}
          className="overflow-auto flex-1"
          style={{ maxHeight: 'calc(90vh - 100px)' }}
          onWheel={handleWheel}
          onScroll={handleScroll}
        >
          <canvas
            ref={canvasRef}
            className="block cursor-crosshair"
            style={{
              width: Math.max(800, contentWidth + PIANO_KEYBOARD_WIDTH),
              height: canvasHeight,
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Helper : snapToGrid (importable localement) ────────────────────────

function snapToGrid(time: number, unit: number = SNAP_UNIT): number {
  return Math.round(time / unit) * unit;
}
