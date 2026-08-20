/**
 * CollapsiblePanel — bandeau rétractable (chevron ▲/▼ + titre) avec contenu
 * masqué par `display:none` : le contenu RESTE MONTÉ (les effets, pollings et
 * mesureurs continuent de tourner — ex. la reconnaissance d'accords du
 * LivePiano en mode Live ne s'arrête pas quand le piano est replié).
 */
import { memo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsiblePanelProps {
  /** Titre affiché à côté du chevron. */
  title: string;
  /** Panneau déployé ? */
  open: boolean;
  /** Bascule (clic sur le chevron). */
  onToggle: () => void;
  children: React.ReactNode;
}

function CollapsiblePanel({ title, open, onToggle, children }: CollapsiblePanelProps) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 mb-1">
        <button
          onClick={onToggle}
          className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
          title={open ? 'Rétracter le panneau' : 'Déployer le panneau'}
          aria-expanded={open}
        >
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <span className="text-[10px] uppercase tracking-wider text-gray-500">{title}</span>
      </div>
      <div style={{ display: open ? undefined : 'none' }}>{children}</div>
    </div>
  );
}

export default memo(CollapsiblePanel);
