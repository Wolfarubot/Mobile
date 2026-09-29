import { describe, expect, it } from 'vitest';
import { AREAS, ENEMIES, GEAR, gearDef, gearStats, type GearId, enemyUnlockCost, HUNTERS, ITEMS, STATION_EFFICIENCY, type AreaId, type ItemId, type SkillId } from '../src/core/balance';
import { Field } from '../src/core/field';
import { Game } from '../src/core/game';
import { newGame, type Wearer } from '../src/core/state';

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

/** Rough value of a piece of gear for the bot. */
function gearScore(base: GearId, level = 1): number {
  const st = gearStats(gearDef(base), level);
  return (st.damage ?? 0) + (st.rate ?? 0) + (st.range ?? 0) / 100 + (st.crit ?? 0) * 3 + (st.stun ?? 0) + (st.gold ?? 0) * 0.3 + (st.drops ?? 0) * 0.2 + (st.radius ?? 0) * 0.5 + (st.guard ?? 0) * 0.2 + (st.pierce ?? 0) * 0.3;
}

/** Fill every slot with the best gear it can craft, then upgrade what's worn. */
function botGear(game: Game): void {
  const wearers: Wearer[] = ['main', ...HUNTERS.filter((h) => game.state.hunters[h.id].recruited).map((h) => h.id)];
  for (const who of wearers) {
    game.slotsOf(who).forEach((slot, i) => {
      const current = game.equipped(who)[i];
      const best = GEAR.filter((gd) => gd.kind === slot.kind && game.canCraftGear(gd.id)).sort((a, b) => gearScore(b.id) - gearScore(a.id))[0];
      if (best && (!current || gearScore(best.id) > gearScore(current.base, current.level))) {
        const item = game.craftGear(best.id)!;
        game.equip(who, i, item.uid);
        if (current) game.salvageGear(current.uid);
      }
    });
  }
  for (const who of wearers) for (const it of game.equipped(who)) if (it) game.upgradeGear(it.uid);
}

/** Spend skill points: alternate Attack Speed and Attack Power, with some Recovery. */
function botSkills(game: Game): void {
  const wearers: Wearer[] = ['main', ...HUNTERS.filter((h) => game.state.hunters[h.id].recruited).map((h) => h.id)];
  for (const who of wearers) {
    while (game.skillPoints(who) > 0) {
      const lv = (k: SkillId) => game.skill(who, k);
      const pick: SkillId =
        lv('recovery') * 3 < lv('power') && game.canLearn(who, 'recovery') ? 'recovery' : lv('speed') <= lv('power') && game.canLearn(who, 'speed') ? 'speed' : 'power';
      if (!game.learn(who, pick)) break;
    }
  }
}

