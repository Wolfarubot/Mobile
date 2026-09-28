import { describe, expect, it } from 'vitest';
import {
  areaDef,
  enemyDef,
  enemyUnlockCost,
  GEAR_COST_GROWTH,
  GUARDIAN_TIME,
  hunterDef,
  itemCost,
  itemDef,
  MAX_TICKETS,
  OFFLINE_CAP_SEC,
  STATION_EFFICIENCY,
  STUN_IMMUNITY,
  TICKET_REGEN_SEC,
} from '../src/core/balance';
import { Field, type Enemy } from '../src/core/field';
import { Game } from '../src/core/game';
import { deserialize, newGame, serialize } from '../src/core/state';

const noCrit = () => 0.99;

const enemy = (over: Partial<Enemy>): Enemy => ({
  id: 1,
  type: 'greenSlime',
  x: 100,
  y: 0,
  hp: 1,
  maxHp: 1,
  r: 10,
  speed: 0,
  boss: false,
  fleeing: false,
  flash: 0,
  kx: 0,
  ky: 0,
  phase: 0,
  ...over,
});

/** A game with plenty of gold and a strong Hunter. */
function rich(): Game {
  const s = newGame(0);
  s.gold = 1e15;
  s.upgrades.power = 200;
  return new Game(s, noCrit);
}

describe('Areas', () => {
  it('starts in the forest with only its first enemy', () => {
    const g = new Game(newGame(0), noCrit);
    expect(g.area).toBe('forest');
    expect(g.unlockedAreas).toEqual(['forest']);
    expect(g.roster().map((e) => e.id)).toEqual(['greenSlime']);
    expect(g.travel('graveyard')).toBe(false);
  });

  it('mastery kills make the Guardian available; beating it permanently unlocks the next area', () => {
    const g = new Game(newGame(0), noCrit);
    expect(g.guardianReady).toBe(false);
    for (let i = 0; i < areaDef('forest').mastery; i++) g.registerKill('greenSlime', false);
    expect(g.guardianReady).toBe(true);
    expect(g.challengeGuardian()).toBe(true);
    g.bossSpawned();
    g.registerKill(g.guardianType, true);
    expect(g.isAreaUnlocked('graveyard')).toBe(true);
    expect(g.lockedNext).toBeNull();
    expect(g.state.stats.guardians).toBe(1);
    // Travel both ways; nothing gets re-locked.
    expect(g.travel('graveyard')).toBe(true);
    expect(g.roster().map((e) => e.id)).toEqual(['skeleton']);
    expect(g.travel('forest')).toBe(true);
    expect(g.isAreaUnlocked('graveyard')).toBe(true);
  });

  it('a Guardian that times out just leaves; you can try again', () => {
    const s = newGame(0);
    s.areas.forest.kills = 999;
    const g = new Game(s, noCrit);
    g.challengeGuardian();
    g.bossSpawned();
    g.tick(GUARDIAN_TIME + 1);
    expect(g.guardianActive).toBe(false);
    expect(g.isAreaUnlocked('graveyard')).toBe(false);
    expect(g.area).toBe('forest');
    expect(g.challengeGuardian()).toBe(true);
  });

  it('the Guardian is tuned to the next area and later areas are tougher and richer', () => {
    const g = new Game(newGame(0), noCrit);
    expect(g.guardianHp).toBeGreaterThan(areaDef('graveyard').hp);
    expect(g.enemyStats('skeleton').hp).toBeGreaterThan(g.enemyStats('greenSlime').hp * 10);
    expect(g.enemyStats('skeleton').gold).toBeGreaterThan(g.enemyStats('greenSlime').gold * 10);
  });
});

