/**
 * LoopControl — boucle sample du MODE NAVIG (lecture WAV navigateur).
 *
 * Un sample audio de quelques mesures (dossier ~/samples/drums/, nommé
 * `<name>_<tempo>.wav`) est répété en boucle PENDANT la lecture, joué par
 * le navigateur en Web Audio en parallèle du WAV principal (même horloge →
 * synchro parfaite par construction).
 *
 * Ergonomie (mieux que la boucle du mode Live) :
 *  - toggle clair avec état ●/○
 *  - sélecteur limité au bucket du tempo courant
 *  - badge durée réelle + nombre de mesures (décodé depuis le fichier)
 *  - volume
 *  - DÉCALAGE DE PHASE précis (slider + champ + ±1/±10 ms) appliqué EN
 *    DIRECT pendant la lecture : la boucle se recale instantanément à la
 *    bonne phase → vérification à l'oreille, comme le décalage du clic.
 */
import { Music } from 'lucide-react';
import { useEffect, useState } from 'react';
import { backendUrl } from '../lib/chordUtils';
import type { SampleLoopCfg } from '../lib/browserSynth';

interface LoopControlProps {
  /** Tempo courant (BPM) — filtre le bucket de samples proposé. */
  tempo: number;
  /** Signature rythmique courante (ex. « 4/4 ») — pour le calcul des mesures. */
  sig: string;
  /** Configuration courante de la boucle (vit dans ChordApp : persistance projet). */
  cfg: SampleLoopCfg;
  /** Applique un changement de config (envoyé au moteur → appliqué en direct). */
  onChange: (patch: Partial<SampleLoopCfg>) => void;
}

