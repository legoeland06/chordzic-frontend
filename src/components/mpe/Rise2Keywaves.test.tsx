/**
 * Tests des keywaves ROLI Seaboard RISE 2 (2 octaves, multi-touch) :
 * Strike (note-on), Bend vertical, Vibrato horizontal (LFO), glissando,
 * multitouch (« dernier geste gagne »), Press (molette), Lift, thèmes.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { BEND_CENTER, StripGesture } from '../../lib/mpe';
import Rise2Keywaves, { RISE2_KEYWAVES, RISE2_START_PITCH } from './Rise2Keywaves';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = MockResizeObserver;

// Géométrie du rendu (identique au composant : px-[3px] + gap-[3px]).
const PAD = 3;
const GAP = 3;
const W = 1000;
const H = 200;
const KW = (W - PAD * 2 - GAP * (RISE2_KEYWAVES - 1)) / RISE2_KEYWAVES;
const keyCenter = (i: number) => PAD + i * (KW + GAP) + KW / 2;

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

function pointer(el: HTMLElement, type: string, x: number, y: number, pointerId = 1) {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId, clientX: x, clientY: y }));
}

function wheel(el: HTMLElement, deltaY: number) {
  el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY }));
}

const nextFrame = () => new Promise(r => setTimeout(r, 40));
/** Laisse la file FIFO de sendPianoNote vider ses fetchs (microtasks). */
const flushNotes = () => new Promise<void>(r => setTimeout(r, 0));

interface Harness {
  zone: HTMLElement;
  onGesture: ReturnType<typeof vi.fn>;
  onGestureEnd: ReturnType<typeof vi.fn>;
  root: Root;
  notes: ReturnType<typeof vi.fn>;
}

function renderZone(returnMode: 'center' | 'hold' = 'center'): Harness {
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
    root.render(<Rise2Keywaves returnMode={returnMode} onGesture={onGesture} onGestureEnd={onGestureEnd} />);
  });
  const zone = document.querySelector('[title^="Keywaves"]') as HTMLElement;
  stubPointerCapture(zone);
  return { zone, onGesture, onGestureEnd, root, notes };
}

function lastGesture(fn: ReturnType<typeof vi.fn>): StripGesture {
  const calls = fn.mock.calls as [StripGesture][];
  return calls[calls.length - 1][0];
}

