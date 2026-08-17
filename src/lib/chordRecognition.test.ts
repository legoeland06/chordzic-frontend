import { describe, expect, it } from 'vitest';
import { recognizeChord } from './chordRecognition';

describe('recognizeChord — reconnaissance d’accords (mode Live)', () => {
  it('aucune note / notes hors plage → null', () => {
    expect(recognizeChord([])).toBeNull();
    expect(recognizeChord([200])).toBeNull();
    expect(recognizeChord([-1])).toBeNull();
  });

  it('une seule note → la note seule, pas un accord', () => {
    const r = recognizeChord([60])!;
    expect(r.label).toBe('C');
    expect(r.noteOnly).toBe(true);
    expect(r.insertable).toBe(true);
    expect(recognizeChord([62])!.label).toBe('D');
    expect(recognizeChord([61])!.label).toBe('C#');
  });

  it('2 notes → match strict uniquement (pas de tolérance)', () => {
    expect(recognizeChord([60, 67])!.label).toBe('C5'); // quinte
    expect(recognizeChord([60, 64])!.label).toBe('Cno5'); // tierce seule
    // C+F et D+G n'ont qu'un match exact à 2 notes : la quinte relative
    expect(recognizeChord([60, 65])!.label).toBe('F5');
    expect(recognizeChord([62, 67])!.label).toBe('G5');
  });

  it('2 notes sans accord connu → notes brutes, non insérable', () => {
    const r = recognizeChord([60, 71])!; // C + B
    expect(r.label).toBe('C·B');
    expect(r.exact).toBe(false);
    expect(r.insertable).toBe(false);
  });

  it('triades majeures → chiffrage propre sans M', () => {
    expect(recognizeChord([60, 64, 67])!.label).toBe('C');
    expect(recognizeChord([61, 65, 68])!.label).toBe('C#');
    expect(recognizeChord([62, 66, 69])!.label).toBe('D');
  });

  it('triades mineures, diminuées, augmentées, sus', () => {
    expect(recognizeChord([60, 63, 67])!.label).toBe('Cm');
    expect(recognizeChord([60, 63, 66])!.label).toBe('Cdim');
    expect(recognizeChord([60, 64, 68])!.label).toBe('Caug');
    expect(recognizeChord([60, 65, 67])!.label).toBe('Csus4');
    expect(recognizeChord([60, 62, 67])!.label).toBe('Csus2');
  });

  it('septièmes : C7, CM7, Cm7 (distinction majeure/dominante/mineure)', () => {
    expect(recognizeChord([60, 64, 67, 70])!.label).toBe('C7'); // Bb
    expect(recognizeChord([60, 64, 67, 71])!.label).toBe('CM7'); // B
    expect(recognizeChord([60, 63, 67, 70])!.label).toBe('Cm7');
  });

  it('renversements : la fondamentale est retrouvée (E G C → C)', () => {
    expect(recognizeChord([64, 67, 72])!.label).toBe('C'); // 1er renversement
    expect(recognizeChord([67, 72, 76])!.label).toBe('C'); // 2e renversement
    expect(recognizeChord([57, 60, 64])!.label).toBe('Am'); // A en basse
  });

  it('accords relatifs départagés par la basse réelle (C6 vs Am7)', () => {
    // C E G A — basse C → C6 ; A C E G — basse A → Am7
    expect(recognizeChord([60, 64, 67, 69])!.label).toBe('C6');
    expect(recognizeChord([57, 60, 64, 67])!.label).toBe('Am7');
  });

  it('doublures et octaves ignorées (même classe)', () => {
    // C3 C4 E4 G4 → C (la doublure du C ne change rien)
    expect(recognizeChord([48, 60, 64, 67])!.label).toBe('C');
  });

  it('inclusion à partir de 3 notes : notes ajoutées reconnues (CM9)', () => {
    // C E G B D = CM9 (classes {0,2,4,7,11} — exact)
    expect(recognizeChord([60, 64, 67, 71, 74])!.label).toBe('CM9');
  });

  it('inclusion : accord inclus dans des notes supplémentaires', () => {
    // C E G + Bb + F → C7 avec la 11 ajoutée : {0,4,5,7,10}
    // 7sus4 {0,5,7,10} ⊆ (4 incluses, 1 étrangère) ; C7 {0,4,7,10} ⊆ (1 étrangère)
    // Le meilleur score = le plus de notes incluses, le moins d'étrangères :
    // C7 (4 notes, 1 étrangère) = 500+40-1 = 539 ; 7sus4 = 500+40-1 = 539 aussi…
    // L'ordre de la table départage (le premier score > best gagne) : C7 passe avant.
    const r = recognizeChord([60, 64, 67, 70, 77])!;
    expect(r.label).toBe('C7');
    expect(r.exact).toBe(false);
    expect(r.insertable).toBe(true);
  });

  it('2 notes strict : pas d’inclusion (C+G+D ne serait pas toléré en 2 notes)', () => {
    // 2 notes : C + G → C5 exact ; jamais un accord à 3 notes
    const r = recognizeChord([60, 67])!;
    expect(r.label).toBe('C5');
    expect(r.exact).toBe(true);
  });

  it('l’inclusion ne s’applique qu’à partir de 3 notes', () => {
    // 2 notes C + G : exact → C5 ; si l'inclusion était permise, C (triade)
    // serait candidat — vérifions qu'on reste sur l'exact.
    expect(recognizeChord([60, 67])!.label).toBe('C5');
    // 3 notes C G D : sus2 exact (pas un vague C avec inclusion)
    expect(recognizeChord([60, 67, 62])!.label).toBe('Csus2');
  });

  it('canal drums : le filtre est côté serveur, la fonction ne reçoit que des pitchs', () => {
    // La fonction est pure : rien à filtrer ici, test documentaire.
    expect(typeof recognizeChord).toBe('function');
  });
});
