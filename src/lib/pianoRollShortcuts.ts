/**
 * pianoRollShortcuts — raccourcis clavier du PianoRoll (intégré + modal).
 *
 * Mapping PUR (testable sans DOM) : la touche + modificateurs → action.
 * Les événements issus d'un champ de saisie (input/textarea/select) ou d'un
 * bouton sont ignorés (sinon les raccourcis se déclencheraient pendant
 * l'édition des locators ou en re-déclenchant un bouton).
 *
 * Raccourcis (demande Eric 2026-08-20) :
 * - e            → outil Édition
 * - v            → outil Sélection
 * - Ctrl+G       → grouper la sélection
 * - Ctrl+U       → dégrouper
 * - q            → quantiser
 * - *            → REC (enregistrement)
 * - 0            → tête de lecture au début du morceau [1.1]
 * - 1            → tête de lecture au locator L
 * - 2            → tête de lecture au locator R
 * - o            → zoom sur la sélection
 * - Ctrl+Espace  → lecture AUDIO globale
 * - Shift+Espace → lecture MIDI (Roland)
 */
export type PianoRollAction =
  | 'tool-edit'
  | 'tool-select'
  | 'group'
  | 'ungroup'
  | 'quantize'
  | 'rec'
  | 'go-start'
  | 'go-loc-l'
  | 'go-loc-r'
  | 'zoom-selection'
  | 'play-audio'
  | 'play-midi';

export interface ShortcutEventLike {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  /** Cible de l'événement (DOM element) — null/absent = pas de garde. */
  target?: unknown;
}

/** Vrai si la cible est un champ de saisie / bouton (saisie utilisateur). */
export function isTypingTarget(target: unknown): boolean {
  const t = target as HTMLElement | null;
  if (!t || typeof t.tagName !== 'string') return false;
  const tag = t.tagName;
  return tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}

/** Résout la touche → action (null si aucune correspondance). */
export function pianoRollShortcut(e: ShortcutEventLike): PianoRollAction | null {
  if (isTypingTarget(e.target)) return null;
  const mod = !!(e.ctrl || e.meta);
  const k = String(e.key).toLowerCase();
  if (mod) {
    if (k === 'g') return 'group';
    if (k === 'u') return 'ungroup';
    if (k === ' ') return 'play-audio'; // Ctrl+Espace = lecture audio globale
    return null;
  }
  if (e.shift && k === ' ') return 'play-midi'; // Shift+Espace = lecture MIDI
  switch (k) {
    case 'e': return 'tool-edit';
    case 'v': return 'tool-select';
    case 'q': return 'quantize';
    case '*': return 'rec';
    case '0': return 'go-start';
    case '1': return 'go-loc-l';
    case '2': return 'go-loc-r';
    case 'o': return 'zoom-selection';
    default: return null;
  }
}
