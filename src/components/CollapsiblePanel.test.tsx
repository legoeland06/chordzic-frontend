/**
 * Tests du CollapsiblePanel (environnement jsdom) : le contenu reste MONTÉ
 * (display:none) — vérifie aussi le basculement du chevron et aria-expanded.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import CollapsiblePanel from './CollapsiblePanel';

function renderPanel(open: boolean, onToggle: () => void): Root {
  const root = createRoot(document.body);
  act(() => {
    root.render(
      <CollapsiblePanel title="🎹 Piano Live" open={open} onToggle={onToggle}>
        <div data-testid="content">contenu</div>
      </CollapsiblePanel>,
    );
  });
  return root;
}

function content(): HTMLElement {
  return document.querySelector('[data-testid="content"]') as HTMLElement;
}

function toggleBtn(): HTMLButtonElement {
  return document.querySelector('button') as HTMLButtonElement;
}

describe('<CollapsiblePanel />', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('déployé : contenu visible, chevron ▲, aria-expanded=true', () => {
    const root = renderPanel(true, () => {});
    expect(content().style.display).toBe('');
    expect(toggleBtn().getAttribute('aria-expanded')).toBe('true');
    expect(toggleBtn().innerHTML).toContain('lucide-chevron-up');
    act(() => root.unmount());
  });

  it('replié : contenu masqué (display:none), chevron ▼, aria-expanded=false', () => {
    const root = renderPanel(false, () => {});
    // Le display:none est porté par le wrapper (le contenu reste monté).
    const wrapper = content().parentElement as HTMLElement;
    expect(wrapper.style.display).toBe('none');
    expect(toggleBtn().getAttribute('aria-expanded')).toBe('false');
    expect(toggleBtn().innerHTML).toContain('lucide-chevron-down');
    act(() => root.unmount());
  });

  it('clic sur le chevron → onToggle appelé (la bascule est pilotée par le parent)', () => {
    const onToggle = vi.fn();
    const root = renderPanel(true, onToggle);
    act(() => toggleBtn().click());
    expect(onToggle).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('le contenu reste MONTÉ même replié (la reco d accords continue de tourner)', () => {
    const root = renderPanel(false, () => {});
    // Le nœud existe toujours dans le DOM (pas de démontage).
    expect(content()).not.toBeNull();
    act(() => root.unmount());
  });
});
