/**
 * Tests du PianoLivePanel — badge 🎛️ du son actuel du Roland (mode Live).
 *
 * jsdom : ResizeObserver mocké (fit scale du LivePiano), fetch mocké
 * (polling /live-input sans clavier ni notes).
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import PianoLivePanel from './PianoLivePanel';
import type { LiveInstrumentState } from '../lib/liveInstrument';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = MockResizeObserver;

const THRU: LiveInstrumentState = {
  source: 'thru',
  vst3: { enabled: false, preset: null, error: null },
  fluid: { program: null, soundfont: null },
};
const SURGE: LiveInstrumentState = {
  source: 'vst3',
  vst3: { enabled: true, preset: { name: 'DX EP', path: '/k/DX EP.fxp' }, error: null },
  fluid: { program: null, soundfont: null },
};
const FLUID: LiveInstrumentState = {
  source: 'fluid',
  vst3: { enabled: false, preset: null, error: null },
  fluid: { program: 4, soundfont: null },
};

function renderPanel(props: React.ComponentProps<typeof PianoLivePanel>) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<PianoLivePanel {...props} />); });
  return { container, root };
}

async function settle() {
  await act(async () => { await Promise.resolve(); });
}

describe('PianoLivePanel — son du Roland en mode Live', () => {
  let root: Root;
  let container: HTMLElement;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () =>
      ({ ok: true, json: async () => ({ device: null, active: [] }) }),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    act(() => { root?.unmount(); });
    container?.remove();
    vi.restoreAllMocks();
  });

  function mount(props: React.ComponentProps<typeof PianoLivePanel>) {
    ({ root, container } = renderPanel(props));
    return container;
  }

  it('mode live + thru : badge « 🎛️ 🔌 Roland GM » cliquable', async () => {
    const onOpen = vi.fn();
    const c = mount({ mode: 'live', onInsert: () => {}, live: THRU, onOpenInstruments: onOpen });
    await settle();

    const badge = c.querySelector('button[title*="Son actuel du Roland"]');
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toContain('🎛️');
    expect(badge?.textContent).toContain('🔌 Roland GM');

    act(() => { (badge as HTMLButtonElement).click(); });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('mode live + vst3 : affiche le preset Surge', async () => {
    const c = mount({ mode: 'live', onInsert: () => {}, live: SURGE, onOpenInstruments: () => {} });
    await settle();
    const badge = c.querySelector('button[title*="Son actuel du Roland"]');
    expect(badge?.textContent).toContain('🎸 Surge — DX EP');
  });

  it('mode live + fluid : affiche le programme GM', async () => {
    const c = mount({ mode: 'live', onInsert: () => {}, live: FLUID, onOpenInstruments: () => {} });
    await settle();
    const badge = c.querySelector('button[title*="Son actuel du Roland"]');
    expect(badge?.textContent).toContain('🎹 FluidSynth — Electric Piano 1');
  });

  it('pas de badge sans état live (ou en mode navig)', async () => {
    const c1 = mount({ mode: 'live', onInsert: () => {}, live: null, onOpenInstruments: () => {} });
    await settle();
    expect(c1.querySelector('button[title*="Son actuel du Roland"]')).toBeNull();

    const c2 = mount({
      mode: 'navig', onInsert: () => {}, live: THRU, onOpenInstruments: () => {},
      targetTrackLabel: null,
    });
    await settle();
    expect(c2.querySelector('button[title*="Son actuel du Roland"]')).toBeNull();
  });
});
