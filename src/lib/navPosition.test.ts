import { describe, expect, it } from 'vitest';
import {
  beatsFromSeconds,
  estimatePositionSec,
  navStartAtBeats,
  secondsFromBeats,
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
});
