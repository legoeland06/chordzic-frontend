import { describe, expect, it } from 'vitest';
import { autoFitRange } from './pianoRollEngine';

describe('autoFitRange — registre auto-couvrant du PianoRoll', () => {
  const notes = (pitches: number[]) => pitches.map((pitch, i) => ({
    id: `n${i}`, channel: 0, startTime: i, pitch, duration: 0.25, velocity: 100,
  }));

  it('ne touche à rien si toutes les notes sont dans la plage', () => {
    expect(autoFitRange(notes([60, 64, 67]), 48, 84)).toBeNull();
    expect(autoFitRange([], 48, 84)).toBeNull();
  });

  it('étend le bord HAUT si une note dépasse (marge +2)', () => {
    const r = autoFitRange(notes([60, 86]), 48, 84);
    expect(r).toEqual({ minPitch: 48, maxPitch: 88 });
  });

  it('étend le bord BAS si une note passe sous la plage (marge −2)', () => {
    const r = autoFitRange(notes([40, 60]), 48, 84);
    expect(r).toEqual({ minPitch: 38, maxPitch: 84 });
  });

  it('ne resserre JAMAIS une plage déjà couvrante', () => {
    // Une plage large reste large même si les notes sont au centre
    expect(autoFitRange(notes([60]), 36, 96)).toBeNull();
  });

  it('respecte l’écart minimal d’une octave et les bornes MIDI', () => {
    const r = autoFitRange(notes([0]), 12, 24);
    expect(r!.minPitch).toBe(0);
    expect(r!.maxPitch - r!.minPitch).toBeGreaterThanOrEqual(12);
    const r2 = autoFitRange(notes([127]), 100, 112);
    expect(r2!.maxPitch).toBe(127);
    expect(r2!.maxPitch - r2!.minPitch).toBeGreaterThanOrEqual(12);
  });
});
