import { describe, expect, it } from 'vitest';
import { deriveRenderEngine, type RenderInstrument } from './browserSynth';

describe('deriveRenderEngine', () => {
  it('retourne undefined quand aucun instrument non-FluidSynth', () => {
    expect(deriveRenderEngine({})).toBeUndefined();
    expect(deriveRenderEngine({
      0: { engine: 'fluidsynth', path: '' },
    })).toBeUndefined();
  });

  it('retourne sfz quand un instrument SFZ est choisi', () => {
    expect(deriveRenderEngine({
      9: { engine: 'sfz', path: '/x/ALL.sfz' },
    })).toBe('sfz');
  });

  it('retourne vst3 quand un instrument VST3 est choisi', () => {
    expect(deriveRenderEngine({
      0: { engine: 'vst3', path: '/x/Surge XT.vst3' },
    })).toBe('vst3');
  });

  it('donne la priorité à sfz quand les deux types sont mélangés', () => {
    const mixed: Record<number, RenderInstrument> = {
      0: { engine: 'vst3', path: '/x/Surge XT.vst3' },
      9: { engine: 'sfz', path: '/x/ALL.sfz' },
    };
    expect(deriveRenderEngine(mixed)).toBe('sfz');
  });

  it('ignore les canaux FluidSynth quand un instrument est présent ailleurs', () => {
    expect(deriveRenderEngine({
      0: { engine: 'fluidsynth', path: '' },
      2: { engine: 'vst3', path: '/x/piano.vst3' },
    })).toBe('vst3');
  });
});
