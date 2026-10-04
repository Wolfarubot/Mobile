import { describe, expect, it } from 'vitest';
import { fmt, fmtDps, fmtTime } from '../src/core/format';

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

describe('fmtDps', () => {
  it('shows at most five digits, abbreviated', () => {
    expect(fmtDps(5.5)).toBe('5.50');
    expect(fmtDps(523.4)).toBe('523');
    expect(fmtDps(1_524_300)).toBe('1.5243M');
    expect(fmtDps(15_243_000_000)).toBe('15.243B');
    expect(fmtDps(152_430_000_000_000)).toBe('152.43T');
    expect(fmtDps(999_999_990)).toBe('1.0000B');
  });
});

describe('fmtTime', () => {
  it('formats durations', () => {
    expect(fmtTime(9)).toBe('9s');
    expect(fmtTime(249)).toBe('4m 09s');
    expect(fmtTime(7500)).toBe('2h 05m');
  });
});
