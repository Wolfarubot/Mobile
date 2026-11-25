import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, EYE_COLORS, LOOK_BODIES, LOOK_HEADS, LOOK_PARTS, SKIN_TONES, headName, partLevel, readLook } from '../src/core/mainLook';
import { deserialize, newGame, serialize } from '../src/core/state';

describe('Your Hunter look', () => {
  it('has a head and body for each of Warrior, Mage and Archer 1-9, opening every 10 levels to Lv 80', () => {
    expect(LOOK_PARTS).toHaveLength(27);
    expect(['s1', 'm1', 'a1'].map((p) => partLevel(p as never))).toEqual([1, 1, 1]);
    expect(['s2', 'm5', 'a9'].map((p) => partLevel(p as never))).toEqual([10, 40, 80]);
  });

  it("leaves out level 2's heads (the same as level 1's): 8 heads per outfit, numbered 1-8, head 2 opening at Lv 20", () => {
    expect(LOOK_BODIES).toHaveLength(27);
    expect(LOOK_HEADS).toHaveLength(24);
    expect(LOOK_HEADS.filter((p) => p[0] === 's').map((p) => headName(p))).toEqual(['Warrior 1', 'Warrior 2', 'Warrior 3', 'Warrior 4', 'Warrior 5', 'Warrior 6', 'Warrior 7', 'Warrior 8']);
    expect(LOOK_HEADS.filter((p) => p[0] === 'a').map((p) => partLevel(p))).toEqual([1, 20, 30, 40, 50, 60, 70, 80]);
    expect(readLook({ head: 's2', body: 's2' })).toMatchObject({ head: 's1', body: 's2' });
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
