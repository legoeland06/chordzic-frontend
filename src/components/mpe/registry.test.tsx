/**
 * Tests du registre des modules MPE : les contrôleurs enregistrés sont
 * valides (id unique, composant présent) et la sélection fonctionne.
 */
// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MPE_MODULES, getMpeModule, mpeModuleIds } from './registry';
import MpeStrip from './MpeStrip';
import MpeModules from './MpeModules';

describe('registre des modules MPE', () => {
  it('au moins un module est enregistré (le Seaboard par défaut)', () => {
    expect(MPE_MODULES.length).toBeGreaterThanOrEqual(1);
    expect(MPE_MODULES[0].id).toBe('seaboard');
    expect(MPE_MODULES[0].name).toContain('Seaboard');
  });

  it('chaque module a un id unique, un nom, une icône et un composant', () => {
    const ids = mpeModuleIds();
    expect(new Set(ids).size).toBe(ids.length); // unicité
    for (const m of MPE_MODULES) {
      expect(m.id.length).toBeGreaterThan(0);
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.icon.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(0);
      // memo() retourne un objet {$$typeof, type…} — vérifier qu'il est
      // rendable (présent et non-null) plutôt que le type exact.
      expect(m.component).toBeTruthy();
    }
  });

  it('getMpeModule retourne le module demandé, sinon le premier', () => {
    expect(getMpeModule('seaboard').id).toBe('seaboard');
    expect(getMpeModule('inconnu').id).toBe(MPE_MODULES[0].id);
  });

  it('le module Seaboard rend bien le composant MpeStrip', () => {
    expect(MPE_MODULES[0].component).toBe(MpeStrip);
  });
});

describe('rendu du module parent avec le module actif', () => {
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = MockResizeObserver;

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('le sélecteur liste les modules et le module actif est rendu', () => {
    // Rendu minimal du parent (fetch mocké — pas de vrai réseau en test)
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }) as unknown as typeof fetch;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 1000, height: 200, left: 0, top: 0, right: 1000, bottom: 200, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    const root = createRoot(document.body);
    act(() => {
      root.render(<MpeModules onClose={() => {}} />);
    });
    // Le titre « MPE Modules » + le nom du module Seaboard sont visibles
    const html = document.body.innerHTML;
    expect(html).toContain('MPE Modules');
    expect(html).toContain('Seaboard');
    // La zone tactile (title « Glisser ») est rendue
    expect(html).toContain('Glisser');
    act(() => root.unmount());
  });
});
