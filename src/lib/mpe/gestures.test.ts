/**
 * Tests de la lib MPE (modal 🎛) : mapping des gestes, throttle, API.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  throttleTrailing,
  wheelToPressure,
  xToBend,
  yToTimbre,
} from './gestures';
import { BEND_CENTER, TIMBRE_CENTER } from './types';

describe('mapping des gestes MPE', () => {
  it('xToBend : 0 → 0, 0.5 → centre, 1 → 16383, bornes', () => {
    expect(xToBend(0)).toBe(0);
    expect(xToBend(1)).toBe(16383);
    // 0.5 × 16383 = 8191.5 → arrondi 8192 (le centre exact)
    expect(xToBend(0.5)).toBe(BEND_CENTER);
    // Bornes hors [0,1]
    expect(xToBend(-0.2)).toBe(0);
    expect(xToBend(1.5)).toBe(16383);
  });

  it('yToTimbre : haut = 127, bas = 0, centre = 64', () => {
    expect(yToTimbre(0)).toBe(127); // y=0 (haut) → timbre max
    expect(yToTimbre(1)).toBe(0); // y=1 (bas) → timbre min
    // 0.5 × 127 = 63.5 → arrondi 64 (neutre)
    expect(yToTimbre(0.5)).toBe(TIMBRE_CENTER);
    expect(yToTimbre(-0.3)).toBe(127);
    expect(yToTimbre(2)).toBe(0);
  });

  it('wheelToPressure : molette haut augmente, bas diminue, borné 0-127', () => {
    expect(wheelToPressure(64, -100)).toBe(68); // molette vers le haut
    expect(wheelToPressure(64, 100)).toBe(60); // molette vers le bas
    expect(wheelToPressure(0, -100)).toBe(4);
    expect(wheelToPressure(127, 100)).toBe(123);
    expect(wheelToPressure(2, -100)).toBe(6);
    expect(wheelToPressure(125, 100)).toBe(121);
    // Pas de dépassement
    expect(wheelToPressure(126, -100)).toBe(127);
    expect(wheelToPressure(1, 100)).toBe(0);
  });
});

describe('throttleTrailing', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("n'envoie que le dernier argument par fenêtre", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = throttleTrailing(fn, 30);

    t(1);
    t(2);
    t(3);
    expect(fn).not.toHaveBeenCalled(); // rien avant la fin de fenêtre

    vi.advanceTimersByTime(30);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3); // seul le dernier part
  });

  it('trailing : un appel en fin de fenêtre repart dans la suivante', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = throttleTrailing(fn, 30);

    t('a');
    vi.advanceTimersByTime(30);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');

    // Nouvelle rafale pendant la fenêtre suivante
    t('b');
    t('c');
    vi.advanceTimersByTime(30);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('c');
  });

  it('aucun appel sans événement', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = throttleTrailing(fn, 30);
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });
});
