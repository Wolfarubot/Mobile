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
  HUNTERS,
  itemCost,
  itemDef,
  OFFLINE_CAP_SEC,
  RARITIES,
  STATION_EFFICIENCY,
  STUN_IMMUNITY,
  GUARDIAN_COOLDOWN,
  eventDef,
  ENEMIES,
  RESIST_MULT,
  STATUS,
  typeMult,
  WEAK_MULT,
} from '../src/core/balance';
import { Field, type Enemy } from '../src/core/field';
import { Game } from '../src/core/game';
import { deserialize, newGame, SAVE_VERSION, serialize, type GameState } from '../src/core/state';

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
/** Every event completed a few times, so every Hunter can be recruited. */
function veteran(s: GameState): GameState {
  for (const e of Object.values(s.events)) e.completed = 5;
  return s;
}

function rich(): Game {
  const s = veteran(newGame(0));
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
    expect(g.isAreaUnlocked('glade')).toBe(true);
    expect(g.isAreaUnlocked('graveyard')).toBe(false); // one area at a time
    expect(g.lockedNext).toBeNull();
    expect(g.state.stats.guardians).toBe(1);
    // Travel both ways; nothing gets re-locked.
    expect(g.travel('glade')).toBe(true);
    expect(g.roster().map((e) => e.id)).toEqual(['toadstool']);
    expect(g.travel('forest')).toBe(true);
    expect(g.isAreaUnlocked('glade')).toBe(true);
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
  it("Hunters become available through their area's events: Mira after the first Forest Guardian", () => {
    const s = newGame(0);
    s.gold = 1e9;
    s.areas.forest.kills = 1e6;
    const g = new Game(s, noCrit);
    expect(hunterDef('alchemist').unlock).toEqual({ event: 'guardian-forest', times: 1 });
    expect(g.hunterAvailable('alchemist')).toBe(false);
    expect(g.recruit('alchemist')).toBe(false);
    expect(g.huntersUnlockedBy('guardian-forest')).toEqual(['alchemist']);
    g.startEvent('guardian-forest');
    g.bossSpawned();
    g.registerKill(g.guardianType, true);
    expect(g.hunterAvailable('alchemist')).toBe(true);
    expect(g.hunterAvailable('ranger')).toBe(false); // needs a second win
    expect(g.huntersUnlockedBy('guardian-forest')).toEqual(['ranger']);
    expect(g.recruit('alchemist')).toBe(true);
    expect(g.recruit('alchemist')).toBe(false);
    // Glimmer joins after surviving a full Slime Swarm; leaving early doesn't count.
    g.travel('forest');
    g.startEvent('slimeSwarm');
    g.travel('graveyard');
    expect(g.hunterAvailable('glimmer')).toBe(false);
    g.travel('forest');
    g.tick(eventDef('slimeSwarm').cooldown);
    g.startEvent('slimeSwarm');
    g.tick(eventDef('slimeSwarm').duration + 0.1);
    expect(g.hunterAvailable('glimmer')).toBe(true);
  });

  it('every Hunter is unlocked by an event in their home area, in order', () => {
    for (const h of HUNTERS) expect(eventDef(h.unlock.event).area).toBe(h.area);
    expect(HUNTERS[0].id).toBe('alchemist');
  });

  it('archetype bane multiplies damage only against that archetype', () => {
    const g = rich();
    g.recruit('alchemist');
    g.state.hunters.alchemist.trains = 10;
    expect(g.shotDamage('alchemist', 'slime')).toBeCloseTo(g.shotDamage('alchemist', 'beast') * 3);
  });

  it('up to 3 Hunters per area; stationed Hunters farm in the background, together', () => {
    const g = rich();
    for (const id of ['alchemist', 'ranger', 'glimmer', 'gravewarden'] as const) g.recruit(id);
    g.state.areas.graveyard.unlocked = true;
    g.state.hunters.alchemist.trains = 50;
    expect(g.station('alchemist', 'forest')).toBe(true);
    expect(g.station('ranger', 'forest')).toBe(true);
    expect(g.station('glimmer', 'forest')).toBe(true);
    expect(g.stationedIn('forest')).toEqual(['alchemist', 'ranger', 'glimmer']);
    expect(g.station('gravewarden', 'forest')).toBe(false); // full
    expect(g.canStation('ranger', 'forest')).toBe(true); // already there
    g.station('glimmer', null);
    expect(g.station('gravewarden', 'forest')).toBe(true);

    g.travel('graveyard'); // you leave; they keep hunting in the forest
    const gold = g.state.gold;
    const kills = g.state.areas.forest.kills;
    for (let i = 0; i < 600; i++) g.tick(0.1);
    expect(g.state.gold).toBeGreaterThan(gold);
    expect(g.state.areas.forest.kills).toBeGreaterThan(kills);
    expect(g.state.materials.goo).toBeGreaterThan(0);
    // Together they can't kill more than the forest spawns.
    const spawns = g.roster('forest').reduce((sum, e) => sum + e.spawnRate, 0);
    expect(g.state.areas.forest.kills - kills).toBeLessThanOrEqual(spawns * 60 + 5);
  });

  it('offline, Hunters sharing an area are reported together', () => {
    const g = rich();
    for (const id of ['alchemist', 'ranger'] as const) g.recruit(id);
    g.state.areas.graveyard.unlocked = true;
    g.station('alchemist', 'graveyard');
    g.station('ranger', 'graveyard');
    g.state.lastSeen = 0;
    const r = g.applyOffline(3600 * 1000);
    expect(r.areas.find((a) => a.area === 'graveyard')?.hunters).toEqual(['alchemist', 'ranger']);
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
    const weakGame = new Game(veteran(s), noCrit);
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

  it("Lance's shield is his Zone of Protection node; his Rallying Oath gives every other Hunter a hit", () => {
    const g = rich();
    g.state.areas.graveyard.unlocked = true;
    g.recruit('ranger');
    expect(g.guardOf('main')).toBe(0);
    expect(g.guardOf('ranger')).toBe(0);
    g.recruit('lance');
    g.state.hunters.lance.trains = 100;
    expect(g.guardOf('lance')).toBe(0); // his shield comes from his skill tree
    expect(g.learn('lance', 'recovery')).toBe(false); // the root comes first
    expect(g.learn('lance', 'root')).toBe(true); // Zone of Protection
    expect(g.guardOf('lance')).toBe(3);
    expect(g.guardOf('main')).toBe(0);
    g.learn('lance', 'recovery');
    expect(g.learn('lance', 'recovery2')).toBe(true); // Rallying Oath
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

  it('skill trees: the root first, then branches; each node needs a point in the one it hangs from', () => {
    const g = rich();
    g.recruit('ranger');
    g.state.main.trains = 100;
    g.state.hunters.ranger.trains = 100;
    const pts = g.skillPoints('main');
    expect(pts).toBeGreaterThan(5);
    const [dmg, rate, stun, tap, radius, crit] = [g.damage, g.fireRate, g.stunTime(), g.tapDamage, g.tapRadius, g.critChanceOf('main')];
    expect(g.learn('main', 'power')).toBe(false); // needs the root
    expect(g.learn('main', 'root')).toBe(true); // Hunter's Instinct: +5% crit
    expect(g.critChanceOf('main')).toBeCloseTo(crit + 0.05);
    expect(g.learn('main', 'power2')).toBe(false); // Tap Power hangs from Attack Power
    for (const k of ['power', 'speed', 'recovery', 'power2', 'recovery2']) expect(g.learn('main', k)).toBe(true);
    expect(g.skillPoints('main')).toBe(pts - 6);
    expect(g.damage).toBeCloseTo(dmg * 1.1);
    expect(g.fireRate).toBeCloseTo(rate * 1.1);
    expect(g.stunTime()).toBeLessThan(stun);
    expect(g.tapDamage).toBeGreaterThan(tap * 1.1);
    expect(g.tapRadius).toBeGreaterThan(radius);
    expect(g.learn('main', 'capstone')).toBe(true); // reachable from any second-row node
    // Every Hunter has their own tree of the same shape.
    expect(g.skillTree('ranger').map((n) => n.id)).toEqual(['root', 'power', 'speed', 'recovery', 'power2', 'speed2', 'recovery2', 'capstone']);
    expect(g.skillTree('ranger')[4].name).toBe('Beast Bane');
    const vsBeast = g.shotDamage('ranger', 'beast');
    g.learn('ranger', 'root');
    g.learn('ranger', 'power');
    g.learn('ranger', 'power2');
    expect(g.shotDamage('ranger', 'beast')).toBeGreaterThan(vsBeast * 1.1);
    // Out of points: nothing more to learn.
    g.state.main.skills.speed = 10;
    g.state.main.skills.power = 10;
    g.state.main.skills.recovery = 5;
    expect(g.skillPoints('main')).toBeLessThanOrEqual(0);
    expect(g.learn('main', 'speed2')).toBe(false);
  });

  it('skills respect their max level', () => {
    const g = rich();
    g.state.main.trains = 5000;
    g.learn('main', 'root');
    for (let i = 0; i < 30; i++) g.learn('main', 'speed');
    expect(g.skill('main', 'speed')).toBe(10);
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
    const g = new Game(veteran(newGame(0)), noCrit);
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
    const g = new Game(veteran(s), noCrit);
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

  it('every Hunter has 3 slots with armor; Lance melee, Wilhelm two weapons, Glimmer a magic weapon', () => {
    const g = stocked();
    const kinds = (who: Parameters<Game['slotsOf']>[0]) => g.slotsOf(who).map((sl) => sl.kind);
    expect(kinds('main')).toEqual(['weapon', 'armor', 'accessory']);
    expect(kinds('ranger')).toEqual(['weapon', 'armor', 'accessory']);
    expect(kinds('lance')).toEqual(['melee', 'armor', 'accessory']);
    expect(kinds('wilhelm')).toEqual(['weapon', 'weapon', 'armor']);
    expect(kinds('glimmer')).toEqual(['magic', 'armor', 'accessory']);
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

  it('magic weapons: Glimmer takes only magic, Mira takes ranged or magic, nobody else takes magic', () => {
    const g = stocked();
    g.recruit('alchemist');
    const wand = g.craftGear('apprenticeWand')!;
    const bow = g.craftGear('huntingBow')!;
    expect(g.equip('glimmer', 0, bow.uid)).toBe(false);
    expect(g.equip('glimmer', 0, wand.uid)).toBe(true);
    expect(g.equip('alchemist', 0, bow.uid)).toBe(true);
    expect(g.equip('alchemist', 0, wand.uid)).toBe(true); // moves from Glimmer
    expect(g.equip('main', 0, wand.uid)).toBe(false);
    expect(g.equip('ranger', 0, wand.uid)).toBe(false);
    expect(g.equip('lance', 0, wand.uid)).toBe(false);
  });

  it("a spellcaster's weapon damage powers their special and its attack rate widens it", () => {
    const g = stocked();
    const dmg = g.specialDamageMult('glimmer');
    const r = g.specialRadius('glimmer');
    const dps = g.dpsOf('glimmer');
    const staff = g.craftGear('soulfireStaff')!; // +75% damage, +30% rate
    g.equip('glimmer', 0, staff.uid);
    expect(g.specialDamageMult('glimmer')).toBeCloseTo(dmg * 1.75);
    expect(g.specialRadius('glimmer')).toBeCloseTo(r * 1.3);
    expect(g.dpsOf('glimmer')).toBeGreaterThan(dps * 1.75);
    // Area gear still widens it too, and Hunters without a special have none.
    const orb = g.craftGear('emberOrb')!;
    g.equip('glimmer', 2, orb.uid);
    expect(g.specialRadius('glimmer')).toBeCloseTo(r * 1.3 * 1.12);
    expect(g.specialCooldown('ranger')).toBeNull();
    expect(g.specialDamageMult('ranger')).toBe(0);
  });

  it("damage types: a Hunter deals their weapon's type, or their own without one; specials keep their own", () => {
    const g = stocked();
    g.recruit('alchemist');
    expect(g.damageTypeOf('main')).toBe('physical');
    expect(g.damageTypeOf('glimmer')).toBe('fire');
    expect(g.damageTypeOf('alchemist')).toBe('poison');
    const staff = g.craftGear('voidScepter')!;
    g.equip('glimmer', 0, staff.uid);
    expect(g.damageTypeOf('glimmer')).toBe('void');
    expect(g.damageTypeOf('glimmer', 'long', true)).toBe('fire'); // fireballs stay fire
    const rifle = g.craftGear('frostRifle')!;
    g.equip('wilhelm', 1, rifle.uid); // short-range slot
    expect(g.damageTypeOf('wilhelm', 'long')).toBe('physical');
    expect(g.damageTypeOf('wilhelm', 'short')).toBe('frost');
    // Every weapon has a type; armor and accessories don't.
    for (const gd of GEAR) expect(!!gd.damageType).toBe(['weapon', 'melee', 'magic'].includes(gd.kind));
  });

  it('enemies take ×1.5 from types they are weak to and ×0.5 from types they resist', () => {
    expect(typeMult('fire', 'greenSlime')).toBe(WEAK_MULT);
    expect(typeMult('poison', 'greenSlime')).toBe(RESIST_MULT);
    expect(typeMult('physical', 'greenSlime')).toBe(1);
    for (const e of ENEMIES) {
      expect(e.weak.length).toBeGreaterThan(0);
      expect(e.weak.some((t) => e.resist.includes(t))).toBe(false);
    }
    // On the field: the same shot deals 1.5x to a weak enemy (Glimmer's bolts are fire).
    const g = stocked();
    const f = new Field(g);
    const hits: Array<{ dmg: number; affinity?: string | null }> = [];
    const at = (id: number, type: Enemy['type']) => enemy({ id, type, x: 0, y: -150, hp: 1e12, maxHp: 1e12 });
    const [slime, wolf, redSlime] = [at(1, 'greenSlime'), at(2, 'wolf'), at(3, 'redSlime')];
    for (const e of [slime, wolf, redSlime]) {
      f.enemies = [e];
      (f as unknown as { hitWith: (...a: unknown[]) => void }).hitWith('glimmer', e, 1, 0, 0, false);
      for (const ev of f.drainEvents()) if (ev.type === 'hit') hits.push(ev);
    }
    expect(hits.map((h) => h.affinity)).toEqual(['weak', 'weak', 'resist']);
    expect(hits[0].dmg / hits[2].dmg).toBeCloseTo(WEAK_MULT / RESIST_MULT);
  });

  it('Fire burns, Poison poisons, Frost chills and Acid corrodes; effects refresh rather than stack', () => {
    const g = stocked();
    g.recruit('alchemist');
    const f = new Field(g);
    const hit = (who: 'glimmer' | 'alchemist' | 'frostbreaker' | 'scavenger', e: Enemy) =>
      (f as unknown as { hitWith: (...a: unknown[]) => void }).hitWith(who, e, 1, 0, 0, false);
    // Fire: a Zombie (neutral to nothing here: weak to fire) keeps burning after the hit.
    const z = enemy({ id: 1, type: 'wolf', x: 0, y: -300, hp: 1e12, maxHp: 1e12 });
    f.enemies = [z];
    hit('glimmer', z);
    const afterHit = z.hp;
    expect(z.burn).toBeDefined();
    const burnTotal = (1e12 - afterHit) * STATUS.burn.share;
    for (let i = 0; i < 90; i++) (f as unknown as { tickStatus: (e: Enemy, dt: number) => void }).tickStatus(z, 1 / 30);
    expect(afterHit - z.hp).toBeCloseTo(burnTotal, -3);
    expect(z.burn).toBeUndefined();
    // Hitting again refreshes the burn instead of stacking a second one.
    hit('glimmer', z);
    hit('glimmer', z);
    expect(z.burn!.left).toBe(STATUS.burn.duration);
    // Poison (Mira with no weapon), Frost (Bjorn's hammer type) and Acid (Pip).
    g.recruit('frostbreaker');
    g.recruit('scavenger');
    const p = enemy({ id: 2, type: 'wolf', x: 0, y: -300, hp: 1e12, maxHp: 1e12 });
    f.enemies.push(p);
    hit('alchemist', p);
    expect(p.poison!.left).toBe(STATUS.poison.duration);
    hit('frostbreaker', p);
    expect(p.slow).toBe(STATUS.chill.duration);
    hit('scavenger', p);
    expect(p.corrode).toBe(STATUS.corrode.duration);
    // Corroded monsters take more from everything.
    const q = enemy({ id: 3, type: 'wolf', x: 0, y: -300, hp: 1e12, maxHp: 1e12 });
    f.enemies.push(q);
    hit('glimmer', q);
    const plain = 1e12 - q.hp;
    const before = p.hp;
    hit('glimmer', p);
    expect(before - p.hp).toBeCloseTo(plain * (1 + STATUS.corrode.amp), -3);
  });

  it('9 areas in order; saves from before the new areas open everything up to their furthest area', () => {
    expect(AREAS.map((a) => a.id)).toEqual(['forest', 'glade', 'graveyard', 'crypt', 'caves', 'mines', 'peaks', 'cliffs', 'rift']);
    const old = JSON.parse(serialize(newGame(0)));
    old.version = 9;
    old.areas.graveyard.unlocked = true;
    old.areas.caves.unlocked = true;
    const s = deserialize(JSON.stringify(old))!;
    expect(AREAS.filter((a) => s.areas[a.id].unlocked).map((a) => a.id)).toEqual(['forest', 'glade', 'graveyard', 'crypt', 'caves']);
  });

  it('50 monsters, at least 5 per area, each with a weakness; Guardians stay put', () => {
    expect(ENEMIES).toHaveLength(50);
    expect(new Set(ENEMIES.map((e) => e.id)).size).toBe(50);
    for (const a of AREAS) expect(ENEMIES.filter((e) => e.area === a.id).length).toBeGreaterThanOrEqual(5);
    const g = new Game(newGame(0), noCrit);
    expect(g.guardianType).toBe('redSlime');
  });

  it("Wilhelm's long and short weapons each power one mode", () => {
    const g = stocked();

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
    g.state.hunters.lance.skills = { root: 1 };
    expect(g.guardOf('lance')).toBe(3 + Math.floor(g.gear('lance').guard));
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
    const g = new Game(veteran(s), noCrit);
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
    const g = new Game(veteran(s), noCrit);
    g.recruit('lance');
    const stunnedAt = (withShield: boolean) => {
      g.state.hunters.lance.skills = withShield ? { root: 1 } : {};
      return g.farmRates('graveyard', ['lance'], 1).stunned.lance!;
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
    const g = new Game(veteran(s), noCrit);
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
  it('the Events tab opens once the first Guardian Challenge unlocks, and stays open', () => {
    const g = new Game(newGame(0), noCrit);
    expect(g.eventsOpen).toBe(false);
    g.state.areas.forest.kills = areaDef('forest').mastery;
    expect(g.eventsOpen).toBe(true);
    g.state.flags.eventsIntro = true;
    g.state.areas.forest.kills = 0;
    expect(g.eventsOpen).toBe(true);
  });

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
    // The final area has no Guardian.
    for (const a of AREAS) g.state.areas[a.id].unlocked = true;
    g.travel('rift');
    expect(g.guardianReady).toBe(false);
    expect(g.challengeGuardian()).toBe(false);
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
    g.registerKill(g.guardianType, true); // win: the Faerie Glade opens
    expect(g.isAreaUnlocked('glade')).toBe(true);
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
    const g = new Game(veteran(s), noCrit);
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
    g.state.hunters[id].skills = { root: 1 }; // e.g. Lance's Zone of Protection
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

  it('Mira flings magic bolts and lobs a potion that leaves a damaging puddle on a cooldown', () => {
    const { f } = withHelper('alchemist');
    f.enemies.push(tough({ id: 1, x: -150, y: 150 }));
    let puddle = false;
    let spark = false;
    for (let i = 0; i < 90; i++) {
      f.update(1 / 30);
      puddle ||= f.puddles.some((p) => p.shooter === 'alchemist');
      spark ||= f.bullets.some((b) => b.shooter === 'alchemist' && b.kind === 'spark');
    }
    expect(f.helpers.map((h) => h.id)).toEqual(['alchemist']);
    expect(puddle).toBe(true);
    // The potion is on a cooldown: in between, only sparks fly.
    expect(f.puddles.filter((p) => p.shooter === 'alchemist').length).toBeLessThanOrEqual(1);
    expect(f.helpers[0].specialCd).toBeGreaterThan(0);
    expect(spark).toBe(true);
    expect(f.enemies[0].hp).toBeLessThan(1e12);
  });

  it("Glimmer's fireballs explode and hit every enemy nearby", () => {
    const { f } = withHelper('glimmer');
    for (let i = 0; i < 3; i++) f.enemies.push(tough({ id: i + 1, x: -55 + (i - 1) * 20, y: -150 }));
    for (let i = 0; i < 90; i++) f.update(1 / 30);
    const events = f.drainEvents();
    expect(events.some((e) => e.type === 'explode')).toBe(true);
    // His hits are fire (he has no weapon, and fireballs are always fire).
    expect(events.some((e) => e.type === 'hit' && e.dtype === 'fire')).toBe(true);
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

  it("with Lance's Rallying Oath, your Hunter's rally shield blocks a hit before you're stunned", () => {
    const { g, f } = withHelper('lance');
    g.state.hunters.lance.skills = { root: 1, recovery: 1, recovery2: 1 };
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
    s.hunters.ranger = { recruited: true, trains: 4, skills: { root: 1, speed: 1 }, station: 'forest' };
    s.main = { trains: 9, skills: { root: 1, power: 2, nope: 3 } };
    const back = deserialize(serialize(s));
    expect(back?.gold).toBe(42);
    expect(back?.items.gloves).toBe(3);
    expect(back?.hunters.ranger).toEqual({ recruited: true, trains: 4, skills: { root: 1, speed: 1 }, station: 'forest' });
    expect(back?.main).toEqual({ trains: 9, skills: { root: 1, power: 2 } }); // unknown nodes dropped
    expect(deserialize('not json')).toBeNull();
  });

  it('migrates v5: Power and Hunter levels become training sessions, skills start unspent', () => {
    const v5 = JSON.parse(serialize(newGame(0)));
    v5.version = 5;
    delete v5.main;
    v5.upgrades = { power: 40, haste: 12, nerves: 3 };
    v5.hunters.glimmer = { recruited: true, level: 30, station: 'forest' };
    const s = deserialize(JSON.stringify(v5))!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.main).toEqual({ trains: 40, skills: {} });
    expect(s.hunters.glimmer).toEqual({ recruited: true, trains: 30, skills: {}, station: 'forest' });
    expect(s.hunters.ranger.trains).toBe(0);
    expect('upgrades' in s).toBe(false);
  });

  it('keeps event cooldowns; v6 saves drop the old Arena (tickets, Stars, Frenzy)', () => {
    const s = newGame(0);
    s.events.slimeSwarm = { cooldown: 120, runs: 3, completed: 1 };
    expect(deserialize(serialize(s))!.events.slimeSwarm).toEqual({ cooldown: 120, runs: 3, completed: 1 });
    const v6 = { ...JSON.parse(serialize(newGame(0))), version: 6, tickets: 2, ticketProgress: 30, frenzyTime: 40, stars: 9, bh: { shield: 1 } };
    delete v6.events;
    const back = deserialize(JSON.stringify(v6))! as unknown as Record<string, unknown>;
    for (const k of ['tickets', 'ticketProgress', 'frenzyTime', 'stars', 'bh']) expect(k in back).toBe(false);
    expect((back.events as Record<string, unknown>)['guardian-forest']).toEqual({ cooldown: 0, runs: 0, completed: 0 });
  });

  it('older saves count a Guardian as beaten once when its next area is open', () => {
    const old = JSON.parse(serialize(newGame(0)));
    old.version = 6;
    delete old.events;
    old.areas.graveyard.unlocked = true;
    const s = deserialize(JSON.stringify(old))!;
    expect(s.events['guardian-forest'].completed).toBe(1);
    expect(s.events['guardian-graveyard'].completed).toBe(0);
  });

  it('keeps settings and tutorial flags; older saves get the defaults', () => {
    const s = newGame(0);
    s.settings.leftHanded = true;
    s.settings.name = 'Wolfa';
    s.flags.eventsIntro = true;
    const back = deserialize(serialize(s))!;
    expect(back.settings).toEqual({ leftHanded: true, name: 'Wolfa', tabOrder: ['hunters', 'inventory', 'beasts', 'events', 'areas'] });
    expect(back.flags).toEqual({ eventsIntro: true, welcome: false, trainIntro: false });
    const old = JSON.parse(serialize(newGame(0)));
    delete old.settings;
    delete old.flags;
    expect(deserialize(JSON.stringify(old))!.settings).toEqual({ leftHanded: false, name: '', tabOrder: ['hunters', 'inventory', 'beasts', 'events', 'areas'] });
    // A saved tab order survives; junk is dropped and missing tabs are appended.
    const custom = newGame(0);
    custom.settings.tabOrder = ['areas', 'events', 'hunters', 'beasts', 'inventory'];
    expect(deserialize(serialize(custom))!.settings.tabOrder).toEqual(['areas', 'events', 'hunters', 'beasts', 'inventory']);
    const broken = JSON.parse(serialize(newGame(0)));
    broken.settings.tabOrder = ['areas', 'nope', 'areas', 'events', 'equipment'];
    expect(deserialize(JSON.stringify(broken))!.settings.tabOrder).toEqual(['areas', 'events', 'inventory', 'hunters', 'beasts']);
    expect(deserialize(JSON.stringify(old))!.flags.welcome).toBe(true); // existing players skip the welcome
    expect(newGame(0).flags.welcome).toBe(false); // a brand-new game shows it
    expect(deserialize(JSON.stringify(old))!.flags.trainIntro).toBe(true);
    expect(newGame(0).flags.trainIntro).toBe(false);
  });

  it('v7 saves: the old flat skills are refunded as unspent points', () => {
    const v7 = JSON.parse(serialize(newGame(0)));
    v7.version = 7;
    v7.main = { trains: 50, skills: { power: 3, speed: 2 } };
    const s = deserialize(JSON.stringify(v7))!;
    expect(s.main).toEqual({ trains: 50, skills: {} });
  });

  it("v8 -> v9: Glimmer's robe and first focus move over for his new magic weapon slot", () => {
    const v8 = JSON.parse(serialize(newGame(0)));
    v8.version = 8;
    v8.inventory = [
      { uid: 1, base: 'leatherVest', level: 1 },
      { uid: 2, base: 'emberOrb', level: 2 },
      { uid: 3, base: 'luckyCharm', level: 1 },
    ];
    v8.equipment = { glimmer: [1, 2, 3], main: [null, null, 3] };
    const s = deserialize(JSON.stringify(v8))!;
    expect(s.equipment.glimmer).toEqual([null, 1, 2]);
    expect(s.equipment.main).toEqual([null, null, 3]);
    expect(s.inventory).toHaveLength(3); // the second focus stays in the inventory
    // Current saves aren't remapped again.
    expect(deserialize(serialize(s))!.equipment.glimmer).toEqual([null, 1, 2]);
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
    expect(s.version).toBe(SAVE_VERSION);
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
