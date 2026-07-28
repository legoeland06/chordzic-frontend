import React, { useState, useRef, useCallback } from 'react';
import { QUALITY_INTERVALS } from '../types/chord';

const NOTE_PATTERN = /^([A-G][#b]?)(.*)/;

const QUALITY_NAMES = Object.keys(QUALITY_INTERVALS)
  .filter(k => k && k !== 'M' && k !== '')
  .sort((a, b) => a.length - b.length || a.localeCompare(b));

function getCurrentToken(text: string, cursor: number): {start: number; end: number; token: string} {
  let start = cursor;
  while (start > 0 && text[start - 1] !== ' ') start--;
  let end = cursor;
  while (end < text.length && text[end] !== ' ') end++;
  return { start, end, token: text.slice(start, end) };
}

function getSuggestions(token: string, lastChordChiffrage: string): string[] {
  if (!token || token === ' ') return [];
  const trimmed = token.trim();

  if (trimmed.includes(':')) {
    const colonIdx = trimmed.indexOf(':');
    const timePart = trimmed.slice(0, colonIdx + 1);
    const rest = trimmed.slice(colonIdx + 1);
    const noteMatch = rest.match(NOTE_PATTERN);
    if (noteMatch) {
      const noteName = noteMatch[1];
      const partialQuality = noteMatch[2].toLowerCase();
      if (partialQuality !== rest.toLowerCase()) {
        const results: string[] = [];
        for (const q of QUALITY_NAMES) {
          if (q.toLowerCase().startsWith(partialQuality)) {
            results.push(timePart + noteName + q);
          }
        }
        return results.slice(0, 12);
      }
    }
  }

  const noteMatch = trimmed.match(NOTE_PATTERN);
  if (noteMatch) {
    const noteName = noteMatch[1];
    const partialQuality = noteMatch[2].toLowerCase();
    const results: string[] = [];
    for (const q of QUALITY_NAMES) {
      if (q.toLowerCase().startsWith(partialQuality)) {
        results.push(noteName + q);
      }
    }
    return results.slice(0, 12);
  }

  if (/^\d+:$/.test(trimmed) && lastChordChiffrage) {
    return [trimmed + lastChordChiffrage];
  }

  return [];
}

interface ChordInputProps {
  input: string;
  onChange: (val: string) => void;
}

export default function ChordInput({ input, onChange }: ChordInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const [suggestToken, setSuggestToken] = useState<{start:number;end:number} | null>(null);
  const [lastChiffrage, setLastChiffrage] = useState('');

  const replaceToken = (text: string, start: number, end: number, replacement: string): string => {
    return text.slice(0, start) + replacement + text.slice(end);
  };

  const applySuggestion = useCallback((suggestion: string) => {
    if (!suggestToken) return;
    const newInput = replaceToken(input, suggestToken.start, suggestToken.end, suggestion);
    onChange(newInput);
    setSuggestions([]);
    setSuggestToken(null);
    const newCursor = suggestToken.start + suggestion.length;
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursor, newCursor);
      }
    });
  }, [input, suggestToken, onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);
    const cursor = e.target.selectionStart ?? val.length;
    const { start, end, token } = getCurrentToken(val, cursor);
    const results = getSuggestions(token, lastChiffrage);
    setSuggestions(results);
    setSuggestIdx(0);
    setSuggestToken(results.length > 0 ? { start, end } : null);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length === 0) return;
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      applySuggestion(suggestions[suggestIdx]);
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestIdx(prev => Math.min(prev + 1, suggestions.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestIdx(prev => Math.max(prev - 1, 0)); return; }
    if (e.key === 'Escape') { setSuggestions([]); setSuggestToken(null); return; }
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-4 relative">
      <label className="text-xs text-gray-500 mb-2 block font-mono">
        Accords (ex: 4:Cm7 2:FM7 4:G7 4:C) — <span className="text-blue-400">Tab</span> pour compléter
      </label>
      <textarea
        ref={inputRef}
        value={input}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        onBlur={() => { setTimeout(() => { setSuggestions([]); setSuggestToken(null); }, 200); }}
        rows={5}
        className="w-full bg-gray-800 text-white text-sm font-mono px-4 py-3 rounded-lg border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
        placeholder="4:Cm7 2:FM7 4:G7 4:C"
      />

      {suggestions.length > 0 && suggestToken && (
        <div className="absolute left-4 z-50 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden"
             style={{ top: '100%', minWidth: 160, maxHeight: 280 }}>
          {suggestions.map((s, i) => (
            <button key={s}
              onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
              className={`w-full text-left px-4 py-2 text-xs font-mono transition-colors ${
                i === suggestIdx ? 'bg-blue-700 text-white' : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              {s}
            </button>
          ))}
          <div className="px-4 py-1.5 text-[10px] text-gray-500 border-t border-gray-700">
            ↑↓ naviguer · Tab/Enter valider · Esc fermer
          </div>
        </div>
      )}
    </div>
  );
}
