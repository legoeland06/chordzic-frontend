/**
 * 🎹 PianoLivePanel — panneau commun des deux modes (Live et Navig).
 *
 * Il embarque le piano Live (LivePiano), la reconnaissance d'accords en
 * temps réel (poll /live-input, le Roland) et l'insertion :
 * - mode `live`  → l'accord reconnu s'insère dans la GRILLE (1 ronde) ;
 * - mode `navig` → l'accord reconnu s'insère en NOTES dans le piano roll
 *   de la piste sélectionnée en amont (celle dont la lane est agrandie),
 *   converti par `chordToPianoNotes`.
 *
 * Illumination du piano :
 * - mode `live`  : les touches tenues sur le Roland s'illument ;
 * - mode `navig` : les touches s'illument au contenu de la piste jouée
 *   (trackPitches, quel que soit le mode de lecture wav/midi) — activable /
 *   désactivable par l'utilisateur (toggle ✨).
 *
 * Insertion : clic sur l'accord (ou « + Grille » / « ➕ Piste ») immédiat,
 * ou ⏱ timer indépendant — un accord identifié tenu ≥ 3 s (réglable) est
 * inséré automatiquement (les deux mains sont occupées à jouer).
 */
import React, { useEffect, useRef, useState } from 'react';
import { recognizeChord, RecognizedChord } from '../lib/chordRecognition';
import { computeAutoInsert, initialAutoInsertState } from '../lib/autoInsert';
import { NOTE_NAMES } from '../types/chord';
import LivePiano from './LivePiano';

const API_BASE = 'http://localhost:4000';
const POLL_MS = 150;
const AUTO_INSERT_DELAYS = [1, 2, 3, 5];

interface PianoLivePanelProps {
  /** live : insertion grille · navig : insertion notes dans la piste. */
  mode: 'live' | 'navig';
  /** Insère l'accord reconnu + les pitchs joués (ordre d'appui, cf.
   * /live-input) — chaque mode convertit à sa façon. */
  onInsert: (chord: RecognizedChord, pitches: number[]) => void;
  /** Navig : nom de la piste cible (null = aucune sélectionnée). */
  targetTrackLabel?: string | null;
  /** Navig : pitchs actifs de la piste jouée à la position courante. */
  trackPitches?: number[];
  /** Navig : illumination de la piste activée ? */
  illuminationEnabled?: boolean;
  /** Navig : bascule l'illumination piste. */
  onToggleIllumination?: () => void;
}

