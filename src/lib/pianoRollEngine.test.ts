import { describe, expect, it } from 'vitest';
import { autoFitRange, fitRangeToContent } from './pianoRollEngine';

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

describe('fitRangeToContent — fit vertical au contenu réel (ouverture piano roll)', () => {
  const notes = (pitches: number[]) => pitches.map((pitch, i) => ({
    id: `n${i}`, channel: 0, startTime: i, pitch, duration: 0.25, velocity: 100,
  }));

  it('réduit une plage par défaut trop large au contenu (+/−4 demi-tons)', () => {
    // Plage par défaut 36-96 (60 demi-tons) ; notes au centre → resserrée
    const r = fitRangeToContent(notes([60, 64, 67]), 36, 96);
    expect(r).toEqual({ minPitch: 56, maxPitch: 71 });
  });

  it('largeur minimale de 10 demi-tons (contexte lisible)', () => {
    const r = fitRangeToContent(notes([60]), 36, 96);
    expect(r).not.toBeNull();
    if (r) {
      expect(r.maxPitch - r.minPitch).toBe(10);
      expect(r.minPitch).toBeGreaterThanOrEqual(0);
    }
  });

  it('bornes MIDI 0-127 respectées', () => {
    const r = fitRangeToContent(notes([2]), 36, 96);
    if (r) {
      expect(r.minPitch).toBe(0); // 2-4 = -2 → clampé à 0
    }
    const r2 = fitRangeToContent(notes([126]), 36, 96);
    if (r2) {
      expect(r2.maxPitch).toBe(127);
    }
  });

  it('aucune note → aucun changement', () => {
    expect(fitRangeToContent([], 36, 96)).toBeNull();
  });

  it('plage déjà exacte → null (rien à faire)', () => {
    const r = fitRangeToContent(notes([60, 64, 67]), 56, 71);
    expect(r).toBeNull();
  });

  it('conserve l écart réel pour un contenu étendu (ex. basse + aigus)', () => {
    const r = fitRangeToContent(notes([30, 100]), 36, 96);
    expect(r).toEqual({ minPitch: 26, maxPitch: 104 });
  });
});
