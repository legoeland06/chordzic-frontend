/**
 * peaks — calcul décimé des peaks min/max d'un AudioBuffer (rendu waveform).
 *
 * Les peaks sont calculés UNE FOIS par buffer (coût unique au chargement),
 * puis le canvas ne dessine que les buckets visibles selon le zoom.
 */

export interface PeakData {
  min: Float32Array;
  max: Float32Array;
  buckets: number;
  /** Buckets par seconde (résolution de décimation). */
  bucketsPerSec: number;
  duration: number;
}

export function computePeaks(buffer: AudioBuffer, bucketsPerSec = 60): PeakData {
  const duration = buffer.duration;
  const buckets = Math.max(64, Math.ceil(duration * bucketsPerSec));
  const min = new Float32Array(buckets);
  const max = new Float32Array(buckets);
  for (let i = 0; i < buckets; i++) { min[i] = 1; max[i] = -1; }

  const chCount = Math.max(1, buffer.numberOfChannels);
  const chData: Float32Array[] = [];
  for (let c = 0; c < chCount; c++) chData.push(buffer.getChannelData(c));

  const per = Math.max(1, Math.floor(buffer.length / buckets));
  for (let b = 0; b < buckets; b++) {
    const start = b * per;
    const end = Math.min(buffer.length, start + per);
    let mn = 1, mx = -1;
    for (let i = start; i < end; i++) {
      for (let c = 0; c < chCount; c++) {
        const v = chData[c][i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    min[b] = mn;
    max[b] = mx;
  }
  return { min, max, buckets, bucketsPerSec, duration };
}
