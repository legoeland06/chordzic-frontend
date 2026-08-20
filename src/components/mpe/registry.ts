/**
 * registry.ts — registre des modules MPE (contrôleurs simulés).
 *
 * Le bouton « 🎛 MPE » (unique dans l'UI) ouvre un MENU qui liste TOUS les
 * modules enregistrés ici ; chaque module est une MODAL complète. Pour
 * ajouter un contrôleur (ROLI Seaboard RISE 2, LinnStrument, Osmose…) :
 * créer sa modal (composant avec `onClose`) puis l'ajouter à MPE_MODULES.
 */
import type { ComponentType } from 'react';
import PushPadGrid from './PushPadGrid';
import Rise2Modal from './Rise2Modal';
import SeaboardModal from './SeaboardModal';

/** Props communes des modals de modules. */
export interface MpeModuleModalProps {
  onClose: () => void;
}

/** Description d'un module MPE. */
export interface MpeModule {
  id: string;
  /** Nom affiché dans le menu. */
  name: string;
  /** Icône (emoji). */
  icon: string;
  /** Description courte (menu / aide). */
  description: string;
  /** La modal complète du module. */
  modal: ComponentType<MpeModuleModalProps>;
}

/** Les modules disponibles — l'ordre du menu. */
export const MPE_MODULES: MpeModule[] = [
  {
    id: 'seaboard',
    name: 'Seaboard (strip)',
    icon: '🎹',
    description: 'Bande tactile : X = pitch bend · Y = timbre · molette = pression (aftertouch)',
    modal: SeaboardModal,
  },
  {
    id: 'rise2',
    name: 'ROLI Seaboard RISE 2',
    icon: '🎛',
    description: '25 keywaves 2 octaves (C3→C5) : glissé vertical = bend · glissé horizontal (petit) = vibrato · molette = pression — multi-touch',
    modal: Rise2Modal,
  },
  {
    id: 'push',
    name: 'Push 3 — pads',
    icon: '🥁',
    description: '64 pads échantillonnés : import de samples, retrigger immédiat, couleurs par dégradés',
    modal: PushPadGrid,
  },
  // Prochains modules à venir :
  //  - LinnStrument (grille isomorphique 25×8)
  //  - Expressive E Osmose (clavier 49 touches à aftertouch polyphonique)
];

/** Retourne un module par id (défaut : le premier). */
export function getMpeModule(id: string): MpeModule {
  return MPE_MODULES.find((m) => m.id === id) ?? MPE_MODULES[0];
}

/** Ids des modules disponibles. */
export function mpeModuleIds(): string[] {
  return MPE_MODULES.map((m) => m.id);
}
