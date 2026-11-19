import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { GEAR, gearArea, HUNTERS, sessionsToLevel, slotAccepts, type AreaId, type EnemyId, type HunterId } from '../src/core/balance';
import { Field } from '../src/core/field';
import { Game } from '../src/core/game';
import { newGame } from '../src/core/state';
import { worth } from './botGear';

/**
 * Hunter test bench: `BENCH_OUT=out.json npx vitest run tests/hunterBench.test.ts` puts each Guild Hunter alone on
 * the field at Lv 50 and Lv 100 (every point spent: the whole first tree, then Ascend and the whole Ascended tree),
 * all in the same tier of gear, and measures their damage per second against monsters that stand still: one very
 * close, one a little way off, one far away, then packs of 5, 10, 20 and 100 a little way off (100 for the later areas' swarms). The monsters can't knock
 * the Hunter down, and each one killed is replaced where it stood, so the number is the Hunter's own output at that
 * range and crowd. BENCH_BASE=before.json adds each row's change against an earlier run (e.g. before a tree rework).
 * BENCH_HUNTERS=alchemist,bard runs only those.
 * tests/hunterBench.baseline.json is the run from before the skill-tree rework.
 */

const OUT = process.env.BENCH_OUT;
const BASE = process.env.BENCH_BASE;
const ONLY = process.env.BENCH_HUNTERS?.split(',');
/** The bench's area (its monsters and its view), the gear tier everyone wears, and the monster that stands there. */
const AREA: AreaId = 'mines';
const TIER = 7;
const DUMMY: EnemyId = 'lavaGolem';
/** The dummy's health, as a multiple of its usual (so a hit seldom kills outright and overkill matters little). */
const HP_MULT = 40;
const WARMUP = 2;
const SECONDS = Number(process.env.BENCH_SECONDS ?? 20);
const SEEDS = Number(process.env.BENCH_SEEDS ?? 2);
const DT = 1 / 20;
const LEVELS = [50, 100];

/** Where the dummies stand (the Hunter is at 0, 0): up the field, at these distances; packs spread around a point. */
const SCENARIOS: Array<{ id: string; at: number; n: number }> = [
  { id: 'close', at: 60, n: 1 },
  { id: 'mid', at: 180, n: 1 },
  { id: 'far', at: 400, n: 1 },
  { id: 'pack5', at: 180, n: 5 },
  { id: 'pack10', at: 180, n: 10 },
  { id: 'pack20', at: 180, n: 20 },
  { id: 'pack100', at: 180, n: 100 },
];

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Spots for a pack of `n` around (0, -at): a sunflower spiral, about a monster's width apart. */
function spots(at: number, n: number): Array<{ x: number; y: number }> {
  if (n === 1) return [{ x: 0, y: -at }];
  return Array.from({ length: n }, (_, i) => {
    const r = 22 * Math.sqrt(i + 0.5);
    const a = i * 2.39996;
    return { x: Math.cos(a) * r, y: -at + Math.sin(a) * r };
  });
}

/** A Hunter set up for the bench: recruited, in the bench's gear (picked before any skills, so it never changes), at `level`. */
function setup(id: HunterId, level: number, seed: number): Game {
  const state = newGame(0);
  state.area = AREA;
  const h = state.hunters[id];
  h.recruited = true;
  h.station = AREA;
  const g = new Game(state, mulberry(seed));
  let uid = 1;
  g.slotsOf(id).forEach((slot, i) => {
    const weapon = slot.kind !== 'armor' && slot.kind !== 'accessory';
    const stars = weapon ? 4 : 3;
    const options = GEAR.filter((gd) => slotAccepts(slot, gd) && gearArea(gd) === TIER);
    if (!options.length) return;
    const best = options.map((gd) => ({ gd, v: worth(g, id, i, gd.id, stars) })).sort((a, b) => b.v - a.v || a.gd.id.localeCompare(b.gd.id))[0];
    state.inventory.push({ uid, base: best.gd.id, stars });
    (state.equipment[id] ??= [])[i] = uid++;
  });
  h.trains = sessionsToLevel(level);
  g.autoLearn(id);
  if (level > 50) {
    // Ascend (it keeps the level: one curve all the way), then the Ascended tree.
    if (!g.learn(id, 'ascend')) throw new Error(`${id}: couldn't ascend`);
    g.autoLearn(id);
  }
  return g;
}

