/**
 * Changing a sound effect's length without changing its pitch (WSOLA: overlapping windowed slices of the sound,
 * re-spaced, each nudged to where it lines up best with the last so the joins don't click or flutter). Pitch is
 * shifted by playing faster or slower, which also changes the length, so a pitch shift stretches by its playback
 * rate first: the sound ends at the length asked for, at the pitch asked for.
 */

/** Playback rate for a pitch shift in semitones (+12 = an octave up, twice as fast). */
export const pitchRate = (semitones: number): number => 2 ** (semitones / 12);

/** How much to stretch a clip before playing it at `pitchRate(semitones)`, so it ends `length` times as long. */
export const stretchFactor = (semitones: number, length: number): number => length * pitchRate(semitones);

/**
 * Stretches each channel to `factor` times its length (factor 2 = twice as long, same pitch). Channels stay in
 * step: slices are placed by the first channel's waveform. Factor 1 returns the input.
 */
export function timeStretch(channels: Float32Array[], factor: number, sampleRate: number): Float32Array[] {
  if (Math.abs(factor - 1) < 1e-3 || !channels.length) return channels;
  const len = channels[0].length;
  const outLen = Math.max(1, Math.round(len * factor));
  // ~30 ms slices, half-overlapping on output; up to ~8 ms of nudge to line up each join.
  const N = 2 * Math.round((sampleRate * 0.03) / 2);
  const hop = N / 2;
  const tol = Math.round(sampleRate * 0.008);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const at = (ch: Float32Array, i: number) => (i >= 0 && i < len ? ch[i] : 0);
  const guide = channels[0];
  const out = channels.map(() => new Float32Array(outLen + N));
  const norm = new Float32Array(outLen + N);
  let prev = 0;
  for (let k = 0; k * hop < outLen; k++) {
    const target = Math.round((k * hop) / factor);
    let pos = target;
    if (k > 0) {
      // The slice that would naturally follow the last one; find the nearby start that matches it best.
      const natural = prev + hop;
      let best = -Infinity;
      for (let d = -tol; d <= tol; d += 2) {
        const p = target + d;
        let corr = 0;
        for (let i = 0; i < hop; i += 2) corr += at(guide, p + i) * at(guide, natural + i);
        if (corr > best) {
          best = corr;
          pos = p;
        }
      }
    }
    const o = k * hop;
    for (let c = 0; c < channels.length; c++) {
      const src = channels[c];
      const dst = out[c];
      for (let i = 0; i < N; i++) dst[o + i] += win[i] * at(src, pos + i);
    }
    for (let i = 0; i < N; i++) norm[o + i] += win[i];
    prev = pos;
  }
  return out.map((ch) => {
    const r = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) r[i] = norm[i] > 1e-3 ? ch[i] / norm[i] : ch[i];
    return r;
  });
}
