/**
 * Tests de sendPianoNote (LivePiano cliquable → POST /piano-note).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendPianoNote, __resetPianoNoteQueue } from './pianoNote';

describe('sendPianoNote', () => {
  const fetchMock = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    __resetPianoNoteQueue();
  });

  it("appui : POST /piano-note avec note-on (pitch, vélocité)", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const ok = await sendPianoNote(60, true);

    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/piano-note$/);
    expect(JSON.parse(init.body)).toEqual({ pitch: 60, velocity: 96, on: true, channel: undefined });
  });

  it('relâchement : on=false, canal fourni transmis', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendPianoNote(64, false, 2, 100);

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ pitch: 64, velocity: 100, on: false, channel: 2 });
  });

  it("échec réseau → false (jamais de throw)", async () => {
    fetchMock.mockRejectedValue(new Error('connexion morte'));
    vi.stubGlobal('fetch', fetchMock);

    expect(await sendPianoNote(60, true)).toBe(false);
  });

  it('réponse non-ok → false', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    expect(await sendPianoNote(60, true)).toBe(false);
  });

  it('sérialise les envois : ordre strict, aucun fetch concurrent', async () => {
    const calls: string[] = [];
    const gates: Array<() => void> = [];
    fetchMock.mockImplementation((_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push(`${body.pitch}:${body.on}`);
      return new Promise(res => { gates.push(() => res({ ok: true } as Response)); });
    });
    vi.stubGlobal('fetch', fetchMock);
    const flush = () => new Promise<void>(r => setTimeout(r, 0));

    // 3 notes en rafale, SANS await entre elles (comme un jeu rapide)
    const p1 = sendPianoNote(60, true);
    await flush();
    expect(calls).toEqual(['60:true']);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const p2 = sendPianoNote(64, true);
    const p3 = sendPianoNote(60, false);
    await flush();
    // Le 1er fetch n'est pas terminé → les suivants attendent dans la file
    expect(fetchMock).toHaveBeenCalledTimes(1);

    gates[0](); // le 1er répond → la file enchaîne
    await p1;
    await flush();
    await flush();
    expect(calls).toEqual(['60:true', '64:true']);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    gates[1]();
    await p2;
    await flush();
    expect(calls).toEqual(['60:true', '64:true', '60:false']);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    gates[2]();
    await p3;
  });

  it('un échec réseau ne bloque pas la file (la suite part quand même)', async () => {
    const calls: string[] = [];
    fetchMock
      .mockRejectedValueOnce(new Error('connexion morte'))
      .mockImplementation((_url: unknown, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        calls.push(`${body.pitch}:${body.on}`);
        return Promise.resolve({ ok: true } as Response);
      });
    vi.stubGlobal('fetch', fetchMock);

    const p1 = sendPianoNote(60, true);
    const p2 = sendPianoNote(64, true);
    expect(await p1).toBe(false);
    expect(await p2).toBe(true);
    expect(calls).toEqual(['64:true']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
