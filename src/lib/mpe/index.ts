/**
 * index.ts — point d'entrée public du système MPE Modules.
 *
 * Les composants et la logique n'importent que depuis ce module : les
 * modules de contrôleurs (Seaboard, LinnStrument…) vivent dans
 * `components/mpe/registry.ts` et partagent ces types/API/gestures.
 */
export * from './types';
export * from './api';
export * from './gestures';