/** The bot's decisions, run once per simulated second while it's playing (and on each return from offline). */
function botShop(game: Game, t: number, memo: { lastChallenge: number }): void {
  const s = game.state;
  // Guardian: challenge when ready (retry every 60s); after winning, move to the newest area.
  if (game.guardianReady && !game.eventRunning && t - memo.lastChallenge > 60) {
    game.challengeGuardian();
    memo.lastChallenge = t;
  }
  // Run the events that make the next Hunters available (back in older areas if need be).
  for (const h of HUNTERS) {
    if (s.hunters[h.id].recruited || game.hunterAvailable(h.id)) continue;
    if (!game.eventRunning && game.eventReady(h.unlock.event) && t - memo.lastChallenge > 60) {
      game.startEvent(h.unlock.event);
      memo.lastChallenge = t;
    }
    break;
  }
  const newest = game.unlockedAreas[game.unlockedAreas.length - 1];
  if (newest !== game.area && !game.eventRunning) game.travel(newest);

  for (const e of ENEMIES) if (game.isAreaUnlocked(e.area) && !s.bestiary[e.id].unlocked && enemyUnlockCost(e) < s.gold * 0.1) game.unlockEnemy(e.id);
  for (const h of HUNTERS) if (game.canRecruit(h.id) && h.recruitCost < s.gold * 0.25) game.recruit(h.id);
  s.buyAmount = 1;
  for (const h of HUNTERS) while (s.hunters[h.id].recruited && game.trainPurchase(h.id, 1).cost < s.gold * 0.03) game.train(h.id);
  for (let guard = 0; guard < 400 && game.train('main'); guard++);
  botSkills(game);
  for (const it of ITEMS) while (game.craft(it.id as ItemId));
  botGear(game);

  // Station Hunters: greedily give each other area the Hunter that earns most there.
  const free = new Set(HUNTERS.filter((h) => s.hunters[h.id].recruited).map((h) => h.id));
  for (const area of game.unlockedAreas.filter((a) => a !== game.area).reverse()) {
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

/**
 * A bot playing the real battlefield headless for `seconds`, tapping `tapsPerSec` and shopping
 * once a second. Records when areas unlock (at clock time `clock + elapsed`).
 */
function play(game: Game, field: Field, seconds: number, clock: number, tapsPerSec: number, memo: { lastChallenge: number }, unlockedAt: Partial<Record<AreaId, number>>): void {
  const dt = 0.05;
  let tapAcc = 0;
  for (let t = 0; t < seconds; t += dt) {
    game.tick(dt);
    field.update(dt);
    field.drainEvents();
    tapAcc += dt * tapsPerSec;
    while (tapAcc >= 1) {
      tapAcc -= 1;
      const e = field.enemies.find((x) => x.boss) ?? field.enemies[0];
      if (e) field.tap(e.x, e.y);
    }
    for (const a of AREAS) if (!(a.id in unlockedAt) && game.isAreaUnlocked(a.id)) unlockedAt[a.id] = clock + t;
    if (Math.round(t / dt) % 20 === 0) botShop(game, clock + t, memo);
  }
}

function newBot() {
  const game = new Game(newGame(0), mulberry(42));
  const field = new Field(game);
  field.setView(390, 420);
  return { game, field, memo: { lastChallenge: -Infinity }, unlockedAt: { forest: 0 } as Partial<Record<AreaId, number>> };
}

/** Nonstop optimal play (no offline time). Returns when each area unlocked, in seconds. */
export function simulate(maxSec: number, tapsPerSec = 2) {
  const bot = newBot();
  for (let t = 0; t < maxSec && !AREAS.every((a) => a.id in bot.unlockedAt); t += 600) play(bot.game, bot.field, 600, t, tapsPerSec, bot.memo, bot.unlockedAt);
  return { unlockedAt: bot.unlockedAt, game: bot.game };
}

const H = 3600;
/**
 * A typical player: a 40-minute first session in the evening (18:00), then check-ins every day
 * at 08:00 (15 min), 13:00 (10 min) and 18:00 (20 min), tapping about once a second.
 * Offline progress (capped at 8h) is applied between sessions. Times are in seconds since the first launch.
 */
export function simulatePlayer(days: number) {
  const bot = newBot();
  const sessions: Array<[number, number]> = [[0, 40 * 60]];
  for (let d = 0; d < days; d++) sessions.push([d * 24 * H + 14 * H, 15 * 60], [d * 24 * H + 19 * H, 10 * 60], [d * 24 * H + 24 * H, 20 * 60]);
  let activeSec = 0;
  const activeAt: Partial<Record<AreaId, number>> = {};
  for (const [start, length] of sessions) {
    if (AREAS.every((a) => a.id in bot.unlockedAt)) break;
    // Coming back: collect offline gains, then shop before playing.
    bot.game.applyOffline(start * 1000);
    botShop(bot.game, start, bot.memo);
    const before = new Set(Object.keys(bot.unlockedAt));
    play(bot.game, bot.field, length, start, 1, bot.memo, bot.unlockedAt);
    for (const a of AREAS) if (a.id in bot.unlockedAt && !before.has(a.id)) activeAt[a.id] = activeSec + (bot.unlockedAt[a.id]! - start);
    activeSec += length;
    bot.game.state.lastSeen = (start + length) * 1000;
  }
  return { unlockedAt: bot.unlockedAt, activeAt, game: bot.game };
}

describe('progression pacing', () => {
  it('a typical player unlocks the Graveyard in their first session, then each area takes days', () => {
    const { unlockedAt: r } = simulatePlayer(14);
    if (process.env.SIM_VERBOSE) console.log(r);
    expect(r.graveyard).toBeLessThan(40 * 60); // first session
    expect(r.caves).toBeGreaterThan(12 * H);
    expect(r.caves).toBeLessThan(2 * 24 * H);
    expect(r.peaks).toBeGreaterThan(2 * 24 * H);
    expect(r.peaks).toBeLessThan(5 * 24 * H);
    expect(r.rift).toBeGreaterThan(5 * 24 * H);
  }, 300_000);
});

const fmtT = (sec: number | undefined) =>
  sec === undefined ? '-' : sec < 3 * H ? `${(sec / 60).toFixed(0)}m` : sec < 48 * H ? `${(sec / H).toFixed(1)}h` : `${(sec / 86400).toFixed(1)}d`;

// `SIM_SWEEP=1 npx vitest run tests/progression.test.ts --silent=false` prints pacing tables for balancing.
it.runIf(!!process.env.SIM_SWEEP)('pacing sweep', () => {
  const started = Date.now();
  const player = simulatePlayer(21);
  console.log('Typical player (since first launch):', AREAS.map((a) => `${a.name}: ${fmtT(player.unlockedAt[a.id])}`).join(' | '));
  console.log('  ...of which actively playing:     ', AREAS.map((a) => `${a.name}: ${fmtT(player.activeAt[a.id])}`).join(' | '));
  const s = player.game.state;
  console.log('  end state: area', s.area, 'main', JSON.stringify(s.main), 'items', JSON.stringify(s.items));
  console.log('  hunters', JSON.stringify(Object.fromEntries(Object.entries(s.hunters).filter(([, h]) => h.recruited).map(([id, h]) => [id, `${h.trains}@${h.station}`]))));
  const nonstop = simulate(12 * H);
  console.log('Nonstop optimal play:', AREAS.map((a) => `${a.name}: ${fmtT(nonstop.unlockedAt[a.id])}`).join(' | '));
  console.log(`(sim took ${((Date.now() - started) / 1000).toFixed(1)}s)`);
}, 900_000);