function notesByPitch(fn: ReturnType<typeof vi.fn>, pitch: number, on: boolean): number {
  return fn.mock.calls.filter(c => (c[0] as { pitch?: number; on?: boolean }).pitch === pitch
    && (c[0] as { pitch?: number; on?: boolean }).on === on).length;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('Rise2Keywaves (2 octaves · multi-touch)', () => {
  it('constantes : 25 keywaves de C3 (48) à C5 (72) — 2 octaves', () => {
    expect(RISE2_KEYWAVES).toBe(25);
    expect(RISE2_START_PITCH).toBe(48);
    expect(RISE2_START_PITCH + RISE2_KEYWAVES - 1).toBe(72);
  });

  it('STRIKE : l appui sur une keywave joue la note (C3 = 48), lift = note-off', async () => {
    mockRect(W, H);
    const h = renderZone();
    act(() => pointer(h.zone, 'pointerdown', keyCenter(0), 100));
    await flushNotes(); // les envois passent par la file FIFO (async)
    expect(h.notes).toHaveBeenCalledWith(expect.objectContaining({ pitch: 48, on: true }));
    act(() => pointer(h.zone, 'pointerup', keyCenter(0), 100));
    await flushNotes();
    expect(h.notes).toHaveBeenCalledWith(expect.objectContaining({ pitch: 48, on: false }));
    act(() => h.root.unmount());
  });

  it('BEND : glissé VERTICAL — la pose est « juste », la translation du poignet bend (haut = aigu, bas = grave)', async () => {
    mockRect(W, H);
    const h = renderZone();
    act(() => pointer(h.zone, 'pointerdown', keyCenter(0), H / 2));
    await nextFrame();
    expect(lastGesture(h.onGesture).bend).toBe(BEND_CENTER); // posé à mi-hauteur → juste
    // Translation vers le haut → bend aigu
    act(() => pointer(h.zone, 'pointermove', keyCenter(0), H * 0.25));
    await nextFrame();
    expect(lastGesture(h.onGesture).bend).toBeGreaterThan(BEND_CENTER);
    // Translation vers le bas → bend grave
    act(() => pointer(h.zone, 'pointermove', keyCenter(0), H * 0.75));
    await nextFrame();
    expect(lastGesture(h.onGesture).bend).toBeLessThan(BEND_CENTER);
    act(() => pointer(h.zone, 'pointerup', keyCenter(0), H * 0.75));
    act(() => h.root.unmount());
  });

  it('ACCORD JUSTE : des doigts posés à des hauteurs différentes ne désaccordent PAS l accord (pose = valeur par défaut juste)', async () => {
    mockRect(W, H);
    const h = renderZone();
    // Doigt 1 posé en HAUT (y = 0.2), doigt 2 posé en BAS (y = 0.8) :
    // sans recalage, le bend absolu les désaccorderait de ±~5000. Ici la
    // pose de chaque doigt est postulée « juste » → bend neutre.
    act(() => pointer(h.zone, 'pointerdown', keyCenter(0), H * 0.2, 1));
    act(() => pointer(h.zone, 'pointerdown', keyCenter(12), H * 0.8, 2));
    await nextFrame();
    expect(lastGesture(h.onGesture).bend).toBe(BEND_CENTER);
    act(() => pointer(h.zone, 'pointerup', keyCenter(0), H * 0.2, 1));
    act(() => pointer(h.zone, 'pointerup', keyCenter(12), H * 0.8, 2));
    act(() => h.root.unmount());
  });

  it('VIBRATO : glissé HORIZONTAL — centre = 0, décalé = profondeur LFO, fréquence 5 Hz', async () => {
    mockRect(W, H);
    const h = renderZone();
    // Point neutre MATHÉMATIQUE (xRel = 0) : le centre visuel de la keywave
    // 0 (21.4 px) est décalé de ~1.4 px par le padding → 0.03 st de vibrato.
    const cx = (0.5 * W) / RISE2_KEYWAVES;
    act(() => pointer(h.zone, 'pointerdown', cx, H / 2));
    await nextFrame();
    expect(lastGesture(h.onGesture).lfoDepth).toBe(0); // centre = pas de vibrato
    expect(lastGesture(h.onGesture).lfoFreq).toBe(5);
    // Petit décalé à droite → vibrato actif
    act(() => pointer(h.zone, 'pointermove', cx + KW * 0.3, H / 2));
    await nextFrame();
    const d = lastGesture(h.onGesture).lfoDepth!;
    expect(d).toBeGreaterThan(0);
    // Retour au centre → vibrato off
    act(() => pointer(h.zone, 'pointermove', cx, H / 2));
    await nextFrame();
    expect(lastGesture(h.onGesture).lfoDepth).toBe(0);
    // Le bend, lui, reste neutre (le glissé horizontal ne bend pas)
    expect(lastGesture(h.onGesture).bend).toBe(BEND_CENTER);
    act(() => pointer(h.zone, 'pointerup', cx, H / 2));
    act(() => h.root.unmount());
  });

  it('glissando : traverser une keywave coupe la note et joue la suivante', async () => {
    mockRect(W, H);
    const h = renderZone();
    act(() => pointer(h.zone, 'pointerdown', keyCenter(0), H / 2)); // keywave 0 = C3
    await flushNotes();
    expect(h.notes).toHaveBeenLastCalledWith(expect.objectContaining({ pitch: 48, on: true }));
    // Traverse vers la keywave 1 (D3 = 49)
    act(() => pointer(h.zone, 'pointermove', PAD + (KW + GAP) + 1, H / 2));
    await nextFrame();
    await flushNotes();
    expect(notesByPitch(h.notes, 48, false)).toBe(1);
    expect(notesByPitch(h.notes, 49, true)).toBe(1);
    act(() => pointer(h.zone, 'pointerup', PAD + (KW + GAP) + 1, H / 2));
    await flushNotes();
    expect(h.notes).toHaveBeenCalledWith(expect.objectContaining({ pitch: 49, on: false }));
    act(() => h.root.unmount());
  });

  it('MULTI-TOUCH : 2 doigts jouent 2 notes, « dernier geste gagne », un doigt levé rend la main', async () => {
    mockRect(W, H);
    const h = renderZone();
    const c0 = keyCenter(0); // keywave 0 (C3 = 48)
    const c12 = keyCenter(12); // keywave 12 (C4 = 60)
    act(() => pointer(h.zone, 'pointerdown', c0, H / 2, 1));
    act(() => pointer(h.zone, 'pointerdown', c12, H / 2, 2));
    await flushNotes();
    expect(notesByPitch(h.notes, 48, true)).toBe(1);
    expect(notesByPitch(h.notes, 60, true)).toBe(1);

    // Doigt 1 vers le haut (aigu), puis doigt 2 vers le bas (grave) → le
    // doigt 2 est le maître (dernier geste)
    act(() => pointer(h.zone, 'pointermove', c0, H * 0.25, 1));
    act(() => pointer(h.zone, 'pointermove', c12, H * 0.75, 2));
    await nextFrame();
    expect(lastGesture(h.onGesture).bend).toBeLessThan(BEND_CENTER); // doigt 2

    // Doigt 2 levé → le doigt 1 reprend la main (bend aigu)
    act(() => pointer(h.zone, 'pointerup', c12, H * 0.75, 2));
    await flushNotes();
    expect(h.notes).toHaveBeenCalledWith(expect.objectContaining({ pitch: 60, on: false }));
    await nextFrame();
    expect(lastGesture(h.onGesture).bend).toBeGreaterThan(BEND_CENTER); // doigt 1

    act(() => pointer(h.zone, 'pointerup', c0, H * 0.25, 1));
    await flushNotes();
    expect(h.notes).toHaveBeenCalledWith(expect.objectContaining({ pitch: 48, on: false }));
    act(() => h.root.unmount());
  });

  it('MULTI-TOUCH : deux doigts simultanés — le lift de l un ne coupe pas l autre', async () => {
    mockRect(W, H);
    const h = renderZone();
    act(() => pointer(h.zone, 'pointerdown', keyCenter(0), H / 2, 1));
    act(() => pointer(h.zone, 'pointerdown', keyCenter(12), H / 2, 2));
    act(() => pointer(h.zone, 'pointerup', keyCenter(0), H / 2, 1));
    await flushNotes();
    // La note 60 (doigt 2) tient toujours — pas de note-off
    expect(notesByPitch(h.notes, 60, false)).toBe(0);
    act(() => pointer(h.zone, 'pointerup', keyCenter(12), H / 2, 2));
    await flushNotes();
    expect(notesByPitch(h.notes, 60, false)).toBe(1);
    act(() => h.root.unmount());
  });

  it('PRESS : la molette ajuste la pression (aftertouch)', async () => {
    mockRect(W, H);
    const h = renderZone();
    act(() => wheel(h.zone, -100));
    await nextFrame();
    expect(lastGesture(h.onGesture).pressure).toBeGreaterThan(0);
    act(() => h.root.unmount());
  });

  it('retour auto : au lift du dernier doigt, le bend revient au centre (animation)', async () => {
    mockRect(W, H);
    const h = renderZone('center');
    act(() => pointer(h.zone, 'pointerdown', keyCenter(0), H * 0.2)); // bend aigu
    act(() => pointer(h.zone, 'pointerup', keyCenter(0), H * 0.2));
    await vi.waitFor(() => {
      expect(h.onGestureEnd).toHaveBeenCalledWith(expect.objectContaining({ bend: BEND_CENTER }));
    }, { timeout: 2000 });
    act(() => h.root.unmount());
  });

  it('retour auto OFF (maintien) : le bend final est conservé au lift', async () => {
    mockRect(W, H);
    const h = renderZone('hold');
    act(() => pointer(h.zone, 'pointerdown', keyCenter(0), H * 0.2));
    // Translation vers le haut (poignet) → bend aigu, puis lift
    act(() => pointer(h.zone, 'pointermove', keyCenter(0), H * 0.05));
    act(() => pointer(h.zone, 'pointerup', keyCenter(0), H * 0.05));
    await nextFrame();
    expect(h.onGestureEnd).toHaveBeenCalledWith(expect.objectContaining({
      bend: expect.any(Number),
      lfoDepth: 0,
    }));
    const g = (h.onGestureEnd.mock.calls[0][0] as StripGesture);
    expect(g.bend!).toBeGreaterThan(BEND_CENTER); // conservé (aigu)
    act(() => h.root.unmount());
  });

  it('look piano : les touches noires sont plus courtes (classe rise2-black sur les chromatiques)', () => {
    mockRect(W, H);
    const h = renderZone();
    const els = Array.from(document.querySelectorAll('.rise2-keywave')) as HTMLElement[];
    expect(els.length).toBe(25);
    // Indices chromatiques (pitch % 12 ∈ {1,3,6,8,10}) à partir de C3 = 48
    const blackIdx = new Set([1, 3, 6, 8, 10, 13, 15, 18, 20, 22]);
    els.forEach((el, i) => {
      expect(el.classList.contains('rise2-black')).toBe(blackIdx.has(i));
    });
    // La hauteur réduite (58 %) est imposée par Rise2Keywaves.css
    // (.rise2-black { height: 58% }) — la classe est le contrat visuel.
    act(() => h.root.unmount());
  });

  it('couleurs : un thème s applique globalement à toutes les keywaves', async () => {
    mockRect(W, H);
    const h = renderZone();
    const styleOf = () => (document.querySelector('.rise2-keywave') as HTMLElement).getAttribute('style') ?? '';
    expect(styleOf()).toContain('rgb(62, 68, 77)'); // #3e444d — Gris nuit par défaut
    // Sélectionne le thème Bleu nuit
    const swatch = document.querySelector('[title="Couleur de l\'instrument : Bleu nuit"]') as HTMLButtonElement;
    act(() => swatch.click());
    expect(styleOf()).toContain('rgb(51, 69, 92)'); // #33455c
    expect(localStorage.getItem('chordzic_rise2_theme')).toBe('ocean');
    act(() => h.root.unmount());
  });
});
