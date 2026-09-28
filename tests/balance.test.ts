import { describe, expect, it } from 'vitest';
import { bulkCost, isBossStage, maxAffordable, monsterGold, monsterHp, shardsForStage } from '../src/core/balance';

describe('balance', () => {
  it('bosses appear every 5 stages with 10x HP', () => {
    expect(isBossStage(5)).toBe(true);
    expect(isBossStage(6)).toBe(false);
    expect(monsterHp(5) / monsterHp(4)).toBeGreaterThan(10);
    expect(monsterGold(1)).toBeGreaterThanOrEqual(1);
  });

  it('monster HP always increases between regular stages', () => {
    for (let s = 1; s < 300; s++) {
      if (isBossStage(s) || isBossStage(s + 1)) continue;
      expect(monsterHp(s + 1)).toBeGreaterThan(monsterHp(s));
    }
  });

  it('maxAffordable matches bulkCost', () => {
    for (const gold of [10, 999, 12345, 1e9]) {
      const n = maxAffordable(50, 7, gold);
      expect(bulkCost(50, 7, n)).toBeLessThanOrEqual(gold);
      expect(bulkCost(50, 7, n + 1)).toBeGreaterThan(gold);
    }
  });

  it('shards require the minimum stage', () => {
    expect(shardsForStage(49)).toBe(0);
    expect(shardsForStage(50)).toBeGreaterThan(0);
    expect(shardsForStage(100)).toBeGreaterThan(shardsForStage(50));
  });
});
