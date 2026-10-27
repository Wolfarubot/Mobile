import { GEAR_WORTH_WEIGHT, gearCost, gearDef, HUNTERS, itemCost, itemDef, ITEMS, MATERIAL_WORTH, modCost, modGold, REGRESSION_TREE, shardsFor, type MaterialId } from './balance';
import { newGame, type GameState, type GearItem, type Invested } from './state';

/**
 * Regression: going back to day 1 in the Wandering Woods for Memory Shards. Your Hunter and every Guild Hunter keep
 * their training, levels and skill trees (Guild Hunters must be recruited again, and come back as they were); gold,
 * materials, gear, Upgrades, areas, events and the Bestiary start over. Gems, premium items, quests, minigame
 * buffs, settings and the Regression Tree are kept. Shards are paid on the run's worth: gold, materials and
 * everything invested in gear and Upgrades, in gold (MATERIAL_WORTH prices each material; gear counts
 * GEAR_WORTH_WEIGHT times over, so the time spent on it pays off).
 */

/** Adds a spend to a piece's record (started, for pieces from before it was kept, from its estimate). */
export function invest(item: GearItem, gold: number, mats: Partial<Record<MaterialId, number>>): void {
  const inv = (item.invested ??= estimateInvested(item));
  inv.gold += gold;
  for (const [m, n] of Object.entries(mats) as [MaterialId, number][]) inv.mats[m] = (inv.mats[m] ?? 0) + n;
}

/**
 * What a piece from before spending was tracked probably cost: its stars (not the first, for starting gear) and
 * the modifiers it holds now. Rolls that were replaced are gone from the record, so this errs low.
 */
export function estimateInvested(item: GearItem): Invested {
  const def = gearDef(item.base);
  const out: Invested = { gold: 0, mats: {} };
  const add = (cost: Partial<Record<MaterialId, number>>) => {
    for (const [m, n] of Object.entries(cost) as [MaterialId, number][]) out.mats[m] = (out.mats[m] ?? 0) + n;
  };
  for (let l = def.starter ? 1 : 0; l < item.stars; l++) add(gearCost(def, l));
  for (const mod of item.mods ?? [])
    if (mod) {
      add(modCost(def, mod.kind));
      out.gold += modGold(def, mod.kind);
    }
  return out;
}

/** What a piece has cost so far. */
export const gearInvested = (item: GearItem): Invested => item.invested ?? estimateInvested(item);

/** Materials, in gold. */
const matsWorth = (mats: Partial<Record<MaterialId, number>>): number =>
  (Object.entries(mats) as [MaterialId, number][]).reduce((sum, [m, n]) => sum + (MATERIAL_WORTH[m] ?? 0) * n, 0);

/** A run's worth toward Memory Shards, in gold, by where it is. */
export interface RunWorth {
  gold: number;
  materials: number;
  /** Gear (crafting, stars, Refines and Enchants) and Upgrades (Idols and the rest), weighted GEAR_WORTH_WEIGHT×. */
  gear: number;
  total: number;
}

export function runWorth(s: GameState): RunWorth {
  const gold = Math.max(0, s.gold);
  const materials = matsWorth(s.materials);
  let gear = 0;
  for (const item of s.inventory) {
    const inv = gearInvested(item);
    gear += inv.gold + matsWorth(inv.mats);
  }
  for (const def of ITEMS) for (let star = 0; star < (s.items[def.id] ?? 0); star++) gear += matsWorth(itemCost(itemDef(def.id), star));
  gear *= GEAR_WORTH_WEIGHT;
  return { gold, materials, gear, total: gold + materials + gear };
}

/** Gold a run starts with (Inheritance). */
export function startGold(s: GameState): number {
  let gold = 0;
  for (const n of REGRESSION_TREE) {
    const rank = s.regression.tree[n.id] ?? 0;
    if (n.startGold && rank > 0) gold = Math.max(gold, n.startGold[Math.min(rank, n.startGold.length) - 1]);
  }
  return gold;
}

/** Memory Shards a Regression would pay right now. */
export const shardsNow = (s: GameState): number => shardsFor(runWorth(s).total);

/**
 * The game after a Regression from `old` at `now` (epoch ms), and the shards it paid. `old` is left as it was.
 * Starts from a new game and carries over what's kept.
 */
export function regress(old: GameState, now: number): { state: GameState; shards: number; worth: RunWorth } {
  const worth = runWorth(old);
  const shards = shardsFor(worth.total);
  const s = newGame(now);
  const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  // Your Hunter: training, skills, ascension and tap ability.
  s.main = copy(old.main);
  // Guild Hunters: training and skills, but not recruited or stationed.
  for (const h of HUNTERS) s.hunters[h.id] = { ...copy(old.hunters[h.id]), recruited: false, station: null };
  // The starting kit again, numbered after every piece ever made so no uid is reused.
  const renumber = new Map<number, number>();
  for (const item of s.inventory) {
    renumber.set(item.uid, old.nextGearUid + renumber.size);
    item.uid = renumber.get(item.uid)!;
  }
  for (const slots of Object.values(s.equipment)) if (slots) slots.forEach((u, i) => (slots[i] = u === null ? null : (renumber.get(u) ?? null)));
  s.nextGearUid = old.nextGearUid + renumber.size;
  // Kept as they were.
  s.settings = copy(old.settings);
  s.flags = copy(old.flags);
  s.stats = copy(old.stats);
  s.gems = old.gems;
  s.premium = [...old.premium];
  s.noAds = old.noAds;
  s.shop = copy(old.shop);
  s.merchant = copy(old.merchant);
  s.quests = copy(old.quests);
  s.buffs = copy(old.buffs);
  s.echo = copy(old.echo);
  s.blessings = copy(old.blessings);
  s.energy = old.energy;
  s.buyAmount = old.buyAmount;
  s.seen = { ...copy(old.seen), gearUid: s.nextGearUid - 1, beasts: [], events: [] };
  s.lastSeen = now;
  s.regression = { ...copy(old.regression), runs: old.regression.runs + 1, shards: old.regression.shards + shards, totalShards: old.regression.totalShards + shards, runStart: now };
  s.gold = startGold(s);
  return { state: s, shards, worth };
}
