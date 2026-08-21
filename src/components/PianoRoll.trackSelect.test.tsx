/**
 * Tests du sélecteur de piste dans le PianoRoll MODAL : la liste déroulante
 * permet de sauter vers une autre piste (la position scroll/zoom/tête de
 * lecture est conservée car le state interne du composant n'est pas
 * réinitialisé — le sélecteur ne fait qu'appeler onSelectTrack(canal)).
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import PianoRoll from './PianoRoll';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = MockResizeObserver;

// jsdom ne dessine pas les canvas 2D : getContext retourne null et les
// fonctions draw du PianoRoll sortent proprement (if (!ctx) return).
// getBoundingClientRect manque de dimensions fiables — on le stabilise.
const rect = { x: 0, y: 0, width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, toJSON: () => ({}) };
(globalThis as { HTMLElement?: unknown }).HTMLElement = globalThis.HTMLElement;
// Patch : getBoundingClientRect par défaut sur les éléments
const origGetBoundingClientRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function () { return rect as DOMRect; };

const TRACKS = [
  { channel: 1, label: 'Piano' },
  { channel: 2, label: 'Basse' },
  { channel: 3, label: 'Drums' },
];

function renderModal(extra: Partial<React.ComponentProps<typeof PianoRoll>> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <PianoRoll
        notes={[]}
        onNotesChange={() => {}}
        trackLabel="Piano"
        channel={1}
        tempo={120}
        trackOptions={TRACKS}
        onSelectTrack={vi.fn()}
        {...extra}
      />,
    );
  });
  return { container, root };
}

describe('PianoRoll modal — sélecteur de piste', () => {
  let root: Root;
  let container: HTMLElement;

  afterEach(() => {
    act(() => { root?.unmount(); });
    container?.remove();
    vi.restoreAllMocks();
    Element.prototype.getBoundingClientRect = origGetBoundingClientRect;
  });

  it('affiche la liste déroulante des pistes (modal seulement)', () => {
    ({ root, container } = renderModal());
    const sel = container.querySelector('select[title*="Sauter vers"]');
    expect(sel).toBeTruthy();
    const options = sel ? Array.from(sel.querySelectorAll('option')).map(o => o.textContent) : [];
    expect(options).toEqual(['Piano', 'Basse', 'Drums']);
  });

  it('la piste courante est sélectionnée', () => {
    ({ root, container } = renderModal());
    const sel = container.querySelector('select[title*="Sauter vers"]') as HTMLSelectElement;
    expect(sel.value).toBe('1');
  });

  it('changer la piste appelle onSelectTrack(canal) — position conservée', () => {
    const onSelectTrack = vi.fn();
    ({ root, container } = renderModal({ onSelectTrack }));
    const sel = container.querySelector('select[title*="Sauter vers"]') as HTMLSelectElement;
    act(() => {
      sel.value = '3';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onSelectTrack).toHaveBeenCalledWith(3);
  });

  it('pas de sélecteur en mode embarqué (intégré)', () => {
    ({ root, container } = renderModal({ embedded: true }));
    expect(container.querySelector('select[title*="Sauter vers"]')).toBeNull();
  });

  it('pas de sélecteur sans onSelectTrack ou avec une seule piste', () => {
    ({ root, container } = renderModal({ onSelectTrack: undefined }));
    expect(container.querySelector('select[title*="Sauter vers"]')).toBeNull();

    ({ root, container } = renderModal({ trackOptions: [{ channel: 1, label: 'Piano' }] }));
    expect(container.querySelector('select[title*="Sauter vers"]')).toBeNull();
  });
});