describe('Enemies & archetypes', () => {
  it("kills drop the enemy's own material and count toward its area's mastery", () => {
    const g = new Game(newGame(0), () => 0);
    g.registerKill('wolf', false);
    expect(g.state.materials.pelt).toBe(1);
    expect(g.state.areas.forest.kills).toBe(1);
  });

  it('bestiary: unlock enemies in unlocked areas; swarm and bounty change their stats', () => {
    const g = rich();
    expect(g.unlockEnemy('zombie')).toBe(false); // graveyard still locked
    const spawn = g.spawnRate;
    expect(g.unlockEnemy('wolf')).toBe(true);
    expect(g.spawnRate).toBeGreaterThan(spawn);
    expect(g.unlockedMaterials).toEqual(['goo', 'pelt']);

    const before = g.enemyStats('wolf');
    g.buyEnemyUpgrade('wolf', 'swarm');
    g.buyEnemyUpgrade('wolf', 'bounty');
    const after = g.enemyStats('wolf');
    expect(after.spawnRate).toBeGreaterThan(before.spawnRate);
    expect(after.gold).toBeGreaterThan(before.gold);
    expect(after.speed).toBeGreaterThan(before.speed);
    expect(enemyUnlockCost(enemyDef('greenSlime'))).toBe(0);
  });

  it('enemies belong to archetypes: slimes are slimes, skeletons and zombies are undead', () => {
    expect(enemyDef('greenSlime').archetype).toBe('slime');
    expect(enemyDef('redSlime').archetype).toBe('slime');
    expect(enemyDef('skeleton').archetype).toBe('undead');
    expect(enemyDef('zombie').archetype).toBe('undead');
    expect(enemyDef('wolf').archetype).toBe('beast');
  });
});

describe('Hunters', () => {
  it('recruiting needs the Hunter\'s area unlocked and gold', () => {
    const g = rich();
    expect(g.recruit('gravewarden')).toBe(false); // graveyard locked
    expect(g.recruit('alchemist')).toBe(true);
    expect(g.state.hunters.alchemist.recruited).toBe(true);
    expect(g.recruit('alchemist')).toBe(false);
  });

  it('archetype bane multiplies damage only against that archetype', () => {
    const g = rich();
    g.recruit('alchemist');
    g.state.hunters.alchemist.level = 10;
    expect(g.shotDamage('alchemist', 'slime')).toBeCloseTo(g.shotDamage('alchemist', 'beast') * 3);
  });

  it('one Hunter per area; stationing swaps; stationed Hunters farm in the background', () => {
    const g = rich();
    g.recruit('alchemist');
    g.recruit('ranger');
    g.state.areas.graveyard.unlocked = true;
    g.state.hunters.alchemist.level = 50;
    expect(g.station('alchemist', 'forest')).toBe(true);
    expect(g.station('ranger', 'forest')).toBe(true);
    expect(g.stationedAt('forest')).toBe('ranger');
    expect(g.state.hunters.alchemist.station).toBeNull();

    g.station('alchemist', 'forest');
    g.travel('graveyard'); // you leave; Mira keeps hunting slimes in the forest
    const gold = g.state.gold;
    const kills = g.state.areas.forest.kills;
    for (let i = 0; i < 600; i++) g.tick(0.1);
    expect(g.state.gold).toBeGreaterThan(gold);
    expect(g.state.areas.forest.kills).toBeGreaterThan(kills);
    expect(g.state.materials.goo).toBeGreaterThan(0);
  });

  it('a Hunter stationed where you are fights on the field instead of farming twice', () => {
    const g = rich();
    g.recruit('alchemist');
    g.station('alchemist', 'forest');
    expect(g.helpersHere).toEqual(['alchemist']);
    const gold = g.state.gold;
    g.tick(10);
    expect(g.state.gold).toBe(gold); // no background accrual for your own area
  });

  it('farm rates respect the spawn rate and station efficiency, and weak Hunters let enemies escape', () => {
    const g = rich();
    g.recruit('alchemist');
    g.state.hunters.alchemist.level = 300;
    const strong = g.farmRates('forest', ['alchemist'], STATION_EFFICIENCY);
    expect(strong.killsTotal).toBeCloseTo(g.spawnRate * STATION_EFFICIENCY);
    g.state.hunters.alchemist.level = 0;
    g.state.items.whetstone = 0;
    const s = newGame(0);
    s.gold = 1e15;
    const weakGame = new Game(s, noCrit);
    weakGame.recruit('alchemist');
    weakGame.state.areas.graveyard.unlocked = true;
    const weak = weakGame.farmRates('graveyard', ['alchemist'], 1);
    expect(weak.killsTotal).toBeLessThan(weakGame.roster('graveyard')[0].spawnRate * 0.1);
  });

  it('gold and drop perks boost their own kills', () => {
    const g = rich();
    g.state.areas.graveyard.unlocked = true;
    g.recruit('prospector');
    const plain = g.registerKill('greenSlime', false, 'main').gold;
    expect(g.registerKill('greenSlime', false, 'prospector').gold).toBeCloseTo(plain * 1.75);
  });
});

