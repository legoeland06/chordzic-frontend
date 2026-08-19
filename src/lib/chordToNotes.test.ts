/**
 * Tests de la conversion accord reconnu → notes de piano roll.
 */
import { describe, expect, it } from 'vitest';
import type { RecognizedChord } from './chordRecognition';
import { activePitchesAt, chordToPianoNotes } from './chordToNotes';
import type { PianoNote } from './pianoRollTypes';

function chord(partial: Partial<RecognizedChord>): RecognizedChord {
  return {
    root: 0,
    quality: '',
    label: 'C',
    classes: [0, 4, 7],
    exact: true,
    noteOnly: false,
    insertable: true,
    bass: null,
    ...partial,
  };
}

describe('chordToPianoNotes', () => {
  it('C majeur → C4 E4 G4 (60, 64, 67) sur la durée demandée', () => {
    const notes = chordToPianoNotes(chord({ root: 0, quality: '' }), 4, 4);
    expect(notes.map(n => n.pitch)).toEqual([60, 64, 67]);
    expect(notes.every(n => n.startTime === 4 && n.duration === 4)).toBe(true);
    expect(notes.every(n => n.velocity === 80)).toBe(true);
    expect(new Set(notes.map(n => n.id)).size).toBe(3); // ids uniques
  });

  it('Am7 → A4 C5 E5 G5 (69, 72, 76, 79)', () => {
    const notes = chordToPianoNotes(chord({ root: 9, quality: 'm7' }), 0, 4);
    expect(notes.map(n => n.pitch)).toEqual([69, 72, 76, 79]);
  });

  it('C/G → basse imposée G3 (55) ajoutée sous la fondamentale', () => {
    const notes = chordToPianoNotes(chord({ root: 0, bass: 'G' }), 0, 4);
    expect(notes.map(n => n.pitch)).toEqual([55, 60, 64, 67]); // trié, basse d'abord
  });

  it('basse identique à la fondamentale → pas de note en double', () => {
    const notes = chordToPianoNotes(chord({ root: 0, bass: 'C' }), 0, 4);
    expect(notes.map(n => n.pitch)).toEqual([60, 64, 67]);
  });

  it('accords étendus (9, 13) : les extensions suivent les intervalles', () => {
    const n9 = chordToPianoNotes(chord({ root: 0, quality: '9' }), 0, 4);
    expect(n9.map(n => n.pitch)).toEqual([60, 64, 67, 70, 74]); // C9
    const n13 = chordToPianoNotes(chord({ root: 0, quality: '13' }), 0, 4);
    expect(n13.map(n => n.pitch)).toEqual([60, 64, 67, 70, 74, 81]); // C13
  });

  it('gère une qualité inconnue avec un repli majeur', () => {
    const notes = chordToPianoNotes(chord({ root: 2, quality: '???inconnue' }), 0, 4);
    expect(notes.map(n => n.pitch)).toEqual([62, 66, 69]); // D F# A
  });

  it('vélocité personnalisable', () => {
    const notes = chordToPianoNotes(chord({ root: 0 }), 0, 4, 100);
    expect(notes.every(n => n.velocity === 100)).toBe(true);
  });
});

describe('activePitchesAt (illumination de la piste jouée)', () => {
  const notes: PianoNote[] = [
    { id: 'a', startTime: 0, pitch: 60, duration: 4, velocity: 80 },
    { id: 'b', startTime: 2, pitch: 64, duration: 2, velocity: 80 },
    { id: 'c', startTime: 4, pitch: 67, duration: 4, velocity: 80 },
  ];

  it('note active dans [start, start+duration[', () => {
    expect(activePitchesAt(notes, 0)).toEqual([60]);
    expect(activePitchesAt(notes, 1.5)).toEqual([60]);
    expect(activePitchesAt(notes, 3)).toEqual([60, 64]); // chevauchement
    expect(activePitchesAt(notes, 4)).toEqual([67]); // b finie, c commence
  });

  it('aucune note active hors des plages', () => {
    expect(activePitchesAt(notes, -1)).toEqual([]);
    expect(activePitchesAt(notes, 8.5)).toEqual([]);
  });

  it('piste vide → rien', () => {
    expect(activePitchesAt([], 2)).toEqual([]);
  });
});
