import { describe, expect, it } from 'vitest';
import { drumName, GM_DRUM_NAMES } from './drumNames';

describe('drumNames', () => {
  it('table GM : les essentiels sont nommés', () => {
    expect(GM_DRUM_NAMES[36]).toBe('Kick 1');
    expect(GM_DRUM_NAMES[38]).toBe('Snare');
    expect(GM_DRUM_NAMES[42]).toBe('Hi-Hat (closed)');
    expect(GM_DRUM_NAMES[46]).toBe('Hi-Hat (open)');
    expect(GM_DRUM_NAMES[49]).toBe('Crash 1');
    expect(GM_DRUM_NAMES[51]).toBe('Ride');
  });

  it('drumName : le kit SFZ prime sur la table GM', () => {
    const kit = { 36: 'Grosse caisse', 42: 'Charleston' };
    expect(drumName(36, kit)).toBe('Grosse caisse');
    expect(drumName(42, kit)).toBe('Charleston');
  });

  it('drumName : repli GM puis numéro brut', () => {
    expect(drumName(38, null)).toBe('Snare');
    expect(drumName(127, null)).toBe('127');
  });

  it('drumName : pitch hors table mais connu du kit', () => {
    const kit = { 33: 'Pédale 1' };
    expect(drumName(33, kit)).toBe('Pédale 1');
  });
});