describe('Shops', () => {
  it('training raises combat stats and respects max levels', () => {
    const g = rich();
    const dmg = g.damage;
    expect(g.buyUpgrade('power')).toBe(true);
    expect(g.damage).toBeGreaterThan(dmg);
    g.state.buyAmount = 'max';
    g.buyUpgrade('haste');
    expect(g.state.upgrades.haste).toBe(60);
    expect(g.buyUpgrade('haste')).toBe(false);
  });

  it('crafting spends materials and items boost every Hunter', () => {
    const g = rich();
    g.recruit('alchemist');
    const cost = itemCost(itemDef('whetstone'), 0).goo!;
    g.state.materials.goo = cost;
    const helperDmg = g.shotDamage('alchemist');
    expect(g.craft('whetstone')).toBe(true);
    expect(g.state.materials.goo).toBe(0);
    expect(g.shotDamage('alchemist')).toBeGreaterThan(helperDmg);
  });

  it('Steady Nerves and Bone Mail shorten stuns', () => {
    const g = new Game(newGame(0), noCrit);
    const base = g.stunTime();
    g.state.upgrades.nerves = 10;
    g.state.items.bonemail = 2;
    expect(g.stunTime()).toBeLessThan(base * 0.6);
    expect(g.stunTime(true)).toBeGreaterThan(g.stunTime());
  });

  it('bullet hell upgrades cost stars', () => {
    const g = new Game(newGame(0), noCrit);
    expect(g.buyBh('shield')).toBe(false);
    g.state.stars = 100;
    expect(g.buyBh('shield')).toBe(true);
    expect(g.state.bh.shield).toBe(1);
  });
});

