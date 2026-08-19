/**
 * 🎹 ChordDetector — reconnaissance d'accords en mode Live.
 *
 * Interroge le serveur (GET /live-input, toutes les 150 ms) qui relaie les
 * notes tenues sur le clavier MIDI (Roland), puis reconnaît l'accord plaqué
 * avec l'harmonie intégrée (chordRecognition → QUALITY_INTERVALS).
 *
 * Affichage :
 * - piano aligné sur le clavier MIDI (LivePiano, A0 → C8) dont les touches
 *   s'illument en direct ;
 * - l'accord détecté et ses notes en grand, bien visibles ;
 * - insertion dans la grille : clic sur l'accord ou « + Grille » → immédiat ;
 * - ⏱ timer indépendant : un accord identifié tenu ≥ 3 s (réglable) est
 *   inséré automatiquement (les deux mains sont occupées à jouer).
 */
import React, { useEffect, useRef, useState } from 'react';
import { recognizeChord, RecognizedChord } from '../lib/chordRecognition';
import { computeAutoInsert, initialAutoInsertState } from '../lib/autoInsert';
import { NOTE_NAMES } from '../types/chord';
import LivePiano from './LivePiano';

const API_BASE = 'http://localhost:4000';
const POLL_MS = 150;
const AUTO_INSERT_DELAYS = [1, 2, 3, 5];

interface Props {
  onInsert: (label: string) => void;
}

/** Vrai si deux listes de pitchs sont identiques (évite les re-renders). */
function samePitches(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export default function ChordDetector({ onInsert }: Props) {
  const [device, setDevice] = useState<string | null>(null);
  const [detected, setDetected] = useState<RecognizedChord | null>(null);
  const [active, setActive] = useState<number[]>([]);
  const [delayS, setDelayS] = useState(3);
  const [justInserted, setJustInserted] = useState(false);

  // État du timer d'insertion automatique (persisté entre les ticks).
  const timerRef = useRef(initialAutoInsertState());

  useEffect(() => {
    let cancelled = false;
    let flash: ReturnType<typeof setTimeout> | undefined;

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

        // ── Timer d'insertion automatique ──
        const key = r ? `${r.label}|${r.classes.join(',')}` : null;
        const verdict = computeAutoInsert(
          timerRef.current, Date.now(), delayS * 1000, key, r?.insertable ?? false,
        );
        timerRef.current = verdict.next;
        if (verdict.shouldInsert) {
          onInsert(r!.label);
          setJustInserted(true);
          if (flash) clearTimeout(flash);
          flash = setTimeout(() => setJustInserted(false), 1200);
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
      if (flash) clearTimeout(flash);
    };
  }, [delayS, onInsert]);

  const canInsert = detected !== null && detected.insertable;
  const noKeyboard = device === null;

  const cycleDelay = () => {
    setDelayS(prev => {
      const i = AUTO_INSERT_DELAYS.indexOf(prev);
      return AUTO_INSERT_DELAYS[(i + 1) % AUTO_INSERT_DELAYS.length];
    });
  };

  const noteNames = detected && detected.classes.length > 0
    ? detected.classes.map(c => NOTE_NAMES[c]).join(' · ')
    : '';

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-2 sm:p-3 mb-2">
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
            {justInserted && <span className="text-green-400 normal-case font-bold">✓ inséré</span>}
          </div>
          <button
            onClick={() => canInsert && onInsert(detected!.label)}
            disabled={!canInsert}
            title={
              noKeyboard
                ? 'Aucun clavier MIDI détecté'
                : detected === null
                  ? 'En attente de notes…'
                  : canInsert
                    ? 'Clique pour insérer dans la grille (1 ronde)'
                    : 'Accord non identifié (notes seules)'
            }
            className={`text-5xl sm:text-6xl font-bold font-mono leading-none transition-colors ${
              canInsert
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
            onClick={() => onInsert(detected!.label)}
            className="shrink-0 text-xs px-2 py-1 rounded-md bg-green-900/40 border border-green-700/40 text-green-300 hover:bg-green-800/40 transition-colors"
            title="Insérer l'accord dans la grille (1 ronde)"
          >
            + Grille
          </button>
        )}
      </div>

      {/* ── Piano aligné sur le clavier : les touches tenues s'illument ── */}
      <div className="overflow-x-auto mt-2 pt-2 border-t border-gray-800">
        <LivePiano activePitches={active} />
      </div>
    </div>
  );
}
