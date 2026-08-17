/**
 * 🎹 ChordDetector — reconnaissance d'accords en mode Live.
 *
 * Interroge le serveur (GET /live-input, toutes les 150 ms) qui relaie les
 * notes tenues sur le clavier MIDI (Roland), puis reconnaît l'accord plaqué
 * avec l'harmonie intégrée (chordRecognition → QUALITY_INTERVALS).
 *
 * Un clic sur l'accord détecté l'insère dans la grille (durée 4 par défaut).
 */
import React, { useEffect, useState } from 'react';
import { recognizeChord, RecognizedChord } from '../lib/chordRecognition';

const API_BASE = 'http://localhost:4000';

interface Props {
  onInsert: (label: string) => void;
}

export default function ChordDetector({ onInsert }: Props) {
  const [device, setDevice] = useState<string | null>(null);
  const [detected, setDetected] = useState<RecognizedChord | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/live-input`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (cancelled) return;
        setDevice(j.device ?? null);
        setDetected(recognizeChord(Array.isArray(j.active) ? j.active : []));
      } catch {
        if (!cancelled) {
          setDevice(null);
          setDetected(null);
        }
      }
    };
    tick();
    const id = setInterval(tick, 150);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const canInsert = detected !== null && detected.insertable;
  const noKeyboard = device === null;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-2 mb-2 flex items-center gap-3">
      <span className="text-lg select-none" title="Reconnaissance d'accords (clavier MIDI)">
        🎹
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 truncate">
          Accord détecté
          {noKeyboard
            ? ' · clavier non détecté'
            : ` · ${device}`}
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
                  ? 'Clique pour insérer dans la grille (4 temps)'
                  : 'Accord non identifié (notes seules)'
          }
          className={`text-2xl font-bold font-mono leading-tight transition-colors ${
            canInsert
              ? 'text-green-300 hover:text-green-200 cursor-pointer'
              : 'text-gray-600 cursor-default'
          }`}
        >
          {detected ? detected.label : '—'}
        </button>
      </div>
      {canInsert && (
        <button
          onClick={() => onInsert(detected!.label)}
          className="shrink-0 text-xs px-2 py-1 rounded-md bg-green-900/40 border border-green-700/40 text-green-300 hover:bg-green-800/40 transition-colors"
          title="Insérer l'accord dans la grille (4 temps)"
        >
          + Grille
        </button>
      )}
    </div>
  );
}
