/**
 * Tests du Push 3 — Pads : mode 🎨 Peindre (poser la couleur de son choix
 * sur chaque pad), « Appliquer à tous », et le clic normal qui joue.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import PushPadGrid from './PushPadGrid';

/** AudioContext factice (jsdom n'en a pas). */
class MockAudioContext {
  destination = {};
  currentTime = 0;
  sampleRate = 44100;
  createGain() { return { gain: { value: 0 }, connect: () => {} }; }
  createBufferSource() {
    return { buffer: null, connect: () => {}, start: () => {}, stop: () => {}, disconnect: () => {}, onended: null };
  }
  createBuffer(_ch: number, len: number) { return { getChannelData: () => new Float32Array(len) }; }
  decodeAudioData() { return Promise.resolve({} as AudioBuffer); }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}
(globalThis as { AudioContext?: unknown }).AudioContext = MockAudioContext;

function renderGrid(): { root: Root } {
  const root = createRoot(document.body);
  act(() => {
    root.render(<PushPadGrid onClose={() => {}} />);
  });
  return { root };
}

function pad(i: number): HTMLElement {
  return document.querySelectorAll('.push-pad')[i] as HTMLElement;
}

function buttonWithText(text: string): HTMLButtonElement {
  return [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text)) as HTMLButtonElement;
}

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('PushPadGrid — couleurs par pad', () => {
  it('64 pads, couleur auto par défaut (dégradé global)', () => {
    const { root } = renderGrid();
    expect(document.querySelectorAll('.push-pad')).toHaveLength(64);
    // Pad 0 vide : dégradé global diag hue 220 → bas-gauche clair (62 %)
    expect(pad(0).getAttribute('style')).toContain('rgb(76, 131, 241)'); // hsl(220, 85%, 62%)
    act(() => root.unmount());
  });

  it('clic normal : joue, ne change PAS la couleur', () => {
    const { root } = renderGrid();
    const before = pad(0).getAttribute('style');
    act(() => pad(0).click());
    expect(pad(0).getAttribute('style')).toBe(before);
    act(() => root.unmount());
  });

  it('mode 🎨 Peindre : un clic pose la couleur choisie sur LE pad cliqué', () => {
    const { root } = renderGrid();
    act(() => buttonWithText('Peindre').click());
    // Couleur courante = Bleu (220) par défaut → solide 50 %
    act(() => pad(0).click());
    expect(pad(0).getAttribute('style')).toContain('rgb(19, 91, 236)'); // hsl(220, 85%, 50%)
    expect(pad(1).getAttribute('style')).toContain('rgb(66, 124, 240)'); // pad 1 inchangé (diag 60 %)
    // Change la palette → Rouge (0) et peint un autre pad
    act(() => (document.querySelector('[title="Rouge"]') as HTMLButtonElement).click());
    act(() => pad(1).click());
    expect(pad(1).getAttribute('style')).toContain('rgb(236, 19, 19)'); // hsl(0, 85%, 50%)
    expect(pad(0).getAttribute('style')).toContain('rgb(19, 91, 236)'); // inchangé
    // Persistance : les hue sont stockés
    const saved = JSON.parse(localStorage.getItem('chordzic_pads') ?? '{}');
    expect(saved.slots[0].hue).toBe(220);
    expect(saved.slots[1].hue).toBe(0);
    act(() => root.unmount());
  });

  it('« Appliquer à tous » : les pads reviennent au dégradé global', () => {
    const { root } = renderGrid();
    act(() => buttonWithText('Peindre').click());
    act(() => pad(0).click()); // pad 0 → solide 50 %
    expect(pad(0).getAttribute('style')).toContain('rgb(19, 91, 236)'); // hsl(220, 85%, 50%)
    act(() => buttonWithText('Appliquer à tous').click());
    expect(pad(0).getAttribute('style')).toContain('rgb(76, 131, 241)'); // dégradé global 62 %
    act(() => root.unmount());
  });

  it('sortie du mode peinture : le clic rejoue le sample (couleur inchangée)', () => {
    const { root } = renderGrid();
    act(() => buttonWithText('Peindre').click());
    act(() => pad(0).click());
    act(() => buttonWithText('Peindre').click()); // désactive
    const painted = pad(0).getAttribute('style');
    act(() => pad(0).click());
    expect(pad(0).getAttribute('style')).toBe(painted);
    act(() => root.unmount());
  });

  it('métronome : un clic sur un pad SANS sample ne démarre pas le métronome', () => {
    const { root } = renderGrid();
    const badge = () => [...document.querySelectorAll('span')].find(s => s.textContent === '● —');
    expect(badge()).toBeDefined(); // badge éteint
    act(() => pad(0).click());
    expect(badge()).toBeDefined(); // toujours éteint (pad vide → rien)
    act(() => root.unmount());
  });

  it('mode 🖧 Serveur : le clic envoie /pad-trigger (fichier + volume), pas de lecture locale', () => {
    // Précharge un slot avec sample + mode serveur (persistés)
    const slots: { file: string | null; label: string; hue: number | null; tempo: number | null }[] =
      Array(64).fill(null).map(() => ({ file: null, label: '', hue: null, tempo: null }));
    slots[0] = { file: 'pad_1.wav', label: 'kick', hue: null, tempo: 120 };
    localStorage.setItem('chordzic_pads', JSON.stringify({
      slots, color: { hue: 220, mode: 'diag' }, volume: 0.9, playMode: 'server',
    }));
    const triggers: { url: string; body: unknown }[] = [];
    global.fetch = vi.fn((url: unknown, init?: RequestInit) => {
      if (String(url).includes('/pad-trigger')) {
        triggers.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      }
      return Promise.resolve({ ok: true });
    }) as unknown as typeof fetch;

    const { root } = renderGrid();
    act(() => pad(0).click());
    expect(triggers.length).toBe(1);
    expect(triggers[0].body).toEqual({ file: 'pad_1.wav', volume: 90 });
    // Le métronome local tourne (maître du timing) — badge actif
    expect(playerIsRunning()).toBe(true);
    act(() => root.unmount());
  });
});

/** Vrai si le métronome du player tourne (le badge ● BPM est affiché). */
function playerIsRunning(): boolean {
  return [...document.querySelectorAll('span')].some(s => (s.textContent ?? '').startsWith('● '));
}