describe('Equipment', () => {
  /** A game with plenty of materials and some Hunters recruited. */
  const stocked = () => {
    const s = newGame(0);
    s.gold = 1e15;
    for (const m of Object.keys(s.materials) as Array<keyof typeof s.materials>) s.materials[m] = 1e6;
    for (const a of ['graveyard', 'caves'] as const) s.areas[a].unlocked = true;
    const g = new Game(s, noCrit);
    for (const id of ['glimmer', 'lance', 'wilhelm', 'ranger'] as const) g.recruit(id);
    return g;
  };

  it('crafting puts a level-1 piece in the inventory and spends materials; upgrading raises it', () => {
    const g = stocked();
    const goo = g.state.materials.goo;
    const bow = g.craftGear('huntingBow')!;
    expect(bow.level).toBe(1);
    expect(g.state.inventory).toHaveLength(1);
    expect(g.state.materials.goo).toBeLessThan(goo);
    expect(g.upgradeGear(bow.uid)).toBe(true);
    expect(g.gearItem(bow.uid)!.level).toBe(2);
    const poor = new Game(newGame(0), noCrit);
    expect(poor.craftGear('huntingBow')).toBeNull();
  });

  it('every Hunter has 3 slots with armor; Lance melee, Wilhelm two weapons, Glimmer two accessories', () => {
    const g = stocked();
    const kinds = (who: Parameters<Game['slotsOf']>[0]) => g.slotsOf(who).map((sl) => sl.kind);
    expect(kinds('main')).toEqual(['weapon', 'armor', 'accessory']);
    expect(kinds('ranger')).toEqual(['weapon', 'armor', 'accessory']);
    expect(kinds('lance')).toEqual(['melee', 'armor', 'accessory']);
    expect(kinds('wilhelm')).toEqual(['weapon', 'weapon', 'armor']);
    expect(kinds('glimmer')).toEqual(['armor', 'accessory', 'accessory']);
    for (const h of ['main', 'glimmer', 'lance', 'wilhelm', 'ranger'] as const) expect(kinds(h)).toContain('armor');
  });

  it('gear only fits matching slots, and moves between Hunters instead of being shared', () => {
    const g = stocked();
    const bow = g.craftGear('huntingBow')!;
    const spear = g.craftGear('ironSpear')!;
    expect(g.equip('lance', 0, bow.uid)).toBe(false); // Lance's first slot is melee
    expect(g.equip('lance', 0, spear.uid)).toBe(true);
    expect(g.equip('main', 0, bow.uid)).toBe(true);
    expect(g.equip('ranger', 0, bow.uid)).toBe(true);
    expect(g.equipped('main')[0]).toBeNull(); // moved to Rin
    expect(g.wearerOf(bow.uid)).toEqual({ who: 'ranger', slot: 0 });
    expect(g.equip('gravewarden', 1, null)).toBe(false); // not recruited
  });

  it('gear changes combat stats', () => {
    const g = stocked();
    const dmg = g.damage;
    const bow = g.craftGear('huntingBow')!;
    g.equip('main', 0, bow.uid);
    expect(g.damage).toBeCloseTo(dmg * 1.2);
    const stun = g.stunTime();
    const vest = g.craftGear('leatherVest')!;
    g.equip('main', 1, vest.uid);
    expect(g.stunTime()).toBeLessThan(stun);
    const lens = g.craftGear('hawkeyeLens')!;
    const range = g.shooterRange('main');
    g.equip('main', 2, lens.uid);
    expect(g.shooterRange('main')).toBe(range + 20);
  });

  it("Glimmer's two accessories stack; Wilhelm's long and short weapons each power one mode", () => {
    const g = stocked();
    const a = g.craftGear('emberOrb')!;
    const b = g.craftGear('emberOrb')!;
    g.equip('glimmer', 1, a.uid);
    g.equip('glimmer', 2, b.uid);
    expect(g.radiusMult('glimmer')).toBeCloseTo(1.24);

    const rifle = g.craftGear('frostRifle')!;
    const bow = g.craftGear('huntingBow')!;
    const baseLong = g.shotDamage('wilhelm', undefined, 'long');
    const baseShort = g.shotDamage('wilhelm', undefined, 'short');
    g.equip('wilhelm', 0, rifle.uid); // long-range slot
    g.equip('wilhelm', 1, bow.uid); // short-range slot
    expect(g.shotDamage('wilhelm', undefined, 'long')).toBeCloseTo(baseLong * 1.45);
    expect(g.shotDamage('wilhelm', undefined, 'short')).toBeCloseTo(baseShort * 1.2);
    expect(g.shooterRange('wilhelm', 'long')).toBe(g.shooterRange('wilhelm', 'short') + 15);
  });

  it('armor shields add Paladin-style charges', () => {
    const g = stocked();
    const plate = g.craftGear('bonePlate')!;
    while (g.gearItem(plate.uid)!.level < 5) g.upgradeGear(plate.uid);
    g.equip('ranger', 1, plate.uid);
    expect(g.guardOf('ranger')).toBe(1);
    expect(g.guardOf('lance')).toBe(3);
  });

  it('salvaging refunds half the materials spent and unequips it', () => {
    const g = stocked();
    const bow = g.craftGear('huntingBow')!;
    g.upgradeGear(bow.uid);
    g.equip('main', 0, bow.uid);
    const goo = g.state.materials.goo;
    const refund = g.salvageValue(bow.uid).goo!;
    expect(refund).toBe(Math.floor((8 + Math.ceil(8 * GEAR_COST_GROWTH)) * 0.5));
    expect(g.salvageGear(bow.uid)).toBe(true);
    expect(g.state.materials.goo).toBe(goo + refund);
    expect(g.state.inventory).toHaveLength(0);
    expect(g.equipped('main')[0]).toBeNull();
  });

  it('inventory and equipment survive a save round-trip; dangling references are dropped', () => {
    const g = stocked();
    const bow = g.craftGear('huntingBow')!;
    g.equip('ranger', 0, bow.uid);
    const back = deserialize(serialize(g.state))!;
    expect(back.inventory).toEqual([bow]);
    expect(back.equipment.ranger?.[0]).toBe(bow.uid);
    const broken = JSON.parse(serialize(g.state));
    broken.inventory = [];
    const fixed = deserialize(JSON.stringify(broken))!;
    expect(fixed.equipment.ranger?.[0]).toBeNull();
  });
});

