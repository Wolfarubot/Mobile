import { describe, expect, it } from 'vitest';
import { fmt, fmtTime } from '../src/core/format';

describe('fmt', () => {
  it('formats small and large numbers', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(7.25)).toBe('7.3');
    expect(fmt(999)).toBe('999');
    expect(fmt(1234)).toBe('1.23K');
    expect(fmt(45_600_000)).toBe('45.6M');
    expect(fmt(1e36)).toBe('1.00e36');
  });
  it('rolls over when rounding reaches 1000', () => {
    expect(fmt(999_999)).toBe('1.00M');
  });
});

describe('fmtTime', () => {
  it('formats durations', () => {
    expect(fmtTime(9)).toBe('9s');
    expect(fmtTime(249)).toBe('4m 09s');
    expect(fmtTime(7500)).toBe('2h 05m');
  });
});
