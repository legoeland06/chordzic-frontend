/**
 * LoopControl — boucle sample du MODE NAVIG (lecture WAV navigateur).
 *
 * Un sample audio de quelques mesures (dossier ~/samples/drums/, nommé
 * `<name>_<tempo>.wav`) est répété en boucle PENDANT la lecture, joué par
 * le navigateur en Web Audio en parallèle du WAV principal (même horloge →
 * synchro parfaite par construction).
 *
 * Ergonomie :
 *  - toggle clair avec état ●/○
 *  - sélecteur limité au bucket du tempo courant ; REBASCLAGE automatique
 *    quand on change de tempo (le sample doit appartenir au nouveau tempo,
 *    sinon l'ancien fichier serait rejoué — bug corrigé 2026-08-08)
 *  - badge durée réelle + nombre de mesures (décodé depuis le fichier)
 *  - volume
 *  - DÉCALAGE DE PHASE −2000..+2000 ms (slider + champ + ±1/±10 ms) appliqué
 *    EN DIRECT pendant la lecture ; chaque sample garde sa préférence
 *    mémorisée via le VERROU 🔒 (spinner grisé quand verrouillé).
 */
import { Lock, Unlock, Music } from 'lucide-react';
import { useEffect, useState } from 'react';
import { backendUrl } from '../lib/chordUtils';
import type { SampleLoopCfg } from '../lib/browserSynth';
import { sampleBelongsToTempo, fitSampleToGrid, measureDurationSec, SAMPLE_OFFSET_MIN, SAMPLE_OFFSET_MAX } from '../lib/sampleLoop';
import { loadSampleOffsets, saveSampleOffsets } from '../lib/sampleOffsets';

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
  /** Samples disponibles groupés par tempo : { "160": ["snap5_160.wav"...] }. */
  const [samples, setSamples] = useState<Record<string, string[]>>({});
  /** Durée réelle (s) du sample sélectionné — pour le badge mesures. */
  const [duration, setDuration] = useState<number | null>(null);
  /** Offsets mémorisés PAR SAMPLE (préférences globales, localStorage). */
  const [memOffsets, setMemOffsets] = useState<Record<string, number>>(() => loadSampleOffsets());
  /** Verrou : quand actif, le spinner est grisé et la valeur est mémorisée. */
  const [locked, setLocked] = useState(false);
  /** Vrai quand /samples-list a répondu — évite de « rebasculer » (ou pire,
   * de DÉSACTIVER) la boucle restaurée tant que le bucket du tempo est vide
   * (course au montage : le fetch part après le premier render). */
  const [samplesLoaded, setSamplesLoaded] = useState(false);

  useEffect(() => {
    fetch(`${backendUrl()}/samples-list`)
      .then((r) => r.json())
      .then((d) => { setSamples(d || {}); setSamplesLoaded(true); })
      .catch(() => setSamplesLoaded(true));
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
  // Recadrage automatique du sample sur la grille (badge ✂ / +) : la période
  // de boucle est forcée à un multiple entier de la mesure — coupée si le
  // sample est trop long, complétée par du silence s'il est trop court.
  const fit = duration
    ? fitSampleToGrid(duration, measureDurationSec(tempo, beatsPerMes))
    : null;

  // OFFSET MÉMORISÉ (🔒) : appliqué uniquement quand l'UTILISATEUR change de
  // sample (sélecteur, rebasculage tempo, activation). Un CHARGEMENT de
  // projet restaure l'offset STOCKÉ DANS LE FICHIER sans être écrasé par la
  // préférence locale — le décalage sauvegardé est donc appliqué d'office,
  // sans avoir à re-cliquer Stop/Play.
  const applySamplePreference = (sample: string) => {
    onChange({ sample });
    const mem = memOffsets[sample];
    if (mem !== undefined) {
      onChange({ offsetMs: mem });
      setLocked(true);
    } else {
      onChange({ offsetMs: 0 });
      setLocked(false);
    }
  };

  // REBASCLAGE au changement de tempo : le sample courant doit appartenir au
  // bucket du tempo actif. Sinon → bascule sur le premier du nouveau tempo,
  // ou désactive la boucle si aucun sample n'existe pour ce tempo.
  useEffect(() => {
    if (!samplesLoaded) return; // liste pas encore là → ne rien décider
    if (!cfg.enabled || !cfg.sample) return;
    if (sampleBelongsToTempo(cfg.sample, tempo, bucket)) return;
    if (bucket.length > 0) {
      applySamplePreference(`${bucket[0]}_${tempo}.wav`);
    } else {
      onChange({ enabled: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tempo, cfg.enabled, cfg.sample, samplesLoaded]);

  // Verrou UI : suit le sample courant. Si l'offset actuel n'est pas la
  // préférence verrouillée de ce sample (ex. offset chargé depuis un projet),
  // le slider reste actif — on ne grise que ce qui est réellement verrouillé.
  useEffect(() => {
    if (!cfg.sample) return;
    setLocked(memOffsets[cfg.sample] === cfg.offsetMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.sample]);

  /** Verrouille/déverrouille : verrouiller = mémoriser l'offset pour CE
   * sample (préférence globale) et griser le spinner. */
  const toggleLock = () => {
    if (!cfg.sample) return;
    if (locked) {
      setLocked(false);
    } else {
      const next = { ...memOffsets, [cfg.sample]: cfg.offsetMs };
      setMemOffsets(next);
      saveSampleOffsets(next);
      setLocked(true);
    }
  };

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
            applySamplePreference(`${bucket[0]}_${tempo}.wav`);
            onChange({ enabled: true });
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
          onChange={(e) => applySamplePreference(e.target.value)}
          title={`Sample à ${tempo} BPM (dossier ~/samples/drums/)`}
          className="bg-gray-800 text-emerald-400 text-[10px] px-1.5 py-1 rounded border border-gray-700 outline-none max-w-[110px]"
        >
          {bucket.map((s) => (
            <option key={s} value={`${s}_${tempo}.wav`}>{s}</option>
          ))}
        </select>
      )}

      {/* Badge durée réelle + mesures + recadrage auto sur la grille.
          Le recadrage est appliqué à la lecture ET à l'extraction WAV : le
          sample ne dérive jamais du métronome (période = multiple entier de
          la mesure). L'ajustement (coupe ✂ / silence +) est affiché en ms. */}
      {cfg.enabled && duration !== null && (
        <span
          className="text-[9px] text-gray-500 font-mono shrink-0"
          title={`Durée réelle du sample : ${duration.toFixed(2)} s — environ ${mesures} mesure(s) à ${tempo} BPM en ${sig}. ${
            fit && fit.mode !== 'exact'
              ? `Recadrage auto sur la grille : période ${fit.periodSec.toFixed(2)} s (${fit.bars} mesure${fit.bars > 1 ? 's' : ''}) — ${
                  fit.mode === 'cut' ? `coupé de ${Math.round(fit.deltaSec * 1000)} ms` : `${Math.round(-fit.deltaSec * 1000)} ms de silence ajoutés`
                }.`
              : 'Le sample est déjà aligné sur la grille (aucun ajustement).'
          }`}
        >
          {duration.toFixed(1)}s·{mesures}mes
          {fit && fit.mode === 'cut' && <span className="text-amber-400">·✂−{Math.round(fit.deltaSec * 1000)}ms</span>}
          {fit && fit.mode === 'pad' && <span className="text-sky-400">·+{Math.round(-fit.deltaSec * 1000)}ms</span>}
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

      {/* Décalage de phase — appliqué EN DIRECT pendant la lecture. Plage
          −2000..+2000 ms : POSITIF si le sample tombe en AVANCE (le reculer),
          NÉGATIF s'il tombe en RETARD (le tirer en arrière). Grisé quand le
          verrou 🔒 est actif (valeur mémorisée pour ce sample). */}
      {cfg.enabled && (
        <div
          className={`flex items-center gap-1 transition-opacity ${locked ? 'opacity-50' : ''}`}
          title={
            locked
              ? `Décalage mémorisé pour ce sample (${cfg.offsetMs} ms) — déverrouillez pour ajuster`
              : `Décalage du sample (${cfg.offsetMs} ms) — positif si le sample tombe EN AVANCE sur les temps (à reculer), négatif s'il tombe EN RETARD (à tirer en arrière). Appliqué immédiatement, même pendant la lecture.`
          }
        >
          <span className="text-[10px] text-gray-400">Décalage</span>
          <input
            type="range" min={SAMPLE_OFFSET_MIN} max={SAMPLE_OFFSET_MAX} step={1} value={cfg.offsetMs}
            disabled={locked}
            onChange={(e) => onChange({ offsetMs: parseInt(e.target.value) })}
            className="w-20 accent-emerald-500"
          />
          <input
            type="number" min={SAMPLE_OFFSET_MIN} max={SAMPLE_OFFSET_MAX} step={1} value={cfg.offsetMs}
            disabled={locked}
            onChange={(e) => onChange({ offsetMs: Math.max(SAMPLE_OFFSET_MIN, Math.min(SAMPLE_OFFSET_MAX, parseInt(e.target.value) || 0)) })}
            className="w-11 bg-gray-800 text-emerald-300 text-xs rounded-md px-1 py-1 border border-gray-700 text-center disabled:opacity-60"
          />
          <span className="text-[10px] text-gray-500">ms</span>
          <button
            onClick={() => onChange({ offsetMs: Math.max(SAMPLE_OFFSET_MIN, cfg.offsetMs - 10) })}
            disabled={locked}
            className="px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded border border-gray-700 disabled:opacity-40"
            title="−10 ms"
          >−10</button>
          <button
            onClick={() => onChange({ offsetMs: Math.max(SAMPLE_OFFSET_MIN, cfg.offsetMs - 1) })}
            disabled={locked}
            className="px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded border border-gray-700 disabled:opacity-40"
            title="−1 ms"
          >−1</button>
          <button
            onClick={() => onChange({ offsetMs: Math.min(SAMPLE_OFFSET_MAX, cfg.offsetMs + 1) })}
            disabled={locked}
            className="px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded border border-gray-700 disabled:opacity-40"
            title="+1 ms"
          >+1</button>
          <button
            onClick={() => onChange({ offsetMs: Math.min(SAMPLE_OFFSET_MAX, cfg.offsetMs + 10) })}
            disabled={locked}
            className="px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded border border-gray-700 disabled:opacity-40"
            title="+10 ms"
          >+10</button>
          {/* Verrou : mémorise l'offset pour CE sample (préférence globale) */}
          <button
            onClick={toggleLock}
            className={`px-1.5 py-0.5 rounded border transition-colors ${
              locked
                ? 'bg-emerald-900/50 border-emerald-500 text-emerald-300'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            title={
              locked
                ? 'Déverrouiller (ajuster le décalage)'
                : 'Verrouiller : mémorise ce décalage pour ce sample (retrouvé à chaque sélection)'
            }
          >
            {locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
          </button>
        </div>
      )}
    </div>
  );
}
