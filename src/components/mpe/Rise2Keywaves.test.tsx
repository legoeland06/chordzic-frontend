/**
 * Tests des keywaves ROLI Seaboard RISE 2 (5D Touch) :
 * Strike (note-on), Glide (bend), glissando (changement de keywave),
 * Slide (timbre), Press (molette), Lift (note-off).
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { BEND_CENTER, TIMBRE_CENTER, StripGesture } from '../../lib/mpe';
import Rise2Keywaves, { RISE2_KEYWAVES, RISE2_START_PITCH } from './Rise2Keywaves';

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

const nextFrame = () => new Promise(r => setTimeout(r, 40));

interface Harness {
  zone: HTMLElement;
  onGesture: ReturnType<typeof vi.fn>;
  onGestureEnd: ReturnType<typeof vi.fn>;
  root: Root;
  notes: ReturnType<typeof vi.fn>;
}

function renderZone(): Harness {
  const onGesture = vi.fn();
  const onGestureEnd = vi.fn();
  const notes = vi.fn().mockResolvedValue(true);
  global.fetch = vi.fn((_url: unknown, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (body.on !== undefined) notes(body);
    return Promise.resolve({ ok: true });
  }) as unknown as typeof fetch;

  const root = createRoot(document.body);
  act(() => {
    root.render(<Rise2Keywaves returnMode="center" onGesture={onGesture} onGestureEnd={onGestureEnd} />);
  });
  const zone = document.querySelector('[title^="Keywaves"]') as HTMLElement;
  stubPointerCapture(zone);
  return { zone, onGesture, onGestureEnd, root, notes };
}

function lastGesture(fn: ReturnType<typeof vi.fn>): StripGesture {
  const calls = fn.mock.calls as [StripGesture][];
  return calls[calls.length - 1][0];
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('Rise2Keywaves (5D Touch)', () => {
  it('STRIKE : l appui sur une keywave joue la note (C2 = 36)', async () => {
    mockRect(980, 200); // 49 keywaves × 20 px
    const h = renderZone();
    // Keywave 0 (C2) : x = 10 px
    act(() => pointer(h.zone, 'pointerdown', 10, 100));
    expect(h.notes).toHaveBeenCalledWith(expect.objectContaining({ pitch: RISE2_START_PITCH, on: true }));
    act(() => pointer(h.zone, 'pointerup', 10, 100));
    expect(h.notes).toHaveBeenCalledWith(expect.objectContaining({ pitch: RISE2_START_PITCH, on: false }));
    act(() => h.root.unmount());
  });

  it('GLIDE : glisser dans la keywave émet un bend (centre = neutre)', async () => {
    mockRect(980, 200);
    const h = renderZone();
    // Keywave 24 (E4) : centre = x = 24*20 + 10 = 490
    act(() => pointer(h.zone, 'pointerdown', 490, 100)); // centre exact
    await nextFrame();
    expect(lastGesture(h.onGesture).bend).toBe(BEND_CENTER);
    // Glisse vers la gauche de la keywave (x=484, pos 0.2) → bend grave
    act(() => pointer(h.zone, 'pointermove', 484, 100));
    await nextFrame();
    expect(lastGesture(h.onGesture).bend).toBeLessThan(BEND_CENTER);
    // Glisse vers la droite (x=496, pos 0.8) → bend aigu
    act(() => pointer(h.zone, 'pointermove', 496, 100));
    await nextFrame();
    expect(lastGesture(h.onGesture).bend).toBeGreaterThan(BEND_CENTER);
    act(() => pointer(h.zone, 'pointerup', 496, 100));
    act(() => h.root.unmount());
  });

  it('glissando : traverser une keywave coupe la note et joue la suivante', async () => {
    mockRect(980, 200);
    const h = renderZone();
    act(() => pointer(h.zone, 'pointerdown', 10, 100)); // keywave 0
    expect(h.notes).toHaveBeenLastCalledWith(expect.objectContaining({ pitch: 36, on: true }));
    // Traverse vers la keywave 2 (x = 50 px)
    act(() => pointer(h.zone, 'pointermove', 50, 100));
    await nextFrame();
    expect(h.notes).toHaveBeenCalledWith(expect.objectContaining({ pitch: 36, on: false }));
    expect(h.notes).toHaveBeenCalledWith(expect.objectContaining({ pitch: 38, on: true }));
    act(() => pointer(h.zone, 'pointerup', 50, 100));
    expect(h.notes).toHaveBeenCalledWith(expect.objectContaining({ pitch: 38, on: false }));
    act(() => h.root.unmount());
  });

  it('SLIDE : la position verticale pilote le timbre (haut = brillant)', async () => {
    mockRect(980, 200);
    const h = renderZone();
    act(() => pointer(h.zone, 'pointerdown', 10, 100)); // milieu → timbre neutre
    await nextFrame();
    expect(lastGesture(h.onGesture).timbre).toBe(TIMBRE_CENTER);
    act(() => pointer(h.zone, 'pointermove', 10, 30)); // haut
    await nextFrame();
    expect(lastGesture(h.onGesture).timbre).toBeGreaterThan(TIMBRE_CENTER);
    act(() => pointer(h.zone, 'pointerup', 10, 30));
    act(() => h.root.unmount());
  });

  it('PRESS : la molette ajuste la pression (aftertouch)', async () => {
    mockRect(980, 200);
    const h = renderZone();
    act(() => wheel(h.zone, -100));
    await nextFrame();
    expect(lastGesture(h.onGesture).pressure).toBeGreaterThan(0);
    act(() => h.root.unmount());
  });

  it('49 keywaves de C2 à C6 (36..84)', () => {
    expect(RISE2_KEYWAVES).toBe(49);
    expect(RISE2_START_PITCH).toBe(36);
  });
});
