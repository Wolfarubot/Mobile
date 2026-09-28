import { describe, expect, it } from 'vitest';
import { HEROES, heroDps, tapBaseDamage } from '../src/core/balance';
import { Game } from '../src/core/game';
import { newGame } from '../src/core/state';

/**
 * A simple bot: taps 4x/sec, greedily buys the best damage-per-gold upgrade,
 * retries failed bosses after 30s of farming. Returns seconds to reach each milestone.
 */
export function simulate(milestones: number[], maxSec: number): Record<number, number> {
  const g = new Game(newGame(0), () => 0.5);
  const reached: Record<number, number> = {};
  const dt = 0.25;
  let farmTime = 0;
  for (let t = 0; t < maxSec; t += dt) {
    g.tap();
    g.tick(dt);
    if (g.canFightBoss) {
      farmTime += dt;
      if (farmTime > 30) {
        g.fightBoss();
        farmTime = 0;
      }
    }
    for (const m of milestones) if (!(m in reached) && g.state.maxStage >= m) reached[m] = t;
    if (milestones.every((m) => m in reached)) break;

    // Greedy shopping once per simulated second.
    if (t % 1 === 0) {
      for (let guard = 0; guard < 50; guard++) {
        let best: (() => boolean) | null = null;
        let bestRatio = 0;
        const tapGain = (tapBaseDamage(g.state.tapLevel + 1) - tapBaseDamage(g.state.tapLevel)) * g.shardMult * 4;
        const tp = g.tapPurchase(1);
        if (tp.cost <= g.state.gold) {
          best = () => g.buyTap();
          bestRatio = tapGain / tp.cost;
        }
        HEROES.forEach((h, i) => {
          if (!g.heroUnlocked(i)) return;
          const p = g.heroPurchase(i, 1);
          const gain = (heroDps(h, g.state.heroes[i] + 1) - heroDps(h, g.state.heroes[i])) * g.shardMult;
          if (p.cost <= g.state.gold && gain / p.cost > bestRatio) {
            bestRatio = gain / p.cost;
            best = () => g.buyHero(i);
          }
        });
        if (!best) break;
        g.state.buyAmount = 1;
        (best as () => boolean)();
      }
    }
  }
  return reached;
}

describe('progression pacing', () => {
  it('reaches key stages in a reasonable time with active tapping', () => {
    const r = simulate([2, 5, 10, 25, 50], 12 * 3600);
    if (process.env.SIM_VERBOSE) console.log(Object.entries(r).map(([s, t]) => `stage ${s}: ${(t / 60).toFixed(1)}m`).join('\n'));
    expect(r[5]).toBeLessThan(3 * 60);
    expect(r[10]).toBeLessThan(10 * 60);
    expect(r[50]).toBeLessThan(3 * 3600);
    expect(r[50]).toBeGreaterThan(30 * 60); // first ascension should take real effort
  });
});

// `SIM_SWEEP=1 npx vitest run tests/progression.test.ts` prints a pacing table for balancing.
it.runIf(!!process.env.SIM_SWEEP)('pacing sweep', () => {
  const ms = [10, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 100];
  const r = simulate(ms, 24 * 3600);
  console.log(ms.map((m) => `${m}: ${r[m] !== undefined ? (r[m] / 60).toFixed(1) + 'm' : '-'}`).join(' | '));
});
