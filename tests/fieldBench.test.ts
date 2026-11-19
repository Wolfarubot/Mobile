import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { AREAS, areaEnemies, GEAR, gearArea, HUNTERS, sessionsToLevel, slotAccepts, type AreaId, type HunterId } from '../src/core/balance';
import { Field } from '../src/core/field';
import { Game } from '../src/core/game';
import { deserialize, newGame } from '../src/core/state';
import { worth } from './botGear';

/**
 * Field test: `FIELD_OUT=out.json npx vitest run tests/fieldBench.test.ts` puts the Guild Hunters in random groups of
 * three (a few different shuffles) on a real battlefield, the area's own monsters spawning as they do in the game
 * (every one of them unlocked), in the Fey Grove, the Shadowy Depths and the Cloud Fortress, each Hunter in that
 * area's gear (the piece of each slot that does the most for them, weapons at 4★, the rest at 3★), at Lv 50 (whole
 * first tree) and Lv 100 (Ascended, whole second tree). Nobody is shielded: monsters reach them and stun them as in
 * the game. Each Hunter's damage per second is what they actually deal (Game.dealt, as the game's DPS shows it),
 * over FIELD_SECONDS after a warm-up. The rows are per Hunter, per area and level, averaged over the groups they
 * were in; compare two runs (before and after a change) Hunter by Hunter.
 *
 * FIELD_PRESETS=1 instead takes each area's "-end" save from public/dev-presets.json (the pacing run as it was about to
 * beat that area's Guardian): only the Hunters recruited by then, at the levels and in the gear they had, their skill
 * points spent afresh on the current trees, in random groups of three in that area. (A real team at a real point of
 * the game, so the monsters aren't far too weak for the Hunters; levels show as 0 in the rows.)
 */

