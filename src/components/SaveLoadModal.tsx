/**
 * SaveLoadModal — modals de sauvegarde et chargement des grilles.
 *
 * Deux modals indépendants, contrôlés par des props booléennes :
 * - `<SaveModal>` : saisie du nom + bouton sauvegarder
 * - `<LoadModal>` : liste des grilles sauvegardées + charger/supprimer
 *
 * Les données sont persistées via localStorage dans ChordApp.
 */
import { useState } from 'react';

interface SaveModalProps {
  show: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  /** Titre du modal (défaut : Sauvegarder la grille). */
  title?: string;
  /** Placeholder du champ (défaut : Nom de la grille). */
  placeholder?: string;
  /** Libellé du bouton (défaut : Sauvegarder). */
  buttonLabel?: string;
}

interface LoadModalProps {
  show: boolean;
  onClose: () => void;
  grilles: Array<{ name: string; input: string; tempo: number; sig: string; date?: number | string; file?: string }>;
  onLoad: (entry: { name: string; input: string; tempo: number; sig: string }) => void;
  onDelete: (id: string) => void;
}

// ─── SaveModal ──────────────────────────────────────────────────────────

export function SaveModal({ show, onClose, onSave, title, placeholder, buttonLabel }: SaveModalProps) {
  const [name, setName] = useState('');

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-80 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-white mb-3">{title ?? '💾 Sauvegarder la grille'}</h3>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { onSave(name); setName(''); }
            if (e.key === 'Escape') onClose();
          }}
          className="w-full bg-gray-800 text-white text-sm font-mono px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 outline-none mb-4"
          placeholder={placeholder ?? 'Nom de la grille'}
        />
        <div className="flex gap-2">
          <button
            onClick={() => { onSave(name); setName(''); }}
            disabled={!name.trim()}
            className="flex-1 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-bold rounded-lg transition-colors"
          >
            {buttonLabel ?? 'Sauvegarder'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-bold rounded-lg transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LoadModal ──────────────────────────────────────────────────────────

export function LoadModal({ show, onClose, grilles, onLoad, onDelete }: LoadModalProps) {
  if (!show) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-96 shadow-2xl max-h-[70vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-white mb-3">📂 Grilles sauvegardées</h3>

        {grilles.length === 0 ? (
          <p className="text-gray-500 text-xs py-6 text-center">Aucune grille sauvegardée</p>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1">
            {grilles.map((g) => (
              <div
                key={g.file ?? g.name}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-800 cursor-pointer group"
                onClick={() => onLoad(g)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-cyan-400 truncate">{g.name}</div>
                  <div className="text-[10px] text-gray-500 truncate">
                    {g.input} · {g.tempo}bpm
                  </div>
                </div>
                <div className="text-[10px] text-gray-600 hidden group-hover:block">
                  {typeof g.date === 'number'
                    ? new Date(g.date * 1000).toLocaleString('fr-FR')
                    : g.date}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onDelete(g.file ?? g.name); }}
                  className="text-gray-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-all"
                  title="Supprimer"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-3 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-bold rounded-lg transition-colors"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
