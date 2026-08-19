/**
 * Tests de la logique du piano Live (portage de rusty-chord/src/outils.rs).
 */
import { describe, expect, it } from 'vitest';
import {
  GRAPH_KEYS,
  LIVE_PIANO_MAX_PITCH,
  LIVE_PIANO_MIN_PITCH,
  LIVE_PIANO_OCTAVES,
  activePitchSet,
  buildPianoKeys,
  pitchToGraphIndex,
} from './livePiano';

describe('buildPianoKeys', () => {
  it('génère 7 octaves = 84 touches', () => {
    const keys = buildPianoKeys();
    expect(keys).toHaveLength(84);
    expect(LIVE_PIANO_OCTAVES).toBe(7);
  });

  it('commence à C2 (pitch 36, white e) et finit à B8 (pitch 119, white f)', () => {
    const keys = buildPianoKeys();
    expect(keys[0]).toMatchObject({ pitch: 36, cls: 'white e', name: 'C' });
    expect(keys[keys.length - 1]).toMatchObject({ pitch: 119, cls: 'white f', name: 'B' });
    expect(LIVE_PIANO_MIN_PITCH).toBe(36);
    expect(LIVE_PIANO_MAX_PITCH).toBe(119);
  });

  it('respecte l ordre graphique de outils.rs sur chaque octave', () => {
    const keys = buildPianoKeys();
    const expected = GRAPH_KEYS.map(g => g.cls);
    for (let o = 0; o < LIVE_PIANO_OCTAVES; o++) {
      const octaveCls = keys.slice(o * 12, o * 12 + 12).map(k => k.cls);
      expect(octaveCls).toEqual(expected);
    }
  });

  it('calcule les pitchs comme 35 + index + 12×octave (2 octaves de test)', () => {
    const keys = buildPianoKeys(2, 0);
    expect(keys.map(k => k.pitch)).toEqual([
      36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47,
      48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59,
    ]);
  });

  it('donne les noms de notes corrects (white e = C, black cs = C#, white f = B)', () => {
    const keys = buildPianoKeys(1, 0);
    expect(keys[0].noteName).toBe('C2');
    expect(keys[1].noteName).toBe('C#2');
    expect(keys[2].noteName).toBe('D2');
    expect(keys[11].noteName).toBe('B2');
  });

  it('un octave complet contient 7 blanches et 5 noires', () => {
    const keys = buildPianoKeys(1, 0);
    expect(keys.filter(k => k.isBlack)).toHaveLength(5);
    expect(keys.filter(k => !k.isBlack)).toHaveLength(7);
  });
});

describe('pitchToGraphIndex', () => {
  it('mappe chaque pitch au bon index graphique (1..12)', () => {
    expect(pitchToGraphIndex(36)).toBe(1); // C2 → white e
    expect(pitchToGraphIndex(37)).toBe(2); // C#2 → black cs
    expect(pitchToGraphIndex(38)).toBe(3); // D2 → white d
    expect(pitchToGraphIndex(47)).toBe(12); // B2 → white f
    expect(pitchToGraphIndex(48)).toBe(1); // C3 → white e (octave suivante)
    expect(pitchToGraphIndex(60)).toBe(1); // C4
    expect(pitchToGraphIndex(64)).toBe(5); // E4 → white c
    expect(pitchToGraphIndex(119)).toBe(12); // B8
  });

  it('renvoie -1 hors de la plage du piano (36..119)', () => {
    expect(pitchToGraphIndex(35)).toBe(-1);
    expect(pitchToGraphIndex(0)).toBe(-1);
    expect(pitchToGraphIndex(120)).toBe(-1);
    expect(pitchToGraphIndex(127)).toBe(-1);
  });
});

describe('activePitchSet', () => {
  it('garde uniquement les pitchs entiers de la plage du piano', () => {
    const s = activePitchSet([60, 64, 67, 12, 130, 100.5]);
    expect(s.has(60)).toBe(true);
    expect(s.has(64)).toBe(true);
    expect(s.has(67)).toBe(true);
    expect(s.has(12)).toBe(false);
    expect(s.has(130)).toBe(false);
    expect(s.has(100.5)).toBe(false);
    expect(s.size).toBe(3);
  });

  it('gère un tableau vide', () => {
    expect(activePitchSet([]).size).toBe(0);
  });
});