const OUT = process.env.FIELD_OUT;
const AREA_IDS: AreaId[] = (process.env.FIELD_AREAS?.split(',') as AreaId[] | undefined) ?? ['glade', 'depths', 'fortress'];
const LEVELS = [50, 100];
const ROUNDS = Number(process.env.FIELD_ROUNDS ?? 3);
const WARMUP = 8;
const SECONDS = Number(process.env.FIELD_SECONDS ?? 30);
const DT = 1 / 30;

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The Hunters in groups of three, shuffled by `seed` (the last group topped up from the start if it's short). */
function groups(seed: number): HunterId[][] {
  const rng = mulberry(seed);
  const ids = HUNTERS.map((h) => h.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const out: HunterId[][] = [];
  for (let i = 0; i < ids.length; i += 3) out.push(ids.slice(i, i + 3));
  const last = out[out.length - 1];
  for (let k = 0; last.length < 3; k++) if (!last.includes(ids[k])) last.push(ids[k]);
  return out;
}

/** One group fighting in `area` at `level`: each Hunter's damage per second. */
function fight(group: HunterId[], area: AreaId, level: number, seed: number): Record<string, number> {
  const state = newGame(0);
  state.area = area;
  state.areas[area].unlocked = true;
  for (const e of areaEnemies(area)) state.bestiary[e.id].unlocked = true;
  const g = new Game(state, mulberry(seed));
  const tier = AREAS.findIndex((a) => a.id === area) + 1;
  let uid = 1;
  for (const id of group) {
    const h = state.hunters[id];
    h.recruited = true;
    h.station = area;
    // The area's gear, picked before any skills (so a tree change never changes it).
    g.slotsOf(id).forEach((slot, i) => {
      const weapon = slot.kind !== 'armor' && slot.kind !== 'accessory';
      const stars = weapon ? 4 : 3;
      let options = GEAR.filter((gd) => slotAccepts(slot, gd) && gearArea(gd) === tier);
      for (let t = tier - 1; !options.length && t >= 1; t--) options = GEAR.filter((gd) => slotAccepts(slot, gd) && gearArea(gd) === t);
      if (!options.length) return;
      const best = options.map((gd) => ({ gd, v: worth(g, id, i, gd.id, stars) })).sort((a, b) => b.v - a.v || a.gd.id.localeCompare(b.gd.id))[0];
      state.inventory.push({ uid, base: best.gd.id, stars });
      (state.equipment[id] ??= [])[i] = uid++;
    });
  }
  for (const id of group) {
    state.hunters[id].trains = sessionsToLevel(level);
    g.autoLearn(id);
    if (level > 50) {
      if (!g.learn(id, 'ascend')) throw new Error(`${id}: couldn't ascend`);
      g.autoLearn(id);
    }
  }
  const f = new Field(g, group[0]);
  f.setView(390, 420);
  for (let t = 0; t < WARMUP; t += DT) {
    g.tick(DT);
    f.update(DT);
    f.drainEvents();
  }
  const start = new Map(g.dealt);
  let secs = 0;
  for (; secs < SECONDS; secs += DT) {
    g.tick(DT);
    f.update(DT);
    f.drainEvents();
  }
  return Object.fromEntries(group.map((id) => [id, ((g.dealt.get(id) ?? 0) - (start.get(id) ?? 0)) / secs]));
}

/** A group from a preset save: the Hunters' own levels and gear, their skills learned afresh. */
function fightPreset(raw: string, group: HunterId[], area: AreaId, seed: number): Record<string, number> {
  const save = JSON.parse(raw) as { lastSeen: number };
  const state = deserialize(raw, save.lastSeen)!;
  state.area = area;
  for (const h of Object.values(state.hunters)) h.station = null;
  for (const id of group) {
    const h = state.hunters[id];
    h.station = area;
    h.skills = {};
    if (h.skills2) h.skills2 = {};
  }
  state.buffs = {};
  const g = new Game(state, mulberry(seed));
  for (const id of group) g.autoLearn(id);
  const f = new Field(g, group[0]);
  f.setView(390, 420);
  for (let t = 0; t < WARMUP; t += DT) {
    g.tick(DT);
    f.update(DT);
    f.drainEvents();
  }
  const start = new Map(g.dealt);
  let secs = 0;
  for (; secs < SECONDS; secs += DT) {
    g.tick(DT);
    f.update(DT);
    f.drainEvents();
  }
  return Object.fromEntries(group.map((id) => [id, ((g.dealt.get(id) ?? 0) - (start.get(id) ?? 0)) / secs]));
}

it.runIf(!!OUT && !!process.env.FIELD_PRESETS)('Field test (pacing-run saves)', () => {
  const presets = JSON.parse(readFileSync('public/dev-presets.json', 'utf8')) as Record<string, unknown>;
  const sums = new Map<string, { dps: number; n: number }>();
  for (const area of AREA_IDS) {
    const raw = JSON.stringify(presets[`${area}-end`]);
    const state = JSON.parse(raw) as { hunters: Record<string, { recruited?: boolean }> };
    const ids = HUNTERS.map((h) => h.id).filter((id) => state.hunters[id]?.recruited);
    for (let r = 0; r < ROUNDS * 2; r++) {
      const rng = mulberry(301 + r);
      const order = [...ids];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      for (let i = 0; i < order.length; i += 3) {
        const group = order.slice(i, i + 3);
        for (let k = 0; group.length < Math.min(3, ids.length); k++) if (!group.includes(order[k])) group.push(order[k]);
        for (const [id, v] of Object.entries(fightPreset(raw, group, area, 7 + r))) {
          const key = `${id}|${area}|0`;
          const cur = sums.get(key) ?? { dps: 0, n: 0 };
          sums.set(key, { dps: cur.dps + v, n: cur.n + 1 });
        }
      }
    }
  }
  const rows = [...sums].map(([k, v]) => {
    const [hunter, area, level] = k.split('|');
    return { hunter, area, level: Number(level), dps: Math.round(v.dps / v.n) };
  });
  writeFileSync(OUT!, JSON.stringify(rows, null, 1));
}, 0);

it.runIf(!!OUT && !process.env.FIELD_PRESETS)('Field test', () => {
  const sums = new Map<string, { dps: number; n: number }>();
  for (let r = 0; r < ROUNDS; r++)
    for (const group of groups(101 + r))
      for (const area of AREA_IDS)
        for (const level of LEVELS) {
          const dps = fight(group, area, level, 7 + r);
          for (const [id, v] of Object.entries(dps)) {
            const k = `${id}|${area}|${level}`;
            const cur = sums.get(k) ?? { dps: 0, n: 0 };
            sums.set(k, { dps: cur.dps + v, n: cur.n + 1 });
          }
        }
  const rows = [...sums].map(([k, v]) => {
    const [hunter, area, level] = k.split('|');
    return { hunter, area, level: Number(level), dps: Math.round(v.dps / v.n) };
  });
  writeFileSync(OUT!, JSON.stringify(rows, null, 1));
}, 0);
