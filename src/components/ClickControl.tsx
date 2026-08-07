/**
 * Contrôle de la piste de clic — MODE NAVIG (rendu WAV).
 * Deux modes au choix :
 *  - « Dans le rendu » : clic MÉLANGÉ au WAV → synchro échantillon-parfaite.
 *  - « Sortie » : clic joué SÉPARÉMENT par le serveur sur un appareil
 *    MULTICANAL (agrégat CoreAudio : sortie intégrée + hub) — main ch1-2,
 *    clic ch3-4, UNE seule horloge → synchro échantillon-parfaite aussi.
 * L'état vit côté SERVEUR (/click) — source de vérité unique au moment du
 * rendu (plus aucun aller-retour de mode nécessaire).
 */
import { Metronome } from 'lucide-react';
import { useEffect, useState } from 'react';
import { setClickSig } from '../lib/clickPrefs';

type ClickCfg = {
  volume: number;
  accent: boolean;
  sound: number;
  in_render: boolean;
  out_device: string | null;
  delay_ms: number;
};

export default function ClickControl() {
  const [cfg, setCfg] = useState<ClickCfg | null>(null);
  const [sounds, setSounds] = useState<{ id: number; name: string }[]>([]);
  const [devices, setDevices] = useState<{ name: string; channels: number }[]>([]);

  useEffect(() => {
    fetch('/click')
      .then((r) => r.json())
      .then((d) => {
        setCfg({
          volume: d.volume, accent: d.accent, sound: d.sound,
          in_render: d.in_render, out_device: d.out_device || null, delay_ms: d.delay_ms || 0,
        });
        setSounds(d.sounds || []);
      })
      .catch(() => {});
    fetch('/audio-devices')
      .then((r) => r.json())
      .then((d) => setDevices(d.devices || []))
      .catch(() => {});
  }, []);

  const save = (c: ClickCfg) => {
    setClickSig(JSON.stringify(c)); // signature pour forcer le re-rendu au Play
    fetch('/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...c, out_device: c.out_device || '' }),
    }).catch(() => {});
  };
  const apply = (patch: Partial<ClickCfg>) => {
    setCfg((prev) => {
      const next = {
        ...(prev || { volume: 80, accent: true, sound: 0, in_render: false, out_device: null, delay_ms: 0 }),
        ...patch,
      };
      save(next);
      return next;
    });
  };
  const onRenderToggle = (v: boolean) => {
    apply({ in_render: v });
  };
  const onDeviceChange = (name: string) => {
    // Choisir une sortie = mode séparé → on décoche le mix
    apply({ out_device: name || null, in_render: false });
  };

  if (!cfg) return null;
  const separated = !!cfg.out_device;

  return (
    <div className="flex items-center gap-1.5 shrink-0 px-1 py-1 rounded-lg border border-gray-800 bg-gray-900/60">
      <Metronome className="w-3.5 h-3.5 text-amber-400 shrink-0" />

      {/* Dans le rendu (mixé, synchro parfaite) */}
      <label
        title="Intègre le clic au WAV rendu (mode Navig) — synchronisation parfaite par construction. Le clic sort avec le son principal."
        className="flex items-center gap-1 text-[10px] text-gray-300 cursor-pointer"
      >
        <input
          type="checkbox"
          checked={cfg.in_render}
          onChange={(e) => onRenderToggle(e.target.checked)}
          className="accent-amber-500"
        />
        Dans le rendu
      </label>

      {/* Sortie dédiée (clic séparé, joué par le serveur) */}
      <select
        value={cfg.out_device || ''}
        onChange={(e) => onDeviceChange(e.target.value)}
        title="Sortie audio dédiée au clic (mode séparé) : le serveur joue le clic sur CETTE sortie pendant que le navigateur joue le son principal. Ex : le hub USB-C sur Mac."
        className="bg-gray-800 text-gray-300 text-xs rounded-md px-1.5 py-1.5 max-w-[130px] border border-gray-700"
      >
        <option value="">Sortie : —</option>
        {devices.map((d) => (
          <option key={d.name} value={d.name}>{d.name} ({d.channels}ch)</option>
        ))}
      </select>

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
        className="w-12 accent-amber-500"
      />

      {/* Décalage du clic (compensation de latence, mode séparé) */}
      {separated && (
        <>
          <input
            type="range" min={0} max={200} value={cfg.delay_ms}
            onChange={(e) => apply({ delay_ms: parseInt(e.target.value) })}
            title={`Décalage clic (${cfg.delay_ms} ms) — si le clic sort EN AVANCE (chemin USB direct vs PipeWire), augmentez jusqu'à ce qu'il tombe pile sur le temps.`}
            className="w-12 accent-amber-500"
          />
          <span className="text-[10px] text-gray-500 w-8">{cfg.delay_ms}ms</span>
        </>
      )}

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