/** Damage per second against one scenario's dummies. */
function bench(id: HunterId, level: number, sc: (typeof SCENARIOS)[number], seed: number): number {
  const g = setup(id, level, seed);
  const f = new Field(g, id);
  f.setView(390, 420);
  const priv = f as unknown as { spawnAcc: number; spawn: (type: EnemyId, boss: boolean, at: { x: number; y: number }) => void };
  priv.spawnAcc = -1e12;
  const at = spots(sc.at, sc.n);
  const hp = g.enemyStats(DUMMY).hp * HP_MULT;
  const anchor = new Map<number, { x: number; y: number }>();
  const last = new Map<number, number>();
  const place = (p: { x: number; y: number }) => {
    priv.spawn(DUMMY, false, p);
    const e = f.enemies[f.enemies.length - 1];
    Object.assign(e, { x: p.x, y: p.y, hp, maxHp: hp, speed: 0, golden: false, scale: 1 });
    delete (e as { lunge?: unknown }).lunge;
    anchor.set(e.id, p);
    last.set(e.id, hp);
  };
  for (const p of at) place(p);
  let dealt = 0;
  let measured = 0;
  for (let t = 0; t < WARMUP + SECONDS; t += DT) {
    f.immune = 1e9;
    g.tick(DT);
    f.update(DT);
    f.drainEvents();
    const counting = t >= WARMUP;
    const alive = new Set<number>();
    for (const e of f.enemies) {
      const before = last.get(e.id);
      if (before === undefined) continue; // anything else on the field (none should be)
      alive.add(e.id);
      if (counting) dealt += Math.max(0, before - Math.max(0, e.hp));
      last.set(e.id, e.hp);
    }
    for (const [eid, before] of [...last]) {
      if (alive.has(eid)) continue;
      // Killed: what it had left counts, and a fresh one takes its place.
      if (counting) dealt += Math.max(0, before);
      const p = anchor.get(eid)!;
      last.delete(eid);
      anchor.delete(eid);
      place(p);
    }
    // Knocked aside: back to its spot twice a second.
    if (Math.round(t / DT) % 10 === 0) for (const e of f.enemies) { const p = anchor.get(e.id); if (p) Object.assign(e, { x: p.x, y: p.y }); }
    if (counting) measured += DT;
  }
  return dealt / measured;
}

it.runIf(!!OUT)('Hunter test bench', () => {
  const base = BASE && existsSync(BASE) ? (JSON.parse(readFileSync(BASE, 'utf8')) as Array<Record<string, number | string>>) : [];
  const rows: Array<Record<string, number | string>> = [];
  for (const h of HUNTERS) {
    if (ONLY && !ONLY.includes(h.id)) continue;
    for (const level of LEVELS) {
      const row: Record<string, number | string> = { hunter: h.id, level };
      for (const sc of SCENARIOS) {
        let sum = 0;
        for (let s = 0; s < SEEDS; s++) sum += bench(h.id, level, sc, 7 + s);
        row[sc.id] = Math.round(sum / SEEDS);
        const was = base.find((b) => b.hunter === h.id && b.level === level)?.[sc.id];
        if (typeof was === 'number' && was > 0) row[`${sc.id}Δ`] = `${(((row[sc.id] as number) / was - 1) * 100).toFixed(1)}%`;
      }
      rows.push(row);
      writeFileSync(OUT!, JSON.stringify(rows, null, 1));
    }
  }
}, 0);
