import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EVENTS, AREAS, ENEMIES, enemyUnlockCost, HUNTERS, ITEMS, RARITIES, STATION_EFFICIENCY, type AreaId, type Rarity, type HunterId, type ItemId } from '../src/core/balance';
import { Field } from '../src/core/field';
import { Game, type Shooter } from '../src/core/game';
import { mergeSample, runSample, sameGroup, SAMPLE_SETTLED } from '../src/core/sampler';
import { deserialize, newGame, serialize, type Wearer } from '../src/core/state';
import { botGear } from './botGear';

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

/** Empower unlocked monsters while it's cheap, and evolve them: root, then gold, then materials, then everything else (capstone included). */
function botMonsters(game: Game): void {
  for (const e of ENEMIES) {
    if (!game.isUnlocked(e.id)) continue;
    for (let guard = 0; guard < 50 && game.empowerPurchase(e.id, 1).cost < game.state.gold * 0.01; guard++) game.empower(e.id, 1);
    for (let guard = 0; guard < 50 && game.evoPoints(e.id) > 0; guard++) {
      const pick = ['root', 'wealth2', 'wealth', 'harvest', 'harvest2', 'horde', 'horde2', 'capstone'].find((n) => game.canEvolve(e.id, n)) ?? game.evoTree(e.id).find((n) => game.canEvolve(e.id, n.id))?.id;
      if (!pick || !game.evolve(e.id, pick)) break;
    }
  }
}

