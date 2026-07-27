import React, { useState, useEffect } from 'react';
import { Volume2 } from 'lucide-react';
import { AudioEngine, TrackConfig } from '../lib/audioEngine';
import { getChordColor, ChordData } from '../types/chord';
import ProgressBar from './ProgressBar';

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
  useSamples: boolean;
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
  onSetUseSamples: (v: boolean) => void;
}

export default function TrackPanel({
  chords, highlighted, playing, currentBeat, tempo,
  volume, use432, browserAudio, loopOn, walkingBass, drumPattern, sig, tracks,
  useSamples, availableSamples,
  onSetVolume, onSet432, onSetBrowserAudio, onSetLoop, onSetWalkingBass,
  onSetDrumPattern, onSetSig, onSetTempo, onUpdateTrack, onSetUseSamples,
}: TrackPanelProps) {
  const [midiPort, setMidiPort] = useState(2);
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <Volume2 className="w-3 h-3 text-gray-500 shrink-0" />
        <span className="text-xs text-gray-500 shrink-0">Vol:</span>
        <input type="range" min={10} max={127} value={volume}
          onChange={(e) => onSetVolume(parseInt(e.target.value))}
          className="w-16 sm:w-20 accent-green-500 shrink-0" />
        <span className="text-xs text-gray-400 w-6 shrink-0">{volume}</span>

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

        <button
          onClick={() => onSetUseSamples(!useSamples)}
          className={`px-2 py-1.5 text-xs font-bold rounded-lg border transition-colors shrink-0 ${
            useSamples
              ? 'bg-emerald-900/40 border-emerald-500 text-emerald-400'
              : 'bg-gray-800 border-gray-700 text-gray-500'
          }`}
          title="Utiliser les samples WAV au lieu de la batterie MIDI"
        >
          {'\ud83c\udfb5'} Samples {useSamples ? '\u25cf' : '\u25cb'}
        </button>

        <span className="text-xs text-gray-500 shrink-0">Pattern:</span>
        <select value={drumPattern}
          onChange={e => onSetDrumPattern(e.target.value)}
          className="bg-gray-800 text-orange-400 text-xs px-2 py-1.5 rounded-lg border border-gray-700 outline-none shrink-0">
          <option value="rock">{'\ud83c\udfb8'} Rock</option>
          <option value="pop">{'\ud83c\udfa4'} Pop</option>
          <option value="reggae">{'\ud83c\udf34'} Reggae</option>
          <option value="onedrop">{'\u23ec'} OneDrop</option>
          <option value="bossa">{'\ud83c\udf0a'} Bossa</option>
          <option value="jazz">{'\ud83c\udfb7'} Jazz</option>
        </select>

        <span className="text-xs text-gray-500 shrink-0">Mesure:</span>
        <select value={sig}
          onChange={e => onSetSig(e.target.value)}
          className="bg-gray-800 text-teal-400 text-xs px-2 py-1.5 rounded-lg border border-gray-700 outline-none shrink-0">
          <option value="4/4">4/4</option>
          <option value="3/4">3/4</option>
          <option value="6/8">6/8</option>
        </select>
      </div>

      {/* Tracks individuelles */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {tracks.map(t => (
          <div key={t.channel}
            className={`rounded-lg border px-3 py-2 ${
              t.mute ? 'border-gray-800 bg-gray-900/30 opacity-50' : 'border-gray-700 bg-gray-800/50'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold" style={{
                color: t.channel === 0 ? '#60a5fa' : t.channel === 2 ? '#fbbf24' : t.channel === 3 ? '#c084fc' : '#f87171'
              }}>
                {t.channel === 0 ? '\ud83c\udfb9' : t.channel === 2 ? '\ud83c\udfb8' : t.channel === 3 ? '\ud83c\udfbb' : '\ud83e\udd41'} {t.label}
              </span>
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
            </div>

            {t.channel !== 9 ? (
              <select
                value={t.program}
                onChange={e => onUpdateTrack(t.channel, { program: parseInt(e.target.value) })}
                className="w-full bg-gray-900 text-xs px-1.5 py-1 rounded border border-gray-700 outline-none mb-1.5"
                style={{ color: t.channel === 0 ? '#60a5fa' : t.channel === 2 ? '#fbbf24' : '#c084fc' }}
              >
                {AudioEngine.INSTRUMENTS.map((name, i) => (
                  <option key={i} value={i}>{name}</option>
                ))}
              </select>
            ) : (
              <div className="h-6" />
            )}

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-500 w-4">Vol</span>
              <input
                type="range"
                min={1} max={127}
                value={t.volume}
                onChange={e => onUpdateTrack(t.channel, { volume: parseInt(e.target.value) })}
                className="flex-1 h-1 accent-blue-500"
              />
              <span className="text-[10px] text-gray-500 w-6 text-right">{t.volume}</span>
            </div>
          </div>
        ))}
      </div>

          {/* Accord en cours + suivant */}
          {highlighted >= 0 && chords[highlighted] && (
            <div className="text-center py-3 mb-1">
              <div className="text-5xl font-bold font-mono tracking-wider"
                style={{ color: getChordColor(highlighted) }}>
                {chords[highlighted].chiffrage === '_' ? '—' : chords[highlighted].chiffrage}
              </div>
              {highlighted + 1 < chords.length && (
                <div className="text-2xl font-mono tracking-wider mt-1 opacity-40"
                  style={{ color: getChordColor(highlighted + 1) }}>
                  {chords[highlighted + 1].chiffrage === '_' ? '—' : chords[highlighted + 1].chiffrage}
                </div>
              )}
              <div className="text-xs text-gray-600 mt-1">{tempo} bpm</div>
            </div>
          )}

          {/* MIDI switch */}
          <div className="mt-2 pt-2 border-t border-gray-800 flex items-center gap-2">
            <span className="text-[10px] text-gray-500">🎛️ MIDI:</span>
            <button onClick={() => { fetch('http://localhost:4001/midi-connect/2',{method:'POST'}); setMidiPort(2); }}
              className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors ${midiPort===2 ? 'bg-green-900/40 border-green-600 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}>
              FluidSynth
            </button>
            <button onClick={() => { fetch('http://localhost:4001/midi-connect/1',{method:'POST'}); setMidiPort(1); }}
              className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors ${midiPort===1 ? 'bg-green-900/40 border-green-600 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}>
              Roland
            </button>
          </div>

          {/* Samples disponibles */}
          {availableSamples[String(tempo)] && availableSamples[String(tempo)].length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-800">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-gray-500">📂 Samples ({tempo} bpm):</span>
                <span className="text-[10px] text-emerald-400">
                  {availableSamples[String(tempo)].join(', ')}
                </span>
              </div>
              {useSamples && (
                <div className="text-[10px] text-emerald-600/60">
                  🎧 Batterie échantillonnée active
                </div>
              )}
            </div>
          )}
    </>
  );
}
