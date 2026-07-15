import React, { useState, useRef, useCallback } from 'react';
import { Play, Square, Trash2, Sparkles, Music, Volume2, Gauge } from 'lucide-react';
import { parseGrille, getChordColor, getNoteColor, ChordData } from '../types/chord';
import { AudioEngine } from '../lib/audioEngine';

export default function ChordApp() {
  const [input, setInput] = useState('4:Fm9 4:Cm9 4:Em 4:Ab');
  const [chords, setChords] = useState<ChordData[]>([]);
  const [highlighted, setHighlighted] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [tempo, setTempo] = useState(120);
  const [volume, setVolume] = useState(80);
  const [instrument, setInstrument] = useState(0);
  const [use432, setUse432] = useState(true);
  const [drumsOn, setDrumsOn] = useState(true);
  const [bassOn, setBassOn] = useState(true);
  const [arpsOn, setArpsOn] = useState(true);
  const [drumPattern, setDrumPattern] = useState('rock');
  const [sig, setSig] = useState('4/4');
  const [status, setStatus] = useState('Prêt');
  const [statusColor, setStatusColor] = useState('text-gray-400');
  const [audioStarted, setAudioStarted] = useState(false);

  const engineRef = useRef<AudioEngine | null>(null);

  const getEngine = useCallback(async () => {
    if (!engineRef.current) {
      engineRef.current = new AudioEngine();
    }
    if (!audioStarted) {
      await engineRef.current.init();
      setAudioStarted(true);
    }
    return engineRef.current;
  }, [audioStarted]);

  const parseInput = () => {
    try {
      const grille = parseGrille(input, tempo);
      setChords(grille.chords);
      setStatus(`✅ ${grille.chords.length} accords`);
      setStatusColor('text-green-400');
      setHighlighted(-1);
    } catch (e: any) {
      setStatus(`❌ ${e.message}`);
      setStatusColor('text-red-400');
    }
  };

  const play = useCallback(async () => {
    const engine = await getEngine();
    if (!engine) return;

    // Parser l'input si les accords ne sont pas à jour
    let chordsToPlay = chords;
    if (chords.length === 0 && input.trim()) {
      try {
        const grille = parseGrille(input, tempo);
        chordsToPlay = grille.chords;
      } catch {}
    }
    if (chordsToPlay.length === 0) return;

    engine.setProgram(instrument);
    engine.set432Hz(use432);
    engine.setVolume(volume);
    engine.setDrums(drumsOn);
    engine.setBass(bassOn);
    engine.setArpeggios(arpsOn);
    engine.setPattern(drumPattern);
    engine.setSig(sig);
    engine.onHighlight((idx) => setHighlighted(idx));

    setPlaying(true);
    setStatus('▶ Lecture...');
    setStatusColor('text-green-400');

    const grille = { titre: 'Session', tempo, chords: chordsToPlay };
    engine.playGrille(grille).then(() => {
      setPlaying(false);
      setHighlighted(-1);
      setStatus('✅ Lecture terminée');
      setStatusColor('text-green-400');
    }).catch((e) => {
      setPlaying(false);
      setStatus(`❌ Erreur: ${e.message}`);
      setStatusColor('text-red-400');
    });
  }, [chords, tempo, volume, instrument, use432, getEngine]);

  const stop = () => {
    if (engineRef.current) {
      engineRef.current.stop();
    }
    setPlaying(false);
    setHighlighted(-1);
    setStatus('■ Arrêté');
    setStatusColor('text-gray-400');
  };

  const clear = () => {
    stop();
    setChords([]);
    setHighlighted(-1);
    setStatus('Prêt');
    setStatusColor('text-gray-400');
  };

  // Initial parse
  // Synchronisation temps réel des paramètres vers l'engine
  React.useEffect(() => {
    engineRef.current?.setDrums(drumsOn);
  }, [drumsOn]);
  React.useEffect(() => {
    engineRef.current?.setBass(bassOn);
  }, [bassOn]);
  React.useEffect(() => {
    engineRef.current?.setArpeggios(arpsOn);
  }, [arpsOn]);
  React.useEffect(() => {
    engineRef.current?.setPattern(drumPattern);
  }, [drumPattern]);
  React.useEffect(() => {
    fetch('http://localhost:4000/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sig }),
    }).catch(() => {});
    engineRef.current?.setSig(sig);
  }, [sig]);
  // Synchronisation temps réel du tempo vers le backend (même sans engine)
  React.useEffect(() => {
    fetch('http://localhost:4000/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempo }),
    }).catch(() => {});
    engineRef.current?.setTempo(tempo);
  }, [tempo]);

  React.useEffect(() => {
    parseInput();
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 flex items-start justify-center p-4">
      <div className="w-full max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Music className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">chordJAVA</h1>
              <p className="text-xs text-gray-500">Moteur Harmonique</p>
            </div>
          </div>
          <span className={`text-xs font-mono ${statusColor}`}>{status}</span>
        </div>

        {/* Input */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-4">
          <label className="text-xs text-gray-500 mb-2 block font-mono">
            Accords (ex: 4:Cm7 2:FM7 4:G7 4:C)
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            className="w-full bg-gray-800 text-white text-sm font-mono px-4 py-3 rounded-lg border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
            placeholder="4:Cm7 2:FM7 4:G7 4:C"
          />
        </div>

        {/* Controls Row 1 */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 mb-2">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={parseInput}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors">
              Analyser
            </button>
            <button onClick={play} disabled={playing || chords.length === 0}
              className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1">
              <Play className="w-3 h-3" /> Jouer
            </button>
            <button onClick={stop}
              className="px-4 py-2 bg-red-800 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1">
              <Square className="w-3 h-3" /> Stop
            </button>
            <button onClick={clear}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-bold rounded-lg transition-colors flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Effacer
            </button>

            <div className="w-px h-6 bg-gray-700 mx-1" />

            <span className="text-xs text-gray-500">Inst:</span>
            <select
              value={instrument}
              onChange={(e) => setInstrument(parseInt(e.target.value))}
              className="bg-gray-800 text-blue-400 text-xs px-2 py-1.5 rounded-lg border border-gray-700 outline-none w-36"
            >
              {AudioEngine.INSTRUMENTS.map((name, i) => (
                <option key={i} value={i}>{name}</option>
              ))}
            </select>

            <div className="w-px h-6 bg-gray-700 mx-1" />

            <Gauge className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-xs text-gray-500">Tempo:</span>
            <input type="range" min={40} max={220} value={tempo}
              onChange={(e) => setTempo(parseInt(e.target.value))}
              className="w-20 accent-blue-500" />
            <span className="text-xs font-bold text-blue-400 w-12">{tempo} bpm</span>
          </div>
        </div>

        {/* Controls Row 2 */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 mb-4">
          <div className="flex items-center gap-2">
            <Volume2 className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-xs text-gray-500">Volume:</span>
            <input type="range" min={10} max={127} value={volume}
              onChange={(e) => setVolume(parseInt(e.target.value))}
              className="w-28 accent-green-500" />
            <span className="text-xs text-gray-400 w-8">{volume}</span>

            <div className="w-px h-6 bg-gray-700 mx-2" />

            <button
              onClick={() => setUse432(!use432)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                use432
                  ? 'bg-yellow-900/40 border-yellow-600 text-yellow-400'
                  : 'bg-gray-800 border-gray-700 text-gray-500'
              }`}
            >
              A=432Hz {use432 ? '●' : '○'}
            </button>

            <div className="w-px h-6 bg-gray-700 mx-2" />

            {/* Checkboxes */}
            <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
              <input type="checkbox" checked={drumsOn}
                onChange={e => setDrumsOn(e.target.checked)}
                className="accent-blue-500" />
              🥁 Drums
            </label>
            <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
              <input type="checkbox" checked={bassOn}
                onChange={e => setBassOn(e.target.checked)}
                className="accent-yellow-500" />
              🎸 Basse
            </label>
            <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
              <input type="checkbox" checked={arpsOn}
                onChange={e => setArpsOn(e.target.checked)}
                className="accent-green-500" />
              🎹 Arpèges
            </label>

            <div className="w-px h-6 bg-gray-700 mx-2" />

            <span className="text-xs text-gray-500">Pattern:</span>
            <select value={drumPattern}
              onChange={e => setDrumPattern(e.target.value)}
              className="bg-gray-800 text-orange-400 text-xs px-2 py-1.5 rounded-lg border border-gray-700 outline-none">
              <option value="rock">🎸 Rock</option>
              <option value="reggae">🌴 Reggae</option>
              <option value="jazz">🎷 Jazz</option>
            </select>

            <span className="text-xs text-gray-500 ml-2">Mesure:</span>
            <select value={sig}
              onChange={e => setSig(e.target.value)}
              className="bg-gray-800 text-teal-400 text-xs px-2 py-1.5 rounded-lg border border-gray-700 outline-none">
              <option value="4/4">4/4</option>
              <option value="3/4">3/4</option>
              <option value="6/8">6/8</option>
            </select>
          </div>
        </div>

        {/* Chord Grid */}
        {chords.length > 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-800">
              <h2 className="text-sm font-bold text-blue-400">
                📊 Session &nbsp;|&nbsp; {tempo} bpm &nbsp;·&nbsp; {chords.length} accords
              </h2>
            </div>

            {/* Chord cards */}
            {chords.map((c, idx) => (
              <div
                key={idx}
                className={`px-4 py-3 border-b border-gray-800 last:border-0 transition-all duration-200 ${
                  highlighted === idx ? 'bg-gray-700/60 ring-1 ring-blue-500/30' : 'hover:bg-gray-800/50'
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Chord name */}
                  <div className="w-28 shrink-0">
                    <span
                      className="text-lg font-bold font-mono"
                      style={{ color: getChordColor(idx) }}
                    >
                      {c.chiffrage}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">{c.time}t</span>
                  </div>

                  {/* Notes */}
                  <div className="flex flex-wrap gap-1.5">
                    {c.notes.map((note, ni) => (
                      <span
                        key={ni}
                        className="px-2.5 py-1 rounded-md text-xs font-mono font-bold border"
                        style={{
                          color: getNoteColor(note),
                          backgroundColor: 'rgba(40,40,40,0.8)',
                          borderColor: 'rgba(60,60,60,0.8)',
                        }}
                      >
                        {note}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {chords.length === 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
            <Sparkles className="w-12 h-12 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-500 text-sm">Entre des accords pour commencer</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-4 text-[10px] text-gray-700">
          chordJAVA v2 · Tone.js · {AudioEngine.INSTRUMENTS.length} instruments · {use432 ? 'A=432Hz' : 'A=440Hz'}
        </div>

      </div>
    </div>
  );
}
