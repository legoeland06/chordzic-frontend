/**
 * TrackPanel — panneau de contrôle des pistes et paramètres audio.
 *
 * Contient :
 * - Volume master + 432Hz toggle
 * - Mode navigateur (WAV render) / MIDI live
 * - Loop toggle
 * - Walking bass toggle
 * - Sélecteur de pattern drums (rock, pop, reggae, jazz, bossa, onedrop)
 * - Sélecteur de signature rythmique (4/4, 3/4, 6/8)
 * - Contrôles individuels par piste (instrument, mute, volume)
 * - Sélecteur MIDI (FluidSynth / Roland)
 * - Section boucle WAV drums (volume, sélecteur, offset spinner)
 */
import React, { useState } from 'react';
import { Volume2 } from 'lucide-react';
import { AudioEngine, TrackConfig } from '../lib/audioEngine';
import { getChordColor, ChordData } from '../types/chord';

/** Icône d'une piste selon son canal (les nouveaux canaux → 🎼 partition). */
const trackIcon = (ch: number) =>
  ch === 0 ? '🎹' : ch === 2 ? '🎸' : ch === 3 ? '🎻' : ch === 9 ? '🥁' : '🎼';

/** Couleur d'une piste selon son canal (les nouveaux canaux → cyan). */
const trackColor = (ch: number) =>
  ch === 0 ? '#60a5fa'
  : ch === 2 ? '#fbbf24'
  : ch === 3 ? '#c084fc'
  : ch === 9 ? '#f87171'
  : ch === 4 ? '#34d399'
  : '#26d3ff';

/** Nom de piste ÉDITABLE : commit au blur / Entrée, Esc annule. */
function TrackLabel({ channel, label, color, onCommit }: {
  channel: number; label: string; color: string;
  onCommit: (channel: number, label: string) => void;
}) {
  const [val, setVal] = useState(label);
  React.useEffect(() => { setVal(label); }, [label]);
  const commit = () => {
    const v = val.trim();
    if (v && v !== label) onCommit(channel, v);
    else setVal(label);
  };
  return (
    <input
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        else if (e.key === 'Escape') { setVal(label); (e.target as HTMLInputElement).blur(); }
      }}
      className="bg-transparent text-xs font-bold outline-none border-b border-transparent focus:border-gray-500 w-24 min-w-0 truncate"
      style={{ color }}
      title="Cliquer pour renommer la piste (Entrée valide, Esc annule)"
      spellCheck={false}
    />
  );
}

interface TrackPanelProps {
  chords: ChordData[];
  highlighted: number;
  playing: boolean;
  currentBeat: number;
  tempo: number;
  volume: number;
  use432: boolean;
  browserAudio: boolean;
  loopOn: boolean;
  walkingBass: boolean;
  drumPattern: string;
  sig: string;
  tracks: TrackConfig[];
  useLoops: boolean;
  loopOffset: number;
  loopName: string;
  availableSamples: Record<string, string[]>;
  onSetVolume: (v: number) => void;
  onSet432: (v: boolean) => void;
  onSetBrowserAudio: (v: boolean) => void;
  onSetLoop: (v: boolean) => void;
  onSetWalkingBass: (v: boolean) => void;
  onSetDrumPattern: (v: string) => void;
  onSetSig: (v: string) => void;
  onSetTempo: (v: number) => void;
  onUpdateTrack: (channel: number, cfg: Partial<TrackConfig>) => void;
  onSetUseLoops: (v: boolean) => void;
  onSetLoopOffset: (v: number) => void;
  onSetLoopName: (v: string) => void;
  onSetLoopVolume: (v: number) => void;
  loopVolume: number;
  /** Callback pour ouvrir le PianoRoll d'une piste (channel). */
  onOpenPianoRoll?: (channel: number) => void;
  /** Ajoute une nouvelle piste instrument. */
  onAddTrack: () => void;
  /** Supprime une piste (channel). */
  onRemoveTrack: (channel: number) => void;
}

