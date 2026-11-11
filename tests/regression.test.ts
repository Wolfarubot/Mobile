import { describe, expect, it } from 'vitest';
import { areaDef, weaponHit, UNBOUND_GEAR, UNBOUND_GEAR_TIERS, gearTier, GEAR_WORTH_WEIGHT, gearCost, gearDef, HUNTERS, MATERIAL_WORTH, MATERIALS, regNode, REGRESSION_LINKS, REGRESSION_TREE, shardsFor, SHARD_POWER, TIME_EATER_GROWTH, timeEaterGrowth, type MaterialId } from '../src/core/balance';
import { Game } from '../src/core/game';
import { Field } from '../src/core/field';
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
    // The paced first run earns about 3.5e30 gold by the Time Eater: about 130 shards.
    expect(shardsFor(3.5e30)).toBeGreaterThanOrEqual(100);
    expect(shardsFor(3.5e30)).toBeLessThanOrEqual(160);
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

  it("a run's worth counts gold earned, materials and gear (weighted), so crafting gains shards", () => {
    // Only the Woods' materials, so the bow's few are visible next to the rest.
    const s = newGame(0);
    s.inventory = [];
    s.gold = 1000;
    s.stats.totalGold = 1000;
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

  it("a run's worth counts the gold earned this run, so spending it (training, Empower) never lowers the shards", () => {
    const s = midRun();
    s.stats.totalGold = 5e9;
    const before = runWorth(s);
    expect(before.gold).toBe(5e9);
    // Every coin on hand spent (on training, Empower...): the worth stays as it was.
    s.gold = 0;
    expect(runWorth(s).total).toBe(before.total);
    // After a Regression only what's earned from then on counts.
    s.regression.unlocked = true;
    const next = regress(s, 1).state;
    expect(next.regression.goldAtStart).toBe(5e9);
    expect(runWorth(next).gold).toBe(0);
    next.stats.totalGold += 1234;
    expect(runWorth(next).gold).toBe(1234);
  });

  it("a save from before a run's start was kept: the first run counts all it earned, a later one its gold on hand", () => {
    const first = midRun();
    first.stats.totalGold = 9e9;
    const raw1 = JSON.parse(serialize(first)) as { regression: Record<string, unknown> };
    delete raw1.regression.goldAtStart;
    expect(runWorth(deserialize(JSON.stringify(raw1))!).gold).toBe(9e9);
    const later = midRun();
    later.stats.totalGold = 9e9;
    later.regression.runs = 2;
    const raw2 = JSON.parse(serialize(later)) as { regression: Record<string, unknown> };
    delete raw2.regression.goldAtStart;
    expect(runWorth(deserialize(JSON.stringify(raw2))!).gold).toBe(later.gold);
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
    // The Account page's records: this run's length and shards.
    expect(s.stats.fastestRun).toBe((1_000_000 - old.regression.runStart) / 1000);
    expect(s.stats.mostShards).toBe(shards);
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
    expect(g.ownsReg('goldenMemory')).toBe(true);
    expect(g.buyReg('goldenMemory')).toBe(false); // bought once
    expect(g.regCostOf('goldenMemory')).toBe(Infinity);
    for (const n of REGRESSION_TREE) expect(n.cost, n.id).toBeGreaterThan(0);
    expect(g.canBuyReg('unbound-forest')).toBe(false); // not for sale yet
    const poor = withShards(0);
    expect(poor.buyReg('stabilize')).toBe(false);
  });

  it('the web shows only what you own and the nodes joined to it; the Unbound timeline stays hidden', () => {
    const g = withShards(0);
    const shown = () => REGRESSION_TREE.filter((n) => g.regVisible(n.id)).map((n) => n.id);
    expect(shown()).toEqual(['stabilize']);
    g.state.regression.tree = { stabilize: 1 };
    expect(shown().sort()).toEqual(['stabilize', 'goldenMemory', 'muscleMemory', 'dreamHunt', 'teemingWilds', 'keenRecall', 'honedInstinct'].sort());
    // The whole inner web owned: the Unbound Woods shows; the nodes past it wait on it.
    g.state.regression.tree = Object.fromEntries(REGRESSION_TREE.filter((n) => n.ring <= 3).map((n) => [n.id, 1]));
    expect(g.regVisible('unbound-forest')).toBe(true);
    expect(['ring-0-1', 'ring-0-2', 'ring-0-3'].map((id) => g.regVisible(id))).toEqual([false, false, false]);
    g.state.regression.tree['unbound-forest'] = 1;
    // Past an area: the inner and outer node beside it and the hub, not the far pair or the next area.
    expect(['ring-0-1', 'ring-0-2', 'ring-0-3'].map((id) => g.regVisible(id))).toEqual([true, true, true]);
    expect(['ring-0-4', 'ring-0-5', 'unbound-glade'].map((id) => g.regVisible(id))).toEqual([false, false, false]);
  });

  it('between two Unbound areas there is no one order: take a node beside the area or go straight for the hub', () => {
    const g = withShards(1e12);
    g.state.regression.tree = Object.fromEntries(REGRESSION_TREE.filter((n) => n.ring <= 3).map((n) => [n.id, 1]));
    g.state.regression.tree['unbound-forest'] = 1;
    const reach = (id: string) => g.regReachable(id);
    // From the Woods: either node beside it, or the hub.
    expect(['ring-0-1', 'ring-0-2', 'ring-0-3', 'ring-0-4', 'ring-0-5'].map(reach)).toEqual([true, true, true, false, false]);
    // The hub opens all four and the next area.
    g.state.regression.tree['ring-0-3'] = 1;
    expect(['ring-0-1', 'ring-0-2', 'ring-0-4', 'ring-0-5', 'unbound-glade'].map(reach)).toEqual([true, true, true, true, true]);
    // Without the hub, a node beside the Woods only leads on to the hub.
    delete g.state.regression.tree['ring-0-3'];
    g.state.regression.tree['ring-0-2'] = 1;
    expect(['ring-0-3', 'ring-0-4', 'ring-0-5', 'unbound-glade'].map(reach)).toEqual([true, false, false, false]);
    // The far pair lead on to the next area too.
    g.state.regression.tree = { 'ring-0-5': 1 };
    expect(reach('unbound-glade')).toBe(true);
    // The hub sits on the areas' own ring, halfway between them.
    expect(regNode('ring-0-3')).toMatchObject({ ring: regNode('unbound-forest')!.ring, angle: -75 });
  });

  it('the Unbound areas sit round a clock face, nodes between them, prices rising all the way round', () => {
    const ring = REGRESSION_TREE.filter((n) => n.id.startsWith('unbound-') || n.id.startsWith('ring-'));
    // Clockwise all the way round, beyond the inner web (the outer ring is at 3).
    for (let i = 1; i < ring.length; i++) expect(ring[i].angle).toBeGreaterThanOrEqual(ring[i - 1].angle);
    for (const n of ring) expect(n.ring).toBeGreaterThan(3.5);
    for (const n of ring) expect(n.ring).toBeLessThan(7);
    // Woods at 12 o'clock, then an hour per area, the Void Rift at 11.
    expect(ring[0].id).toBe('unbound-forest');
    expect(ring.filter((n) => n.area).pop()!.id).toBe('unbound-rift');
    // Past the Rift, the ring's five final nodes fill the gap round to the Woods.
    expect(ring.slice(-5).map((n) => n.id)).toEqual([1, 2, 3, 4, 5].map((j) => `ring-11-${j}`));
    for (const n of ring.slice(-5)) expect(n.angle).toBeGreaterThan(240), expect(n.angle).toBeLessThan(270);
    expect(ring.filter((n) => n.area).map((n) => n.angle)).toEqual(Array.from({ length: 12 }, (_, i) => -90 + 30 * i));
    for (let i = 1; i < ring.length; i++) {
      expect(ring[i].cost).toBeGreaterThan(ring[i - 1].cost);
    }
    // Between two areas, the five nodes in the middle come first.
    expect(ring.findIndex((n) => n.id === 'unbound-glade') - ring.findIndex((n) => n.id === 'unbound-forest')).toBe(6);
  });

  it('the Unbound areas are for sale, each opening the nodes past it; nothing past an area before it', () => {
    const g = withShards(1e15);
    g.state.regression.tree = Object.fromEntries(REGRESSION_TREE.filter((n) => n.ring <= 3).map((n) => [n.id, 1]));
    expect(g.canBuyReg('ring-0-1')).toBe(false);
    expect(g.buyReg('unbound-forest')).toBe(true);
    expect(g.isUnbound('forest')).toBe(true);
    // Past the Woods, straight to the hub, which opens the far pair and the Grove.
    expect(g.buyReg('ring-0-3')).toBe(true);
    expect(g.canBuyReg('ring-0-5')).toBe(true);
    expect(g.canBuyReg('unbound-glade')).toBe(true);
    expect(g.canBuyReg('ring-1-1')).toBe(false); // past the Grove: waits on it
    // All the way round: everything can be bought, and the final five stop short of the Woods.
    for (let pass = 0; pass < 40; pass++) for (const n of REGRESSION_TREE) g.buyReg(n.id);
    expect(REGRESSION_TREE.every((n) => g.ownsReg(n.id))).toBe(true);
    const joined = (a: string, b: string) => REGRESSION_LINKS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    expect(joined('unbound-rift', 'ring-11-3')).toBe(true);
    for (let j = 1; j <= 5; j++) expect(joined(`ring-11-${j}`, 'unbound-forest')).toBe(false);
  });

  it('the Unbound areas run in order round the web, each needing the one before, prices rising', () => {
    const order = ['forest', 'glade', 'graveyard', 'crypt', 'depths', 'caves', 'mines', 'peaks', 'cliffs', 'fortress', 'meteors', 'rift'];
    const nodes = order.map((a) => regNode(`unbound-${a}`)!);
    nodes.forEach((n, i) => {
      expect(n.area).toBe(order[i]);
      expect(n.needs).toBe(i ? `unbound-${order[i - 1]}` : undefined);
      if (i) expect(n.cost).toBeGreaterThan(nodes[i - 1].cost);
    });
    // Each one is reachable through the web from the Woods.
    const seen = new Set(['unbound-forest']);
    for (let changed = true; changed; ) {
      changed = false;
      for (const [a, b] of REGRESSION_LINKS) {
        if (seen.has(a) === seen.has(b)) continue;
        const next = regNode(seen.has(a) ? b : a)!;
        // Nodes not for sale yet (Self-Forging) mustn't be the only way round.
        if (next.soon && !next.area) continue;
        seen.add(next.id);
        changed = true;
      }
    }
    for (const n of nodes) expect(seen.has(n.id), n.id).toBe(true);
  });

  it('Kindred Spirits keeps Guild Hunters recruited through Regression', () => {
    const g = withShards(0);
    g.state.regression.tree = { [REGRESSION_TREE.find((n) => n.flag === 'keepHunters')!.id]: 1 };
    expect(regress(g.state, 1).state.hunters.ranger).toMatchObject({ recruited: true, station: null, trains: 120 });
  });

  it('Stabilize multiplies gold and cuts training costs; nodes stack', () => {
    const g = withShards(1e6);
    const gold = g.enemyStats('greenSlime').gold;
    const train = g.trainPurchase('main', 1).cost;
    g.buyReg('stabilize');
    expect(g.enemyStats('greenSlime').gold).toBeCloseTo(gold * 100);
    expect(g.trainPurchase('main', 1).cost).toBeCloseTo(train * 0.02);
    g.buyReg('goldenMemory');
    expect(g.enemyStats('greenSlime').gold).toBeCloseTo(gold * 100 * regNode('goldenMemory')!.mult!.gold!);
    const dmg = g.damage;
    g.buyReg('honedInstinct');
    expect(g.damage).toBeCloseTo(dmg * regNode('honedInstinct')!.mult!.damage!);
  });

  it('shard nodes multiply what a Regression pays', () => {
    const g = withShards(1e6);
    const base = g.shardsNow;
    expect(base).toBeGreaterThan(0);
    g.state.regression.tree = { stabilize: 1, honedInstinct: 1, apexMemory: 1, goldenAge: 1, echoingMemories: 1 };
    const mult = regNode('goldenAge')!.mult!.shards! * regNode('echoingMemories')!.mult!.shards!;
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
    expect(state.gold).toBe(regNode('inheritance')!.startGold);
  });

  it('Perpetual Growth buys Empower only while one costs at most the chosen share of gold', () => {
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

describe('The Time Eater', () => {
  it('grows by ×20 more with every Regression (×20, ×40, ×60...); other Guardians stay as they were', () => {
    const at = (area: 'rift' | 'meteors', runs: number) => {
      const s = newGame(0);
      s.area = area;
      s.regression.runs = runs;
      return new Game(s, noCrit).guardianHp;
    };
    expect(at('rift', 1) / at('rift', 0)).toBeCloseTo(TIME_EATER_GROWTH, 6);
    expect(at('rift', 2) / at('rift', 0)).toBeCloseTo(TIME_EATER_GROWTH * 2, 6);
    expect(at('rift', 3) / at('rift', 0)).toBeCloseTo(TIME_EATER_GROWTH * 3, 6);
    expect([1, 2, 3].map(timeEaterGrowth)).toEqual([20, 40, 60]);
    expect(at('meteors', 2)).toBe(at('meteors', 0));
  });

  it('is only driven back at half its health, until the Unbound Void Rift is yours: then it can be slain', () => {
    const run = (mortal: boolean) => {
      const s = newGame(0);
      s.area = 'rift';
      s.areas.rift.unlocked = true;
      if (mortal) s.regression.tree['unbound-rift'] = 1;
      const g = new Game(s, noCrit);
      const f = new Field(g);
      f.setView(390, 420);
      const events: Array<{ type: string; slain?: boolean }> = [];
      g.on((e) => events.push(e as { type: string; slain?: boolean }));
      s.areas.rift.kills = 1e12;
      s.events.shadowTide.completed = 1;
      s.energy = 10;
      expect(g.challengeGuardian()).toBe(true);
      for (let i = 0; i < 5 && !f.enemies.some((e) => e.boss); i++) f.update(0.05);
      const boss = f.enemies.find((e) => e.boss)!;
      expect(boss?.type).toBe('timeEater');
      // A blow that takes it just past half its health.
      boss.hp = boss.maxHp * 0.5 + 0.01;
      f.tap(boss.x, boss.y);
      return { left: boss.hp, events };
    };
    const driven = run(false);
    expect(driven.left).toBe(0);
    expect(driven.events.find((e) => e.type === 'finalGuardian')).toEqual({ type: 'finalGuardian', slain: false });
    // With the Unbound Void Rift it fights on past half, to the death.
    const mortal = run(true);
    expect(mortal.left).toBeGreaterThan(0);
    expect(mortal.events.some((e) => e.type === 'finalGuardian')).toBe(false);
  });
});


describe('Unbound areas', () => {
  const withShards = (n: number) => {
    const s = midRun();
    s.regression.unlocked = true;
    s.regression.shards = n;
    return new Game(s, noCrit);
  };

  it('an Unbound Woods: area-13 monsters dropping Unbound materials and loot; Unbound gear and materials last through Regression', () => {
    const g = withShards(1e15);
    const hp = g.enemyStats('greenSlime').hp;
    const gold = g.enemyStats('greenSlime').gold;
    g.state.regression.tree = { ...Object.fromEntries(REGRESSION_TREE.filter((n) => n.ring <= 3).map((n) => [n.id, 1])), 'unbound-forest': 1 };
    expect(g.isUnbound('forest')).toBe(true);
    expect(g.areaStats('forest').name).toBe('Unbound Wandering Woods');
    // Stronger than the Void Rift's monsters, and richer.
    expect(g.enemyStats('greenSlime').hp / hp).toBeGreaterThan(areaDef('rift').hp);
    expect(g.enemyStats('greenSlime').gold / gold).toBeGreaterThan(areaDef('rift').gold);
    expect(g.enemyStats('greenSlime').material).toBe('u_goo');
    expect(g.isUnbound('glade')).toBe(false);
    expect(g.enemyStats('pixie').material).not.toMatch(/^u_/);
    // Loot here is Unbound gear: the same piece, UNBOUND_GEAR_TIERS tiers stronger.
    expect(gearDef(g.dropLoot('forest', true).gear).unboundOf).toBeTruthy();
    expect(gearTier(gearDef('u_slimeSword'))).toBeCloseTo(gearTier(gearDef('slimeSword')) + UNBOUND_GEAR_TIERS, 2);
    expect(weaponHit(gearDef('u_slimeSword'), 1)).toBeGreaterThan(weaponHit(gearDef('slimeSword'), 1) * 5);
    // One more built-in effect than its original, on every piece (so even Common gear has one).
    for (const u of UNBOUND_GEAR) expect(u.builtIn?.length ?? 0).toBe((gearDef(u.unboundOf!).builtIn?.length ?? 0) + 1);
    // Through a Regression: Unbound materials and gear stay (worn pieces stay worn); ordinary ones go.
    g.state.materials.u_goo = 50;
    g.state.materials.goo = 50;
    const uid = g.state.nextGearUid++;
    g.state.inventory.push({ uid, base: 'u_slimeSword', stars: 2, invested: { gold: 0, mats: {} } });
    g.equip('main', 0, uid);
    g.state.regression.unlocked = true;
    const next = regress(g.state, 1000).state;
    expect(next.materials.u_goo).toBe(50);
    expect(next.materials.goo).toBe(0);
    expect(next.inventory.find((it) => it.uid === uid)?.stars).toBe(2);
    expect(next.equipment.main?.[0]).toBe(uid);
    // And it survives a save.
    const back = deserialize(serialize(next))!;
    expect(back.materials.u_goo).toBe(50);
    expect(back.inventory.some((it) => it.base === 'u_slimeSword')).toBe(true);
  });
});
