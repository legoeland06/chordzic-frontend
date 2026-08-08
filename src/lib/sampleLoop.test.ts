/**
 * Tests unitaires de la boucle sample (mode Navig).
 *
 * Couvre le calcul de phase avec décalage POSITIF et NÉGATIF (le réglage
 * −200..+200 ms) et le bornage de l'offset. Ces fonctions pures vivent
 * dans src/lib/sampleLoop.ts.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  computeSamplePhase,
  clampSampleOffset,
  sampleBelongsToTempo,
  SAMPLE_OFFSET_MIN,
  SAMPLE_OFFSET_MAX,
} from './sampleLoop';

/** Comparaison flottante avec tolérance (les calculs modulo sont en f64). */
const approx = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// ─── computeSamplePhase ────────────────────────────────────────────────

test('offset 0 : phase = position du morceau (modulo durée)', () => {
  assert.ok(approx(computeSamplePhase(1.0, 0, 4.0), 1.0));
});

test('offset POSITIF : recule la phase (sample en avance → à recaler)', () => {
  assert.ok(approx(computeSamplePhase(1.0, 200, 4.0), 1.2));   // +200 ms
  assert.ok(approx(computeSamplePhase(0.5, 50, 4.0), 0.55));    // +50 ms
});

test('offset NÉGATIF : tire la phase en arrière (sample en retard)', () => {
  assert.ok(approx(computeSamplePhase(1.0, -200, 4.0), 0.8));   // −200 ms
  assert.ok(approx(computeSamplePhase(0.5, -50, 4.0), 0.45));   // −50 ms
});

test('offset négatif passant sous zéro : enroule via le double modulo', () => {
  // 0.05 s − 0.1 s = −0.05 → modulo 4 s → 3.95 s (fin du sample)
  assert.ok(approx(computeSamplePhase(0.05, -100, 4.0), 3.95));
  // Position 0 avec −1 s → 3.0 s
  assert.ok(approx(computeSamplePhase(0.0, -1000, 4.0), 3.0));
});

test('position au-delà de la durée : boucle proprement', () => {
  assert.ok(approx(computeSamplePhase(4.5, 0, 4.0), 0.5));
  assert.ok(approx(computeSamplePhase(8.2, -200, 4.0), 0.0));
});

test('résultat toujours dans [0, durée)', () => {
  for (const pos of [0, 0.001, 1.999, 3.999, 12.345]) {
    for (const off of [-200, -37, 0, 88, 200]) {
      const phase = computeSamplePhase(pos, off, 4.0);
      assert.ok(phase >= 0 && phase < 4.0, `phase ${phase} hors bornes (pos=${pos}, off=${off})`);
    }
  }
});

test('durée invalide (0 ou négative) : retourne 0', () => {
  assert.equal(computeSamplePhase(1.0, 100, 0), 0);
  assert.equal(computeSamplePhase(1.0, 100, -2), 0);
});

// ─── clampSampleOffset ─────────────────────────────────────────────────

test('clamp : borne dans [−200, +200]', () => {
  assert.equal(clampSampleOffset(0), 0);
  assert.equal(clampSampleOffset(200), 200);
  assert.equal(clampSampleOffset(-200), -200);
  assert.equal(clampSampleOffset(250), 200);
  assert.equal(clampSampleOffset(-250), -200);
  assert.equal(clampSampleOffset(42), 42);
});

test('clamp : valeurs non finies → 0', () => {
  assert.equal(clampSampleOffset(Number.NaN), 0);
  assert.equal(clampSampleOffset(Number.POSITIVE_INFINITY), 0);
});

test('bornes exportées cohérentes', () => {
  assert.equal(SAMPLE_OFFSET_MIN, -200);
  assert.equal(SAMPLE_OFFSET_MAX, 200);
});

// ─── sampleBelongsToTempo ──────────────────────────────────────────────

test('sample reconnu dans le bucket de SON tempo', () => {
  assert.ok(sampleBelongsToTempo('snap5_160.wav', 160, ['snap5', 'snap6']));
  assert.ok(sampleBelongsToTempo('snap6_160.wav', 160, ['snap5', 'snap6']));
});

test('sample d un AUTRE tempo rejeté (rebasculage nécessaire)', () => {
  // Le bug signalé : arrivé sur 175 BPM, cfg.sample valait encore snap5_160.wav
  assert.ok(!sampleBelongsToTempo('snap5_160.wav', 175, ['snap2', 'snap3', 'snap4']));
  assert.ok(!sampleBelongsToTempo('snap5_160.wav', 160, []));
});

test('nom de fichier construit à la main = clé + tempo (convention backend)', () => {
  assert.ok(sampleBelongsToTempo('snap2_175.wav', 175, ['snap2']));
});
