import { describe, expect, it } from 'vitest';
import {
  beatFromX,
  clipToKeyboard,
  isInKeyboardZone,
  keyboardLeftEdge,
  xFromBeat,
} from './pianoRollCoords';
import { PIANO_KEYBOARD_WIDTH } from './pianoRollTypes';

describe('pianoRollCoords — grille alignée (clavier overlay à droite)', () => {
  it('convertit beat → x écran sans décalage de clavier (origine 0)', () => {
    expect(xFromBeat(0, 60, 0)).toBe(0); // beat 0 = bord gauche, aligné lanes
    expect(xFromBeat(1, 60, 0)).toBe(60);
    expect(xFromBeat(4, 60, 120)).toBe(120);
    expect(xFromBeat(2, 60, 500)).toBe(-380); // scrollé hors champ à gauche
  });

  it('convertit x écran → beat (inverse exact)', () => {
    expect(beatFromX(0, 60, 0)).toBe(0);
    expect(beatFromX(60, 60, 0)).toBe(1);
    expect(beatFromX(120, 60, 120)).toBe(4);
    expect(beatFromX(500, 60, 100)).toBe(10);
  });

  it('le clavier est un overlay à DROITE', () => {
    expect(keyboardLeftEdge(1000)).toBe(1000 - PIANO_KEYBOARD_WIDTH);
    expect(keyboardLeftEdge(100)).toBe(0); // viewport trop petit → 0
    expect(isInKeyboardZone(1000, 1000)).toBe(true);
    expect(isInKeyboardZone(1000 - PIANO_KEYBOARD_WIDTH, 1000)).toBe(false);
    expect(isInKeyboardZone(0, 1000)).toBe(false);
  });

  it('clipToKeyboard empêche les notes de passer sous le clavier droit', () => {
    const vw = 1000;
    const edge = 1000 - PIANO_KEYBOARD_WIDTH; // 900
    // Note entièrement visible
    expect(clipToKeyboard(100, 50, vw)).toEqual({ x: 100, width: 50 });
    // Note qui déborde sous le clavier → largeur rognée
    expect(clipToKeyboard(880, 60, vw)).toEqual({ x: 880, width: 20 });
    // Note entièrement sous le clavier → null (pas dessinée)
    expect(clipToKeyboard(900, 50, vw)).toBeNull();
    expect(clipToKeyboard(950, 50, vw)).toBeNull();
    // Note qui commence AVANT le bord et dépasse → rognée à l'edge
    expect(clipToKeyboard(899, 100, vw)).toEqual({ x: 899, width: 1 });
  });
});
