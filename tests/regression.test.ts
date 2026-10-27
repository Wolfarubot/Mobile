import { describe, expect, it } from 'vitest';
import { gearCost, gearDef, HUNTERS, MATERIAL_WORTH, MATERIALS, shardsFor, SHARD_POWER, type MaterialId } from '../src/core/balance';
import { Game } from '../src/core/game';
import { estimateInvested, gearInvested, regress, runWorth } from '../src/core/regression';
import { deserialize, newGame, serialize, type GameState } from '../src/core/state';

const noCrit = () => 0.99;

/** A late-ish run: gold, materials, a recruited Guild Hunter with training, Upgrades, areas and the Bestiary moving. */
function midRun(): GameState {
  const s = newGame(0);
  s.gold = 1e9;
  for (const m of MATERIALS) s.materials[m.id] = 1e6;
  s.main.trains = 500;
  s.main.skills = { root: 1 };
  s.hunters.ranger = { ...s.hunters.ranger, recruited: true, station: 'forest', trains: 120, skills: { root: 2 } };
  s.areas.glade.unlocked = true;
  s.areas.forest.kills = 5000;
  s.bestiary.greenSlime.empower = 7;
  s.bestiary.greenSlime.kills = 9000;
  for (const e of Object.values(s.events)) e.completed = 2;
  s.gems = 42;
  s.premium = ['offline1'];
  return s;
}

describe('Regression', () => {
  it('material worth rises with the area a material drops in', () => {
    expect(MATERIAL_WORTH.goo).toBeGreaterThan(0);
    expect(MATERIAL_WORTH.voidPrism).toBeGreaterThan(MATERIAL_WORTH.goo * 1e6);
  });

  it('shards grow slowly with worth: double the worth is about 15% more', () => {
    expect(shardsFor(0)).toBe(0);
    const w = 1e28;
    expect(shardsFor(2 * w) / shardsFor(w)).toBeCloseTo(2 ** SHARD_POWER, 1);
    expect(shardsFor(1e28)).toBeGreaterThanOrEqual(50);
    expect(shardsFor(1e28)).toBeLessThanOrEqual(200);
  });

  it('crafting and starring a piece record what it cost; older pieces get an estimate', () => {
    const g = new Game(midRun(), noCrit);
    const bow = g.craftGear('forestBow')!;
    expect(bow.invested).toEqual({ gold: 0, mats: gearCost(gearDef('forestBow'), 0) });
    const gold = g.gearUpgradeGold(bow.uid)!;
    const step = gearCost(gearDef('forestBow'), 1);
    expect(g.upgradeGear(bow.uid)).toBe(true);
    expect(bow.invested!.gold).toBe(gold);
    for (const [m, n] of Object.entries(step) as [MaterialId, number][]) expect(bow.invested!.mats[m]).toBe((gearCost(gearDef('forestBow'), 0)[m] ?? 0) + n);
    // A piece from before it was tracked: its stars' recipes.
    const old = { uid: 99, base: 'forestBow' as const, stars: 2 };
    expect(gearInvested(old)).toEqual(estimateInvested(old));
    expect(estimateInvested(old).mats).toEqual(bow.invested!.mats);
    // Saved and loaded, the record stays.
    const back = deserialize(serialize(g.state))!;
    expect(back.inventory.find((it) => it.uid === bow.uid)!.invested).toEqual(bow.invested);
  });

  it("a run's worth counts gold, materials and gear, so crafting doesn't lose shards", () => {
    const s = midRun();
    const g = new Game(s, noCrit);
    const before = runWorth(s);
    expect(before.gold).toBe(1e9);
    expect(before.materials).toBeGreaterThan(0);
    g.craftGear('forestBow');
    const after = runWorth(s);
    expect(after.gear).toBeGreaterThan(0);
    // The materials moved into the bow: the total holds.
    expect(after.total).toBeCloseTo(before.total, 6);
  });

  it('you can regress only after the Time Eater swallows the first run', () => {
    const g = new Game(midRun(), noCrit);
    expect(g.canRegress).toBe(false);
    g.state.regression.unlocked = true;
    expect(g.canRegress).toBe(true);
  });

  it('regressing keeps levels, skills, gems and premium; resets gold, materials, gear, areas and monsters', () => {
    const old = midRun();
    const g = new Game(old, noCrit);
    g.craftGear('forestBow');
    old.regression.unlocked = true;
    const worth = runWorth(old).total;
    const snapshot = serialize(old);
    const { state: s, shards } = regress(old, 1_000_000);
    expect(serialize(old)).toBe(snapshot); // the old run is untouched
    expect(shards).toBe(shardsFor(worth));
    expect(shards).toBeGreaterThan(0);
    // Kept.
    expect(s.main.trains).toBe(500);
    expect(s.main.skills).toEqual({ root: 1 });
    expect(s.hunters.ranger).toMatchObject({ recruited: false, station: null, trains: 120, skills: { root: 2 } });
    expect(s.gems).toBe(42);
    expect(s.premium).toEqual(['offline1']);
    expect(s.regression).toMatchObject({ unlocked: true, runs: 1, shards, totalShards: shards, runStart: 1_000_000 });
    // Reset.
    expect(s.gold).toBe(0);
    expect(Object.values(s.materials).every((n) => n === 0)).toBe(true);
    expect(s.area).toBe('forest');
    expect(s.areas.glade.unlocked).toBe(false);
    expect(s.areas.forest.kills).toBe(0);
    expect(s.bestiary.greenSlime).toMatchObject({ empower: 0, kills: 0 });
    expect(Object.values(s.events).every((e) => e.completed === 0)).toBe(true);
    for (const h of HUNTERS) expect(s.hunters[h.id].recruited).toBe(false);
    // The starting kit again, under new uids, worn.
    expect(s.inventory.every((it) => gearDef(it.base).starter)).toBe(true);
    expect(s.inventory.every((it) => it.uid >= old.nextGearUid)).toBe(true);
    const worn = (s.equipment.main ?? []).filter((u): u is number => u !== null);
    expect(worn.length).toBeGreaterThan(0);
    for (const u of worn) expect(s.inventory.some((it) => it.uid === u)).toBe(true);
    // A second Regression adds to the shards held.
    const again = regress(s, 2_000_000);
    expect(again.state.regression.runs).toBe(2);
    expect(again.state.regression.shards).toBe(shards + again.shards);
    // It loads back as it was.
    expect(deserialize(serialize(s))!.regression).toEqual(s.regression);
  });

  it('old saves load with no Regression yet', () => {
    const s = newGame(5);
    const data = JSON.parse(serialize(s)) as Record<string, unknown>;
    delete data.regression;
    const back = deserialize(JSON.stringify(data))!;
    expect(back.regression).toMatchObject({ unlocked: false, runs: 0, shards: 0, totalShards: 0, tree: {} });
  });
});
