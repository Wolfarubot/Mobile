import { describe, expect, it } from 'vitest';
import { ENEMIES, ITEMS, UPGRADES, type ItemId, type UpgradeId } from '../src/core/balance';
import { Field } from '../src/core/field';
import { Game } from '../src/core/game';
import { newGame } from '../src/core/state';

/** Small deterministic PRNG so pacing results are reproducible. */
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A simple bot playing the real battlefield headless: taps the nearest enemy
 * `tapsPerSec` times a second, buys the cheapest useful gold upgrade, crafts
 * whatever it can, unlocks new enemies, and pushes forward again 30s after a retreat.
 */
export function simulate(milestones: number[], maxSec: number, tapsPerSec = 2) {
  const game = new Game(newGame(0), mulberry(42));
  const field = new Field(game);
  field.setView(390, 420);
  const reached: Record<number, number> = {};
  const dt = 0.05;
  let tapAcc = 0;
  let sinceRetreat = 0;
  for (let t = 0; t < maxSec; t += dt) {
    game.tick(dt);
    field.update(dt);
    field.drainEvents();
    tapAcc += dt * tapsPerSec;
    while (tapAcc >= 1) {
      tapAcc -= 1;
      const e = field.enemies[0];
      if (e) field.tap(e.x, e.y);
    }
    if (!game.state.autoAdvance) {
      sinceRetreat += dt;
      if (sinceRetreat > 30) {
        game.setStage(game.state.maxStage);
        sinceRetreat = 0;
      }
    }
    for (const m of milestones) if (!(m in reached) && game.state.maxStage >= m) reached[m] = t;
    if (milestones.every((m) => m in reached)) break;

    if (Math.round(t / dt) % 20 === 0) {
      game.state.buyAmount = 1;
      for (let guard = 0; guard < 40; guard++) {
        const opts = UPGRADES.map((u) => ({ id: u.id as UpgradeId, p: game.upgradePurchase(u.id, 1) }))
          .filter((o) => o.p.count > 0)
          // Weight damage higher; the others are capped anyway.
          .sort((a, b) => a.p.cost * (a.id === 'power' ? 1 : 1.5) - b.p.cost * (b.id === 'power' ? 1 : 1.5));
        if (!opts.length || !game.buyUpgrade(opts[0].id)) break;
      }
      for (const it of ITEMS) while (game.craft(it.id as ItemId));
      // Unlock new enemies once they cost under a tenth of our gold (so training isn't starved).
      for (const e of ENEMIES) if (!game.isUnlocked(e.id) && e.unlockCost < game.state.gold * 0.1) game.unlockEnemy(e.id);
    }
  }
  return { reached, game };
}

describe('progression pacing', () => {
  it('early stages fly by, then a wall makes the first Ascension take real effort', () => {
    const { reached: r } = simulate([10, 30, 50], 4 * 3600);
    if (process.env.SIM_VERBOSE) console.log(r);
    expect(r[10]).toBeLessThan(5 * 60);
    expect(r[30]).toBeLessThan(20 * 60);
    expect(r[50]).toBeGreaterThan(45 * 60);
    expect(r[50]).toBeLessThan(4 * 3600);
  }, 60_000);
});

// `SIM_SWEEP=1 npx vitest run tests/progression.test.ts --silent=false` prints a pacing table for balancing.
it.runIf(!!process.env.SIM_SWEEP)('pacing sweep', () => {
  const ms = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60];
  const started = Date.now();
  const { reached: r, game } = simulate(ms, 6 * 3600);
  console.log(ms.map((m) => `${m}: ${r[m] !== undefined ? (r[m] / 60).toFixed(1) + 'm' : '-'}`).join(' | '));
  console.log('upgrades', game.state.upgrades, 'items', game.state.items, 'mats', game.state.materials, 'escaped', game.state.stats.escaped, 'kills', game.state.stats.totalKills, 'unlocked', game.unlockedEnemies);
  console.log(`(sim took ${((Date.now() - started) / 1000).toFixed(1)}s)`);
}, 600_000);
