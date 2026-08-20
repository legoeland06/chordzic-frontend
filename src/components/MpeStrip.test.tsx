/**
 * Tests de MpeStrip : le glissé émet des gestes échantillonnés (bend/timbre),
 * la molette ajuste la pression, le retour auto ramène le bend au centre.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import MpeStrip, { StripGesture } from './MpeStrip';

// jsdom : ni ResizeObserver ni pointer capture ni getBoundingClientRect
// réaliste — no-op / mocks globaux.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = MockResizeObserver;

function mockRect(w: number, h: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: w, height: h, left: 0, top: 0, right: w, bottom: h, x: 0, y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

function stubPointerCapture(el: HTMLElement) {
  el.setPointerCapture = () => {};
  el.releasePointerCapture = () => {};
  el.hasPointerCapture = () => true;
}

function pointer(el: HTMLElement, type: string, x: number, y: number) {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: x, clientY: y }));
}

function wheel(el: HTMLElement, deltaY: number) {
  el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY }));
}

interface Harness {
  strip: HTMLElement;
  onGesture: ReturnType<typeof vi.fn>;
  onGestureEnd: ReturnType<typeof vi.fn>;
  root: Root;
}

function renderStrip(returnMode: 'center' | 'hold' = 'hold'): Harness {
  const onGesture = vi.fn();
  const onGestureEnd = vi.fn();
  const root = createRoot(document.body);
  act(() => {
    root.render(<MpeStrip returnMode={returnMode} onGesture={onGesture} onGestureEnd={onGestureEnd} />);
  });
  const strip = document.querySelector('[title^="Glisser"]') as HTMLElement;
  stubPointerCapture(strip);
  return { strip, onGesture, onGestureEnd, root };
}

/** Attend la prochaine frame (les gestes sont échantillonnés en rAF). */
const nextFrame = () => new Promise(r => setTimeout(r, 40));

function lastGesture(fn: ReturnType<typeof vi.fn>): StripGesture {
  const calls = fn.mock.calls as [StripGesture][];
  return calls[calls.length - 1][0];
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('MpeStrip', () => {
  it('le glissé émet un geste bend/timbre échantillonné', async () => {
    mockRect(1000, 200);
    const h = renderStrip();

    act(() => pointer(h.strip, 'pointerdown', 500, 100)); // centre
    act(() => pointer(h.strip, 'pointermove', 750, 50)); // droite + haut
    await nextFrame();

    expect(h.onGesture).toHaveBeenCalled();
    const g = lastGesture(h.onGesture);
    // x=0,75 → bend ≈ 12288 (> centre) ; y=0,25 → timbre ≈ 95 (> neutre)
    expect(g.bend).toBeGreaterThan(8192);
    expect(g.timbre).toBeGreaterThan(64);
    act(() => h.root.unmount());
  });

  it('sans mouvement, aucun geste émis', async () => {
    mockRect(1000, 200);
    const h = renderStrip();
    await nextFrame();
    expect(h.onGesture).not.toHaveBeenCalled();
    act(() => h.root.unmount());
  });

  it('la molette ajuste la pression (borne 0-127)', async () => {
    mockRect(1000, 200);
    const h = renderStrip();

    act(() => wheel(h.strip, -100));
    await nextFrame();
    expect(h.onGesture).toHaveBeenCalled();
    const g = lastGesture(h.onGesture);
    expect(g.pressure).toBeGreaterThan(0);
    expect(g.pressure).toBeLessThanOrEqual(127);

    act(() => wheel(h.strip, 10000)); // très bas
    await nextFrame();
    expect(lastGesture(h.onGesture).pressure).toBe(0);
    act(() => h.root.unmount());
  });

  it('le retour auto ramène le bend au centre et termine le geste', async () => {
    mockRect(1000, 200);
    const h = renderStrip('center');

    // Glisser à l'extrême gauche (bend 0) puis relâcher
    act(() => pointer(h.strip, 'pointerdown', 0, 100));
    act(() => pointer(h.strip, 'pointermove', 0, 100));
    await nextFrame();
    act(() => pointer(h.strip, 'pointerup', 0, 100));

    // L'animation de retour tourne ~10 frames (~160 ms) ; attendre la fin
    await new Promise(r => setTimeout(r, 400));

    expect(h.onGestureEnd).toHaveBeenCalled();
    expect(h.onGestureEnd.mock.calls[0][0].bend).toBe(8192); // revenu au centre
    act(() => h.root.unmount());
  });

  it('en mode maintien, le bend reste où on lâche', async () => {
    mockRect(1000, 200);
    const h = renderStrip('hold');

    act(() => pointer(h.strip, 'pointerdown', 250, 100)); // gauche du centre
    await nextFrame();
    act(() => pointer(h.strip, 'pointerup', 250, 100));
    await nextFrame();

    expect(h.onGestureEnd).toHaveBeenCalled();
    expect(h.onGestureEnd.mock.calls[0][0].bend).toBeLessThan(8192); // resté grave
    act(() => h.root.unmount());
  });
});
