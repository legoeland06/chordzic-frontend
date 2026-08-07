/**
 * Contrôle de la piste de clic (métronome) avec sortie audio DÉDIÉE.
 * Auto-suffisant : lit/écrit la config via /click et /audio-devices,
 * persiste en localStorage. Placé dans la vue Navig (mode rendu WAV).
 */
import { Metronome } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getClickInRender, setClickInRender } from '../lib/clickPrefs';

type ClickCfg = { enabled: boolean; device: string | null; volume: number; delay_ms: number; accent: boolean };

export default function ClickControl() {
  const [cfg, setCfg] = useState<ClickCfg | null>(null);
  const [devices, setDevices] = useState<{ name: string; channels: number }[]>([]);
  const [inRender, setInRender] = useState<boolean>(getClickInRender());

  useEffect(() => {
    fetch('/audio-devices')
      .then((r) => r.json())
      .then((d) => setDevices(d.devices || []))
      .catch(() => {});
    fetch('/click')
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => {});
  }, []);

  const save = (c: ClickCfg) => {
    localStorage.setItem('chordzic_click', JSON.stringify(c));
    fetch('/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...c, device: c.device || '' }),
    }).catch(() => {});
  };
  const apply = (patch: Partial<ClickCfg>) => {
    setCfg((prev) => {
      const next = { ...(prev || { enabled: false, device: null, volume: 80, delay_ms: 10, accent: true }), ...patch };
      save(next);
      return next;
    });
  };
  const onRenderToggle = (v: boolean) => {
    setInRender(v);
    setClickInRender(v);
  };

  if (!cfg) return null;

  return (
    <div className="flex items-center gap-1.5 shrink-0 px-1 py-1 rounded-lg border border-gray-800 bg-gray-900/60">
      {/* Toggle clic */}
      <button
        onClick={() => apply({ enabled: !cfg.enabled })}
        title="Piste de clic : on/off (mode live, sortie dédiée)"
        className={`px-2 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-colors ${cfg.enabled ? 'bg-amber-600 text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
      >
        <Metronome className="w-3.5 h-3.5" /> Clic
      </button>

      {/* Dans le rendu (mode Navig) */}
      <label title="Intègre le clic au WAV rendu (mode Navig) — synchronisation parfaite par construction. Le clic sort alors avec le son principal." className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={inRender}
          onChange={(e) => onRenderToggle(e.target.checked)}
          className="accent-amber-500"
        />
        Dans le rendu
      </label>

      {/* Choix de la sortie dédiée (mode live) */}
      <select
        value={cfg.device || ''}
        onChange={(e) => apply({ device: e.target.value || null })}
        title="Sortie audio dédiée au clic live (vide = sortie par défaut). Ex : le hub USB-C sur Mac."
        className="bg-gray-800 text-gray-300 text-xs rounded-md px-1.5 py-1.5 max-w-[130px] border border-gray-700"
      >
        <option value="">Sortie : défaut</option>
        {devices.map((d) => (
          <option key={d.name} value={d.name}>{d.name} ({d.channels}ch)</option>
        ))}
      </select>

      {/* Volume */}
      <input
        type="range" min={0} max={100} value={cfg.volume}
        onChange={(e) => apply({ volume: parseInt(e.target.value) })}
        title={`Volume du clic (${cfg.volume})`}
        className="w-14 accent-amber-500"
      />

      {/* Latence (compensation live) */}
      <input
        type="range" min={0} max={100} value={cfg.delay_ms}
        onChange={(e) => apply({ delay_ms: parseInt(e.target.value) })}
        title={`Latence clic ${cfg.delay_ms} ms — règle pour caler le clic live sur le son (0-100 ms)`}
        className="w-14 accent-amber-500"
      />
      <span className="text-[10px] text-gray-500 w-7">{cfg.delay_ms}ms</span>

      {/* Accent 1er temps */}
      <label title="Accent sur le 1er temps de chaque mesure" className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={cfg.accent}
          onChange={(e) => apply({ accent: e.target.checked })}
          className="accent-amber-500"
        />
        Accent
      </label>
    </div>
  );
}
