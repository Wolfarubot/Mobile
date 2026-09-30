import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AREAS, areaEnemies, ENEMIES, GEAR, gearDef, gearStats, slotAccepts, typeMult, type GearId, enemyUnlockCost, HUNTERS, ITEMS, STATION_EFFICIENCY, type AreaId, type ItemId } from '../src/core/balance';
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

/** Rough value of a piece of gear for the bot. Weapons count for more when their damage type suits the area. */
function gearScore(game: Game, base: GearId, level = 1): number {
  const gd = gearDef(base);
  const st = gearStats(gd, level);
  const raw = (st.damage ?? 0) + (st.rate ?? 0) + (st.range ?? 0) / 100 + (st.crit ?? 0) * 3 + (st.stun ?? 0) + (st.gold ?? 0) * 0.3 + (st.drops ?? 0) * 0.2 + (st.radius ?? 0) * 0.5 + (st.guard ?? 0) * 0.2 + (st.pierce ?? 0) * 0.3;
  if (!gd.damageType) return raw;
  const here = areaEnemies(game.area);
  const fit = here.reduce((sum, e) => sum + typeMult(gd.damageType!, e.id), 0) / here.length;
  return (1 + raw) * fit - 1;
}

/** Fill every slot with the best gear it can craft, then upgrade what's worn. */
function botGear(game: Game): void {
  const wearers: Wearer[] = ['main', ...HUNTERS.filter((h) => game.state.hunters[h.id].recruited).map((h) => h.id)];
  for (const who of wearers) {
    game.slotsOf(who).forEach((slot, i) => {
      const current = game.equipped(who)[i];
      const best = GEAR.filter((gd) => slotAccepts(slot, gd.kind) && game.canCraftGear(gd.id)).sort((a, b) => gearScore(game, b.id) - gearScore(game, a.id))[0];
      if (best && (!current || gearScore(game, best.id) > gearScore(game, current.base, current.stars))) {
        const item = game.craftGear(best.id)!;
        game.equip(who, i, item.uid);
        if (current) game.salvageGear(current.uid);
      }
    });
  }
  for (const who of wearers) for (const it of game.equipped(who)) if (it) game.upgradeGear(it.uid);
}

/** Spend skill points down the tree: root, then Attack Speed and Power in turn (some Recovery), then the rest. */
function botSkills(game: Game): void {
  const wearers: Wearer[] = ['main', ...HUNTERS.filter((h) => game.state.hunters[h.id].recruited).map((h) => h.id)];
  for (const who of wearers) {
    for (let guard = 0; guard < 100 && game.skillPoints(who) > 0; guard++) {
      const lv = (k: string) => game.skill(who, k);
      const order = ['root', lv('speed') <= lv('power') ? 'speed' : 'power', lv('recovery') * 3 < lv('power') ? 'recovery' : 'power', 'speed', 'power2', 'speed2', 'capstone', 'recovery2', 'recovery'];
      const pick = order.find((k) => game.canLearn(who, k));
      if (pick) {
        if (!game.learn(who, pick)) break;
        continue;
      }
      // Past the core: the rest of the first tree in order, then Ascend, then the ascended tree.
      const next = (['base', 'ascended'] as const).flatMap((w) => game.skillTree(who, w).map((n) => [w, n.id] as const)).find(([w, id]) => game.canLearn(who, id, w));
      if (!next || !game.learn(who, next[1], next[0])) break;
    }
  }
}

/** Empower unlocked monsters while it's cheap, and evolve them: root, then gold, then materials. */
function botMonsters(game: Game): void {
  for (const e of ENEMIES) {
    if (!game.isUnlocked(e.id)) continue;
    for (let guard = 0; guard < 50 && game.empowerPurchase(e.id, 1).cost < game.state.gold * 0.01; guard++) game.empower(e.id, 1);
    for (let guard = 0; guard < 50 && game.evoPoints(e.id) > 0; guard++) {
      const pick = ['root', 'wealth2', 'wealth', 'harvest', 'harvest2', 'capstone', 'horde'].find((n) => game.canEvolve(e.id, n));
      if (!pick || !game.evolve(e.id, pick)) break;
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
  botMonsters(game);
  // Area Upgrades (e.g. the Forest Idol) only pay off where you farm, so the bot leaves them.
  for (const it of ITEMS) if (!it.area) while (game.craft(it.id as ItemId));
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
  it('a typical player opens the Faerie Glade in their first session, then new areas every day or few', () => {
    const { unlockedAt: r } = simulatePlayer(14);
    // SIM_OUT=file.json writes when each area unlocked, in hours.
    if (process.env.SIM_OUT) writeFileSync(process.env.SIM_OUT, JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, +(v! / 3600).toFixed(1)]))));
    expect(r.glade).toBeLessThan(40 * 60); // first session
    expect(r.graveyard).toBeGreaterThan(4 * H);
    expect(r.graveyard).toBeLessThan(36 * H);
    expect(r.caves).toBeGreaterThan(24 * H);
    expect(r.caves).toBeLessThan(3 * 24 * H);
    expect(r.peaks).toBeGreaterThan(3 * 24 * H);
    expect(r.peaks).toBeLessThan(8 * 24 * H);
    expect(r.cliffs).toBeGreaterThan(6 * 24 * H);
    // The Void Rift is the long-term goal: weeks away.
    expect(r.rift ?? Infinity).toBeGreaterThan(10 * 24 * H);
  }, 1_500_000);
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
