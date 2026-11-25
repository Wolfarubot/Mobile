import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, EYE_COLORS, LOOK_PARTS, SKIN_TONES, partLevel, readLook } from '../src/core/mainLook';
import { deserialize, newGame, serialize } from '../src/core/state';

describe('Your Hunter look', () => {
  it('has a head and body for each of Warrior, Mage and Archer 1-9, opening every 10 levels to Lv 80', () => {
    expect(LOOK_PARTS).toHaveLength(27);
    expect(['s1', 'm1', 'a1'].map((p) => partLevel(p as never))).toEqual([1, 1, 1]);
    expect(['s2', 'm5', 'a9'].map((p) => partLevel(p as never))).toEqual([10, 40, 80]);
  });

  it('offers eight skin tones (light to dark) and ten eye colours', () => {
    expect(SKIN_TONES.map((t) => t.id)).toEqual(['pale', 'fair', 'rose', 'golden', 'tan', 'bronze', 'brown', 'deep']);
    expect(SKIN_TONES.every((t) => t.ramp.length === 5)).toBe(true);
    expect(EYE_COLORS).toHaveLength(10);
  });

  it('saves the look, and anything unknown in a save falls back to the default', () => {
    const s = newGame(0);
    s.settings.look = { head: 'a9', body: 'm3', skin: 'deep', eyes: 'violet' };
    expect(deserialize(serialize(s))!.settings.look).toEqual({ head: 'a9', body: 'm3', skin: 'deep', eyes: 'violet' });
    expect(readLook({ head: 'x4', body: 's10', skin: 'blue', eyes: 7 })).toEqual(DEFAULT_LOOK);
    expect(readLook(undefined)).toEqual(DEFAULT_LOOK);
  });
});
