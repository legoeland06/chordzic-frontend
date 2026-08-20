/**
 * registry.ts — registre des modules de contrôleurs MPE.
 *
 * Chaque module = un contrôleur simulé (ROLI Seaboard, LinnStrument,
 * Osmose…) : une zone de manipulation plein écran qui émet des gestes
 * d'expression. Le module PARENT (MpeModules) liste ces modules, laisse
 * l'utilisateur choisir celui qu'il veut utiliser EN DIRECT, et route les
 * gestes du module actif vers le serveur (bend / pression / timbre / LFO).
 *
 * Pour ajouter un contrôleur : créer son composant (qui respecte
 * MpeModuleProps) puis l'ajouter à MPE_MODULES.
 */
import type { ComponentType } from 'react';
import type { StripGesture } from '../../lib/mpe';
import MpeStrip from './MpeStrip';

/** Props communes que chaque module reçoit du parent. */
export interface MpeModuleProps {
  /** Retour auto du bend au centre au relâchement vs maintien. */
  returnMode: 'center' | 'hold';
  /** Échantillon de geste (~1×/frame pendant un glissé). */
  onGesture: (g: StripGesture) => void;
  /** Fin du geste (relâchement) — synchronise les réglages du parent. */
  onGestureEnd: (g: StripGesture) => void;
}

/** Description d'un module de contrôleur MPE. */
export interface MpeModule {
  id: string;
  /** Nom affiché dans le sélecteur. */
  name: string;
  /** Icône (emoji). */
  icon: string;
  /** Description courte (tooltip / aide). */
  description: string;
  /** Le composant du contrôleur simulé. */
  component: ComponentType<MpeModuleProps>;
}

/** Les modules disponibles. Le premier est le module par défaut. */
export const MPE_MODULES: MpeModule[] = [
  {
    id: 'seaboard',
    name: 'Seaboard (strip)',
    icon: '🎹',
    description: 'Bande tactile : X = pitch bend · Y = timbre · molette = pression (aftertouch)',
    component: MpeStrip,
  },
  // Prochains modules à venir :
  //  - ROLI Seaboard RISE 2 (keywaves 5D : Strike/Glide/Slide/Press/Lift)
  //  - LinnStrument (grille isomorphique 25×8)
  //  - Expressive E Osmose (clavier 49 touches à aftertouch polyphonique)
];

/** Retourne un module par id (défaut : le premier). */
export function getMpeModule(id: string): MpeModule {
  return MPE_MODULES.find((m) => m.id === id) ?? MPE_MODULES[0];
}

/** Ids des modules disponibles (pour la persistance du choix). */
export function mpeModuleIds(): string[] {
  return MPE_MODULES.map((m) => m.id);
}
