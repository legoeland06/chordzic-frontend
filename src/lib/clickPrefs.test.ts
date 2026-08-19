/**
 * Tests des préférences de clic (localStorage).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { getClickSig, setClickSig } from './clickPrefs';

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

describe('clickPrefs (configuration du clic)', () => {
  it('signature vide par défaut', () => {
    expect(getClickSig()).toBe('');
  });

  it('set puis get retourne la valeur', () => {
    setClickSig('{"in_render":true}');
    expect(getClickSig()).toBe('{"in_render":true}');
  });

  it('set remplace la valeur précédente', () => {
    setClickSig('{"in_render":false}');
    setClickSig('{"out_device":"hw:1"}');
    expect(getClickSig()).toBe('{"out_device":"hw:1"}');
  });
});
