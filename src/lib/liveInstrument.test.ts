import { beforeEach, describe, expect, it } from 'vitest';
import {
  filterPresets, GM_PROGRAMS, groupPresets, liveInstrumentLabel,
  loadSavedLiveInstrument, nextSource, saveLiveInstrument, SOURCES,
  stepInList, SurgePreset,
} from './liveInstrument';

describe('liveInstrument', () => {
  const presets: SurgePreset[] = [
    { name: 'Soft Suitcase', path: '/k/Soft Suitcase.fxp', category: 'Keys', best: true },
    { name: 'DX EP', path: '/k/DX EP.fxp', category: 'Keys', best: true },
    { name: 'Brass Hit', path: '/b/Brass Hit.fxp', category: 'Brass', best: false },
    { name: 'Analog Lead', path: '/l/Analog Lead.fxp', category: 'Leads', best: true },
  ];

  describe('groupPresets', () => {
    it('regroupe par catégorie en conservant l’ordre', () => {
      const groups = groupPresets(presets);
      expect(groups.map(g => g.category)).toEqual(['Keys', 'Brass', 'Leads']);
      expect(groups[0].items.map(i => i.name)).toEqual(['Soft Suitcase', 'DX EP']);
    });

    it('retourne une liste vide pour zéro preset', () => {
      expect(groupPresets([])).toEqual([]);
    });
  });

  describe('filterPresets', () => {
    it('retourne tout sans requête', () => {
      expect(filterPresets(presets, '')).toHaveLength(4);
      expect(filterPresets(presets, '   ')).toHaveLength(4);
    });

    it('filtre par nom (insensible à la casse, partiel)', () => {
      expect(filterPresets(presets, 'ep').map(p => p.name)).toEqual(['DX EP']);
    });

    it('filtre par catégorie', () => {
      expect(filterPresets(presets, 'leads').map(p => p.name)).toEqual(['Analog Lead']);
    });
  });

  describe('stepInList (navigation ↑/↓ avec rebouclage)', () => {
    it('avance et reboucle', () => {
      const list = ['a', 'b', 'c'];
      expect(stepInList(list, 'a', 1)).toBe(1);
      expect(stepInList(list, 'c', 1)).toBe(0); // wrap
      expect(stepInList(list, 'b', -1)).toBe(0);
      expect(stepInList(list, 'a', -1)).toBe(2); // wrap arrière
    });

    it('courant null → premier/dernier ; inconnu → premier', () => {
      const list = ['a', 'b', 'c'];
      expect(stepInList(list, null, 1)).toBe(0);
      expect(stepInList(list, null, -1)).toBe(2);
      expect(stepInList(list, 'zzz', 1)).toBe(0);
    });

    it('liste vide → -1', () => {
      expect(stepInList([], null, 1)).toBe(-1);
    });
  });

  describe('nextSource (navigation ←/→)', () => {
    it('cycle thru → vst3 → fluid → thru', () => {
      expect(SOURCES).toEqual(['thru', 'vst3', 'fluid']);
      expect(nextSource('thru', 1)).toBe('vst3');
      expect(nextSource('vst3', 1)).toBe('fluid');
      expect(nextSource('fluid', 1)).toBe('thru');
      expect(nextSource('thru', -1)).toBe('fluid');
    });
  });

  describe('catalogue GM', () => {
    it('contient les 128 instruments GM', () => {
      expect(GM_PROGRAMS).toHaveLength(128);
      expect(GM_PROGRAMS[0]).toBe('Acoustic Grand Piano');
      expect(GM_PROGRAMS[50]).toBe('Synth Strings 1');
      expect(GM_PROGRAMS[51]).toBe('Synth Strings 2');
    });
  });

  describe('persistance localStorage', () => {
    /** Mock minimal de localStorage (absent en environnement node). */
    const store = new Map<string, string>();
    beforeEach(() => {
      store.clear();
      (globalThis as Record<string, unknown>).localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => store.clear(),
      };
    });

    it('défaut : thru sans rien', () => {
      expect(loadSavedLiveInstrument()).toEqual({ source: 'thru', preset: null, program: null });
    });

    it('sauvegarde puis relit', () => {
      saveLiveInstrument({ source: 'vst3', preset: '/k/DX EP.fxp', program: null });
      expect(loadSavedLiveInstrument()).toEqual({ source: 'vst3', preset: '/k/DX EP.fxp', program: null });
    });

    it('tolère un JSON invalide et une source inconnue', () => {
      localStorage.setItem('chordzic_live_instrument', '{pas du json');
      expect(loadSavedLiveInstrument().source).toBe('thru');
      localStorage.setItem('chordzic_live_instrument', '{"source":"alien"}');
      expect(loadSavedLiveInstrument().source).toBe('thru');
    });
  });

  describe('liveInstrumentLabel', () => {
    it('thru → Roland GM', () => {
      expect(liveInstrumentLabel({
        source: 'thru',
        vst3: { enabled: false, preset: null, error: null },
        fluid: { program: null, soundfont: null },
      })).toBe('🔌 Roland GM');
    });

    it('vst3 → nom du preset Surge', () => {
      expect(liveInstrumentLabel({
        source: 'vst3',
        vst3: { enabled: true, preset: { name: 'DX EP', path: '/k/DX EP.fxp' }, error: null },
        fluid: { program: null, soundfont: null },
      })).toBe('🎸 Surge — DX EP');
    });

    it('vst3 sans preset → preset par défaut', () => {
      expect(liveInstrumentLabel({
        source: 'vst3',
        vst3: { enabled: true, preset: null, error: null },
        fluid: { program: null, soundfont: null },
      })).toBe('🎸 Surge — preset par défaut');
    });

    it('fluid → nom GM du programme (0 = Acoustic Grand Piano)', () => {
      expect(liveInstrumentLabel({
        source: 'fluid',
        vst3: { enabled: false, preset: null, error: null },
        fluid: { program: 0, soundfont: null },
      })).toBe('🎹 FluidSynth — Acoustic Grand Piano');
    });

    it('fluid sans programme → GM 0', () => {
      expect(liveInstrumentLabel({
        source: 'fluid',
        vst3: { enabled: false, preset: null, error: null },
        fluid: { program: null, soundfont: null },
      })).toBe('🎹 FluidSynth — Acoustic Grand Piano');
    });
  });
});
