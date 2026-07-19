interface ProgressBarProps {
  chords: { time: number }[];
  highlighted: number;
  playing: boolean;
  currentBeat: number;
  tempo: number;
}

export default function ProgressBar({ chords, highlighted, playing, currentBeat, tempo }: ProgressBarProps) {
  if (chords.length === 0 || !playing) return null;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 mb-2">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-300 ease-linear"
            style={{ width: `${Math.round(((highlighted + 1) / chords.length) * 100)}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-500 font-mono shrink-0">
          {Math.round(((highlighted + 1) / chords.length) * 100)}%
        </span>
        <span className="text-[10px] text-gray-600 font-mono shrink-0">
          {highlighted + 1}/{chords.length}
        </span>
      </div>
      <div className="flex items-center justify-center gap-2 mt-2">
        {[0,1,2,3].map(b => (
          <div key={b}
            className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all duration-100 ${
              currentBeat === b
                ? (b === 0 ? 'bg-blue-500 text-white scale-110' : 'bg-gray-600 text-white')
                : 'bg-gray-800 text-gray-600'
            }`}
          >
            {b + 1}
          </div>
        ))}
        <span className="text-[10px] text-gray-600 ml-1">{tempo} bpm</span>
      </div>
    </div>
  );
}
