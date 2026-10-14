import type { AreaId, EnemyId, MaterialId } from './balance';
import { Field } from './field';
import { Game, type Shooter } from './game';
import { deserialize, type FieldSample } from './state';

/**
 * Background battlefield samples: a hidden copy of an area's battlefield, run faster than real time with the
 * group farming there, measures what they actually manage (kills, gold, drops, knockouts). Offline gains and
 * stationed Hunters earn at the measured rates, so they match what you see when you watch them play.
 */

/** Simulated seconds before measuring (the field starts empty), and measured per run. */
export const SAMPLE_WARMUP = 10;
export const SAMPLE_RUN = 30;
/** Step size, as the live field runs at 30+ fps. */
export const SAMPLE_DT = 1 / 30;
/** Measured seconds after which a sample is settled (no more runs until the group or its strength changes). */
export const SAMPLE_SETTLED = 300;
/** Seconds kept at most: older runs count for less beyond this (a rolling average). */
export const SAMPLE_KEEP = 600;

/** One run's job: a copy of the save, the area, the group (its first Hunter stands in the middle), the view. */
export interface SampleJob {
  save: string;
  area: AreaId;
  group: Shooter[];
  seconds: number;
  view: { w: number; h: number };
}

export type SampleRun = Omit<FieldSample, 'sig' | 'group'>;

/** Runs a hidden battlefield for `job.seconds` (after the warm-up) and returns what happened in it. */
export function runSample(job: SampleJob, rng: () => number = Math.random): SampleRun {
  const state = deserialize(job.save)!;
  state.area = job.area;
  // Only the group is on this field; everyone else stays home (and no background farming runs in the copy).
  for (const [id, h] of Object.entries(state.hunters)) h.station = h.recruited && job.group.includes(id as Shooter) ? job.area : null;
  const game = new Game(state, rng);
  const field = new Field(game, job.group[0]);
  field.setView(job.view.w, job.view.h);
  const step = (): void => {
    game.tick(SAMPLE_DT);
    field.update(SAMPLE_DT);
  };
  for (let t = 0; t < SAMPLE_WARMUP; t += SAMPLE_DT) {
    step();
    field.drainEvents();
  }
  const kills0 = Object.fromEntries(Object.entries(state.bestiary).map(([id, b]) => [id, b.kills]));
  const gold0 = state.stats.totalGold;
  const mats0 = { ...state.stats.matGained };
  const hk0 = { ...state.stats.hunterKills };
  const out: SampleRun = { seconds: 0, kills: {}, gold: 0, materials: {}, stuns: {}, down: {}, hunterKills: {} };
  let t = 0;
  for (; t < job.seconds; t += SAMPLE_DT) {
    step();
    for (const e of field.drainEvents()) if (e.type === 'stun') out.stuns[e.who] = (out.stuns[e.who] ?? 0) + 1;
    for (const who of job.group) if (field.isDown(who)) out.down[who] = (out.down[who] ?? 0) + SAMPLE_DT;
  }
  out.seconds = t;
  for (const [id, b] of Object.entries(state.bestiary) as [EnemyId, { kills: number }][]) if (b.kills > kills0[id]) out.kills[id] = b.kills - kills0[id];
  out.gold = state.stats.totalGold - gold0;
  for (const [m, n] of Object.entries(state.stats.matGained) as [MaterialId, number][]) if (n > (mats0[m] ?? 0)) out.materials[m] = n - (mats0[m] ?? 0);
  for (const [sh, n] of Object.entries(state.stats.hunterKills) as [Shooter, number][]) if (n > (hk0[sh] ?? 0)) out.hunterKills[sh] = n - (hk0[sh] ?? 0);
  return out;
}

const addCounts = <K extends string>(a: Partial<Record<K, number>>, b: Partial<Record<K, number>>, k: number): Partial<Record<K, number>> => {
  const out: Partial<Record<K, number>> = {};
  for (const [id, n] of Object.entries(a) as [K, number][]) out[id] = n * k;
  for (const [id, n] of Object.entries(b) as [K, number][]) out[id] = (out[id] ?? 0) + n;
  return out;
};

/**
 * Adds a run to an area's sample. A sample for another group or strength is replaced; past SAMPLE_KEEP seconds
 * the older runs are scaled down, so the sample follows small changes the strength check rounds away.
 */
export function mergeSample(old: FieldSample | undefined, group: Shooter[], sig: string, run: SampleRun): FieldSample {
  const same = !!old && old.sig === sig && sameGroup(old.group, group);
  const k = same ? Math.min(1, Math.max(0, SAMPLE_KEEP - run.seconds) / old!.seconds) : 0;
  const base: FieldSample = same ? old! : { group, sig, seconds: 0, kills: {}, gold: 0, materials: {}, stuns: {}, down: {}, hunterKills: {} };
  return {
    group,
    sig,
    seconds: base.seconds * k + run.seconds,
    kills: addCounts(base.kills, run.kills, k),
    gold: base.gold * k + run.gold,
    materials: addCounts(base.materials, run.materials, k),
    stuns: addCounts(base.stuns, run.stuns, k),
    down: addCounts(base.down, run.down, k),
    hunterKills: addCounts(base.hunterKills, run.hunterKills, k),
  };
}

/** The same Hunters, in any order. */
export function sameGroup(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}
