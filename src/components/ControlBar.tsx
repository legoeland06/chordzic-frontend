/**
 * ControlBar — barre de contrôle principale : analyser, jouer, stop, effacer,
 * sauvegarder, charger, exporter, importer, nouveau projet et extraction WAV.
 *
 * Design affiné (finesse des lignes, fonds sombres discrets, accents colorés
 * limités aux actions principales) — cohérent avec le mode Navig. Le tempo et
 * la bascule 📱 Navig. vivent dans la LiveSettingsBar (rangée de réglages).
 */
import { memo } from 'react';
import { Play, Square, Trash2, Save, FolderOpen, Download, FilePlus2 } from 'lucide-react';

interface ControlBarProps {
  chords: { time: number }[];
  playing: boolean;
  onAnalyse: () => void;
  onPlay: () => void;
  onStop: () => void;
  onClear: () => void;
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onImport: () => void;
  /** Réinitialise le projet courant (Nouveau projet). */
  onNewProject: () => void;
  /** Extrait le dernier rendu WAV (mode Navig) en fichier téléchargeable. */
  onExtractWav: () => void;
  /** Vrai si un WAV a déjà été rendu (bouton Extract actif). */
  hasWav: boolean;
  /** Ouvre la modal 🎛 MPE (simulation de contrôleur MPE). */
  onOpenMpe: () => void;
  /** Vrai si la modal MPE est ouverte (style du bouton). */
  mpeActive: boolean;
}

/** Bouton neutre (fonds sombre, texte gris clair — style Navig). */
const btn = 'h-7 px-2.5 flex items-center gap-1.5 rounded-md text-[10px] font-semibold border transition-colors shrink-0 disabled:opacity-40 disabled:hover:bg-[#141a24]';

function ControlBar({
  chords, playing,
  onAnalyse, onPlay, onStop, onClear,
  onSave, onLoad, onExport, onImport, onNewProject,
  onExtractWav, hasWav, onOpenMpe, mpeActive,
}: ControlBarProps) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-2 sm:p-3 mb-2 overflow-x-auto">
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
        {/* ── Boutons de lecture ── */}
        <button
          onClick={onAnalyse}
          className={`${btn} bg-[#1a2230] border-[#2f4a6e] text-[#a8c8e8] hover:bg-[#22304a]`}
          title="Analyser la grille saisie"
        >
          Analyser
        </button>

        <button
          onClick={onPlay}
          disabled={playing || chords.length === 0}
          className={`${btn} bg-[#2f6ba8] border-[#3a7ab8] text-white hover:bg-[#3a7ab8] disabled:hover:bg-[#2f6ba8]`}
        >
          <Play className="w-3 h-3" /> Jouer
        </button>

        <button
          onClick={onStop}
          className={`${btn} bg-[#141a24] border-[#242c3a] text-[#e8a0b0] hover:bg-[#2a1a24]`}
        >
          <Square className="w-3 h-3" /> Stop
        </button>

        {/* ── Modal MPE (simulation de contrôleur d'expression) ── */}
        <button
          onClick={onOpenMpe}
          className={`${btn} ${
            mpeActive
              ? 'bg-cyan-900/60 border-cyan-500/60 text-cyan-200 hover:bg-cyan-800/60'
              : 'bg-[#141a24] border-[#242c3a] text-[#7fd4e0] hover:bg-[#1a2230]'
          }`}
          title="🎛 MPE — jouer sur le son en direct (bend / pression / timbre) pendant que tu joues sur le Roland ou pendant un enregistrement"
        >
          🎛 MPE {mpeActive ? '●' : ''}
        </button>

        {/* ── Extraction du rendu WAV (mode Navig) ── */}
        <button
          onClick={onExtractWav}
          disabled={!hasWav}
          className={`${btn} bg-[#141a24] border-[#242c3a] text-[#c9a45c] hover:bg-[#1a2230]`}
          title="Extrait le dernier rendu WAV (mode Navig) en fichier .wav"
        >
          <Download className="w-3 h-3" /> Extract Wav
        </button>

        <button
          onClick={onClear}
          className={`${btn} bg-[#141a24] border-[#242c3a] text-[#9aa3b2] hover:text-white hover:bg-[#1a2230]`}
          title="Effacer la grille"
        >
          <Trash2 className="w-3 h-3" /> Effacer
        </button>

        {/* Séparateur */}
        <div className="w-px h-5 bg-[#242c3a] shrink-0" />

        {/* ── Sauvegarde / Chargement / Nouveau ── */}
        <button
          onClick={onSave}
          className={`${btn} bg-[#141a24] border-[#242c3a] text-[#9aa3b2] hover:text-white hover:bg-[#1a2230]`}
          title="Sauvegarder le projet"
        >
          <Save className="w-3 h-3" /> Save
        </button>
        <button
          onClick={onLoad}
          className={`${btn} bg-[#141a24] border-[#242c3a] text-[#9aa3b2] hover:text-white hover:bg-[#1a2230]`}
          title="Charger un projet"
        >
          <FolderOpen className="w-3 h-3" /> Load
        </button>

        <button
          onClick={onNewProject}
          className={`${btn} bg-[#141a24] border-[#242c3a] text-[#9aa3b2] hover:text-white hover:bg-[#1a2230]`}
          title="Nouveau projet — efface la grille, les pistes et les réglages pour repartir de zéro"
        >
          <FilePlus2 className="w-3 h-3" /> Nouveau
        </button>

        {/* Export / Import JSON */}
        <button
          onClick={onExport}
          className={`${btn} bg-[#141a24] border-[#242c3a] text-[#9aa3b2] hover:text-white hover:bg-[#1a2230]`}
          title="Exporter"
        >
          📤
        </button>
        <button
          onClick={onImport}
          className={`${btn} bg-[#141a24] border-[#242c3a] text-[#9aa3b2] hover:text-white hover:bg-[#1a2230]`}
          title="Importer"
        >
          📥
        </button>
      </div>
    </div>
  );
}


export default memo(ControlBar);
