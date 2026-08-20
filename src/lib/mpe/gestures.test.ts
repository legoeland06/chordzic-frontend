/**
 * Tests de la lib MPE (modal 🎛) : mapping des gestes, throttle, API.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  locateKeywave,
  throttleTrailing,
  wheelToPressure,
  xToBend,
  xToVibrato,
  yToBend,
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

  it('yToBend (RISE 2) : centre vertical = neutre, haut = aigu, bas = grave', () => {
    expect(yToBend(0.5)).toBe(BEND_CENTER);
    expect(yToBend(0)).toBe(16383); // tout en haut → +8192 (borné)
    expect(yToBend(1)).toBe(0); // tout en bas → -8192
    expect(yToBend(0.25)).toBe(BEND_CENTER + 4096); // 8192 + (0.25 × 16384)
    expect(yToBend(0.75)).toBe(BEND_CENTER - 4096);
    expect(yToBend(-0.3)).toBe(16383); // bornes
    expect(yToBend(2)).toBe(0);
  });

  it('xToVibrato : centre = 0, bords = profondeur max, symétrique, borné', () => {
    expect(xToVibrato(0, 2)).toBe(0);
    expect(xToVibrato(0.5, 2)).toBe(2);
    expect(xToVibrato(-0.5, 2)).toBe(2); // symétrique
    expect(xToVibrato(0.25, 2)).toBe(1); // linéaire |xRel| / 0.5 × max
    expect(xToVibrato(0.3, 2)).toBe(1.2);
    expect(xToVibrato(0.7, 2)).toBe(2); // hors bornes → max
    expect(xToVibrato(0.3, 30)).toBe(14.4); // maxDepth borné à 24
    expect(xToVibrato(0.3, 0)).toBe(0);
  });

  it('locateKeywave : index 0..count-1 et xRel [-0.5, +0.5] centré', () => {
    expect(locateKeywave(0, 25)).toEqual({ index: 0, xRel: -0.5 });
    expect(locateKeywave(1, 25)).toEqual({ index: 24, xRel: 0.5 });
    expect(locateKeywave(0.5, 25)).toEqual({ index: 12, xRel: 0 }); // centre exact
    expect(locateKeywave(0.04, 25)).toEqual({ index: 1, xRel: -0.5 }); // 0.04×25 = 1.0 → bord gauche
    expect(locateKeywave(0.039, 25)).toEqual({ index: 0, xRel: 0.475 }); // 0.039×25 = 0.975
    expect(locateKeywave(-0.2, 25)).toEqual({ index: 0, xRel: -0.5 }); // bornes
    expect(locateKeywave(1.5, 25)).toEqual({ index: 24, xRel: 0.5 });
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