describe('Stuns in background & offline farming', () => {
  it('a Hunter strong enough for an area is never knocked out', () => {
    const s = newGame(0);
    s.upgrades.power = 150;
    const g = new Game(s, noCrit);
    const r = g.farmRates('forest', ['main'], 1);
    expect(r.stuns.main).toBe(0);
    expect(r.stunned.main).toBe(0);
    expect(r.killsTotal).toBeCloseTo(g.spawnRate);
  });

  it('a Hunter too weak for a new area spends most of the time stunned and kills little', () => {
    const s = newGame(0);
    s.upgrades.power = 20; // comfortable in the forest...
    s.areas.graveyard.unlocked = true;
    const g = new Game(s, noCrit);
    const forest = g.farmRates('forest', ['main'], 1);
    const graveyard = g.farmRates('graveyard', ['main'], 1);
    expect(forest.stunned.main).toBe(0);
    expect(graveyard.stunned.main).toBeGreaterThan(0.4); // ...but swamped in the graveyard
    expect(graveyard.stuns.main).toBeGreaterThan(0);
    const spawns = g.roster('graveyard').reduce((sum, e) => sum + e.spawnRate, 0);
    expect(graveyard.killsTotal).toBeLessThan(spawns * 0.25);
  });

  it("going offline in an area you can't handle pays less than farming one you can", () => {
    const setup = (area: 'forest' | 'graveyard') => {
      const s = newGame(0);
      s.upgrades.power = 20;
      s.areas.graveyard.unlocked = true;
      s.area = area;
      return new Game(s, noCrit).applyOffline(8 * 3600 * 1000);
    };
    const easy = setup('forest');
    const hard = setup('graveyard');
    expect(hard.knockouts).toBeGreaterThan(1000);
    expect(easy.knockouts).toBe(0);
    expect(hard.gold).toBeLessThan(easy.gold); // despite graveyard monsters paying 25x more each
  });

  it('knockouts are reported per Hunter, only when they happened', () => {
    const s = newGame(0);
    s.gold = 1e12;
    s.upgrades.power = 150;
    s.areas.graveyard.unlocked = true;
    const g = new Game(s, noCrit);
    g.recruit('alchemist'); // level 0: hopeless in the graveyard
    g.station('alchemist', 'graveyard');
    const r = g.applyOffline(3600 * 1000);
    const forest = r.areas.find((a) => a.area === 'forest')!;
    const graveyard = r.areas.find((a) => a.area === 'graveyard')!;
    expect(forest.knockouts.main).toBeUndefined(); // strong enough: nothing to report
    expect(graveyard.knockouts.alchemist).toBeGreaterThan(0);
    expect(r.knockouts).toBe(graveyard.knockouts.alchemist);
  });

  it("Lance's shield soaks hits: less time stunned than the same Hunter without it", () => {
    const s = newGame(0);
    s.gold = 1e12;
    s.areas.graveyard.unlocked = true;
    const g = new Game(s, noCrit);
    g.recruit('lance');
    const def = hunterDef('lance');
    const guard = def.guard;
    const stunnedAt = (withShield: boolean) => {
      def.guard = withShield ? guard : 0;
      const v = g.farmRates('graveyard', ['lance'], 1).stunned.lance!;
      def.guard = guard;
      return v;
    };
    // Find a strength where he's pressed but not hopeless in the graveyard.
    let level = 0;
    while (level < 400 && !(stunnedAt(false) > 0.05 && stunnedAt(false) < 0.9)) g.state.hunters.lance.level = ++level;
    const shielded = stunnedAt(true);
    const bare = stunnedAt(false);
    expect(bare).toBeGreaterThan(0);
    expect(shielded).toBeLessThan(bare);
  });
});

