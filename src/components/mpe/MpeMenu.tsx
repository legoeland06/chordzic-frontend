/**
 * 🎛 MpeMenu — le MENU du système MPE Modules.
 *
 * Un SEUL bouton « MPE » apparaît dans l'interface (barre de contrôle /
 * transport). Au clic, un deuxième menu liste TOUS les modules de
 * contrôleurs enregistrés (Seaboard, Push 3 — pads, et les futurs : ROLI
 * Seaboard RISE 2, LinnStrument, Osmose…) ; le choix ouvre la modal du
 * module. Fermeture au clic à l'extérieur ou à la sélection.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MPE_MODULES } from './registry';

interface MpeMenuProps {
  /** Sélection d'un module (id) — le parent ouvre sa modal. */
  onSelect: (moduleId: string) => void;
  /** Vrai si une modal MPE est ouverte (style du bouton). */
  active: boolean;
}

function MpeMenu({ onSelect, active }: MpeMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fermeture au clic à l'extérieur
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`h-7 px-2.5 flex items-center gap-1.5 rounded-md text-[10px] font-semibold border transition-colors shrink-0 ${
          active || open
            ? 'bg-cyan-900/60 border-cyan-500/60 text-cyan-200'
            : 'bg-[#141a24] border-[#242c3a] text-[#7fd4e0] hover:bg-[#1a2230]'
        }`}
        title="🎛 MPE — choisir le contrôleur MPE à utiliser en direct"
      >
        🎛 MPE {(active || open) ? '●' : ''}
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-[220px] bg-[#1a2230] border border-gray-700 rounded-xl shadow-2xl p-1.5">
          <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-gray-500">
            Contrôleurs MPE
          </div>
          {MPE_MODULES.map(m => (
            <button
              key={m.id}
              onClick={() => {
                setOpen(false);
                onSelect(m.id);
              }}
              className="w-full flex items-start gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-gray-800 transition-colors"
              title={m.description}
            >
              <span className="text-base leading-none mt-0.5">{m.icon}</span>
              <span className="min-w-0">
                <span className="block text-[11px] font-bold text-gray-200">{m.name}</span>
                <span className="block text-[9px] text-gray-500 leading-tight">{m.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(MpeMenu);