/** The bot's decisions, run once per simulated second while it's playing (and on each return from offline). */
function botShop(game: Game, t: number, memo: { lastChallenge: number; lastHeavy?: number }): void {
  const s = game.state;
  // An area's Guardian waits on its first event (a swarm of its monsters): run that once when it's ready.
  const first = EVENTS.find((e) => e.area === game.area && e.kind === 'swarm');
  if (first && game.eventCompletions(first.id) === 0 && game.eventReady(first.id) && t - memo.lastChallenge > 60) {
    game.startEvent(first.id);
    memo.lastChallenge = t;
  }
  // Guardian: challenge when ready (retry every 60s); after winning, move to the newest area.
  // SIM_NO_CHALLENGE: never challenge (to stay in an area, levelling and gearing up).
  if (!process.env.SIM_NO_CHALLENGE && game.guardianReady && !game.eventRunning && t - memo.lastChallenge > 60) {
    game.challengeGuardian();
    memo.lastChallenge = t;
  }
  // Run the events that make new Hunters available (back in older areas if need be), every one as soon as it's ready:
  // players unlock their recruits as soon as they can.
  for (const h of HUNTERS) {
    if (s.hunters[h.id].recruited || game.hunterAvailable(h.id)) continue;
    if (!game.eventRunning && game.eventReady(h.unlock.event) && t - memo.lastChallenge > 60) {
      game.startEvent(h.unlock.event);
      memo.lastChallenge = t;
    }
  }
  // Auto Salvage every rarity once it opens (the bot crafts what it wears), and clear what piled up before.
  if (game.autoSalvageOpen && s.settings.autoSalvage.length === 0) {
    s.settings.autoSalvage = Object.keys(RARITIES) as Rarity[];
    game.salvageRarities(s.settings.autoSalvage);
  }
  const newest = game.unlockedAreas[game.unlockedAreas.length - 1];
  if (newest !== game.area && !game.eventRunning) game.travel(newest);

  for (const e of ENEMIES) if (game.isAreaUnlocked(e.area) && !s.bestiary[e.id].unlocked && enemyUnlockCost(e) < s.gold * 0.1) game.unlockEnemy(e.id);
  // Recruit every Hunter the moment they can be afforded.
  for (const h of HUNTERS) if (game.canRecruit(h.id)) game.recruit(h.id);
  s.buyAmount = 1;
  for (const h of HUNTERS) while (s.hunters[h.id].recruited && game.trainPurchase(h.id, 1).cost < s.gold * 0.03) game.train(h.id);
  for (let guard = 0; guard < 400 && game.train('main'); guard++);
  botSkills(game);
  botMonsters(game);
  // Every upgrade the moment its materials are in: global ones first, then Area Upgrades (e.g. the Forest Idol).
  for (const it of [...ITEMS.filter((i) => !i.area), ...ITEMS.filter((i) => i.area)]) while (game.craft(it.id as ItemId));
  // Crafting gear and re-stationing Hunters are slow to work out, and a player does them now and then:
  // once a minute while playing (and on every return).
  if (memo.lastHeavy !== undefined && t - memo.lastHeavy < 60 && t >= memo.lastHeavy) return;
  memo.lastHeavy = t;
  botGear(game);

  // Station Hunters the way players do: three Guild Hunters beside you in the newest area (to take on its
  // difficulty bump), one in the Woods, then two in every other older area, newest first, each area taking the
  // remaining Hunters that earn the most there; anyone left over fills a third spot wherever they earn the most.
  const free = HUNTERS.filter((h) => s.hunters[h.id].recruited).map((h) => h.id);
  for (const id of free) game.station(id, null);
  const left = new Set(free);
  const earns = (id: HunterId, area: AreaId) => game.farmRates(area, [id], area === game.area ? 1 : STATION_EFFICIENCY).gold;
  // The Woods' one Hunter is placed right after your own area: when there aren't Hunters enough for every area yet,
  // the oldest other areas go short instead.
  const older = [...game.unlockedAreas].reverse().filter((a) => a !== game.area && a !== 'forest');
  const areas = [game.area, ...(game.area !== 'forest' ? (['forest'] as AreaId[]) : []), ...older];
  for (const area of areas) {
    const best = [...left].sort((x, y) => earns(y, area) - earns(x, area));
    let n = 0;
    for (const id of best) {
      if (n >= (area === game.area ? 3 : area === 'forest' ? 1 : 2)) break;
      if (game.station(id, area)) {
        left.delete(id);
        n++;
      }
    }
  }
  const extra = [...left].flatMap((id) => areas.map((area) => ({ id, area, gold: earns(id, area) }))).sort((x, y) => y.gold - x.gold);
  for (const { id, area } of extra) if (left.has(id) && (area !== 'forest' || area === game.area) && game.station(id, area)) left.delete(id);
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

/**
 * What the game's background sampler (ui/samplerHost.ts) does while you play: measure each farming group on a
 * hidden copy of its battlefield, so offline gains and stationed Hunters earn at measured rates. The bot does it
 * as a session ends, one 60s run per group whose sample is missing, stale (another group or strength) or short.
 */
function sampleGroups(game: Game, rng: () => number): void {
  const groups: Array<{ area: AreaId; group: Shooter[] }> = [{ area: game.area, group: ['main', ...game.helpersHere] }];
  for (const area of game.unlockedAreas) if (area !== game.area && game.stationedIn(area).length) groups.push({ area, group: game.stationedIn(area) });
  for (const { area, group } of groups) {
    const sig = game.sampleSig(area, group);
    const smp = game.state.samples[area];
    if (smp && smp.sig === sig && sameGroup(smp.group, group) && smp.seconds >= SAMPLE_SETTLED) continue;
    const run = runSample({ save: serialize(game.state), area, group, seconds: 60, view: { w: 390, h: 420 } }, rng);
    game.state.samples[area] = mergeSample(game.state.samples[area], group, sig, run);
  }
}
const sampleRng = mulberry(7);

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
    sampleGroups(bot.game, sampleRng);
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
}, 0);

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
    sampleGroups(g, sampleRng);
    g.state.lastSeen = (start + length) * 1000;
    writeFileSync(process.env.PRESETS_OUT!, JSON.stringify(Object.fromEntries(AREAS.flatMap((a) => [`${a.id}-start`, `${a.id}-end`]).filter((k) => presets[k]).map((k) => [k, JSON.parse(presets[k])]))));
  }
  expect(Object.keys(presets)).toHaveLength(AREAS.length * 2);
}, 0);