describe('Offline & minigames', () => {
  it('pays out for you and every stationed Hunter, capped, and regenerates tickets', () => {
    const s = newGame(0);
    s.upgrades.power = 30;
    s.tickets = 0;
    s.gold = 1e9;
    const g = new Game(s, noCrit);
    g.state.areas.graveyard.unlocked = true;
    g.recruit('gravewarden');
    g.state.hunters.gravewarden.level = 150;
    g.station('gravewarden', 'graveyard');
    const gold = g.state.gold;
    const r = g.applyOffline(24 * 3600 * 1000);
    expect(r.seconds).toBe(OFFLINE_CAP_SEC);
    expect(r.gold).toBeGreaterThan(0);
    expect(g.state.gold).toBeCloseTo(gold + r.gold);
    expect(r.materials.goo).toBeGreaterThan(0); // you, in the forest
    expect(r.materials.bone).toBeGreaterThan(0); // Alric, in the graveyard
    expect(g.state.tickets).toBe(MAX_TICKETS);

    const g2 = new Game({ ...newGame(0), tickets: 0 }, noCrit);
    g2.applyOffline(TICKET_REGEN_SEC * 1000 * 1.5);
    expect(g2.state.tickets).toBe(1);
  });

  it('minigame payouts grant gold, frenzy, materials and stars', () => {
    const g = new Game(newGame(0), noCrit);
    const r = g.grantMinigame({ id: 'skysiege', score: 1234, units: 1000, materials: { goo: 7, pelt: 2 }, stars: 5 });
    expect(r.gold).toBeGreaterThan(0);
    expect(g.state.frenzyTime).toBe(300);
    expect(g.state.materials.goo).toBe(7);
    expect(g.state.stars).toBe(5);
    expect(g.state.stats.best.skysiege).toBe(1234);
  });
});