/** Vrai si deux listes de pitchs sont identiques (évite les re-renders). */
function samePitches(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export default function PianoLivePanel({
  mode,
  onInsert,
  targetTrackLabel = null,
  trackPitches = [],
  illuminationEnabled = true,
  onToggleIllumination,
}: PianoLivePanelProps) {
  const [device, setDevice] = useState<string | null>(null);
  const [detected, setDetected] = useState<RecognizedChord | null>(null);
  const [active, setActive] = useState<number[]>([]);
  const [delayS, setDelayS] = useState(3);
  const [justInserted, setJustInserted] = useState(false);

  // État du timer d'insertion automatique (persisté entre les ticks).
  const timerRef = useRef(initialAutoInsertState());
  const flashRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/live-input`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (cancelled) return;
        setDevice(j.device ?? null);
        const pitches = Array.isArray(j.active) ? (j.active as number[]) : [];
        setActive(prev => (samePitches(prev, pitches) ? prev : pitches));
        const r = recognizeChord(pitches);
        setDetected(r);

        // ── Timer d'insertion automatique (mode live : grille ; navig :
        //    piste sélectionnée — pas d'insertion sans piste cible) ──
        const noTrack = mode === 'navig' && !targetTrackLabel;
        const insertable = (r?.insertable ?? false) && !noTrack;
        const key = r ? `${r.label}|${r.classes.join(',')}` : null;
        const verdict = computeAutoInsert(
          timerRef.current, Date.now(), delayS * 1000, key, insertable,
        );
        timerRef.current = verdict.next;
        if (verdict.shouldInsert && r) {
          onInsert(r, pitches);
          setJustInserted(true);
          if (flashRef.current) clearTimeout(flashRef.current);
          flashRef.current = setTimeout(() => setJustInserted(false), 1200);
        }
      } catch {
        if (!cancelled) {
          setDevice(null);
          setDetected(null);
        }
      }
    };

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      if (flashRef.current) clearTimeout(flashRef.current);
    };
  }, [delayS, onInsert, mode, targetTrackLabel]);

  const canInsert = detected !== null && detected.insertable;
  const noKeyboard = device === null;
  const noTrack = mode === 'navig' && !targetTrackLabel;
  const insertDisabled = !canInsert || noTrack;

  // Illumination : Live = Roland tenu · Navig = Roland tenu (comme Live)
  // + piste jouée (toggle ✨, préférence de l'utilisateur).
  const pianoPitches = mode === 'live'
    ? active
    : [...new Set([...active, ...(illuminationEnabled ? trackPitches : [])])];

  const cycleDelay = () => {
    setDelayS(prev => {
      const i = AUTO_INSERT_DELAYS.indexOf(prev);
      return AUTO_INSERT_DELAYS[(i + 1) % AUTO_INSERT_DELAYS.length];
    });
  };

  const noteNames = detected && detected.classes.length > 0
    ? detected.classes.map(c => NOTE_NAMES[c]).join(' · ')
    : '';

  const handleInsert = () => {
    if (insertDisabled || !detected) return;
    onInsert(detected, active);
    setJustInserted(true);
    if (flashRef.current) clearTimeout(flashRef.current);
    flashRef.current = setTimeout(() => setJustInserted(false), 1200);
  };

  const insertTitle = noKeyboard
    ? 'Aucun clavier MIDI détecté'
    : noTrack
      ? 'Sélectionne d’abord une piste (clic sur son nom pour l’agrandir)'
      : detected === null
        ? 'En attente de notes…'
        : canInsert
          ? mode === 'live'
            ? 'Clique pour insérer l’accord dans la grille (1 ronde)'
            : 'Clique pour insérer l’accord en notes dans la piste sélectionnée'
          : 'Accord non identifié (notes seules)';

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-2 sm:p-3">
      {/* ── Bandeau : badge + gros accord détecté + actions ── */}
      <div className="flex items-center gap-3">
        <span className="text-lg select-none" title="Reconnaissance d'accords (clavier MIDI)">
          🎹
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 truncate flex items-center gap-2">
            Accord détecté
            {noKeyboard
              ? ' · clavier non détecté'
              : ` · ${device}`}
            {mode === 'navig' && (
              <span className="text-amber-400/80 normal-case font-bold truncate">
                → {targetTrackLabel ?? 'aucune piste sélectionnée'}
              </span>
            )}
            {justInserted && <span className="text-green-400 normal-case font-bold">✓ inséré</span>}
          </div>
          <button
            onClick={handleInsert}
            disabled={insertDisabled}
            title={insertTitle}
            className={`text-5xl sm:text-6xl font-bold font-mono leading-none transition-colors ${
              !insertDisabled
                ? 'text-green-300 hover:text-green-200 cursor-pointer'
                : 'text-gray-600 cursor-default'
            }`}
          >
            {detected ? detected.label : '—'}
          </button>
          {/* Notes plaquées en clair, bien visibles */}
          <div className={`text-2xl sm:text-3xl font-mono leading-tight mt-1 ${noteNames ? 'text-cyan-300' : 'text-gray-700'}`}>
            {noteNames || '· · ·'}
          </div>
        </div>

        {/* Mode Navig : bascule de l'illumination de la piste jouée */}
        {mode === 'navig' && onToggleIllumination && (
          <button
            onClick={onToggleIllumination}
            className={`shrink-0 text-[10px] px-1.5 py-1 rounded-md border transition-colors ${
              illuminationEnabled
                ? 'bg-sky-900/40 border-sky-700/50 text-sky-300'
                : 'bg-gray-800 border-gray-700 text-gray-500'
            }`}
            title={illuminationEnabled
              ? 'Illumination de la piste jouée : ACTIVE (désactiver)'
              : 'Illumination de la piste jouée : désactivée (activer)'}
          >
            ✨ Piste {illuminationEnabled ? 'ON' : 'OFF'}
          </button>
        )}

        {/* Timer d'insertion automatique (délai réglable) */}
        <button
          onClick={cycleDelay}
          className="shrink-0 text-[10px] px-1.5 py-1 rounded-md bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
          title={`Insertion automatique après ${delayS} s d'appui prolongé (clique pour changer)`}
        >
          ⏱ {delayS}s
        </button>

        {canInsert && (
          <button
            onClick={handleInsert}
            disabled={noTrack}
            className={`shrink-0 text-xs px-2 py-1 rounded-md border transition-colors ${
              noTrack
                ? 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed'
                : 'bg-green-900/40 border-green-700/40 text-green-300 hover:bg-green-800/40'
            }`}
            title={noTrack ? 'Sélectionne d’abord une piste' : mode === 'live' ? "Insérer l'accord dans la grille (1 ronde)" : "Insérer l'accord en notes dans la piste sélectionnée"}
          >
            {mode === 'live' ? '+ Grille' : '➕ Piste'}
          </button>
        )}
      </div>

      {/* ── Piano : touches tenues (Live) ou piste jouée (Navig) ── */}
      <div className="overflow-x-auto mt-2 pt-2 border-t border-gray-800">
        <LivePiano activePitches={pianoPitches} />
      </div>
    </div>
  );
}
