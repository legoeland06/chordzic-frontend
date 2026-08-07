/**
 * ControlBar — barre de contrôle principale : analyse, play, stop, effacer,
 * sauvegarder, charger, exporter, importer et réglage du tempo.
 *
 * Agit comme un hub de commandes pour ChordApp : chaque bouton déclenche
 * une callback vers le composant parent.
 */
import { Play, Square, Trash2, Gauge, Save, FolderOpen, Download, Metronome } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getClickInRender, setClickInRender } from '../lib/clickPrefs';

/**
 * Contrôle de la piste de clic (métronome) avec sortie audio DÉDIÉE.
 * Auto-suffisant : lit/écrit la config via /click et /audio-devices,
 * persiste en localStorage.
 */
function ClickControl() {
  type ClickCfg = { enabled: boolean; device: string | null; volume: number; delay_ms: number; accent: boolean };
  const [cfg, setCfg] = useState<ClickCfg | null>(null);
  const [devices, setDevices] = useState<{ name: string; channels: number }[]>([]);
  const [inRender, setInRender] = useState<boolean>(getClickInRender());

  useEffect(() => {
    fetch('/audio-devices')
      .then((r) => r.json())
      .then((d) => setDevices(d.devices || []))
      .catch(() => {});
    fetch('/click')
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => {});
  }, []);

  const save = (c: ClickCfg) => {
    localStorage.setItem('chordzic_click', JSON.stringify(c));
    fetch('/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...c, device: c.device || '' }),
    }).catch(() => {});
  };
  const apply = (patch: Partial<ClickCfg>) => {
    setCfg((prev) => {
      const next = { ...(prev || { enabled: false, device: null, volume: 80, delay_ms: 20, accent: true }), ...patch };
      save(next);
      return next;
    });
  };

  if (!cfg) return null;

  return (
    <div className="flex items-center gap-1.5 shrink-0 px-1 py-1 rounded-lg border border-gray-800 bg-gray-900/60">
      {/* Toggle clic */}
      <button
        onClick={() => apply({ enabled: !cfg.enabled })}
        title="Piste de clic : on/off"
        className={`px-2 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-colors ${cfg.enabled ? 'bg-amber-600 text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
      >
        <Metronome className="w-3.5 h-3.5" /> Clic
      </button>

      {/* Choix de la sortie dédiée */}
      <select
        value={cfg.device || ''}
        onChange={(e) => apply({ device: e.target.value || null })}
        title="Sortie audio dédiée au clic (vide = sortie par défaut). Ex : le hub USB-C sur Mac."
        className="bg-gray-800 text-gray-300 text-xs rounded-md px-1.5 py-1.5 max-w-[130px] border border-gray-700"
      >
        <option value="">Sortie : défaut</option>
        {devices.map((d) => (
          <option key={d.name} value={d.name}>{d.name} ({d.channels}ch)</option>
        ))}
      </select>

      {/* Volume */}
      <input
        type="range" min={0} max={100} value={cfg.volume}
        onChange={(e) => apply({ volume: parseInt(e.target.value) })}
        title={`Volume du clic (${cfg.volume})`}
        className="w-14 accent-amber-500"
      />

      {/* Latence (compensation) */}
      <input
        type="range" min={0} max={100} value={cfg.delay_ms}
        onChange={(e) => apply({ delay_ms: parseInt(e.target.value) })}
        title={`Latence clic ${cfg.delay_ms} ms — règle pour caler le clic sur le son (0-100 ms)`}
        className="w-14 accent-amber-500"
      />
      <span className="text-[10px] text-gray-500 w-7">{cfg.delay_ms}ms</span>

      {/* Accent 1er temps */}
      <label title="Accent sur le 1er temps de chaque mesure" className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={cfg.accent}
          onChange={(e) => apply({ accent: e.target.checked })}
          className="accent-amber-500"
        />
        Accent
      </label>

      {/* Clic dans le rendu (mode Navig) */}
      <label title="Intègre le clic au WAV rendu (mode Navig) — synchronisation parfaite par construction. Le clic sort alors avec le son principal." className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={inRender}
          onChange={(e) => setInRender(e.target.checked)}
          className="accent-amber-500"
        />
        Dans le rendu
      </label>
    </div>
  );
}

interface ControlBarProps {
  chords: { time: number }[];
  playing: boolean;
  tempo: number;
  onAnalyse: () => void;
  onPlay: () => void;
  onStop: () => void;
  onClear: () => void;
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onImport: () => void;
  /** Extrait le dernier rendu WAV (mode Navig) en fichier téléchargeable. */
  onExtractWav: () => void;
  /** Vrai si un WAV a déjà été rendu (bouton Extract actif). */
  hasWav: boolean;
  onTempoChange: (t: number) => void;
}

export default function ControlBar({
  chords, playing, tempo,
  onAnalyse, onPlay, onStop, onClear,
  onSave, onLoad, onExport, onImport,
  onExtractWav, hasWav,
  onTempoChange,
}: ControlBarProps) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-2 sm:p-3 mb-2 overflow-x-auto">
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
        {/* ── Boutons de lecture ── */}
        <button
          onClick={onAnalyse}
          className="px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors shrink-0"
        >
          Analyser
        </button>

        <button
          onClick={onPlay}
          disabled={playing || chords.length === 0}
          className="px-3 sm:px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0"
        >
          <Play className="w-3 h-3" /> Jouer
        </button>

        <button
          onClick={onStop}
          className="px-3 sm:px-4 py-2 bg-red-800 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0"
        >
          <Square className="w-3 h-3" /> Stop
        </button>

        {/* ── Extraction du rendu WAV (mode Navig) ── */}
        <button
          onClick={onExtractWav}
          disabled={!hasWav}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-gray-800 text-amber-400 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0"
          title="Extrait le dernier rendu WAV (mode Navig) en fichier .wav"
        >
          <Download className="w-3 h-3" /> Extract Wav
        </button>

        <button
          onClick={onClear}
          className="px-3 sm:px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0"
        >
          <Trash2 className="w-3 h-3" /> Effacer
        </button>

        {/* Séparateur */}
        <div className="w-px h-5 bg-gray-700 mx-0.5 shrink-0" />

        {/* ── Sauvegarde / Chargement ── */}
        <button
          onClick={onSave}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-emerald-400 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0"
        >
          <Save className="w-3 h-3" /> Save
        </button>
        <button
          onClick={onLoad}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-cyan-400 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0"
        >
          <FolderOpen className="w-3 h-3" /> Load
        </button>

        {/* Export / Import JSON */}
        <button
          onClick={onExport}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-orange-400 text-xs font-bold rounded-lg transition-colors shrink-0"
          title="Exporter"
        >
          📤
        </button>
        <button
          onClick={onImport}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-orange-400 text-xs font-bold rounded-lg transition-colors shrink-0"
          title="Importer"
        >
          📥
        </button>

        {/* Séparateur */}
        <div className="w-px h-5 bg-gray-700 mx-0.5 shrink-0" />

        {/* ── Piste de clic (métronome + sortie dédiée) ── */}
        <ClickControl />

        {/* Séparateur */}
        <div className="w-px h-5 bg-gray-700 mx-0.5 shrink-0" />

        {/* ── Contrôle du tempo ── */}
        <Gauge className="w-3 h-3 text-gray-500 shrink-0" />
        <span className="text-xs text-gray-500 shrink-0">Tempo:</span>

        {/* Slider tempo (40-220 BPM) */}
        <input
          type="range"
          min={40} max={220}
          value={tempo}
          onChange={(e) => onTempoChange(parseInt(e.target.value))}
          className="w-16 sm:w-20 accent-blue-500 shrink-0"
        />

        {/* Affichage numérique + édition directe */}
        <input
          type="number"
          value={tempo}
          onChange={(e) => onTempoChange(parseInt(e.target.value))}
          className="text-xs font-bold text-blue-400 w-10 shrink-0"
        />
      </div>
    </div>
  );
}
