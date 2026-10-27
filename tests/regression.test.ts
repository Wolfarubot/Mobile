import { describe, expect, it } from 'vitest';
import { GEAR_WORTH_WEIGHT, gearCost, gearDef, HUNTERS, MATERIAL_WORTH, MATERIALS, regCost, regNode, REGRESSION_LINKS, REGRESSION_TREE, shardsFor, SHARD_POWER, type MaterialId } from '../src/core/balance';
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

  it("a run's worth counts gold, materials and gear (weighted), so crafting gains shards", () => {
    // Only the Woods' materials, so the bow's few are visible next to the rest.
    const s = newGame(0);
    s.inventory = [];
    s.gold = 1000;
    s.materials.goo = 500;
    s.materials.twig = 500;
    const g = new Game(s, noCrit);
    const before = runWorth(s);
    expect(before).toMatchObject({ gold: 1000, gear: 0 });
    expect(before.materials).toBe(500 * MATERIAL_WORTH.goo + 500 * MATERIAL_WORTH.twig);
    const bow = g.craftGear('forestBow')!;
    const spent = (Object.entries(bow.invested!.mats) as [MaterialId, number][]).reduce((sum, [m, n]) => sum + MATERIAL_WORTH[m] * n, 0);
    expect(spent).toBeGreaterThan(0);
    const after = runWorth(s);
    // The materials moved into the bow, which counts GEAR_WORTH_WEIGHT times over.
    expect(after.gear).toBe(spent * GEAR_WORTH_WEIGHT);
    expect(after.total - before.total).toBe(spent * (GEAR_WORTH_WEIGHT - 1));
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

describe('Regression Tree', () => {
  const withShards = (n: number) => {
    const s = midRun();
    s.regression.unlocked = true;
    s.regression.shards = n;
    return new Game(s, noCrit);
  };

  it('is a web: Stabilize in the centre, every other node joined to it through the links', () => {
    expect(REGRESSION_TREE.filter((n) => n.ring === 0).map((n) => n.id)).toEqual(['stabilize']);
    const seen = new Set(['stabilize']);
    for (let changed = true; changed; ) {
      changed = false;
      for (const [a, b] of REGRESSION_LINKS)
        if (seen.has(a) !== seen.has(b)) {
          seen.add(a);
          seen.add(b);
          changed = true;
        }
    }
    expect(seen.size).toBe(REGRESSION_TREE.length);
    expect(new Set(REGRESSION_TREE.map((n) => n.id)).size).toBe(REGRESSION_TREE.length);
  });

  it('nodes open outward from Stabilize and cost shards', () => {
    const g = withShards(1000);
    expect(g.regReachable('goldenMemory')).toBe(false);
    expect(g.buyReg('goldenMemory')).toBe(false);
    expect(g.buyReg('stabilize')).toBe(true);
    expect(g.state.regression.shards).toBe(1000 - regNode('stabilize')!.cost);
    expect(g.buyReg('stabilize')).toBe(false); // one rank
    expect(g.buyReg('goldenMemory')).toBe(true);
    expect(g.regNextCost('goldenMemory')).toBe(regCost(regNode('goldenMemory')!, 1));
    expect(g.canBuyReg('unboundTimeline')).toBe(false); // not for sale yet
    const poor = withShards(0);
    expect(poor.buyReg('stabilize')).toBe(false);
  });

  it('Stabilize multiplies gold and cuts training costs; ranks compound', () => {
    const g = withShards(1e6);
    const gold = g.enemyStats('greenSlime').gold;
    const train = g.trainPurchase('main', 1).cost;
    g.buyReg('stabilize');
    expect(g.enemyStats('greenSlime').gold).toBeCloseTo(gold * 100);
    expect(g.trainPurchase('main', 1).cost).toBeCloseTo(train * 0.02);
    g.buyReg('goldenMemory');
    g.buyReg('goldenMemory');
    expect(g.enemyStats('greenSlime').gold).toBeCloseTo(gold * 100 * regNode('goldenMemory')!.mult!.gold! ** 2);
    const dmg = g.damage;
    g.buyReg('honedInstinct');
    expect(g.damage).toBeCloseTo(dmg * 1.15);
  });

  it('shard nodes multiply what a Regression pays', () => {
    const g = withShards(1e6);
    const base = g.shardsNow;
    expect(base).toBeGreaterThan(0);
    g.state.regression.tree = { stabilize: 1, honedInstinct: 1, apexMemory: 1, goldenAge: 1, echoingMemories: 2 };
    const mult = regNode('goldenAge')!.mult!.shards! * regNode('echoingMemories')!.mult!.shards! ** 2;
    expect(regress(g.state, 1).shards).toBe(Math.floor(shardsFor(runWorth(g.state).total) * mult));
  });

  it('the tree survives Regression, and Inheritance starts the next run with gold', () => {
    const g = withShards(1e6);
    g.buyReg('stabilize');
    g.buyReg('goldenMemory');
    g.buyReg('midasEcho');
    g.buyReg('inheritance');
    const { state } = regress(g.state, 1);
    expect(state.regression.tree).toMatchObject({ stabilize: 1, goldenMemory: 1, midasEcho: 1, inheritance: 1 });
    expect(state.gold).toBe(1e6);
  });

  it('Auto Empower & Evolve buys Empower only while one costs at most the chosen share of gold', () => {
    const g = withShards(1e6);
    g.state.flags.empowerIntro = true;
    g.state.regression.tree = { stabilize: 1, autoEmpower: 1 };
    const cost = g.empowerPurchase('greenSlime', 1).cost;
    g.state.gold = cost * 10; // 5% of it won't cover one
    const before = g.state.bestiary.greenSlime.empower;
    g.tick(2.1);
    expect(g.state.bestiary.greenSlime.empower).toBe(before);
    g.setAutoShare(0.5);
    expect(g.state.regression.autoShare).toBe(0.5);
    g.setAutoShare(0.33); // not one of the choices
    expect(g.state.regression.autoShare).toBe(0.5);
    g.tick(2.1);
    expect(g.state.bestiary.greenSlime.empower).toBeGreaterThan(before);
  });
});