/**
 * Starting over (a "New Game+"): a fresh game that keeps every Hunter's training and skill nodes (yours and the
 * Guild Hunters', ascensions included) from `save`, and nothing else: no gear, gold, materials, areas or monster
 * levels. Guild Hunters still have to be unlocked and recruited again, and come back at their old levels.
 */
function newGamePlus(save: string) {
  const old = deserialize(save)!;
  const s = newGame(0);
  const keep = <T extends { trains: number; skills: Record<string, number>; ascendAt?: number; skills2?: Record<string, number> }>(to: T, from: T) => {
    to.trains = from.trains;
    to.skills = { ...from.skills };
    if (from.ascendAt !== undefined) to.ascendAt = from.ascendAt;
    if (from.skills2) to.skills2 = { ...from.skills2 };
  };
  keep(s.main, old.main);
  s.main.tapAbility = old.main.tapAbility;
  for (const h of HUNTERS) keep(s.hunters[h.id], old.hunters[h.id]);
  return s;
}

/**
 * The whole game, start to Time Eater, as the typical player (same check-ins as simulatePlayer). Slow: hours.
 * `SIM_FULL=log.txt npx vitest run tests/progression.test.ts -t "full game"` appends a line as each area opens,
 * a status line every few days, and the day the Time Eater falls. The player never watches an ad, buys gems or
 * spends any on the Shop: events wait on energy like a free player's (5, one back every 20 minutes).
 * SIM_END=file.json saves the game when the Time Eater falls; SIM_NGP=that file starts over from it, keeping
 * every Hunter's levels and skills but no gear (see newGamePlus).
 */
