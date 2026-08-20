import { beforeEach, describe, expect, it } from 'vitest';
import { filterPresets, groupPresets, loadSavedLiveVst3, saveLiveVst3, SurgePreset } from './vst3Live';

describe('vst3Live', () => {
  const presets: SurgePreset[] = [
    { name: 'Soft Suitcase', path: '/k/Soft Suitcase.fxp', category: 'Keys' },
    { name: 'DX EP', path: '/k/DX EP.fxp', category: 'Keys' },
    { name: 'Brass Hit', path: '/b/Brass Hit.fxp', category: 'Brass' },
    { name: 'Analog Lead', path: '/l/Analog Lead.fxp', category: 'Leads' },
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
      const out = filterPresets(presets, 'ep');
      expect(out.map(p => p.name)).toEqual(['DX EP']);
    });

    it('filtre par catégorie', () => {
      const out = filterPresets(presets, 'leads');
      expect(out.map(p => p.name)).toEqual(['Analog Lead']);
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

    it('défaut : désactivé sans preset', () => {
      expect(loadSavedLiveVst3()).toEqual({ enabled: false, preset: null });
    });

    it('sauvegarde puis relit', () => {
      saveLiveVst3({ enabled: true, preset: '/k/DX EP.fxp' });
      expect(loadSavedLiveVst3()).toEqual({ enabled: true, preset: '/k/DX EP.fxp' });
    });

    it('tolère un JSON invalide', () => {
      localStorage.setItem('chordzic_live_vst3', '{pas du json');
      expect(loadSavedLiveVst3()).toEqual({ enabled: false, preset: null });
    });
  });
});