export default function LoopControl({ tempo, sig, cfg, onChange }: LoopControlProps) {
  /** Samples disponibles groupés par tempo : { "160": ["snap5_160.wav", ...] }. */
  const [samples, setSamples] = useState<Record<string, string[]>>({});
  /** Durée réelle (s) du sample sélectionné — pour le badge mesures. */
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${backendUrl()}/samples-list`)
      .then((r) => r.json())
      .then((d) => setSamples(d || {}))
      .catch(() => {});
  }, []);

  // Mesure la durée du sample sélectionné (décodage du fichier réel)
  useEffect(() => {
    if (!cfg.sample) { setDuration(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${backendUrl()}/sample-file/${encodeURIComponent(cfg.sample)}`);
        if (!resp.ok) return;
        const data = await resp.arrayBuffer();
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const buf = await ctx.decodeAudioData(data);
        await ctx.close();
        if (!cancelled) setDuration(buf.duration);
      } catch {
        if (!cancelled) setDuration(null);
      }
    })();
    return () => { cancelled = true; };
  }, [cfg.sample]);

  const bucket = samples[String(tempo)] || [];
  const beatsPerMes = parseInt(sig.split('/')[0] || '4', 10) || 4;
  const mesures = duration ? Math.max(1, Math.round((duration * tempo) / 60 / beatsPerMes)) : null;

  return (
    <div
      className="flex items-center gap-1.5 shrink-0 px-1 py-1 rounded-lg border border-gray-800 bg-gray-900/60"
      title="Boucle sample : un sample de quelques mesures répété en boucle pendant la lecture (mode Navig). Le décalage décale la phase EN DIRECT pour caler le sample sur le tempo."
    >
      <Music className="w-3.5 h-3.5 text-emerald-400 shrink-0" />

      {/* Toggle loop */}
      <button
        onClick={() => {
          if (!cfg.enabled && !cfg.sample && bucket.length > 0) {
            // Premier activage : pré-sélectionne le premier sample du tempo
            onChange({ enabled: true, sample: `${bucket[0]}_${tempo}.wav` });
          } else {
            onChange({ enabled: !cfg.enabled });
          }
        }}
        disabled={bucket.length === 0}
        className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors ${
          cfg.enabled
            ? 'bg-emerald-900/40 border-emerald-500 text-emerald-400'
            : 'bg-gray-800 border-gray-700 text-gray-500 hover:bg-gray-700'
        } disabled:opacity-30`}
        title={
          bucket.length === 0
            ? `Aucun sample pour ${tempo} BPM — ajoutez des fichiers <nom>_${tempo}.wav dans ~/samples/drums/`
            : 'Active / désactive la boucle sample'
        }
      >
        🎵 Loop {cfg.enabled ? '●' : '○'}
      </button>

      {/* Sélecteur de sample (bucket du tempo courant uniquement) — la valeur
          stockée est le NOM COMPLET du fichier (<clé>_<tempo>.wav), ce que
          le backend attend pour /sample-file. */}
      {bucket.length > 0 && (
        <select
          value={cfg.sample || `${bucket[0]}_${tempo}.wav`}
          onChange={(e) => onChange({ sample: e.target.value })}
          title={`Sample à ${tempo} BPM (dossier ~/samples/drums/)`}
          className="bg-gray-800 text-emerald-400 text-[10px] px-1.5 py-1 rounded border border-gray-700 outline-none max-w-[110px]"
        >
          {bucket.map((s) => (
            <option key={s} value={`${s}_${tempo}.wav`}>{s}</option>
          ))}
        </select>
      )}

      {/* Badge durée réelle + mesures */}
      {cfg.enabled && duration !== null && (
        <span
          className="text-[9px] text-gray-500 font-mono shrink-0"
          title={`Durée réelle du sample : ${duration.toFixed(2)} s — environ ${mesures} mesure(s) à ${tempo} BPM en ${sig}`}
        >
          {duration.toFixed(1)}s·{mesures}mes
        </span>
      )}

      {/* Volume */}
      {cfg.enabled && (
        <input
          type="range" min={0} max={100} value={cfg.volume}
          onChange={(e) => onChange({ volume: parseInt(e.target.value) })}
          title={`Volume du sample (${cfg.volume})`}
          className="w-12 accent-emerald-500"
        />
      )}

      {/* Décalage de phase — appliqué EN DIRECT pendant la lecture */}
      {cfg.enabled && (
        <div
          className="flex items-center gap-1"
          title={`Décalage du sample (${cfg.offsetMs} ms) — si le sample tombe EN AVANCE sur les temps, augmentez jusqu'à ce qu'il soit pile calé. Appliqué immédiatement, même pendant la lecture.`}
        >
          <span className="text-[10px] text-gray-400">Décalage</span>
          <input
            type="range" min={0} max={200} step={1} value={cfg.offsetMs}
            onChange={(e) => onChange({ offsetMs: parseInt(e.target.value) })}
            className="w-20 accent-emerald-500"
          />
          <input
            type="number" min={0} max={200} step={1} value={cfg.offsetMs}
            onChange={(e) => onChange({ offsetMs: Math.max(0, Math.min(200, parseInt(e.target.value) || 0)) })}
            className="w-11 bg-gray-800 text-emerald-300 text-xs rounded-md px-1 py-1 border border-gray-700 text-center"
          />
          <span className="text-[10px] text-gray-500">ms</span>
          <button
            onClick={() => onChange({ offsetMs: Math.max(0, cfg.offsetMs - 10) })}
            className="px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded border border-gray-700"
            title="−10 ms"
          >−10</button>
          <button
            onClick={() => onChange({ offsetMs: Math.max(0, cfg.offsetMs - 1) })}
            className="px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded border border-gray-700"
            title="−1 ms"
          >−1</button>
          <button
            onClick={() => onChange({ offsetMs: Math.min(200, cfg.offsetMs + 1) })}
            className="px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded border border-gray-700"
            title="+1 ms"
          >+1</button>
          <button
            onClick={() => onChange({ offsetMs: Math.min(200, cfg.offsetMs + 10) })}
            className="px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded border border-gray-700"
            title="+10 ms"
          >+10</button>
        </div>
      )}
    </div>
  );
}