it.runIf(!!process.env.SIM_FULL)('full game: a typical player beats the Time Eater', () => {
  const out = process.env.SIM_FULL!;
  const log = (line: string) => writeFileSync(out, line + '\n', { flag: 'a' });
  const bot = newBot();
  if (process.env.SIM_NGP) {
    const end = JSON.parse(readFileSync(process.env.SIM_NGP, 'utf8')) as { save: string };
    bot.game = new Game(newGamePlus(end.save), mulberry(42));
    bot.field = new Field(bot.game);
    bot.field.setView(390, 420);
    const s = bot.game.state;
    log(`New Game+: you Lv ${bot.game.levelOf('main')}, Guild Hunters ${HUNTERS.map((h) => `${h.id}:${bot.game.levelOf(h.id)}`).join(' ')} (to recruit again), no gear but the starter kit, ${s.gold} gold`);
  }
  log('No ads watched, no gems bought or spent: events run on energy alone.');
  // SIM_FROM=checkpoint.json resumes from a checkpoint written by SIM_SNAP=dir (one per area, as it opens).
  const from = process.env.SIM_FROM ? (JSON.parse(readFileSync(process.env.SIM_FROM, 'utf8')) as { clock: number; save: string; unlockedAt: Partial<Record<AreaId, number>>; masteries?: Partial<Record<AreaId, number>> }) : null;
  if (from) {
    bot.game = new Game(deserialize(from.save, from.clock * 1000)!, mulberry(42));
    bot.field = new Field(bot.game);
    bot.field.setView(390, 420);
    bot.unlockedAt = from.unlockedAt;
  }
  const g = bot.game;
  let beaten: number | null = null;
  let now = 0;
  // SIM_PRESETS=public/dev-presets.json records the Dev menu's progress phases from this run, as `npm run presets`
  // does (each area's start, and the save just before the Guardian challenge that wins), written after every session.
  const presets: Record<string, string> = {};
  // A resumed run (SIM_FROM) keeps the phases already recorded.
  if (from && process.env.SIM_PRESETS && existsSync(process.env.SIM_PRESETS))
    for (const [k, v] of Object.entries(JSON.parse(readFileSync(process.env.SIM_PRESETS, 'utf8')) as Record<string, unknown>)) presets[k] = JSON.stringify(v);
  const takePreset = (key: string) => {
    if (process.env.SIM_PRESETS && !presets[key]) presets[key] = serialize(g.state);
  };
  if (process.env.SIM_PRESETS) {
    if (!from) takePreset('forest-start');
    let pending: { area: AreaId; save: string } | null = null;
    const challenge = g.challengeGuardian.bind(g);
    g.challengeGuardian = () => {
      pending = { area: g.state.area, save: serialize(g.state) };
      return challenge();
    };
    g.on((e) => {
      if (e.type === 'eventComplete' && pending && e.event === `guardian-${pending.area}` && !presets[`${pending.area}-end`]) presets[`${pending.area}-end`] = pending.save;
    });
  }
  const writePresets = () => {
    if (!process.env.SIM_PRESETS) return;
    writeFileSync(process.env.SIM_PRESETS, JSON.stringify(Object.fromEntries(AREAS.flatMap((a) => [`${a.id}-start`, `${a.id}-end`]).filter((k) => presets[k]).map((k) => [k, JSON.parse(presets[k])]))));
  };
  g.on((e) => {
    if (e.type === 'finalGuardian' && beaten === null) beaten = now;
  });
  const days = Number(process.env.SIM_DAYS ?? 150);
  const sessions: Array<[number, number]> = [[0, 40 * 60]];
  for (let d = 0; d < days; d++) sessions.push([d * 24 * H + 14 * H, 15 * 60], [d * 24 * H + 19 * H, 10 * 60], [d * 24 * H + 24 * H, 20 * 60]);
  const seen = new Set<string>(Object.keys(bot.unlockedAt));
  let lastStatus = 0;
  // SIM_PACE={"glade":1.5,...} finds masteries for a schedule: each listed area's Guardian Challenge stays locked
  // until the day given (when the next area should open, less a little for the fight), then its mastery is set to
  // the kills made there by then, so it unlocks on time. Logs each mastery found.
  const pace = process.env.SIM_PACE ? (JSON.parse(process.env.SIM_PACE) as Partial<Record<AreaId, number>>) : null;
  const paced = new Set<AreaId>();
  if (pace) for (const a of Object.keys(pace) as AreaId[]) EVENTS.find((e) => e.id === `guardian-${a}`)!.unlockKills = Infinity;
  // Masteries already found before a checkpoint stay as found.
  const found: Partial<Record<AreaId, number>> = { ...from?.masteries };
  for (const [a, k] of Object.entries(found) as [AreaId, number][]) {
    EVENTS.find((e) => e.id === `guardian-${a}`)!.unlockKills = k;
    paced.add(a);
  }
  // SIM_MASTERY={"mines":1047000} tries other masteries (overriding the game's and any found above).
  if (process.env.SIM_MASTERY)
    for (const [a, k] of Object.entries(JSON.parse(process.env.SIM_MASTERY) as Record<AreaId, number>) as [AreaId, number][]) {
      EVENTS.find((e) => e.id === `guardian-${a}`)!.unlockKills = k;
      found[a] = k;
      paced.add(a);
    }
  // SIM_GUARDIAN={"mines":10} multiplies Guardians' health, to see when the team could first beat a tougher one.
  if (process.env.SIM_GUARDIAN)
    for (const [a, k] of Object.entries(JSON.parse(process.env.SIM_GUARDIAN) as Record<AreaId, number>) as [AreaId, number][]) AREAS.find((x) => x.id === a)!.guardian *= k;
  let stopped = false;
  // Each Guardian challenge: when, the team's levels, and how much of the Guardian's health was left on a loss.
  {
    const end = (g as unknown as { endGuardian: () => void }).endGuardian.bind(g);
    (g as unknown as { endGuardian: () => void }).endGuardian = () => {
      const boss = bot.field.enemies.find((e) => e.boss && e.hp > 0);
      if (boss) log(`  guardian ${g.state.area} lost (day ${(now / 86400).toFixed(2)}): ${Math.round((boss.hp / boss.maxHp) * 100)}% of its health left`);
      end();
    };
    g.on((e) => {
      // SIM_STOP_CHALLENGE=file: the save at the first Guardian challenge (as its mastery is reached; SIM_STOP_AREA:
      // that area's), then stop.
      if (e.type === 'guardianChallenge' && process.env.SIM_STOP_CHALLENGE && !stopped && (!process.env.SIM_STOP_AREA || g.state.area === process.env.SIM_STOP_AREA)) {
        stopped = true;
        writeFileSync(process.env.SIM_STOP_CHALLENGE, JSON.stringify({ clock: now, area: g.state.area, save: serialize(g.state) }));
      }
      if (e.type === 'guardianChallenge') log(`  guardian ${g.state.area} challenged (day ${(now / 86400).toFixed(2)}) · you Lv ${g.levelOf('main')} · ${HUNTERS.filter((h) => g.state.hunters[h.id].recruited).map((h) => `${h.id}:${g.levelOf(h.id)}`).join(' ')}`);
      if (e.type === 'eventComplete' && e.event.startsWith('guardian-')) log(`  guardian ${e.event.slice(9)} beaten (day ${(now / 86400).toFixed(2)})`);
    });
  }
  const started = Date.now();
  // SIM_UNTIL=90 plays on to that day (past the Time Eater too) and stops there.
  const until = process.env.SIM_UNTIL ? Number(process.env.SIM_UNTIL) * 86400 : null;
  for (const [start, length] of sessions) {
    if (stopped || (until !== null ? start >= until : beaten !== null)) break;
    if (from && start + length <= from.clock) continue;
    now = start;
    g.applyOffline(start * 1000);
    const day = pace?.[g.state.area];
    if (day !== undefined && !paced.has(g.state.area) && start / 86400 >= day - 0.25) {
      paced.add(g.state.area);
      const ev = EVENTS.find((e) => e.id === `guardian-${g.state.area}`)!;
      ev.unlockKills = Math.max(1, g.eventProgress(ev.id));
      found[g.state.area] = ev.unlockKills;
      log(`  mastery ${g.state.area}: ${Math.round(ev.unlockKills)} (day ${(start / 86400).toFixed(2)})`);
    }
    botShop(g, start, bot.memo);
    takePreset(`${g.state.area}-start`);
    play(g, bot.field, length, start, 1, bot.memo, bot.unlockedAt, () => {
      now = start;
      takePreset(`${g.state.area}-start`);
    });
    sampleGroups(g, sampleRng);
    g.state.lastSeen = (start + length) * 1000;
    writePresets();
    // A checkpoint after every session (resume with SIM_FROM=<dir>/latest.json if the run is cut off).
    if (process.env.SIM_SNAP) writeFileSync(`${process.env.SIM_SNAP}/latest.json`, JSON.stringify({ clock: start + length, save: serialize(g.state), unlockedAt: bot.unlockedAt, masteries: found }));
    for (const a of AREAS) if (a.id in bot.unlockedAt && !seen.has(a.id)) {
      seen.add(a.id);
      log(`${a.name}: day ${(bot.unlockedAt[a.id]! / 86400).toFixed(1)}`);
      if (process.env.SIM_SNAP) writeFileSync(`${process.env.SIM_SNAP}/${a.id}.json`, JSON.stringify({ clock: start + length, save: serialize(g.state), unlockedAt: bot.unlockedAt, masteries: found }));
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
  // A free player: no ads, no gems.
  expect(g.state.noAds).toBe(false);
  expect(g.state.premium).toEqual([]);
  if (process.env.SIM_END) writeFileSync(process.env.SIM_END, JSON.stringify({ clock: now, save: serialize(g.state) }));
}, 0);
