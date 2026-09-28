import { describe, expect, it } from 'vitest';
import {
  areaDef,
  AREAS,
  enemyDef,
  enemyUnlockCost,
  GEAR,
  GEAR_COST_GROWTH,
  GUARDIAN_TIME,
  hunterDef,
  itemCost,
  itemDef,
  OFFLINE_CAP_SEC,
  RARITIES,
  STATION_EFFICIENCY,
  STUN_IMMUNITY,
  GUARDIAN_COOLDOWN,
  eventDef,
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
  s.main.trains = 200;
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

  it('a Guardian that times out just leaves; you can try again after the cooldown', () => {
    const s = newGame(0);
    s.areas.forest.kills = 999;
    const g = new Game(s, noCrit);
    g.challengeGuardian();
    g.bossSpawned();
    g.tick(GUARDIAN_TIME + 1);
    expect(g.guardianActive).toBe(false);
    expect(g.isAreaUnlocked('graveyard')).toBe(false);
    expect(g.area).toBe('forest');
    expect(g.challengeGuardian()).toBe(false);
    g.tick(GUARDIAN_COOLDOWN);
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
    g.state.hunters.alchemist.trains = 10;
    expect(g.shotDamage('alchemist', 'slime')).toBeCloseTo(g.shotDamage('alchemist', 'beast') * 3);
  });

  it('one Hunter per area; stationing swaps; stationed Hunters farm in the background', () => {
    const g = rich();
    g.recruit('alchemist');
    g.recruit('ranger');
    g.state.areas.graveyard.unlocked = true;
    g.state.hunters.alchemist.trains = 50;
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
    g.state.hunters.alchemist.trains = 300;
    const strong = g.farmRates('forest', ['alchemist'], STATION_EFFICIENCY);
    expect(strong.killsTotal).toBeCloseTo(g.spawnRate * STATION_EFFICIENCY);
    g.state.hunters.alchemist.trains = 0;
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

  it("Lance's rally gives every other Hunter (you too) an extra shield charge once he's recruited", () => {
    const g = rich();
    g.state.areas.graveyard.unlocked = true;
    g.recruit('ranger');
    expect(g.guardOf('main')).toBe(0);
    expect(g.guardOf('ranger')).toBe(0);
    g.recruit('lance');
    expect(g.guardOf('main')).toBe(1);
    expect(g.guardOf('ranger')).toBe(1);
    expect(g.guardOf('lance')).toBe(3); // his own shield isn't rallied
  });

  it('tracks gold, escapes and knockouts per area, live and while away', () => {
    const g = rich();
    g.registerKill('greenSlime', false);
    expect(g.state.areas.forest.gold).toBeGreaterThan(0);
    g.registerEscape();
    g.registerKnockout();
    expect(g.state.areas.forest.escaped).toBe(1);
    expect(g.state.areas.forest.knockouts).toBe(1);
    const s = newGame(0);
    s.main.trains = 20;
    s.areas.graveyard.unlocked = true;
    s.area = 'graveyard'; // too tough: knocked out while away
    const away = new Game(s, noCrit);
    const r = away.applyOffline(3600 * 1000);
    expect(away.state.areas.graveyard.knockouts).toBe(r.knockouts);
    expect(away.state.areas.graveyard.gold).toBeCloseTo(r.gold);
  });

  it('counts kills per Hunter, on the field and while away', () => {
    const g = rich();
    g.recruit('ranger');
    g.registerKill('greenSlime', false, 'main');
    g.registerKill('greenSlime', false, 'ranger');
    g.registerKill('greenSlime', false, 'ranger');
    expect(g.killsBy('main')).toBe(1);
    expect(g.killsBy('ranger')).toBe(2);
    expect(g.killsBy('glimmer')).toBe(0);
    g.state.hunters.ranger.trains = 60;
    g.station('ranger', 'forest'); // fights beside you: offline kills are shared by damage
    const before = { main: g.killsBy('main'), ranger: g.killsBy('ranger') };
    const r = g.applyOffline(3600 * 1000);
    const gained = g.killsBy('main') - before.main + g.killsBy('ranger') - before.ranger;
    expect(g.killsBy('main')).toBeGreaterThan(before.main);
    expect(g.killsBy('ranger')).toBeGreaterThan(before.ranger);
    expect(Math.abs(gained - r.kills)).toBeLessThanOrEqual(2); // rounding
  });
});

describe('Shops', () => {
  it('training adds damage; levels need more sessions each time and earn skill points', () => {
    const g = new Game(newGame(0), noCrit);
    g.state.gold = 1e9;
    expect(g.levelOf('main')).toBe(1);
    const dmg = g.damage;
    expect(g.train('main')).toBe(true);
    expect(g.damage).toBeGreaterThan(dmg);
    g.train('main');
    expect(g.levelInfo('main')).toEqual({ level: 1, into: 2, need: 3 });
    expect(g.skillPoints('main')).toBe(0);
    g.train('main'); // 3 sessions: Lv 2
    expect(g.levelOf('main')).toBe(2);
    expect(g.skillPoints('main')).toBe(1);
    for (let i = 0; i < 3; i++) g.train('main');
    expect(g.levelOf('main')).toBe(2); // Lv 2 → 3 takes 4 sessions
    g.train('main');
    expect(g.levelOf('main')).toBe(3);
    expect(g.trainPurchase('main', 1).cost).toBeGreaterThan(g.trainPurchase('main', 1).cost * 0); // costs gold
    const before = g.trainPurchase('main', 1).cost;
    g.train('main');
    expect(g.trainPurchase('main', 1).cost).toBeGreaterThan(before); // and gets pricier
  });

  it('skill points buy Attack Power, Attack Speed, Recovery and (for you) Tap skills', () => {
    const g = rich();
    g.recruit('ranger');
    g.state.main.trains = 100;
    g.state.hunters.ranger.trains = 100;
    const pts = g.skillPoints('main');
    expect(pts).toBeGreaterThan(5);
    const [dmg, rate, stun, tap, radius] = [g.damage, g.fireRate, g.stunTime(), g.tapDamage, g.tapRadius];
    for (const k of ['power', 'speed', 'recovery', 'tapPower', 'tapSize'] as const) expect(g.learn('main', k)).toBe(true);
    expect(g.skillPoints('main')).toBe(pts - 5);
    expect(g.damage).toBeCloseTo(dmg * 1.1);
    expect(g.fireRate).toBeCloseTo(rate * 1.1);
    expect(g.stunTime()).toBeLessThan(stun);
    expect(g.tapDamage).toBeGreaterThan(tap * 1.1);
    expect(g.tapRadius).toBeGreaterThan(radius);
    // Guild Hunters have the combat skills but not the tap ones.
    expect(g.skillsOf('ranger').map((k) => k.id)).toEqual(['power', 'speed', 'recovery']);
    expect(g.learn('ranger', 'tapPower')).toBe(false);
    const rdmg = g.shotDamage('ranger');
    expect(g.learn('ranger', 'power')).toBe(true);
    expect(g.shotDamage('ranger')).toBeCloseTo(rdmg * 1.1);
    // Out of points: nothing more to learn.
    g.state.main.skills.power = g.levelOf('main');
    expect(g.skillPoints('main')).toBeLessThanOrEqual(0);
    expect(g.learn('main', 'power')).toBe(false);
  });

  it('skills respect their max level', () => {
    const g = rich();
    g.state.main.trains = 5000;
    for (let i = 0; i < 30; i++) g.learn('main', 'speed');
    expect(g.skill('main', 'speed')).toBe(20);
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

  it('Recovery Speed and Bone Mail shorten stuns', () => {
    const g = new Game(newGame(0), noCrit);
    const base = g.stunTime();
    g.state.main.skills.recovery = 10;
    g.state.items.bonemail = 2;
    expect(g.stunTime()).toBeLessThan(base * 0.6);
    expect(g.stunTime(true)).toBeGreaterThan(g.stunTime());
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
    expect(g.guardOf('ranger')).toBe(1 + g.rallyFor('ranger')); // Lance is recruited: +1 rally
    expect(g.guardOf('lance')).toBe(3);
  });

  it('every piece of gear has a rarity, and all nine rarities are used', () => {
    for (const gd of GEAR) expect(Object.keys(RARITIES)).toContain(gd.rarity);
    expect(new Set(GEAR.map((gd) => gd.rarity)).size).toBe(Object.keys(RARITIES).length);
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
    s.main.trains = 150;
    const g = new Game(s, noCrit);
    const r = g.farmRates('forest', ['main'], 1);
    expect(r.stuns.main).toBe(0);
    expect(r.stunned.main).toBe(0);
    expect(r.killsTotal).toBeCloseTo(g.spawnRate);
  });

  it('a Hunter too weak for a new area is stunned often and kills little', () => {
    const s = newGame(0);
    s.main.trains = 20; // comfortable in the forest...
    s.areas.graveyard.unlocked = true;
    const g = new Game(s, noCrit);
    const forest = g.farmRates('forest', ['main'], 1);
    const graveyard = g.farmRates('graveyard', ['main'], 1);
    expect(forest.stunned.main).toBe(0);
    // ...but swamped in the graveyard: stunned again as soon as each immunity wears off (at most T / (T + immunity)).
    expect(graveyard.stunned.main).toBeGreaterThan(0.3);
    expect(graveyard.stuns.main).toBeGreaterThan(0);
    const spawns = g.roster('graveyard').reduce((sum, e) => sum + e.spawnRate, 0);
    expect(graveyard.killsTotal).toBeLessThan(spawns * 0.25);
  });

  it("going offline in an area you can't handle pays less than farming one you can", () => {
    const setup = (area: 'forest' | 'graveyard') => {
      const s = newGame(0);
      s.main.trains = 20;
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
    s.main.trains = 150;
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
    while (level < 400 && !(stunnedAt(false) > 0.05 && stunnedAt(false) < 0.9)) g.state.hunters.lance.trains = ++level;
    const shielded = stunnedAt(true);
    const bare = stunnedAt(false);
    expect(bare).toBeGreaterThan(0);
    expect(shielded).toBeLessThan(bare);
  });
});

describe('Offline', () => {
  it('pays out for you and every stationed Hunter, capped', () => {
    const s = newGame(0);
    s.main.trains = 30;
    s.gold = 1e9;
    const g = new Game(s, noCrit);
    g.state.areas.graveyard.unlocked = true;
    g.recruit('gravewarden');
    g.state.hunters.gravewarden.trains = 150;
    g.station('gravewarden', 'graveyard');
    const gold = g.state.gold;
    const r = g.applyOffline(24 * 3600 * 1000);
    expect(r.seconds).toBe(OFFLINE_CAP_SEC);
    expect(r.gold).toBeGreaterThan(0);
    expect(g.state.gold).toBeCloseTo(gold + r.gold);
    expect(r.materials.goo).toBeGreaterThan(0); // you, in the forest
    expect(r.materials.bone).toBeGreaterThan(0); // Alric, in the graveyard
  });
});

describe('Events', () => {
  it('every area with a Guardian has a Guardian Challenge, unlocked at its mastery', () => {
    for (const a of AREAS.filter((x) => Number.isFinite(x.mastery))) {
      const ev = eventDef(`guardian-${a.id}`);
      expect(ev.kind).toBe('guardian');
      expect(ev.unlockKills).toBe(a.mastery);
    }
    const g = new Game(newGame(0), noCrit);
    expect(g.eventUnlocked('guardian-forest')).toBe(false);
    g.state.areas.forest.kills = areaDef('forest').mastery;
    expect(g.eventUnlocked('guardian-forest')).toBe(true);
    expect(g.eventReady('guardian-graveyard')).toBe(false); // graveyard still locked
  });

  it('starting an event puts it on cooldown, which also runs down while away', () => {
    const s = newGame(0);
    s.areas.forest.kills = 999;
    const g = new Game(s, noCrit);
    expect(g.startEvent('guardian-forest')).toBe(true);
    expect(g.guardianActive).toBe(true);
    expect(g.eventCooldown('guardian-forest')).toBe(GUARDIAN_COOLDOWN);
    expect(g.startEvent('guardian-forest')).toBe(false); // already running
    g.bossSpawned();
    g.registerKill(g.guardianType, true); // win: graveyard opens
    expect(g.isAreaUnlocked('graveyard')).toBe(true);
    expect(g.eventReady('guardian-forest')).toBe(false); // cooling down
    g.state.lastSeen = 0;
    g.applyOffline(GUARDIAN_COOLDOWN * 1000);
    expect(g.eventReady('guardian-forest')).toBe(true);
    // Repeat wins pay the bounty again.
    const gold = g.state.gold;
    g.startEvent('guardian-forest');
    g.bossSpawned();
    g.registerKill(g.guardianType, true);
    expect(g.state.gold).toBeGreaterThan(gold);
    expect(g.state.events['guardian-forest'].runs).toBe(2);
  });

  it('Slime Swarm unlocks later in the forest: only slimes, twice as many and twice as fast, for 60s', () => {
    const s = newGame(0);
    s.bestiary.wolf.unlocked = true;
    s.bestiary.redSlime.unlocked = true;
    const g = new Game(s, noCrit);
    const def = eventDef('slimeSwarm');
    expect(def.area).toBe('forest');
    g.state.areas.forest.kills = def.unlockKills - 1;
    expect(g.eventUnlocked('slimeSwarm')).toBe(false);
    g.state.areas.forest.kills = def.unlockKills;
    const slime = g.enemyStats('greenSlime');
    expect(g.startEvent('slimeSwarm')).toBe(true);
    expect(g.enemyStats('greenSlime').spawnRate).toBeCloseTo(slime.spawnRate * 2);
    expect(g.enemyStats('greenSlime').speed).toBeCloseTo(slime.speed * 2);
    expect(g.enemyStats('redSlime').spawnRate).toBeGreaterThan(0);
    expect(g.enemyStats('wolf').spawnRate).toBe(0); // only slimes
    expect(g.startEvent('guardian-forest')).toBe(false); // one event at a time
    g.tick(def.duration + 0.1);
    expect(g.activeEvent).toBeNull();
    expect(g.enemyStats('greenSlime').spawnRate).toBeCloseTo(slime.spawnRate);
    expect(g.eventReady('slimeSwarm')).toBe(false);
    g.tick(def.cooldown);
    expect(g.eventReady('slimeSwarm')).toBe(true);
  });

  it('starting an event elsewhere travels there; leaving ends a swarm early', () => {
    const s = newGame(0);
    s.areas.graveyard.unlocked = true;
    s.area = 'graveyard';
    s.areas.forest.kills = 1e6;
    const g = new Game(s, noCrit);
    expect(g.startEvent('slimeSwarm')).toBe(true);
    expect(g.area).toBe('forest');
    expect(g.activeEvent?.id).toBe('slimeSwarm');
    g.travel('graveyard');
    expect(g.activeEvent).toBeNull();
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
    g.state.main.trains = 30;
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
    g.state.hunters[id].trains = 10;
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

  it('a brand-new Hunter handles the opening slimes without being stunned', () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const g = new Game(newGame(0), rng);
    const f = new Field(g);
    f.setView(390, 420);
    let stuns = 0;
    for (let i = 0; i < 120 * 30; i++) {
      f.update(1 / 30);
      for (const e of f.drainEvents()) if (e.type === 'stun') stuns++;
    }
    expect(stuns).toBe(0);
    expect(g.state.stats.escaped).toBe(0);
    expect(g.state.stats.totalKills).toBeGreaterThan(60);
  });

  it('a stun runs its course: more hits while stunned or immune never extend it', () => {
    const g = new Game(newGame(0), noCrit);
    const f = new Field(g);
    f.setView(390, 420);
    g.state.bestiary.greenSlime.unlocked = false;
    f.enemies = [tough({ id: 1, x: 20, y: 0 })];
    f.update(1 / 30);
    const t = g.stunTime();
    expect(f.stun).toBeCloseTo(t, 1);
    // Another monster arrives mid-stun: the timer keeps running down, and that monster still runs off.
    for (let i = 0; i < 15; i++) f.update(1 / 30);
    const left = f.stun;
    f.enemies = [tough({ id: 2, x: 20, y: 0 })];
    f.update(1 / 30);
    expect(f.stun).toBeLessThan(left);
    expect(f.enemies[0].fleeing).toBe(true);
    // Once it wears off, immunity protects for a moment.
    while (f.stun > 0) f.update(1 / 30);
    expect(f.immune).toBeGreaterThan(1);
    f.enemies = [tough({ id: 3, x: 20, y: 0 })];
    f.update(1 / 30);
    expect(f.stun).toBe(0);
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

  it("with Lance recruited, your Hunter's rally shield blocks a hit before you're stunned", () => {
    const { f } = withHelper('lance');
    for (let i = 0; i < 5 * 30; i++) f.update(1 / 30);
    expect(f.guard).toBe(1);
    f.enemies = [tough({ id: 30, x: 20, y: -5, speed: 40 })];
    f.update(1 / 30);
    expect(f.guard).toBe(0);
    expect(f.stun).toBe(0);
    f.enemies = [tough({ id: 31, x: 20, y: -5, speed: 40 })];
    f.update(1 / 30);
    expect(f.stun).toBeGreaterThan(0);
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
    bj.g.state.hunters.frostbreaker.trains = 10;
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
    s.hunters.ranger = { recruited: true, trains: 4, skills: { speed: 1 }, station: 'forest' };
    s.main = { trains: 9, skills: { tapPower: 2 } };
    const back = deserialize(serialize(s));
    expect(back?.gold).toBe(42);
    expect(back?.items.gloves).toBe(3);
    expect(back?.hunters.ranger).toEqual({ recruited: true, trains: 4, skills: { speed: 1 }, station: 'forest' });
    expect(back?.main).toEqual({ trains: 9, skills: { tapPower: 2 } });
    expect(deserialize('not json')).toBeNull();
  });

  it('migrates v5: Power and Hunter levels become training sessions, skills start unspent', () => {
    const v5 = JSON.parse(serialize(newGame(0)));
    v5.version = 5;
    delete v5.main;
    v5.upgrades = { power: 40, haste: 12, nerves: 3 };
    v5.hunters.glimmer = { recruited: true, level: 30, station: 'forest' };
    const s = deserialize(JSON.stringify(v5))!;
    expect(s.version).toBe(7);
    expect(s.main).toEqual({ trains: 40, skills: {} });
    expect(s.hunters.glimmer).toEqual({ recruited: true, trains: 30, skills: {}, station: 'forest' });
    expect(s.hunters.ranger.trains).toBe(0);
    expect('upgrades' in s).toBe(false);
  });

  it('keeps event cooldowns; v6 saves drop the old Arena (tickets, Stars, Frenzy)', () => {
    const s = newGame(0);
    s.events.slimeSwarm = { cooldown: 120, runs: 3 };
    expect(deserialize(serialize(s))!.events.slimeSwarm).toEqual({ cooldown: 120, runs: 3 });
    const v6 = { ...JSON.parse(serialize(newGame(0))), version: 6, tickets: 2, ticketProgress: 30, frenzyTime: 40, stars: 9, bh: { shield: 1 } };
    delete v6.events;
    const back = deserialize(JSON.stringify(v6))! as unknown as Record<string, unknown>;
    for (const k of ['tickets', 'ticketProgress', 'frenzyTime', 'stars', 'bh']) expect(k in back).toBe(false);
    expect((back.events as Record<string, unknown>)['guardian-forest']).toEqual({ cooldown: 0, runs: 0 });
  });

  it('keeps per-Hunter kills, and older saves start them empty', () => {
    const s = newGame(0);
    s.stats.hunterKills = { main: 12, ranger: 5 };
    expect(deserialize(serialize(s))!.stats.hunterKills).toEqual({ main: 12, ranger: 5 });
    const old = JSON.parse(serialize(newGame(0)));
    delete old.stats.hunterKills;
    old.stats.hunterKills = undefined;
    expect(deserialize(JSON.stringify(old))!.stats.hunterKills).toEqual({});
    old.stats.hunterKills = { main: 3, nobody: 9, ranger: 'x' };
    expect(deserialize(JSON.stringify(old))!.stats.hunterKills).toEqual({ main: 3 });
  });

  it('migrates a stage-based save: keeps items and surviving materials', () => {
    const v3 = { version: 3, gold: 1e9, stage: 40, maxStage: 40, items: { whetstone: 4 }, materials: { goo: 50, bone: 20, ember: 5 }, stars: 7, stats: { totalKills: 123, deaths: 2 } };
    const s = deserialize(JSON.stringify(v3))!;
    expect(s.version).toBe(7);
    expect(s.area).toBe('forest');
    expect(s.gold).toBe(0);
    expect(s.items.whetstone).toBe(4);
    expect(s.materials.goo).toBe(50);
    expect(s.materials.bone).toBe(20);
    expect('stars' in s).toBe(false);
    expect(s.stats.totalKills).toBe(123);
    expect('deaths' in s.stats).toBe(false);
  });
});
