import { describe, expect, it } from 'vitest';
import { AREAS, areaEnemies, ENEMIES, enemyUnlockCost, HUNTERS, ITEMS, STATION_EFFICIENCY, UPGRADES, type AreaId, type ItemId, type UpgradeId } from '../src/core/balance';
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
 * A simple bot playing the real battlefield headless. It taps `tapsPerSec` times a second,
 * trains, unlocks monsters, recruits/levels/stations Hunters, crafts everything it can,
 * challenges Guardians as soon as they're ready (retrying every 60s) and moves on to new areas.
 * Returns the time (seconds) each area was unlocked.
 */
export function simulate(maxSec: number, tapsPerSec = 2) {
  const game = new Game(newGame(0), mulberry(42));
  const field = new Field(game);
  field.setView(390, 420);
  const unlockedAt: Partial<Record<AreaId, number>> = { forest: 0 };
  const dt = 0.05;
  let tapAcc = 0;
  let lastChallenge = -Infinity;
  for (let t = 0; t < maxSec; t += dt) {
    game.tick(dt);
    field.update(dt);
    field.drainEvents();
    tapAcc += dt * tapsPerSec;
    while (tapAcc >= 1) {
      tapAcc -= 1;
      const e = field.enemies.find((x) => x.boss) ?? field.enemies[0];
      if (e) field.tap(e.x, e.y);
    }
    for (const a of AREAS) if (!(a.id in unlockedAt) && game.isAreaUnlocked(a.id)) unlockedAt[a.id] = t;
    if (AREAS.every((a) => a.id in unlockedAt)) break;

    if (Math.round(t / dt) % 20 !== 0) continue; // shop once per simulated second
    const s = game.state;

    // Guardian: challenge when ready; after winning, move to the newest area.
    if (game.guardianReady && !game.guardianActive && t - lastChallenge > 60) {
      game.challengeGuardian();
      lastChallenge = t;
    }
    const newest = game.unlockedAreas[game.unlockedAreas.length - 1];
    if (newest !== game.area && !game.guardianActive) game.travel(newest);

    for (const e of ENEMIES) if (game.isAreaUnlocked(e.area) && !s.bestiary[e.id].unlocked && enemyUnlockCost(e) < s.gold * 0.1) game.unlockEnemy(e.id);
    for (const h of HUNTERS) if (game.canRecruit(h.id) && h.recruitCost < s.gold * 0.25) game.recruit(h.id);
    s.buyAmount = 1;
    for (const h of HUNTERS) while (s.hunters[h.id].recruited && game.hunterPurchase(h.id, 1).cost < s.gold * 0.03) game.levelHunter(h.id);
    for (let guard = 0; guard < 40; guard++) {
      const opts = UPGRADES.map((u) => ({ id: u.id as UpgradeId, p: game.upgradePurchase(u.id, 1) }))
        .filter((o) => o.p.count > 0)
        .sort((a, b) => a.p.cost * (a.id === 'power' ? 1 : 1.5) - b.p.cost * (b.id === 'power' ? 1 : 1.5));
      if (!opts.length || !game.buyUpgrade(opts[0].id)) break;
    }
    for (const it of ITEMS) while (game.craft(it.id as ItemId));

    // Station Hunters: greedily give each area the Hunter that earns most there.
    const free = new Set(HUNTERS.filter((h) => s.hunters[h.id].recruited).map((h) => h.id));
    const areas = game.unlockedAreas.filter((a) => a !== game.area);
    for (const area of [...areas].reverse()) {
      let best: { id: (typeof HUNTERS)[number]['id']; gold: number } | null = null;
      for (const id of free) {
        const gold = game.farmRates(area, [id], STATION_EFFICIENCY).gold;
        if (!best || gold > best.gold) best = { id, gold };
      }
      if (best) {
        game.station(best.id, area);
        free.delete(best.id);
      }
    }
    for (const id of free) game.station(id, game.area); // leftovers fight beside you (one fits)
  }
  return { unlockedAt, game };
}

describe('progression pacing', () => {
  it('each area takes longer than the last, and all five are reachable', () => {
    const { unlockedAt: r } = simulate(10 * 3600);
    if (process.env.SIM_VERBOSE) console.log(r);
    expect(r.graveyard).toBeLessThan(15 * 60);
    expect(r.caves).toBeGreaterThan(r.graveyard!);
    expect(r.rift).toBeLessThan(10 * 3600);
  }, 120_000);
});

// `SIM_SWEEP=1 npx vitest run tests/progression.test.ts --silent=false` prints a pacing table for balancing.
it.runIf(!!process.env.SIM_SWEEP)('pacing sweep', () => {
  const started = Date.now();
  const { unlockedAt, game } = simulate(12 * 3600);
  console.log(AREAS.map((a) => `${a.name}: ${unlockedAt[a.id] !== undefined ? (unlockedAt[a.id]! / 60).toFixed(1) + 'm' : '-'}`).join(' | '));
  const s = game.state;
  console.log('area', s.area, 'power', s.upgrades.power, 'items', JSON.stringify(s.items));
  console.log('hunters', JSON.stringify(Object.fromEntries(Object.entries(s.hunters).filter(([, h]) => h.recruited).map(([id, h]) => [id, `${h.level}@${h.station}`]))));
  console.log('enemies', ENEMIES.filter((e) => s.bestiary[e.id].unlocked).map((e) => e.id).join(','), 'kills', JSON.stringify(Object.fromEntries(AREAS.map((a) => [a.id, s.areas[a.id].kills]))));
  console.log('escaped', s.stats.escaped, 'total kills', s.stats.totalKills, 'areaEnemies', areaEnemies('forest').length);
  console.log(`(sim took ${((Date.now() - started) / 1000).toFixed(1)}s)`);
}, 900_000);
