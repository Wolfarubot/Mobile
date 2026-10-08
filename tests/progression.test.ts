import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { weaponHit, gearArea, EVENTS, AREAS, areaEnemies, ENEMIES, GEAR, gearDef, gearStats, slotAccepts, typeMult, type GearId, enemyUnlockCost, HUNTERS, ITEMS, STATION_EFFICIENCY, type AreaId, type ItemId } from '../src/core/balance';
import { Field } from '../src/core/field';
import { Game } from '../src/core/game';
import { deserialize, newGame, serialize, type Wearer } from '../src/core/state';

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
  // A weapon's base damage multiplies everything, so it counts in full (a bare hit is 1).
  const raw = (gd.weaponClass ? weaponHit(gd, level) - 1 : 0) + (st.damage ?? 0) + (st.rate ?? 0) + (st.range ?? 0) / 100 + (st.crit ?? 0) * 3 + (st.stun ?? 0) + (st.gold ?? 0) * 0.3 + (st.drops ?? 0) * 0.2 + (st.radius ?? 0) * 0.5 + (st.guard ?? 0) * 0.2 + (st.pierce ?? 0) * 0.3;
  if (!gd.damageType) return raw;
  const here = areaEnemies(game.area);
  const fit = here.reduce((sum, e) => sum + typeMult(gd.damageType!, e.id), 0) / here.length;
  return (1 + raw) * fit - 1;
}

/** How well a damage type suits the current area's monsters (their average weakness/resistance to it). */
function typeFit(game: Game, base: GearId): number {
  const gd = gearDef(base);
  if (!gd.damageType) return 1;
  const here = areaEnemies(game.area);
  return here.reduce((sum, e) => sum + typeMult(gd.damageType!, e.id), 0) / here.length;
}

/**
 * A weapon's worth to this Hunter in this slot: the game's own damage per second with it equipped (so slow,
 * heavy hammers don't win on damage per hit alone, and bows get the Hunter's multishot), times how well its
 * type suits the area. Tried by slipping a 1★ copy into the slot for a moment.
 */
function weaponWorth(game: Game, who: Wearer, slot: number, base: GearId, stars = 1, uid?: number): number {
  const s = game.state;
  const eq = (s.equipment[who] ??= []);
  const prev = eq[slot] ?? null;
  const temp = uid === undefined;
  const id = temp ? -999 : uid;
  if (temp) s.inventory.push({ uid: id, base, stars });
  eq[slot] = id;
  const dps = game.dpsOf(who as never);
  eq[slot] = prev;
  if (temp) s.inventory.pop();
  return dps * typeFit(game, base);
}

/** How much better a new piece from the same area must be before the bot crafts it to replace what's worn. */
const SWAP_MARGIN = 1.3;

