/**
 * Contrôle de la piste de clic — MODE RENDU UNIQUEMENT (mode Navig).
 * Le clic est intégré au WAV rendu : synchronisation échantillon-parfaite
 * par construction. Auto-suffisant : lit/écrit la config via /click,
 * persiste « Dans le rendu » en localStorage.
 */
import { Metronome } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getClickInRender, setClickInRender } from '../lib/clickPrefs';

type ClickCfg = { volume: number; accent: boolean; sound: number };

export default function ClickControl() {
  const [cfg, setCfg] = useState<ClickCfg | null>(null);
  const [sounds, setSounds] = useState<{ id: number; name: string }[]>([]);
  const [inRender, setInRender] = useState<boolean>(getClickInRender());

  useEffect(() => {
    fetch('/click')
      .then((r) => r.json())
      .then((d) => {
        setCfg({ volume: d.volume, accent: d.accent, sound: d.sound });
        setSounds(d.sounds || []);
      })
      .catch(() => {});
  }, []);

  const save = (c: ClickCfg) => {
    fetch('/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    }).catch(() => {});
  };
  const apply = (patch: Partial<ClickCfg>) => {
    setCfg((prev) => {
      const next = { ...(prev || { volume: 80, accent: true, sound: 0 }), ...patch };
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
      <Metronome className="w-3.5 h-3.5 text-amber-400 shrink-0" />

      {/* Dans le rendu */}
      <label
        title="Intègre le clic au WAV rendu (mode Navig) — synchronisation parfaite par construction. Le clic sort alors avec le son principal."
        className="flex items-center gap-1 text-[10px] text-gray-300 cursor-pointer"
      >
        <input
          type="checkbox"
          checked={inRender}
          onChange={(e) => onRenderToggle(e.target.checked)}
          className="accent-amber-500"
        />
        Dans le rendu
      </label>

      {/* Son du clic */}
      <select
        value={cfg.sound}
        onChange={(e) => apply({ sound: parseInt(e.target.value) })}
        title="Son du clic"
        className="bg-gray-800 text-gray-300 text-xs rounded-md px-1.5 py-1.5 border border-gray-700"
      >
        {sounds.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {/* Volume */}
      <input
        type="range" min={0} max={100} value={cfg.volume}
        onChange={(e) => apply({ volume: parseInt(e.target.value) })}
        title={`Volume du clic (${cfg.volume})`}
        className="w-14 accent-amber-500"
      />

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