describe('Field', () => {
  const run = (g: Game, f: Field, seconds: number) => {
    for (let i = 0; i < seconds * 30; i++) {
      g.tick(1 / 30);
      f.update(1 / 30);
    }
  };

  it('spawns a horde, shoots it down and reports kills', () => {
    const g = new Game(newGame(0), noCrit);
    g.state.upgrades.power = 30;
    const f = new Field(g);
    f.setView(390, 420);
    run(g, f, 20);
    const kills = f.drainEvents().filter((e) => e.type === 'kill').length;
    expect(kills).toBeGreaterThan(5);
    expect(g.state.stats.totalKills).toBe(kills);
  });

  it('an enemy reaching the Hunter stuns them and flees; unkilled runners escape', () => {
    const g = new Game(newGame(0), noCrit);
    g.state.areas.graveyard.unlocked = true;
    g.travel('graveyard'); // far too tough for a fresh Hunter
    const f = new Field(g);
    f.setView(390, 420);
    let stunned = false;
    for (let i = 0; i < 40 * 30; i++) {
      g.tick(1 / 30);
      f.update(1 / 30);
      stunned ||= f.stunned;
    }
    expect(stunned).toBe(true);
    expect(g.state.stats.escaped).toBeGreaterThan(0);
    expect(g.area).toBe('graveyard'); // no retreat, ever
  });

  it('the Hunter cannot shoot while stunned and is briefly immune afterwards', () => {
    const g = new Game(newGame(0), noCrit);
    const f = new Field(g);
    f.setView(390, 420);
    f.enemies.push(enemy({ id: 1, x: 20, hp: 1e9, maxHp: 1e9, speed: 40 }));
    f.update(1 / 30);
    expect(f.stunned).toBe(true);
    expect(f.enemies[0].fleeing).toBe(true);
    const bullets = f.bullets.length;
    f.update(0.3);
    expect(f.bullets.length).toBe(bullets);
    f.update(g.stunTime());
    expect(f.stunned).toBe(false);
    expect(f.immune).toBeCloseTo(STUN_IMMUNITY, 5);
    f.enemies.push(enemy({ id: 2, x: -20, hp: 1e9, maxHp: 1e9, speed: 40 }));
    f.update(1 / 30);
    expect(f.stunned).toBe(false);
    expect(f.enemies.find((e) => e.id === 2)?.fleeing).toBe(true);
  });

  it('challenging the Guardian spawns it; it stuns longer and bounces off instead of fleeing', () => {
    const s = newGame(0);
    s.areas.forest.kills = 999;
    const g = new Game(s, noCrit);
    const f = new Field(g);
    f.setView(390, 420);
    g.challengeGuardian();
    f.update(1 / 30);
    const boss = f.enemies.find((e) => e.boss)!;
    expect(boss.maxHp).toBe(g.guardianHp);
    expect(g.bossAlive).toBe(true);
    boss.x = 30;
    boss.y = 0;
    f.update(1 / 30);
    expect(f.stun).toBeCloseTo(g.stunTime(true), 1);
    expect(boss.fleeing).toBe(false);
    expect(boss.kx).toBeGreaterThan(0);
  });

  /** A field with one Hunter stationed in the forest (you're there too). */
  const withHelper = (id: Parameters<Game['recruit']>[0]) => {
    const g = rich();
    g.state.areas.graveyard.unlocked = true;
    g.state.areas.caves.unlocked = true;
    g.recruit(id);
    g.state.hunters[id].level = 10;
    g.station(id, 'forest');
    const f = new Field(g);
    f.setView(390, 420);
    g.state.bestiary.greenSlime.unlocked = false; // no random spawns: tests place enemies by hand
    return { g, f };
  };
  const tough = (over: Partial<Enemy>) => enemy({ hp: 1e12, maxHp: 1e12, ...over });

  it('the view is zoomed out: enemies spawn far away and walk in', () => {
    const g = new Game(newGame(0), noCrit);
    const f = new Field(g);
    f.setView(390, 420);
    for (let i = 0; i < 60; i++) f.update(1 / 30);
    const d = Math.min(...f.enemies.map((e) => Math.hypot(e.x, e.y)));
    expect(d).toBeGreaterThan(300); // well beyond the old ~200px edge
  });

  it('your Hunter only shoots enemies within range', () => {
    const g = new Game(newGame(0), noCrit);
    g.state.bestiary.greenSlime.unlocked = false;
    const f = new Field(g);
    f.setView(390, 420);
    f.enemies.push(tough({ id: 1, x: g.shooterRange('main') + 60 }));
    for (let i = 0; i < 20; i++) f.update(1 / 30);
    expect(f.bullets.length).toBe(0);
    f.enemies[0].x = g.shooterRange('main') - 20;
    for (let i = 0; i < 20; i++) f.update(1 / 30);
    expect(f.bullets.length).toBeGreaterThan(0);
  });

  it('Mira lobs potions that leave damaging puddles', () => {
    const { f } = withHelper('alchemist');
    f.enemies.push(tough({ id: 1, x: -150, y: 150 }));
    let puddle = false;
    for (let i = 0; i < 60; i++) {
      f.update(1 / 30);
      puddle ||= f.puddles.some((p) => p.shooter === 'alchemist');
    }
    expect(f.helpers.map((h) => h.id)).toEqual(['alchemist']);
    expect(puddle).toBe(true);
    expect(f.enemies[0].hp).toBeLessThan(1e12);
  });

  it("Glimmer's fireballs explode and hit every enemy nearby", () => {
    const { f } = withHelper('glimmer');
    for (let i = 0; i < 3; i++) f.enemies.push(tough({ id: i + 1, x: -55 + (i - 1) * 20, y: -150 }));
    for (let i = 0; i < 90; i++) f.update(1 / 30);
    expect(f.drainEvents().some((e) => e.type === 'explode')).toBe(true);
    expect(f.enemies.every((e) => e.hp < 1e12)).toBe(true);
  });

  it("Lance's shield blocks hits before he is stunned, then recharges", () => {
    const { f } = withHelper('lance');
    f.update(1 / 30);
    const lance = f.helpers[0];
    expect(lance.guard).toBe(3);
    for (let i = 0; i < 3; i++) {
      f.enemies = [tough({ id: 10 + i, x: lance.x - 20, y: lance.y + 5, speed: 40 })];
      f.update(1 / 30);
    }
    expect(lance.guard).toBe(0);
    expect(lance.stun).toBe(0);
    f.enemies = [tough({ id: 20, x: lance.x - 20, y: lance.y + 5, speed: 40 })];
    f.update(1 / 30);
    expect(lance.stun).toBeGreaterThan(0);
    expect(f.enemies[0].fleeing).toBe(true);
    f.enemies = [];
    for (let i = 0; i < 5 * 30; i++) f.update(1 / 30);
    expect(lance.guard).toBeGreaterThan(0);
  });

  it('Wilhelm snipes from long range and switches to akimbo pistols up close', () => {
    const { f } = withHelper('wilhelm');
    f.enemies.push(tough({ id: 1, x: -55, y: -480 }));
    for (let i = 0; i < 90; i++) f.update(1 / 30);
    expect(f.helpers[0].akimbo).toBe(false);
    expect(f.drainEvents().some((e) => e.type === 'beam')).toBe(true);
    expect(f.enemies[0].hp).toBeLessThan(1e12);

    f.enemies = [tough({ id: 2, x: -55, y: -30 })];
    for (let i = 0; i < 10; i++) f.update(1 / 30);
    expect(f.helpers[0].akimbo).toBe(true);
    expect(f.bullets.some((b) => b.kind === 'pistol')).toBe(true);
  });

  it('stationed Hunters can be stunned too, and stop attacking while dazed', () => {
    const { f } = withHelper('ranger');
    f.update(1 / 30);
    const rin = f.helpers[0];
    f.enemies = [tough({ id: 1, x: rin.x - 20, y: rin.y + 5, speed: 40 })];
    f.update(1 / 30);
    expect(rin.stun).toBeGreaterThan(0);
    const before = f.bullets.filter((b) => b.shooter === 'ranger').length;
    f.enemies.push(tough({ id: 2, x: rin.x - 100, y: rin.y - 100 }));
    f.update(0.2);
    expect(f.bullets.filter((b) => b.shooter === 'ranger').length).toBe(before);
  });

  it('frost hammers slow what they hit; ricochets bounce between enemies', () => {
    const bj = withHelper('frostbreaker');
    bj.g.state.areas.peaks.unlocked = true;
    bj.g.recruit('frostbreaker');
    bj.g.state.hunters.frostbreaker.level = 10;
    bj.g.station('frostbreaker', 'forest');
    bj.f.enemies.push(tough({ id: 1, x: -55, y: -150 }));
    for (let i = 0; i < 60; i++) bj.f.update(1 / 30);
    expect(bj.f.enemies[0].slow).toBeGreaterThan(0);

    const { f } = withHelper('scavenger');
    f.enemies.push(tough({ id: 1, x: -55, y: -150 }), tough({ id: 2, x: -55, y: -250 }));
    for (let i = 0; i < 45; i++) f.update(1 / 30);
    expect(f.enemies.every((e) => e.hp < 1e12)).toBe(true);
  });

  it('tap blasts damage enemies near the tap', () => {
    const g = new Game(newGame(0), noCrit);
    const f = new Field(g);
    f.enemies.push(enemy({ id: 1, x: 100 }));
    f.enemies.push(enemy({ id: 2, x: -100 }));
    f.tap(100, 5);
    expect(f.enemies.map((e) => e.id)).toEqual([2]);
    expect(g.state.stats.taps).toBe(1);
  });
});