/** Fill every slot with the best gear it can craft, then upgrade what's worn. Weapons are judged by damage per second. */
function botGear(game: Game): void {
  const wearers: Wearer[] = ['main', ...HUNTERS.filter((h) => game.state.hunters[h.id].recruited).map((h) => h.id)];
  for (const who of wearers) {
    game.slotsOf(who).forEach((slot, i) => {
      const current = game.equipped(who)[i];
      const options = GEAR.filter((gd) => slotAccepts(slot, gd) && game.canCraftGear(gd.id));
      if (!options.length) return;
      const weapons = options.some((gd) => gd.weaponClass) && (!current || gearDef(current.base).weaponClass);
      const worth = (base: GearId, stars = 1, uid?: number) => (weapons && gearDef(base).weaponClass ? weaponWorth(game, who, i, base, stars, uid) : gearScore(game, base, stars));
      const best = options.map((gd) => ({ gd, v: worth(gd.id) })).sort((a, b) => b.v - a.v)[0];
      // Gear from a newer area always replaces older gear; between pieces of the same area, swap only for a
      // real step up, as every new piece has to be upgraded again (materials and gold).
      const margin = current && gearArea(best.gd) <= gearArea(gearDef(current.base)) ? SWAP_MARGIN : 1;
      if (best && (!current || best.v > margin * worth(current.base, current.stars, current.uid))) {
        const item = game.craftGear(best.gd.id)!;
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
function botShop(game: Game, t: number, memo: { lastChallenge: number; lastHeavy?: number }): void {
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
  // Crafting gear and re-stationing Hunters are slow to work out, and a player does them now and then:
  // once a minute while playing (and on every return).
  if (memo.lastHeavy !== undefined && t - memo.lastHeavy < 60 && t >= memo.lastHeavy) return;
  memo.lastHeavy = t;
  botGear(game);

  // Station Hunters where each earns the most gold (up to 3 per area, your own area included): strong
  // Hunters end up beside you in the newest area, which pays the most when they can handle it, and
  // the rest farm older areas they can still clear.
  const free = HUNTERS.filter((h) => s.hunters[h.id].recruited).map((h) => h.id);
  for (const id of free) game.station(id, null);
  const pairs = free.flatMap((id) => game.unlockedAreas.map((area) => ({ id, area, gold: game.farmRates(area, [id], area === game.area ? 1 : STATION_EFFICIENCY).gold })));
  pairs.sort((x, y) => y.gold - x.gold);
  const placed = new Set<string>();
  for (const { id, area } of pairs) if (!placed.has(id) && game.station(id, area)) placed.add(id);
}

/**
 * A bot playing the real battlefield headless for `seconds`, tapping `tapsPerSec` and shopping
 * once a second. Records when areas unlock (at clock time `clock + elapsed`).
 */
function play(game: Game, field: Field, seconds: number, clock: number, tapsPerSec: number, memo: { lastChallenge: number; lastHeavy?: number }, unlockedAt: Partial<Record<AreaId, number>>, onShop?: () => void): void {
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
    if (Math.round(t / dt) % 20 === 0) {
      botShop(game, clock + t, memo);
      onShop?.();
    }
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
  it('a typical player opens the Fey Grove on day one, then new areas every day or few', () => {
    const { unlockedAt: r } = simulatePlayer(14);
    // SIM_OUT=file.json writes when each area unlocked, in hours.
    if (process.env.SIM_OUT) writeFileSync(process.env.SIM_OUT, JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, +(v! / 3600).toFixed(1)]))));
    // The Forest Guardian takes 10,000 Forest kills, so the Glade opens on day one, not in the first session.
    expect(r.glade).toBeGreaterThan(40 * 60);
    expect(r.glade).toBeLessThan(24 * H);
    expect(r.graveyard).toBeGreaterThan(4 * H);
    expect(r.graveyard).toBeLessThan(36 * H);
    expect(r.caves).toBeGreaterThan(4 * 24 * H);
    expect(r.caves).toBeLessThan(10 * 24 * H);
    expect(r.peaks).toBeGreaterThan(7 * 24 * H);
    expect(r.peaks).toBeLessThan(14 * 24 * H);
    expect(r.cliffs).toBeGreaterThan(9 * 24 * H);
    // The Void Rift is the long-term goal: about two weeks in.
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

/**
 * The Dev menu's progress phases (Settings → Dev → Progress), recorded from a typical player's bot run:
 * each area's start (right after arriving and crafting with the last Guardian's materials) and its end
 * (just before the Guardian challenge that wins). Regenerate after balance or content changes with
 * `npm run presets` (writes src/dev/presets.json; takes a while).
 */
it.runIf(!!process.env.PRESETS_OUT)('dev progress presets', () => {
  const bot = newBot();
  const g = bot.game;
  const presets: Record<string, string> = {};
  const take = (key: string, save: string) => {
    if (!presets[key]) presets[key] = save;
  };
  take('forest-start', serialize(g.state));
  // The save from just before each Guardian challenge; kept once that challenge wins.
  let pending: { area: AreaId; save: string } | null = null;
  const challenge = g.challengeGuardian.bind(g);
  g.challengeGuardian = () => {
    pending = { area: g.state.area, save: serialize(g.state) };
    return challenge();
  };
  g.on((e) => {
    if (e.type === 'eventComplete' && pending && e.event === `guardian-${pending.area}`) take(`${pending.area}-end`, pending.save);
  });
  const onShop = () => take(`${g.state.area}-start`, serialize(g.state));
  const sessions: Array<[number, number]> = [[0, 40 * 60]];
  for (let d = 0; d < 200; d++) sessions.push([d * 24 * H + 14 * H, 15 * 60], [d * 24 * H + 19 * H, 10 * 60], [d * 24 * H + 24 * H, 20 * 60]);
  for (const [start, length] of sessions) {
    if (presets['rift-end']) break;
    g.applyOffline(start * 1000);
    botShop(g, start, bot.memo);
    onShop();
    play(g, bot.field, length, start, 1, bot.memo, bot.unlockedAt, onShop);
    g.state.lastSeen = (start + length) * 1000;
    writeFileSync(process.env.PRESETS_OUT!, JSON.stringify(Object.fromEntries(AREAS.flatMap((a) => [`${a.id}-start`, `${a.id}-end`]).filter((k) => presets[k]).map((k) => [k, JSON.parse(presets[k])]))));
  }
  expect(Object.keys(presets)).toHaveLength(AREAS.length * 2);
}, 0);

/**
 * The whole game, start to Time Eater, as the typical player (same check-ins as simulatePlayer). Slow: hours.
 * `SIM_FULL=log.txt npx vitest run tests/progression.test.ts -t "full game"` appends a line as each area opens,
 * a status line every few days, and the day the Time Eater falls.
 */
it.runIf(!!process.env.SIM_FULL)('full game: a typical player beats the Time Eater', () => {
  const out = process.env.SIM_FULL!;
  const log = (line: string) => writeFileSync(out, line + '\n', { flag: 'a' });
  const bot = newBot();
  // SIM_FROM=checkpoint.json resumes from a checkpoint written by SIM_SNAP=dir (one per area, as it opens).
  const from = process.env.SIM_FROM ? (JSON.parse(readFileSync(process.env.SIM_FROM, 'utf8')) as { clock: number; save: string; unlockedAt: Partial<Record<AreaId, number>> }) : null;
  if (from) {
    bot.game = new Game(deserialize(from.save, from.clock * 1000)!, mulberry(42));
    bot.field = new Field(bot.game);
    bot.field.setView(390, 420);
    bot.unlockedAt = from.unlockedAt;
  }
  const g = bot.game;
  let beaten: number | null = null;
  let now = 0;
  g.on((e) => {
    if (e.type === 'finalGuardian' && beaten === null) beaten = now;
  });
  const days = Number(process.env.SIM_DAYS ?? 150);
  const sessions: Array<[number, number]> = [[0, 40 * 60]];
  for (let d = 0; d < days; d++) sessions.push([d * 24 * H + 14 * H, 15 * 60], [d * 24 * H + 19 * H, 10 * 60], [d * 24 * H + 24 * H, 20 * 60]);
  const seen = new Set<string>(Object.keys(bot.unlockedAt));
  let lastStatus = 0;
  const started = Date.now();
  for (const [start, length] of sessions) {
    if (beaten !== null) break;
    if (from && start + length <= from.clock) continue;
    now = start;
    g.applyOffline(start * 1000);
    botShop(g, start, bot.memo);
    play(g, bot.field, length, start, 1, bot.memo, bot.unlockedAt, () => (now = start));
    g.state.lastSeen = (start + length) * 1000;
    for (const a of AREAS) if (a.id in bot.unlockedAt && !seen.has(a.id)) {
      seen.add(a.id);
      log(`${a.name}: day ${(bot.unlockedAt[a.id]! / 86400).toFixed(1)}`);
      if (process.env.SIM_SNAP) writeFileSync(`${process.env.SIM_SNAP}/${a.id}.json`, JSON.stringify({ clock: start + length, save: serialize(g.state), unlockedAt: bot.unlockedAt }));
    }
    if (start - lastStatus >= 5 * 86400) {
      lastStatus = start;
      const s = g.state;
      const hunters = HUNTERS.filter((h) => s.hunters[h.id].recruited).map((h) => `${h.id}:${g.levelOf(h.id)}`).join(' ');
      const ev = EVENTS.find((e) => e.id === `guardian-${s.area}`);
      const prog = ev ? ` (${Math.min(100, Math.round((g.eventProgress(ev.id) / ev.unlockKills) * 100))}% to its Guardian)` : '';
      log(`  [day ${(start / 86400).toFixed(0)}] area ${s.area}${prog} · you Lv ${g.levelOf('main')} · gold ${s.gold.toExponential(2)} · ${hunters} · wall ${((Date.now() - started) / 60000).toFixed(0)}m`);
    }
  }
  log(beaten !== null ? `TIME EATER BEATEN: day ${(beaten / 86400).toFixed(1)}` : `Time Eater not beaten in ${days} days`);
}, 0);
