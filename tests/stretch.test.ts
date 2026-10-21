import { describe, expect, it } from 'vitest';
import { pitchRate, stretchFactor, timeStretch } from '../src/ui/stretch';

const SR = 44100;
const tone = (hz: number, sec: number) => Float32Array.from({ length: Math.round(SR * sec) }, (_, i) => Math.sin((2 * Math.PI * hz * i) / SR) * 0.5);
/** Zero crossings per second: a stand-in for pitch. */
const crossingsPerSec = (x: Float32Array) => {
  let n = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 !== x[i] < 0) n++;
  return n / (x.length / SR);
};

describe('sound effect time stretch', () => {
  it('changes length but keeps pitch', () => {
    const src = tone(440, 0.5);
    for (const f of [0.6, 1.5, 2]) {
      const [out] = timeStretch([src], f, SR);
      expect(out.length).toBe(Math.round(src.length * f));
      // 440 Hz crosses zero 880 times a second; allow a little for the slice joins and the edges.
      expect(Math.abs(crossingsPerSec(out.subarray(2000, out.length - 2000)) - 880)).toBeLessThan(25);
      // The middle keeps its loudness (no gaps or doubled-up slices).
      const mid = out.subarray(Math.floor(out.length * 0.3), Math.floor(out.length * 0.7));
      const rms = Math.sqrt(mid.reduce((s, v) => s + v * v, 0) / mid.length);
      expect(rms).toBeGreaterThan(0.3);
      expect(rms).toBeLessThan(0.4);
    }
  });

  it('leaves a clip alone at factor 1 and keeps channels the same length', () => {
    const src = tone(220, 0.2);
    expect(timeStretch([src], 1, SR)[0]).toBe(src);
    const st = timeStretch([src, tone(330, 0.2)], 1.3, SR);
    expect(st[0].length).toBe(st[1].length);
  });

  it('pitch shift stretches by its rate so the final length is as asked', () => {
    expect(pitchRate(12)).toBeCloseTo(2);
    expect(pitchRate(-12)).toBeCloseTo(0.5);
    // Up 12 semitones at length 1: stretch to twice as long, then play twice as fast.
    expect(stretchFactor(12, 1)).toBeCloseTo(2);
    expect(stretchFactor(-12, 1.5) / pitchRate(-12)).toBeCloseTo(1.5);
  });
});