describe('Saves', () => {
  it('round-trips and tolerates garbage', () => {
    const s = newGame(0);
    s.gold = 42;
    s.items.gloves = 3;
    s.hunters.ranger = { recruited: true, level: 4, station: 'forest' };
    const back = deserialize(serialize(s));
    expect(back?.gold).toBe(42);
    expect(back?.items.gloves).toBe(3);
    expect(back?.hunters.ranger).toEqual({ recruited: true, level: 4, station: 'forest' });
    expect(deserialize('not json')).toBeNull();
  });

  it('migrates a stage-based save: keeps items, surviving materials and Arena progress', () => {
    const v3 = { version: 3, gold: 1e9, stage: 40, maxStage: 40, items: { whetstone: 4 }, materials: { goo: 50, bone: 20, ember: 5 }, stars: 7, stats: { totalKills: 123, deaths: 2 } };
    const s = deserialize(JSON.stringify(v3))!;
    expect(s.version).toBe(5);
    expect(s.area).toBe('forest');
    expect(s.gold).toBe(0);
    expect(s.items.whetstone).toBe(4);
    expect(s.materials.goo).toBe(50);
    expect(s.materials.bone).toBe(20);
    expect(s.stars).toBe(7);
    expect(s.stats.totalKills).toBe(123);
    expect('deaths' in s.stats).toBe(false);
  });
});
