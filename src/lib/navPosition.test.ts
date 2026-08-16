import { describe, expect, it } from 'vitest';
import {
  beatsFromSeconds,
  estimatePositionSec,
  navStartAtBeats,
  secondsFromBeats,
  wrapLoopPositionSec,
} from './navPosition';

describe('navPosition — position de lecture mode Navig', () => {
  it('estime la position depuis le démarrage serveur (secondes)', () => {
    expect(estimatePositionSec(1000, 1000)).toBe(0);
    expect(estimatePositionSec(1000, 2500)).toBe(1.5);
    expect(estimatePositionSec(1000, 500)).toBe(0); // jamais négatif
  });

  it('convertit beats ↔ secondes au tempo donné', () => {
    expect(secondsFromBeats(4, 120)).toBe(2);
    expect(secondsFromBeats(1, 60)).toBe(1);
    expect(secondsFromBeats(0, 120)).toBe(0);
    expect(beatsFromSeconds(2, 120)).toBe(4);
    expect(beatsFromSeconds(1, 60)).toBe(1);
    expect(beatsFromSeconds(-3, 120)).toBe(0); // jamais négatif
    expect(beatsFromSeconds(30, 60)).toBe(30);
    expect(secondsFromBeats(0, 0)).toBe(0); // tempo ≤ 0 → clampé à 1
  });

  it('calcule start_at (beats) pour le scrub séparé', () => {
    expect(navStartAtBeats(0, 120)).toBe(0);
    expect(navStartAtBeats(2, 120)).toBe(4);
    expect(navStartAtBeats(2.5, 123)).toBeCloseTo(5.125, 6);
  });

  it('wrap la position dans l\'intervalle [L, R[ (locators)', () => {
    // Pas d'intervalle → position inchangée
    expect(wrapLoopPositionSec(5, 0, 0)).toBe(5);
    expect(wrapLoopPositionSec(5, 3, 3)).toBe(5);
    // Avant L : inchangée (le 1er passage joue de start à R)
    expect(wrapLoopPositionSec(2, 4, 8)).toBe(2);
    // Dans l'intervalle : inchangée
    expect(wrapLoopPositionSec(5, 4, 8)).toBe(5);
    expect(wrapLoopPositionSec(7.999, 4, 8)).toBeCloseTo(7.999, 6);
    // À R et au-delà : wrap dans [L, R[
    expect(wrapLoopPositionSec(8, 4, 8)).toBe(4);
    expect(wrapLoopPositionSec(9.5, 4, 8)).toBeCloseTo(5.5, 6);
    expect(wrapLoopPositionSec(12, 4, 8)).toBe(4);
    expect(wrapLoopPositionSec(20, 4, 8)).toBe(4);
  });
});