export default function TrackPanel({
  chords, highlighted, playing, currentBeat, tempo,
  volume, use432, browserAudio, loopOn, walkingBass, drumPattern, sig, tracks,
  useLoops, loopOffset, loopName, availableSamples,
  onSetVolume, onSet432, onSetBrowserAudio, onSetLoop, onSetWalkingBass,
  loopVolume,
  onSetDrumPattern, onSetSig, onSetTempo, onUpdateTrack,
  onSetUseLoops, onSetLoopOffset, onSetLoopName, onSetLoopVolume,
  onOpenPianoRoll, onAddTrack, onRemoveTrack,
}: TrackPanelProps) {
  const [midiPort, setMidiPort] = useState(2);
  // Échantillons disponibles pour le tempo courant
  const samplesHere = availableSamples[String(tempo)] || [];

  return (
    <>
      {/* ── Rangée 1 : contrôles généraux ── */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">

        {/* Volume master */}
        <Volume2 className="w-3 h-3 text-gray-500 shrink-0" />
        <span className="text-xs text-gray-500 shrink-0">Vol:</span>
        <input
          type="range" min={10} max={127} value={volume}
          onChange={(e) => onSetVolume(parseInt(e.target.value))}
          className="w-16 sm:w-20 accent-green-500 shrink-0"
        />
        <span className="text-xs text-gray-400 w-6 shrink-0">{volume}</span>

        {/* 432Hz toggle */}
        <button
          onClick={() => onSet432(!use432)}
          className={`px-2 py-1.5 text-xs font-bold rounded-lg border transition-colors shrink-0 ${
            use432
              ? 'bg-yellow-900/40 border-yellow-600 text-yellow-400'
              : 'bg-gray-800 border-gray-700 text-gray-500'
          }`}
        >
          432Hz {use432 ? '\u25cf' : '\u25cb'}
        </button>

        {/* Mode navigateur (WAV render) */}
        <button
          onClick={() => onSetBrowserAudio(!browserAudio)}
          className={`px-2 py-1.5 text-xs font-bold rounded-lg border transition-colors shrink-0 ${
            browserAudio
              ? 'bg-purple-900/40 border-purple-500 text-purple-400'
              : 'bg-gray-800 border-gray-700 text-gray-500'
          }`}
          title="Mode navigateur: rendu WAV via le synthé du PC"
        >
          {'\uD83D\uDCF1'} Navig. {browserAudio ? '\u25cf' : '\u25cb'}
        </button>

        {/* Loop toggle */}
        <button
          onClick={() => onSetLoop(!loopOn)}
          className={`px-2 py-1.5 text-xs font-bold rounded-lg border transition-colors shrink-0 ${
            loopOn
              ? 'bg-purple-900/40 border-purple-500 text-purple-400'
              : 'bg-gray-800 border-gray-700 text-gray-500'
          }`}
          disabled={playing}
        >
          {'\ud83d\udd04'} Loop
        </button>

        {/* Walking Bass toggle */}
        <button
          onClick={() => onSetWalkingBass(!walkingBass)}
          className={`px-2 py-1.5 text-xs font-bold rounded-lg border transition-colors shrink-0 ${
            walkingBass
              ? 'bg-pink-900/40 border-pink-500 text-pink-400'
              : 'bg-gray-800 border-gray-700 text-gray-500'
          }`}
        >
          {'\ud83c\udfb5'} WB
        </button>

        {/* Pattern drums */}
        <span className="text-xs text-gray-500 shrink-0">Pattern:</span>
        <select
          value={drumPattern}
          onChange={e => onSetDrumPattern(e.target.value)}
          className="bg-gray-800 text-orange-400 text-xs px-2 py-1.5 rounded-lg border border-gray-700 outline-none shrink-0"
        >
          <option value="rock">{'\ud83c\udfb8'} Rock</option>
          <option value="pop">{'\ud83c\udfa4'} Pop</option>
          <option value="reggae">{'\ud83c\udf34'} Reggae</option>
          <option value="onedrop">{'\u23ec'} OneDrop</option>
          <option value="bossa">{'\ud83c\udf0a'} Bossa</option>
          <option value="jazz">{'\ud83c\udfb7'} Jazz</option>
        </select>

        {/* Signature rythmique */}
        <span className="text-xs text-gray-500 shrink-0">Mesure:</span>
        <select
          value={sig}
          onChange={e => onSetSig(e.target.value)}
          className="bg-gray-800 text-teal-400 text-xs px-2 py-1.5 rounded-lg border border-gray-700 outline-none shrink-0"
        >
          <option value="4/4">4/4</option>
          <option value="3/4">3/4</option>
          <option value="6/8">6/8</option>
        </select>
      </div>

      {/* ── Pistes individuelles ── */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {tracks.map(t => (
          <div
            key={t.channel}
            className={`rounded-lg border px-3 py-2 ${
              t.mute
                ? 'border-gray-800 bg-gray-900/30 opacity-50'
                : 'border-gray-700 bg-gray-800/50'
            }`}
          >
            {/* En-tête : icône + label + bouton piano roll + mute */}
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <TrackLabel
                channel={t.channel}
                label={t.label}
                color={trackColor(t.channel)}
                onCommit={(ch, label) => onUpdateTrack(ch, { label })}
              />
              <div className="flex items-center gap-1 shrink-0">
                {/* Bouton Piano Roll */}
                <button
                  onClick={() => onOpenPianoRoll?.(t.channel)}
                  className="px-1.5 py-0.5 text-xs rounded font-bold bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-yellow-400 transition-colors"
                  title="Ouvrir le Piano Roll"
                >
                  {trackIcon(t.channel)}
                </button>
                <button
                  onClick={() => onUpdateTrack(t.channel, { mute: !t.mute })}
                  className={`text-xs px-2 py-0.5 rounded font-bold ${
                    t.mute
                      ? 'bg-red-900/40 text-red-400'
                      : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {t.mute ? 'MUTE' : 'On'}
                </button>
                <button
                  onClick={() => onRemoveTrack(t.channel)}
                  className="text-xs px-1.5 py-0.5 rounded font-bold bg-gray-800 text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors"
                  title="Supprimer cette piste"
                >
                  🗑
                </button>
              </div>
            </div>

            {/* Sélecteur d'instrument (sauf drums — kit fixe) */}
            {t.channel !== 9 && !t.drums ? (
              <select
                value={t.program}
                onChange={e => onUpdateTrack(t.channel, { program: parseInt(e.target.value) })}
                className="w-full bg-gray-900 text-xs px-1.5 py-1 rounded border border-gray-700 outline-none mb-1.5"
                style={{ color: trackColor(t.channel) }}
              >
                {AudioEngine.INSTRUMENTS.map((name, i) => (
                  <option key={i} value={i}>{name}</option>
                ))}
              </select>
            ) : (
              <div className="h-6 mb-1.5 flex items-center justify-center rounded border border-gray-800 bg-gray-900/40 text-[10px] text-gray-500 font-mono">
                🥁 Kit drums
              </div>
            )}

            {/* Volume de la piste */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-500 w-4">Vol</span>
              <input
                type="range" min={1} max={127}
                value={t.volume}
                onChange={e => onUpdateTrack(t.channel, { volume: parseInt(e.target.value) })}
                className="flex-1 h-1 accent-blue-500"
              />
              <span className="text-[10px] text-gray-500 w-6 text-right">{t.volume}</span>
            </div>
          </div>
        ))}
        {/* Carte « Ajouter une piste » (pistes dynamiques) */}
        <button
          onClick={onAddTrack}
          className="rounded-lg border border-dashed border-gray-700 hover:border-gray-500 hover:bg-gray-800/40 text-gray-500 hover:text-gray-300 text-xs font-bold px-3 py-2 transition-colors flex flex-col items-center justify-center gap-1 min-h-[76px]"
          title="Ajouter une nouvelle piste instrument (canal MIDI libre)"
        >
          <span className="text-lg">➕</span>
          Ajouter une piste
        </button>
      </div>

      {/* ── Accord en cours + suivant ── */}
      {highlighted >= 0 && chords[highlighted] && (
        <div className="text-center py-3 mb-1">
          {/* Accord courant (gros) */}
          <div
            className="text-5xl font-bold font-mono tracking-wider"
            style={{ color: getChordColor(highlighted) }}
          >
            {chords[highlighted].chiffrage === '_' ? '\u2014' : chords[highlighted].chiffrage}
          </div>
          {/* Accord suivant (petit, transparent) */}
          {highlighted + 1 < chords.length && (
            <div
              className="text-2xl font-mono tracking-wider mt-1 opacity-40"
              style={{ color: getChordColor(highlighted + 1) }}
            >
              {chords[highlighted + 1].chiffrage === '_' ? '\u2014' : chords[highlighted + 1].chiffrage}
            </div>
          )}
          <div className="text-xs text-gray-600 mt-1">{tempo} bpm</div>
        </div>
      )}

      {/* ── Sélecteur MIDI (FluidSynth / Roland) ── */}
      <div className="mt-2 pt-2 border-t border-gray-800 flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-gray-500">{'\uD83C\uDF9B\uFE0F'} MIDI:</span>
        <button
          onClick={() => {
            fetch('http://localhost:4001/midi-connect/2', { method: 'POST' });
            setMidiPort(2);
          }}
          className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors ${
            midiPort === 2
              ? 'bg-green-900/40 border-green-600 text-green-400'
              : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
          }`}
        >
          FluidSynth
        </button>
        <button
          onClick={() => {
            fetch('http://localhost:4001/midi-connect/1', { method: 'POST' });
            setMidiPort(1);
          }}
          className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors ${
            midiPort === 1
              ? 'bg-green-900/40 border-green-600 text-green-400'
              : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Roland
        </button>
      </div>

      {/* ── Section boucle WAV drums ── */}
      {samplesHere.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-800">
          <div className="flex flex-wrap items-center gap-2">
            {/* Volume boucle */}
            <span className="text-[10px] text-gray-500 shrink-0">Vol:</span>
            <input
              type="range" min={1} max={127} value={loopVolume}
              onChange={(e) => onSetLoopVolume(parseInt(e.target.value))}
              className="w-16 accent-emerald-500 shrink-0"
            />

            {/* Toggle boucle */}
            <button
              onClick={() => onSetUseLoops(!useLoops)}
              className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors ${
                useLoops
                  ? 'bg-emerald-900/40 border-emerald-500 text-emerald-400'
                  : 'bg-gray-800 border-gray-700 text-gray-500 hover:bg-gray-700'
              }`}
            >
              {'\ud83c\udfb5'} Boucle {useLoops ? '\u25cf' : '\u25cb'}
            </button>

            {/* Sélecteur de fichier boucle */}
            {samplesHere.length > 1 && (
              <select
                value={loopName || samplesHere[0]}
                onChange={e => onSetLoopName(e.target.value)}
                className="bg-gray-800 text-emerald-400 text-[10px] px-2 py-1 rounded border border-gray-700 outline-none"
              >
                {samplesHere.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}

            {/* Spinner offset (décalage en ms) */}
            <div className="flex items-center gap-1 bg-gray-800 rounded border border-gray-700 px-2 py-1">
              <span className="text-[10px] text-gray-500">{'\u2195'}</span>
              <button
                onClick={() => onSetLoopOffset(loopOffset - 1)}
                className="text-[10px] text-gray-400 hover:text-white px-1 font-bold"
                title="-1ms"
              >{'◀'}</button>
              <input
                type="number"
                value={loopOffset}
                onChange={e => onSetLoopOffset(parseInt(e.target.value) || 0)}
                className="w-14 bg-gray-900 text-emerald-400 text-xs font-mono text-center rounded border border-gray-700 outline-none px-1 py-0.5"
                step={1}
              />
              <span className="text-[10px] text-gray-500">ms</span>
              <button
                onClick={() => onSetLoopOffset(loopOffset + 1)}
                className="text-[10px] text-gray-400 hover:text-white px-1 font-bold"
                title="+1ms"
              >{'▶'}</button>
            </div>
          </div>

          {/* Info boucle unique */}
          {samplesHere.length === 1 && (
            <div className="text-[10px] text-gray-500 mt-1">
              Boucle: {samplesHere[0]} ({tempo} bpm)
            </div>
          )}

          {/* Statut boucle active */}
          {useLoops && (
            <div className="text-[10px] text-emerald-600/60 mt-1">
              {'\ud83d\udd01'} Lecture en boucle active (offset {loopOffset}ms)
            </div>
          )}
        </div>
      )}

      {/* Message si pas de boucle pour ce tempo */}
      {samplesHere.length === 0 && (
        <div className="mt-2 pt-2 border-t border-gray-800">
          <div className="text-[10px] text-gray-600">
            {'\uD83D\uDCC2'} Aucune boucle pour {tempo} bpm dans ~/samples/drums/
          </div>
        </div>
      )}
    </>
  );
}
