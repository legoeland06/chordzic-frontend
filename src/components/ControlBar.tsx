/**
 * ControlBar — barre de contrôle principale : analyse, play, stop, effacer,
 * sauvegarder, charger, exporter, importer et réglage du tempo.
 *
 * Agit comme un hub de commandes pour ChordApp : chaque bouton déclenche
 * une callback vers le composant parent.
 */
import { Play, Square, Trash2, Gauge, Save, FolderOpen, Download } from 'lucide-react';

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
