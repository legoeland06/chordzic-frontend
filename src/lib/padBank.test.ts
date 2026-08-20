/**
 * Tests de padBank.ts : dégradés de couleurs, API, labels, retrigger.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  PAD_COLS,
  PAD_COUNT,
  EMPTY_PAD_COLOR,
  PadPlayer,
  PadSlot,
  clearPadColors,
  emptyPads,
  isPadOff,
  labelFromFilename,
  padColor,
  paintPad,
  slotColor,
} from './padBank';

describe('dégradés de couleurs des pads', () => {
  it('solide : toutes les pads ont la même couleur', () => {
    const c0 = padColor(220, 0, 'solid');
    const c27 = padColor(220, 27, 'solid');
    const c63 = padColor(220, 63, 'solid');
    expect(c0).toBe(c27);
    expect(c0).toBe(c63);
    expect(c0).toContain('220');
  });

  it('horizontal : luminosité décroissante de gauche à droite', () => {
    const l = (i: number) => parseInt(padColor(120, i, 'h').match(/hsl\(120, 85%, (\d+)%\)/)![1]);
    // Ligne 0 : colonne 0 (luminosité max) → colonne 7 (min)
    expect(l(0)).toBeGreaterThan(l(7));
    expect(l(0)).toBeGreaterThan(l(3));
    expect(l(3)).toBeGreaterThan(l(7));
    // Ligne 1 identique à la ligne 0 (dégradé horizontal pur)
    expect(l(8)).toBe(l(0));
  });

  it('vertical : luminosité décroissante de bas en haut', () => {
    const l = (i: number) => parseInt(padColor(0, i, 'v').match(/hsl\(0, 85%, (\d+)%\)/)![1]);
    expect(l(7)).toBeGreaterThan(l(56)); // bas (ligne 0) plus clair que haut (ligne 7)
    expect(l(0)).toBe(l(7)); // même ligne → même couleur
  });

  it('diagonal : coin bas-gauche clair, haut-droite sombre', () => {
    const l = (i: number) => parseInt(padColor(270, i, 'diag').match(/hsl\(270, 85%, (\d+)%\)/)![1]);
    expect(l(63)).toBeLessThan(l(0)); // haut-droite sombre, bas-gauche clair
    expect(l(7)).toBe(l(56)); // symétrie diagonale (col+row constant)
  });

  it('blanc (hue -1) : pads éteints', () => {
    expect(padColor(-1, 0, 'diag')).toBe('#e9e9e9');
    expect(isPadOff(-1)).toBe(true);
    expect(isPadOff(220)).toBe(false);
  });

  it('64 pads sur une grille 8×8', () => {
    expect(PAD_COUNT).toBe(64);
    expect(emptyPads()).toHaveLength(64);
    expect(emptyPads().every(p => p.file === null && p.label === '' && p.hue === null)).toBe(true);
  });
});

describe('couleur par pad (mode peinture)', () => {
  const global = { hue: 220, mode: 'diag' as const };

  it('slotColor : hue null = dégradé global, hue posé = couleur solide du pad', () => {
    const auto = { file: null, label: '', hue: null };
    const blue = { file: null, label: '', hue: 220 };
    const red = { file: null, label: '', hue: 0 };
    // Auto : suit le dégradé global (diag) — varie selon l'index
    expect(slotColor(auto, 0, global)).toBe(padColor(220, 0, 'diag'));
    expect(slotColor(auto, 63, global)).toBe(padColor(220, 63, 'diag'));
    expect(slotColor(auto, 0, global)).not.toBe(slotColor(auto, 63, global));
    // Posé : SOLIDE, indépendant de l'index et du mode global
    expect(slotColor(blue, 0, global)).toBe(padColor(220, 0, 'solid'));
    expect(slotColor(blue, 63, global)).toBe(slotColor(blue, 0, global));
    expect(slotColor(red, 5, global)).toContain('hsl(0, 85%');
    // Blanc éteint
    const off = { file: null, label: '', hue: -1 };
    expect(slotColor(off, 12, global)).toBe('#e9e9e9');
  });

  it('paintPad pose la couleur sur UN pad sans muter les autres (copie)', () => {
    const slots = emptyPads();
    slots[0] = { file: 'pad_1.wav', label: 'kick', hue: null };
    const painted = paintPad(slots, 0, 0); // rouge sur le pad 1
    expect(painted[0].hue).toBe(0);
    expect(painted[0].file).toBe('pad_1.wav'); // le sample est conservé
    expect(painted[1].hue).toBeNull();
    expect(slots[0].hue).toBeNull(); // l'original n'est pas muté
    expect(painted).not.toBe(slots); // copie
  });

  it('paintPad peut peindre un pad vide (crée la couleur sans sample)', () => {
    const slots = emptyPads();
    const painted = paintPad(slots, 42, 120);
    expect(painted[42].hue).toBe(120);
    expect(painted[42].file).toBeNull();
  });

  it('clearPadColors remet tous les pads au dégradé global', () => {
    let slots = emptyPads();
    slots = paintPad(slots, 3, 0);
    slots = paintPad(slots, 10, 120);
    const cleared = clearPadColors(slots);
    expect(cleared.every(s => s.hue === null)).toBe(true);
    expect(slots[3].hue).toBe(0); // original non muté
  });

  it('migration : un slot sans champ hue (ancienne version) → auto (null)', () => {
    const old = { file: 'pad_2.wav', label: 'snare' } as PadSlot; // pas de hue
    expect(old.hue).toBeUndefined();
    expect(EMPTY_PAD_COLOR.hue).toBe(220);
    // Le composant fait : typeof s.hue === 'number' ? s.hue : null
    const migrated = { file: old.file, label: old.label, hue: typeof old.hue === 'number' ? old.hue : null };
    expect(migrated.hue).toBeNull();
  });
});

describe('labels et API', () => {
  it('labelFromFilename retire le chemin et l extension', () => {
    expect(labelFromFilename('kick.wav')).toBe('kick');
    expect(labelFromFilename('C:/Users/x/boom.mp3')).toBe('boom');
    expect(labelFromFilename('snare.avec.points.ogg')).toBe('snare.avec.points');
  });
});

describe('PadPlayer (retrigger)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('trigger coupe la source précédente du pad et en crée une nouvelle', () => {
    // Contexte audio factice
    const fakeCtx = {
      destination: {},
      createGain: () => ({ gain: { value: 0 }, connect: vi.fn() }),
      createBufferSource: () => ({
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        onended: null,
      }),
      decodeAudioData: vi.fn(),
    } as unknown as AudioContext;
    const player = new PadPlayer(fakeCtx);
    player.buffers[3] = {} as AudioBuffer;

    player.trigger(3);
    const src1 = player.sources[3];
    expect(src1).not.toBeNull();

    player.trigger(3); // retrigger
    expect(player.sources[3]).not.toBe(src1); // nouvelle source
    expect(src1!.stop).toHaveBeenCalled(); // l'ancienne a été coupée
  });

  it('trigger sans sample : rien ne se passe', () => {
    const fakeCtx = {
      destination: {},
      createGain: () => ({ gain: { value: 0 }, connect: vi.fn() }),
      createBufferSource: () => ({
        start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(),
      }),
    } as unknown as AudioContext;
    const player = new PadPlayer(fakeCtx);
    player.trigger(5); // buffer null
    expect(player.sources[5]).toBeNull();
  });

  it('stopAll coupe tout', () => {
    const stops: ReturnType<typeof vi.fn>[] = [];
    const fakeCtx = {
      destination: {},
      createGain: () => ({ gain: { value: 0 }, connect: vi.fn() }),
      createBufferSource: () => {
        const stop = vi.fn();
        stops.push(stop);
        return { start: vi.fn(), stop, connect: vi.fn(), disconnect: vi.fn(), onended: null };
      },
    } as unknown as AudioContext;
    const player = new PadPlayer(fakeCtx);
    player.buffers[0] = {} as AudioBuffer;
    player.buffers[1] = {} as AudioBuffer;
    player.trigger(0);
    player.trigger(1);
    player.stopAll();
    expect(stops).toHaveLength(2);
    expect(stops[0]).toHaveBeenCalled();
    expect(stops[1]).toHaveBeenCalled();
    expect(player.sources.every(s => s === null)).toBe(true);
  });

  it('load décode et stocke le buffer', async () => {
    const buf = {} as AudioBuffer;
    const decode = vi.fn().mockResolvedValue(buf);
    const fakeCtx = {
      destination: {},
      createGain: () => ({ gain: { value: 0 }, connect: vi.fn() }),
      decodeAudioData: decode,
    } as unknown as AudioContext;
    const player = new PadPlayer(fakeCtx);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    }) as unknown as typeof fetch;

    const ok = await player.load(2, 'http://x/pad_1.wav');
    expect(ok).toBe(true);
    expect(decode).toHaveBeenCalled();
    expect(player.buffers[2]).toBe(buf);
  });
});
