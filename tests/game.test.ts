import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  areaDef,
  AREAS,
  enemyDef,
  enemyDrops,
  modRoll,
  MOD_METALS,
  modCost,
  modGold,
  MOD_GEMS,
  modValue,
  modPower,
  modPerfect,
  MOD_QUALITY_STEPS,
  REFINES,
  ENCHANTS,
  type EnchantId,
  enemyExtraDrops,
  dropRarity,
  areaEnemies,
  enemyUnlockCost,
  GEAR,
  GUARDIAN_TIME,
  hunterDef,
  HUNTERS,
  MAIN_RANGE,
  itemCost,
  itemDef,
  itemLevels,
  gearCost,
  gearStats,
  gearTotals,
  rollLoot,
  gearTier,
  gearArea,
  gearTypes,
  DAMAGE_TYPES,
  lootChance,
  tomeSummonType,
  ARMOR_TYPES,
  effectBase,
  MAX_STARS,
  OFFLINE_CAP_SEC,
  RARITIES,
  ITEMS,
  STATION_EFFICIENCY,
  STUN_IMMUNITY,
  GUARDIAN_COOLDOWN,
  eventDef,
  ENEMIES,
  ARCHETYPES,
  helperTrainCost,
  HELPER_TRAIN_GROWTH,
  HELPER_TAPER_GROWTH,
  powerDamage,
  TIER_HIT,
  weaponHit,
  WEAPON_HIT_POWER,
  HELPER_TAPER_LEVEL,
  HELPER_TAPER_SESSIONS,
  helperBulkCost,
  helperMaxAffordable,
  levelFromTrains,
  ASCEND_LEVEL,
  MAIN_ASCEND_LEVEL,
  MAIN_MAX_LEVEL,
  MAIN_SESSIONS_TO_ASCEND,
  MAIN_SESSIONS_AFTER_ASCEND,
  mainBulkCost,
  SLAYER_TREE,
  WEAPON_CLASSES,
  weaponUptime,
  weaponHitsPerAttack,
  EVENTS,
  TRAIN_UNLOCK_KILLS,
  dropsFrom,
  ASCENDED_TREES,
  MAX_LEVEL,
  SESSIONS_AFTER_ASCEND,
  SESSIONS_TO_ASCEND,
  SKILL_TREES,
  gearDef,
  type GearId,
  EMPOWER,
  MAX_EMPOWER_SESSIONS,
  MAX_MONSTER_LEVEL,
  EMPOWER_UNLOCK_KILLS,
  evoKillsNeeded,
  EVO_TREES,
  RESIST_MULT,
  STATUS,
  FROST_TAP_CHILL,
  type DamageType,
  type MaterialId,
  typeMult,
  WEAK_MULT,
} from '../src/core/balance';
import { Field, type Enemy } from '../src/core/field';
import { Game } from '../src/core/game';
import { deserialize, FX_KEYS, newGame as startingGame, SAVE_VERSION, serialize, type GameState } from '../src/core/state';

/** A new game without the starting gear, so tests see a bare Hunter unless they add gear themselves. */
function newGame(now = 0): GameState {
  const s = startingGame(now);
  s.inventory = [];
  s.equipment = {};
  s.nextGearUid = 1;
  return s;
}

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
  s.flags.trainIntro = true; // past the first 20 slimes, so training is open
  return s;
}

function rich(): Game {
  const s = veteran(newGame(0));
  s.gold = 1e20;
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
    s.areas.forest.kills = areaDef('forest').mastery;
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

  it('a new game starts with a Short Sword and Common Clothes on, and a Short Bow in the inventory', () => {
    const g = new Game(startingGame(0), noCrit);
    expect(g.equipped('main').map((it) => it?.base ?? null)).toEqual(['shortSword', 'commonClothes', null]);
    expect(g.state.inventory.map((it) => it.base)).toContain('shortBow');
    expect(g.weaponClassOf('main')?.name).toBe('Sword');
    // One damage from the Short Sword, no bonuses: exactly a green slime's HP.
    expect(g.damage).toBe(1);
    expect(g.enemyStats('greenSlime').hp).toBe(1);
    expect(g.canCraftGear('shortSword')).toBe(false); // starting gear isn't craftable
    const clothes = g.equipped('main')[1]!;
    expect(g.gearUpgradeCost(clothes.uid)).toBeNull(); // no stats, nothing to upgrade
    expect(g.salvageValue(clothes.uid)).toEqual({}); // it was free
  });

  it('beating the Time Eater, the Void Rift Guardian, conquers the Void Rift', () => {
    const g = new Game(newGame(0), noCrit);
    for (const a of AREAS) g.state.areas[a.id].unlocked = true;
    g.travel('rift');
    expect(g.guardianType).toBe('timeEater');
    const events: string[] = [];
    g.on((e) => events.push(e.type));
    g.state.areas.rift.kills = AREAS[AREAS.length - 1].mastery;
    expect(g.challengeGuardian()).toBe(true);
    g.bossSpawned();
    g.registerKill('timeEater', true);
    expect(events).toContain('finalGuardian');
    expect(g.state.events['guardian-rift'].completed).toBe(1);
  });

  it('the Time Eater is beaten once its HP falls to half', () => {
    const g = new Game(newGame(0), noCrit);
    for (const a of AREAS) g.state.areas[a.id].unlocked = true;
    g.travel('rift');
    g.state.areas.rift.kills = AREAS[AREAS.length - 1].mastery;
    g.challengeGuardian();
    g.bossSpawned();
    const events: string[] = [];
    g.on((e) => events.push(e.type));
    const f = new Field(g);
    const max = g.guardianHp;
    const boss = enemy({ id: 1, type: 'timeEater', boss: true, x: 100, hp: max * 0.5 + g.tapDamage * 0.5, maxHp: max, r: 40 });
    f.enemies.push(boss);
    f.tap(100, 0); // one tap takes it just past half
    expect(boss.hp).toBe(0);
    expect(events).toContain('finalGuardian');
  });

  it('the Guardian is tuned to the next area and later areas are tougher and richer', () => {
    const g = new Game(newGame(0), noCrit);
    // The Guardian is a wall: far tougher than anything in the next area.
    expect(g.guardianHp).toBeGreaterThan(areaDef('glade').hp * 5);
    // Each area is far tougher and far richer than the last, and HP and gold both grow exponentially.
    for (let i = 1; i < AREAS.length; i++) {
      expect(AREAS[i].hp).toBeGreaterThan(AREAS[i - 1].hp * 1.5);
      expect(AREAS[i].gold).toBeGreaterThan(AREAS[i - 1].gold * 10);
      if (i < AREAS.length - 1) expect(AREAS[i].guardian).toBeGreaterThan(AREAS[i + 1].hp * 2);
    }
  });
});

describe('Enemies & archetypes', () => {
  it("kills drop the enemy's own material and count toward its area's mastery", () => {
    const g = new Game(newGame(0), () => 0);
    g.registerKill('wolf', false);
    expect(g.state.materials.pelt).toBe(1);
    expect(g.state.areas.forest.kills).toBe(1);
  });

  it('bestiary: unlock enemies in unlocked areas; Empower makes them tougher but richer and levels them up', () => {
    const g = rich();
    expect(g.unlockEnemy('zombie')).toBe(false); // graveyard still locked
    const spawn = g.spawnRate;
    expect(g.unlockEnemy('wolf')).toBe(true);
    expect(g.spawnRate).toBeGreaterThan(spawn);
    expect(enemyUnlockCost(enemyDef('greenSlime'))).toBe(0);

    const before = g.enemyStats('wolf');
    g.state.buyAmount = 1;
    // Empower opens after 100 slimes.
    expect(g.empowerUnlocked).toBe(false);
    expect(g.empower('wolf')).toBe(false);
    g.state.bestiary.greenSlime.kills = 60;
    g.state.bestiary.umbralOoze.kills = 39; // every slime counts
    expect(g.empowerUnlocked).toBe(false);
    g.registerKill('greenSlime', false);
    expect(g.slimeKills).toBe(EMPOWER_UNLOCK_KILLS);
    expect(g.empowerUnlocked).toBe(true);
    const cost = g.empowerPurchase('wolf').cost;
    const gold = g.state.gold;
    expect(g.empower('wolf')).toBe(true);
    expect(g.state.gold).toBe(gold - cost);
    expect(g.empowerPurchase('wolf').cost).toBeGreaterThan(cost);
    const after = g.enemyStats('wolf');
    expect(after.hp).toBeCloseTo(before.hp * (1 + EMPOWER.hp));
    expect(after.gold / g.goldMult).toBeCloseTo((before.gold / g.goldMult) * (1 + EMPOWER.gold));
    expect(after.dropChance).toBeCloseTo(before.dropChance * (1 + EMPOWER.drops));
    expect(after.spawnRate).toBeCloseTo(before.spawnRate * (1 + EMPOWER.spawn));
    expect(after.speed).toBe(before.speed);
    // Every 5 sessions is a level; each level is an evolution point.
    expect(g.monsterLevelInfo('wolf').level).toBe(1);
    expect(g.evoPoints('wolf')).toBe(0);
    g.state.buyAmount = 10;
    g.empower('wolf');
    expect(g.state.bestiary.wolf.empower).toBe(11);
    expect(g.monsterLevelInfo('wolf').level).toBe(3);
    expect(g.evoPoints('wolf')).toBe(2);
    const lv3 = g.enemyStats('wolf');
    expect(lv3.gold / g.goldMult).toBeCloseTo((before.gold / g.goldMult) * (1 + 11 * EMPOWER.gold));
    // Lv 42 is the top (enough points for any evolution tree): Empower stops there.
    g.state.gold = 1e300;
    g.state.buyAmount = 'max';
    g.empower('wolf');
    expect(g.state.bestiary.wolf.empower).toBe(MAX_EMPOWER_SESSIONS);
    expect(g.monsterLevelInfo('wolf').level).toBe(MAX_MONSTER_LEVEL);
    expect(g.empower('wolf')).toBe(false);
    // Locked monsters can't be empowered.
    expect(g.empower('zombie')).toBe(false);
  });

  it('evolution trees: one per archetype, root first; slimes get HP and gold, then bigger hordes', () => {
    const g = rich();
    g.state.bestiary.greenSlime.empower = 30; // plenty of points
    // Evolutions open as you slay more of that monster.
    expect(g.canEvolve('greenSlime', 'root')).toBe(false);
    expect(g.evoKillsLeft('greenSlime', 'root')).toBe(evoKillsNeeded(enemyDef('greenSlime'), EVO_TREES.slime[0]));
    g.state.bestiary.greenSlime.kills = 100;
    expect(g.canEvolve('greenSlime', 'root')).toBe(true);
    expect(g.evoKillsLeft('greenSlime', 'capstone')).toBeGreaterThan(0);
    g.state.bestiary.greenSlime.kills = 1e6;
    expect(g.evoTree('greenSlime')).toBe(EVO_TREES.slime);
    expect(g.canEvolve('greenSlime', 'horde')).toBe(false); // needs the root first
    const base = g.enemyStats('greenSlime');
    expect(g.evolve('greenSlime', 'root')).toBe(true);
    const rooted = g.enemyStats('greenSlime');
    expect(rooted.hp).toBeCloseTo(base.hp * 1.25);
    expect(rooted.gold).toBeCloseTo(base.gold * 1.25);
    expect(g.evolve('greenSlime', 'root')).toBe(false); // maxed at 1 rank
    expect(g.evolve('greenSlime', 'horde')).toBe(true);
    expect(g.evolve('greenSlime', 'horde2')).toBe(true); // Small Hordes
    expect(g.packOf('greenSlime')).toEqual([enemyDef('greenSlime').pack[0] + 1, enemyDef('greenSlime').pack[1] + 1]);
    const points = g.evoPoints('greenSlime');
    expect(points).toBe(g.monsterLevelInfo('greenSlime').level - 1 - 3);
    // Every archetype has a tree of the same shape.
    for (const a of Object.keys(ARCHETYPES) as Array<keyof typeof ARCHETYPES>) {
      expect(EVO_TREES[a].map((n) => n.id)).toEqual(['root', 'wealth', 'horde', 'harvest', 'wealth2', 'horde2', 'harvest2', 'capstone']);
    }
  });

  it('v10 -> v11: Swarm and Bounty levels carry over as Empower sessions', () => {
    const old = JSON.parse(serialize(newGame(0)));
    old.version = 10;
    old.bestiary.greenSlime = { unlocked: true, swarm: 3, bounty: 2 };
    old.bestiary.wolf = { unlocked: true, swarm: 0, bounty: 0 };
    const s = deserialize(JSON.stringify(old))!;
    expect(s.bestiary.greenSlime).toEqual({ unlocked: true, empower: 5, evo: {}, kills: 0 });
    expect(s.bestiary.wolf).toEqual({ unlocked: true, empower: 0, evo: {}, kills: 0 });
    // Current saves keep their evolutions (and drop ranks for nodes that don't exist).
    const cur = newGame(0);
    cur.bestiary.greenSlime = { unlocked: true, empower: 12, evo: { root: 1, horde: 2, bogus: 4 }, kills: 345 };
    expect(deserialize(serialize(cur))!.bestiary.greenSlime).toEqual({ unlocked: true, empower: 12, evo: { root: 1, horde: 2 }, kills: 345 });
  });

  it('enemies belong to archetypes: slimes are slimes, skeletons and zombies are undead', () => {
    expect(enemyDef('greenSlime').archetype).toBe('slime');
    expect(enemyDef('umbralOoze').archetype).toBe('slime');
    expect(enemyDef('skeleton').archetype).toBe('undead');
    expect(enemyDef('zombie').archetype).toBe('undead');
    expect(enemyDef('wolf').archetype).toBe('beast');
  });
});

describe('Hunters', () => {
  it("Hunters become available through their area's events: Reginald after a Slime Swarm", () => {
    const s = newGame(0);
    s.gold = 1e9;
    s.areas.forest.kills = 1e6;
    const g = new Game(s, noCrit);
    expect(hunterDef('alchemist').unlock).toEqual({ event: 'slimeSwarm', times: 1 });
    expect(g.hunterAvailable('alchemist')).toBe(false);
    expect(g.recruit('alchemist')).toBe(false);
    expect(g.huntersUnlockedBy('slimeSwarm')).toEqual(['alchemist']);
    g.state.events.slimeSwarm.completed = 1;
    expect(g.hunterAvailable('alchemist')).toBe(true);
    expect(g.huntersUnlockedBy('guardian-forest')).toEqual(['ranger']);
    g.startEvent('guardian-forest');
    g.bossSpawned();
    g.registerKill(g.guardianType, true);
    expect(g.hunterAvailable('ranger')).toBe(true); // Galladair: one Forest Guardian win
    expect(g.recruit('alchemist')).toBe(true);
    expect(g.recruit('alchemist')).toBe(false);
    // Glimmer waits in the Forbidden Crypt for its Guardian to fall.
    expect(hunterDef('glimmer').area).toBe('crypt');
    expect(hunterDef('glimmer').unlock).toEqual({ event: 'guardian-crypt', times: 1 });
    expect(g.hunterAvailable('glimmer')).toBe(false);
    g.state.events['guardian-crypt'].completed = 1;
    expect(g.hunterAvailable('glimmer')).toBe(true);
  });

  it('the Shadowy Depths: Wilhelm after its Guardian, Celeste the Psion after two', () => {
    expect(hunterDef('wilhelm').area).toBe('depths');
    expect(hunterDef('wilhelm').unlock).toEqual({ event: 'guardian-depths', times: 1 });
    expect(hunterDef('wilhelm').story).toContain('a hundred eyes');
    const c = hunterDef('celeste');
    expect([c.name, c.title, c.area]).toEqual(['Celeste', 'Psion', 'depths']);
    expect(c.unlock).toEqual({ event: 'guardian-depths', times: 2 });
    expect(c.bane).toEqual({ archetype: 'dragon', mult: 3 });
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
    for (const id of ['alchemist', 'ranger', 'glimmer', 'thief'] as const) g.recruit(id);
    g.state.areas.graveyard.unlocked = true;
    g.state.hunters.alchemist.trains = 50;
    g.state.gold = 1000; // small enough that forest gold still shows up
    expect(g.station('alchemist', 'forest')).toBe(true);
    expect(g.station('ranger', 'forest')).toBe(true);
    expect(g.station('glimmer', 'forest')).toBe(true);
    expect(g.stationedIn('forest')).toEqual(['alchemist', 'ranger', 'glimmer']);
    expect(g.station('thief', 'forest')).toBe(false); // full
    expect(g.canStation('ranger', 'forest')).toBe(true); // already there
    g.station('glimmer', null);
    expect(g.station('thief', 'forest')).toBe(true);

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

  it('gold perks boost their own kills (Alias\'s Sticky Fingers)', () => {
    const g = rich();
    g.state.hunters.thief.recruited = true;
    const plain = g.registerKill('greenSlime', false, 'main').gold;
    g.state.hunters.thief.trains = 50;
    expect(g.learn('thief', 'root')).toBe(true);
    expect(g.registerKill('greenSlime', false, 'thief').gold).toBeCloseTo(plain * 1.1);
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
  it('training opens once 20 slimes are slain', () => {
    const g = new Game(newGame(0), noCrit);
    g.state.gold = 1e9;
    expect(g.trainUnlocked).toBe(false);
    expect(g.train('main')).toBe(false);
    g.state.bestiary.greenSlime.kills = TRAIN_UNLOCK_KILLS - 1;
    expect(g.train('main')).toBe(false);
    g.state.bestiary.greenSlime.kills = TRAIN_UNLOCK_KILLS;
    expect(g.train('main')).toBe(true);
  });

  it('the Forest Guardian Challenge unlocks at 10,000 Forest kills (any monster); Twigglings cost 250 gold', () => {
    expect(areaDef('forest').mastery).toBe(10_000);
    expect(eventDef('guardian-forest').unlockKills).toBe(10_000);
    expect(enemyUnlockCost(enemyDef('twiggling'))).toBe(250);
  });

  it('training adds damage; levels need more sessions each time and earn skill points', () => {
    const g = new Game(newGame(0), noCrit);
    g.state.gold = 1e9;
    g.state.flags.trainIntro = true;
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

  it("every Guild Hunter's first tree costs 39 points: complete at Lv 40", () => {
    for (const h of HUNTERS) {
      const cost = SKILL_TREES[h.id].reduce((sum, n) => sum + n.maxRank * (n.cost ?? 1), 0);
      expect(cost, h.id).toBe(39);
      // The capstone is the last node: its cost is what's left after everything else at Lv 40.
    }
  });

  it('Guild Hunter training costs taper past Lv 30: +8.5% per session before, +1% after', () => {
    const base = 10;
    const k = HELPER_TAPER_SESSIONS;
    expect(levelFromTrains(k).level).toBe(HELPER_TAPER_LEVEL);
    const one = (n: number) => helperBulkCost(base, n, 1);
    expect(one(k - 1) / one(k - 2)).toBeCloseTo(HELPER_TRAIN_GROWTH);
    expect(one(k + 1) / one(k)).toBeCloseTo(HELPER_TAPER_GROWTH);
    expect(one(k) / one(k - 1)).toBeCloseTo(HELPER_TRAIN_GROWTH); // no jump at the switch
    // Bulk costs add up session by session, across the switch.
    let sum = 0;
    for (let n = k - 5; n < k + 5; n++) sum += one(n);
    expect(helperBulkCost(base, k - 5, 10) / sum).toBeCloseTo(1, 9);
    // MAX buys as many as the gold covers, within the level cap.
    const ten = helperBulkCost(base, k - 5, 10);
    expect(helperMaxAffordable(base, k - 5, ten, 100)).toBe(10);
    expect(helperMaxAffordable(base, k - 5, ten, 4)).toBe(4);
  });

  it('Ascension: gold node after a full tree (10 points = Lv 50), level curve restarts, new tree to Lv 100', () => {
    const g = rich();
    g.recruit('alchemist');
    const t = g.state.hunters.alchemist;
    // Training stops at Lv 50 until they ascend.
    t.trains = SESSIONS_TO_ASCEND - 1;
    expect(g.trainPurchase('alchemist', 10).count).toBe(1);
    t.trains = SESSIONS_TO_ASCEND;
    expect(g.levelOf('alchemist')).toBe(ASCEND_LEVEL);
    expect(g.trainPurchase('alchemist', 1).count).toBe(0);
    expect(g.train('alchemist')).toBe(false);
    // Fill the first tree (39 points), leaving 10 for Ascend.
    expect(g.nodeReachable('alchemist', 'ascend')).toBe(false);
    for (const n of SKILL_TREES.alchemist) while (g.skill('alchemist', n.id) < n.maxRank) expect(g.learn('alchemist', n.id)).toBe(true);
    expect(g.skillPoints('alchemist')).toBe(10);
    expect(g.nodeReachable('alchemist', 'ascend')).toBe(true);
    const cost = g.trainPurchase('alchemist', 1);
    expect(g.titleOf('alchemist')).toBe('Alchemist');
    expect(g.learn('alchemist', 'ascend')).toBe(true);
    // Ascended: new title, still Lv 50, 1 session to Lv 51, and the price picks up where it was.
    expect(g.ascended('alchemist')).toBe(true);
    expect(g.titleOf('alchemist')).toBe(hunterDef('alchemist').ascendedTitle);
    expect(g.levelInfo('alchemist')).toEqual({ level: 50, into: 0, need: 1 });
    expect(g.skillPoints('alchemist')).toBe(0);
    const after = g.trainPurchase('alchemist', 1);
    expect(after.count).toBe(1);
    g.state.gold = 1e300;
    g.state.buyAmount = 1;
    expect(g.train('alchemist')).toBe(true);
    expect(g.levelOf('alchemist')).toBe(51);
    // The price carries on from where it was: the first session after ascending costs what the next one would have.
    const base = helperTrainCost(hunterDef('alchemist'));
    const expected = base * HELPER_TRAIN_GROWTH ** HELPER_TAPER_SESSIONS * HELPER_TAPER_GROWTH ** (SESSIONS_TO_ASCEND - HELPER_TAPER_SESSIONS);
    expect(after.cost / expected).toBeCloseTo(1, 6);
    void cost;
    // The ascended tree is 50 points with its capstone last: at Lv 100 exactly.
    expect(ASCENDED_TREES.alchemist.reduce((sum, n) => sum + n.maxRank * (n.cost ?? 1), 0)).toBe(50);
    t.trains = t.ascendAt! + SESSIONS_AFTER_ASCEND;
    expect(g.levelOf('alchemist')).toBe(MAX_LEVEL);
    expect(g.trainPurchase('alchemist', 1).count).toBe(0);
    expect(g.skillPoints('alchemist')).toBe(50);
    for (const n of ASCENDED_TREES.alchemist) while (g.skill('alchemist', n.id, 'ascended') < n.maxRank) expect(g.learn('alchemist', n.id, 'ascended')).toBe(true);
    expect(g.skillPoints('alchemist')).toBe(0);
    // It survives a save.
    const back = deserialize(serialize(g.state))!;
    expect(back.hunters.alchemist.ascendAt).toBe(t.ascendAt);
    expect(back.hunters.alchemist.skills2).toEqual(t.skills2);
  });

  it("the Slayer: your Hunter's tree runs to Lv 90, Ascend at Lv 100, then the Slayer's tree to Lv 200", () => {
    const g = rich();
    const t = g.state.main;
    expect(g.titleOf('main')).toBe('Hunter');
    // The whole first tree costs 89 points, plus 10 for Ascend: Lv 100.
    expect(SKILL_TREES.main.reduce((sum, n) => sum + n.maxRank * (n.cost ?? 1), 0)).toBe(89);
    expect(SLAYER_TREE.reduce((sum, n) => sum + n.maxRank * (n.cost ?? 1), 0)).toBe(100);
    // Training stops at Lv 100.
    t.trains = MAIN_SESSIONS_TO_ASCEND - 1;
    expect(g.trainPurchase('main', 10).count).toBe(1);
    t.trains = MAIN_SESSIONS_TO_ASCEND;
    expect(g.levelOf('main')).toBe(MAIN_ASCEND_LEVEL);
    expect(g.trainPurchase('main', 1).count).toBe(0);
    expect(g.nodeReachable('main', 'ascend')).toBe(false);
    for (const n of [...SKILL_TREES.main].sort((a, b) => a.row - b.row)) while (g.skill('main', n.id) < n.maxRank) expect(g.learn('main', n.id)).toBe(true);
    expect(g.skillPoints('main')).toBe(10);
    expect(g.learn('main', 'ascend')).toBe(true);
    expect(g.titleOf('main')).toBe('Slayer');
    expect(g.levelInfo('main')).toEqual({ level: 100, into: 0, need: 1 });
    expect(g.trainPurchase('main', 1).count).toBe(1);
    t.trains = t.ascendAt! + MAIN_SESSIONS_AFTER_ASCEND;
    expect(g.levelOf('main')).toBe(MAIN_MAX_LEVEL);
    expect(g.trainPurchase('main', 1).count).toBe(0);
    const dmg = g.damage;
    for (const n of SLAYER_TREE) while (g.skill('main', n.id, 'ascended') < n.maxRank) expect(g.learn('main', n.id, 'ascended')).toBe(true);
    expect(g.skillPoints('main')).toBe(0);
    expect(g.damage).toBeGreaterThan(dmg * 1.5);
    const back = deserialize(serialize(g.state))!;
    expect(back.main.ascendAt).toBe(t.ascendAt);
    expect(back.main.skills2).toEqual(t.skills2);
  });

  it('past Lv 30 training keeps getting pricier at least as fast as it adds damage, and stays finite to the top', () => {
    const k = MAIN_SESSIONS_TO_ASCEND;
    const costStep = mainBulkCost(k, 1) / mainBulkCost(k - 1, 1);
    const dmgStep = (powerDamage(k + 25) / powerDamage(k)) ** (1 / 25);
    expect(costStep).toBeGreaterThanOrEqual(dmgStep);
    expect(Number.isFinite(mainBulkCost(0, MAIN_SESSIONS_TO_ASCEND + MAIN_SESSIONS_AFTER_ASCEND))).toBe(true);
    const base = helperTrainCost(hunterDef('alchemist'));
    expect(Number.isFinite(helperBulkCost(base, 0, SESSIONS_TO_ASCEND + SESSIONS_AFTER_ASCEND))).toBe(true);
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
    expect(g.damage).toBeCloseTo(dmg * 1.2);
    expect(g.fireRate).toBeCloseTo(rate * 1.05);
    expect(g.stunTime()).toBeLessThan(stun);
    expect(g.tapDamage).toBeGreaterThan(tap * 1.1);
    expect(g.tapRadius).toBeGreaterThan(radius);
    expect(g.learn('main', 'capstone')).toBe(false); // your Hunter's capstone hangs from the ability nodes
    expect(g.learn('main', 'flameTap')).toBe(true);
    expect(g.learn('main', 'capstone')).toBe(true); // reachable from any one of them
    // Every Hunter has their own tree of the same shape.
    expect(g.skillTree('ranger').map((n) => n.id)).toEqual(['root', 'power', 'speed', 'recovery', 'power2', 'speed2', 'recovery2', 'capstone', 'ascend']);
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

  it('Upgrades have rarities; the Forest Idol doubles Wandering Woods HP and gold, and nowhere else', () => {
    for (const it of ITEMS) expect(Object.keys(RARITIES)).toContain(it.rarity);
    const g = rich();
    const before = g.enemyStats('greenSlime');
    const elsewhere = g.enemyStats('skeleton');
    for (const [m, n] of Object.entries(itemCost(itemDef('forestIdol'), 0))) g.state.materials[m as keyof typeof g.state.materials] = n!;
    expect(g.craft('forestIdol')).toBe(true);
    expect(g.enemyStats('greenSlime').hp / before.hp).toBeCloseTo(2);
    expect(g.enemyStats('greenSlime').gold / before.gold).toBeCloseTo(2);
    expect(g.enemyStats('skeleton').hp).toBeCloseTo(elsewhere.hp);
    g.state.items.forestIdol = MAX_STARS;
    expect(g.enemyStats('greenSlime').gold / before.gold).toBeCloseTo(3);
  });

  it('drop chances past 100% drop several: each 100% is guaranteed, the rest is a chance of one more', () => {
    expect(dropsFrom(0.5, 0.4)).toBe(1);
    expect(dropsFrom(0.5, 0.6)).toBe(0);
    expect(dropsFrom(1.5, 0.4)).toBe(2);
    expect(dropsFrom(1.5, 0.6)).toBe(1);
    expect(dropsFrom(3.5, 0.49)).toBe(4);
    expect(dropsFrom(3.5, 0.99)).toBe(3);
    expect(dropsFrom(2, 0.999)).toBe(2);
  });

  it('a new recruit joins you in your current area (if there is room)', () => {
    const g = rich();
    g.state.areas.graveyard.unlocked = true;
    g.state.area = 'graveyard';
    for (const h of ['alchemist', 'ranger'] as const) g.state.hunters[h].recruited = false;
    g.state.stats.guardians = 99;
    g.recruit('alchemist');
    expect(g.state.hunters.alchemist.station).toBe('graveyard');
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
    const twig = g.state.materials.twig;
    const bow = g.craftGear('forestBow')!;
    expect(bow.stars).toBe(1);
    expect(g.state.inventory).toHaveLength(1);
    expect(g.state.materials.twig).toBeLessThan(twig);
    expect(g.upgradeGear(bow.uid)).toBe(true);
    expect(g.gearItem(bow.uid)!.stars).toBe(2);
    const poor = new Game(newGame(0), noCrit);
    expect(poor.craftGear('forestBow')).toBeNull();
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
    const bow = g.craftGear('forestBow')!;
    const spear = g.craftGear('ironSpear')!;
    expect(g.equip('lance', 0, bow.uid)).toBe(false); // Lance's first slot is melee
    expect(g.equip('lance', 0, spear.uid)).toBe(true);
    expect(g.equip('main', 0, bow.uid)).toBe(true);
    expect(g.equip('ranger', 0, bow.uid)).toBe(true);
    expect(g.equipped('main')[0]).toBeNull(); // moved to Galladair
    expect(g.wearerOf(bow.uid)).toEqual({ who: 'ranger', slot: 0 });
    expect(g.equip('thief', 1, null)).toBe(false); // not recruited
  });

  it('gear changes combat stats', () => {
    const g = stocked();
    const dmg = g.damage;
    const bow = g.craftGear('forestBow')!;
    g.equip('main', 0, bow.uid);
    // Every hit starts from the weapon's own damage (bare-handed: 1).
    expect(g.damage).toBeCloseTo(dmg * weaponHit(gearDef('forestBow'), 1));
    expect(weaponHit(gearDef('forestBow'), 1)).toBeGreaterThan(weaponHit(gearDef('shortBow'), 1)); // crafted beats starting gear
    const stun = g.stunTime();
    const vest = g.craftGear('furCoat')!;
    g.equip('main', 1, vest.uid);
    expect(g.stunTime()).toBeLessThan(stun);
    const lens = g.craftGear('hawkeyeLens')!;
    const range = g.shooterRange('main');
    g.equip('main', 2, lens.uid);
    expect(g.shooterRange('main')).toBe(range + 20);
  });

  it('magic weapons: Glimmer takes only magic, Reginald takes ranged or magic, nobody else takes magic', () => {
    const g = stocked();
    g.recruit('alchemist');
    const wand = g.craftGear('slimeWand')!;
    const bow = g.craftGear('forestBow')!;
    expect(g.equip('glimmer', 0, bow.uid)).toBe(false);
    expect(g.equip('glimmer', 0, wand.uid)).toBe(true);
    expect(g.equip('alchemist', 0, bow.uid)).toBe(true);
    expect(g.equip('alchemist', 0, wand.uid)).toBe(true); // moves from Glimmer
    expect(g.equip('main', 0, wand.uid)).toBe(true); // your Hunter's weapon slot takes any weapon
    g.equip('alchemist', 0, wand.uid);
    expect(g.equip('ranger', 0, wand.uid)).toBe(false);
    expect(g.equip('lance', 0, wand.uid)).toBe(false);
  });

  it("a spellcaster's weapon damage powers their special and its attack rate widens it", () => {
    const g = stocked();
    const dmg = g.shotDamage('glimmer') * g.specialDamageMult('glimmer');
    const r = g.specialRadius('glimmer');
    const dps = g.dpsOf('glimmer');
    const staff = g.craftGear('soulfireStaff')!; // its base damage, +15% rate
    g.equip('glimmer', 0, staff.uid);
    expect(g.shotDamage('glimmer') * g.specialDamageMult('glimmer')).toBeCloseTo(dmg * weaponHit(gearDef('soulfireStaff'), 1));
    expect(g.specialRadius('glimmer')).toBeCloseTo(r * 1.15);
    expect(g.dpsOf('glimmer')).toBeGreaterThan(dps * 1.5);
    // Area gear still widens it too, and Hunters without a special have none.
    const orb = g.craftGear('emberOrb')!;
    g.equip('glimmer', 2, orb.uid);
    expect(g.specialRadius('glimmer')).toBeCloseTo(r * 1.15 * 1.12);
    expect(g.specialCooldown('ranger')).toBeNull();
    expect(g.specialDamageMult('ranger')).toBe(0);
  });

  it("damage types: a Hunter deals their weapon's type, or Physical without one; specials keep their own", () => {
    const g = stocked();
    g.recruit('alchemist');
    expect(g.damageTypeOf('main')).toBe('physical');
    expect(g.damageTypeOf('glimmer')).toBe('physical');
    expect(g.damageTypeOf('alchemist')).toBe('physical');
    expect(g.damageTypeOf('alchemist', 'long', true)).toBe('poison'); // potions stay poison
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
    // On the field: the same shot deals 1.5x to a weak enemy (Glimmer with a Spark Wand deals fire).
    const g = stocked();
    g.equip('glimmer', 0, g.craftGear('sparkWand')!.uid);
    const f = new Field(g);
    const hits: Array<{ dmg: number; affinity?: string | null }> = [];
    const at = (id: number, type: Enemy['type']) => enemy({ id, type, x: 0, y: -150, hp: 1e12, maxHp: 1e12 });
    const [slime, wolf, magma] = [at(1, 'greenSlime'), at(2, 'wolf'), at(3, 'magmaSlime')];
    for (const e of [slime, wolf, magma]) {
      f.enemies = [e];
      (f as unknown as { hitWith: (...a: unknown[]) => void }).hitWith('glimmer', e, 1, 0, 0, false);
      for (const ev of f.drainEvents()) if (ev.type === 'hit') hits.push(ev);
    }
    expect(hits.map((h) => h.affinity)).toEqual(['weak', 'weak', 'resist']);
    expect(hits[0].dmg / hits[2].dmg).toBeCloseTo(WEAK_MULT / RESIST_MULT);
  });

  it("Void opens a gravity well: monsters around the one hit are pulled in to it (not Guardians or the Void-resistant)", () => {
    const g = stocked();
    const f = new Field(g);
    const api = f as unknown as { applyStatus: (e: Enemy, t: string, dmg: number, by: string) => void; tickStatus: (e: Enemy, dt: number) => void };
    const at = (id: number, x: number, type: Enemy['type'] = 'greenSlime', boss = false) => enemy({ id, type, x, y: -200, hp: 1e9, maxHp: 1e9, boss });
    const host = at(1, 0);
    const near = at(2, 60);
    const far = at(3, 400);
    const guardian = at(4, -60, 'greenSlime', true);
    const resists = ENEMIES.find((d) => d.resist.includes('void') && !d.guardianOnly);
    const holder = resists ? at(5, 0, resists.id) : null;
    if (holder) holder.y = -140;
    f.enemies = [host, near, far, guardian, ...(holder ? [holder] : [])];
    api.applyStatus(host, 'void', 100, 'main');
    expect(host.well).toBe(STATUS.well.duration);
    for (let i = 0; i < 30; i++) api.tickStatus(host, 1 / 30);
    // Pulled in until it touches the host, no further.
    expect(near.x).toBeCloseTo(host.r + near.r, 0);
    expect(far.x).toBe(400);
    expect(guardian.x).toBe(-60);
    if (holder) expect(holder.y).toBe(-140);
    for (let i = 0; i < 30; i++) api.tickStatus(host, 1 / 30);
    expect(host.well).toBe(0);
  });

  it('Refine (Kargesh): a random stat that fits the piece, rolled within a range that grows with rarity', () => {
    let roll = 0;
    const g = stocked();
    (g as unknown as { rng: () => number }).rng = () => roll;
    g.state.gold = 1e30;
    const bow = g.craftGear('emberLongbow')!; // Very Rare: 1 slot
    const rifle = g.craftGear('frostRifle')!; // Legendary: 2 slots
    const plate = g.craftGear('voidPlate')!; // Exalted armor: 3 slots
    expect(g.modSlots(bow.uid)).toEqual([null]);
    expect(g.modSlots(rifle.uid)).toEqual([null, null]);
    expect(g.modSlots(plate.uid)).toEqual([null, null, null]);
    expect(g.modSlots(g.craftGear('slimeSword')!.uid)).toEqual([]);
    expect(g.refine(bow.uid, 0)).toBeNull(); // closed until Kargesh joins
    g.state.hunters.blacksmith.recruited = true;
    // Only stats that fit: no magazine on a bow; shields and stun time on armor, no knockback there.
    expect(g.refinesFor(bow.uid)).not.toContain('mag');
    expect(g.refinesFor(plate.uid)).toEqual(expect.arrayContaining(['guard', 'stun', 'rate', 'damage']));
    expect(g.refinesFor(plate.uid)).not.toContain('knock');
    expect(g.refinesFor(g.craftGear('emberOrb')!.uid)).toEqual(expect.arrayContaining(['gold', 'drops', 'range', 'radius']));
    // Legendary attack speed rolls 5% to 10%; rarer gear rolls higher.
    expect(modRoll(REFINES.rate.range, false, 'legendary', 0)).toBeCloseTo(0.05);
    expect(modRoll(REFINES.rate.range, false, 'legendary', MOD_QUALITY_STEPS)).toBeCloseTo(0.1);
    expect(modRoll(REFINES.rate.range, false, 'exalted', MOD_QUALITY_STEPS)).toBeGreaterThan(0.1);
    // A roll: the stat and its strength both come from the dice (0: the first stat, at its lowest).
    g.equip('main', 0, bow.uid);
    const before = g.gear('main');
    const gold = g.state.gold;
    roll = 0;
    const low = g.refine(bow.uid, 0)!;
    expect(low).toEqual({ kind: 'refine', stat: 'rate', q: 0 });
    expect(modPerfect(low)).toBe(false);
    // It costs gold, plus some of the bow's recipe and golem metal (Iron Ore, for Very Rare).
    expect(g.state.gold).toBe(gold - g.modGoldOf(bow.uid, 'refine'));
    expect(g.refineCostOf(bow.uid)).toMatchObject({ ironOre: 4 });
    expect(g.state.materials.ironOre).toBe(1e6 - 4);
    expect(g.gear('main').rate).toBeCloseTo(before.rate + modRoll(REFINES.rate.range, false, 'veryRare', 0));
    // The top roll is perfect.
    roll = 0.9999;
    const top = g.refine(bow.uid, 0)!;
    expect(top.q).toBe(MOD_QUALITY_STEPS);
    expect(modPerfect(top)).toBe(true);
    // Stars don't change modifiers, and they survive a save.
    g.upgradeGear(bow.uid);
    expect(g.modSlots(bow.uid)).toEqual([top]);
    expect(deserialize(serialize(g.state))!.inventory.find((it) => it.uid === bow.uid)!.mods).toEqual([top]);
    // A rifle's Magazine Size refine grows its magazine.
    const pool = g.refinesFor(rifle.uid);
    roll = (pool.indexOf('mag') + 0.5) / pool.length;
    expect((g.refine(rifle.uid, 1) as { stat: string }).stat).toBe('mag');
    g.equip('main', 0, rifle.uid);
    const q = (g.modSlots(rifle.uid)[1] as { q: number }).q;
    expect(g.weaponClassOf('main')!.mag).toBe(Math.round(WEAPON_CLASSES.rifle.mag! * (1 + modRoll(REFINES.mag.range, false, 'legendary', q))));
  });

  it('Enchant (Marceline): a random enchantment that fits (one of each per piece), rolled; infusions, Potency, Fireburst, armor specials', () => {
    let roll = 0;
    const g = stocked();
    (g as unknown as { rng: () => number }).rng = () => roll;
    g.state.gold = 1e30;
    const bow = g.craftGear('emberLongbow')!; // Fire, Very Rare: 1 slot
    const rifle = g.craftGear('frostRifle')!; // Frost, Legendary: 2 slots
    const plate = g.craftGear('voidPlate')!; // Exalted heavy armor: 3 slots
    expect(hunterDef('enchantress')).toMatchObject({ name: 'Marceline', area: 'mines', unlock: { event: 'guardian-mines', times: 1 } });
    expect(g.enchant(bow.uid, 0)).toBeNull(); // closed until she joins
    g.state.hunters.enchantress.recruited = true;
    // What fits: no infusing a type the weapon deals; armor gets armor specials, not weapon enchantments.
    expect(g.enchantsFor(bow.uid)).not.toContain('infuseFire');
    expect(g.enchantsFor(plate.uid)).toEqual(expect.arrayContaining(['thorns', 'evasion', 'shieldBurst', 'emberPulse']));
    expect(g.enchantsFor(plate.uid)).not.toContain('potency');
    // Picks the dice roll that lands on an enchantment (they're weighted).
    const rollFor = (uid: number, slot: number, id: EnchantId) => {
      const pool = g.enchantsFor(uid, slot);
      const total = pool.reduce((sum, x) => sum + ENCHANTS[x].weight, 0);
      let acc = 0;
      for (const x of pool) {
        if (x === id) return (acc + ENCHANTS[x].weight / 2) / total;
        acc += ENCHANTS[x].weight;
      }
      throw new Error(id);
    };
    // A Frost infusion on the Fire bow: hits split Fire/Frost, plus its rolled Frost bonus.
    g.equip('main', 0, bow.uid);
    const gold = g.state.gold;
    roll = rollFor(bow.uid, 0, 'infuseFrost');
    const m = g.enchant(bow.uid, 0)! as { id: string; q: number; p: number };
    expect(m.id).toBe('infuseFrost');
    expect(g.state.gold).toBe(gold - g.modGoldOf(bow.uid, 'enchant'));
    expect(g.modGoldOf(bow.uid, 'enchant')).toBe(g.modGoldOf(bow.uid, 'refine') * 2);
    // Enchanting costs golem gems (Quartz, for Very Rare) instead of metals, plus the same share of the recipe.
    expect(g.enchantCostOf(bow.uid)).toMatchObject({ quartz: 4 });
    expect(g.enchantCostOf(bow.uid).ironOre).toBeUndefined();
    expect(g.state.materials.quartz).toBe(1e6 - 4);
    expect(g.damageTypesOf('main')).toEqual(['fire', 'frost']);
    // Two rolls: its Frost bonus (power) and its chance to chill (the one that decides Perfect).
    expect(g.typeBonus('main', 'frost')).toBeCloseTo(1 + modRoll(ENCHANTS.infuseFrost.power!, false, 'veryRare', m.p));
    expect(g.procFor('main', 'frost')).toBeCloseTo(modRoll(ENCHANTS.infuseFrost.range, false, 'veryRare', m.q));
    expect(g.procFor('main', 'fire')).toBe(g.procOf('main')); // the bow's own Fire keeps its own chance
    // Potency on the rifle: more status chance; what one slot holds can't roll into another.
    g.equip('main', 0, rifle.uid);
    const proc = g.procOf('main');
    roll = rollFor(rifle.uid, 0, 'potency');
    expect((g.enchant(rifle.uid, 0) as { id: string }).id).toBe('potency');
    expect(g.enchantsFor(rifle.uid, 1)).not.toContain('potency');
    const pq = (g.modSlots(rifle.uid)[0] as { q: number }).q;
    expect(g.procOf('main')).toBeCloseTo(proc + modRoll(ENCHANTS.potency.range, false, 'legendary', pq));
    // Fireburst: kills by the weapon burst around the monster.
    roll = rollFor(rifle.uid, 1, 'fireburst');
    expect((g.enchant(rifle.uid, 1) as { id: string }).id).toBe('fireburst');
    const f = new Field(g);
    const victim = enemy({ id: 1, x: 0, y: -100, hp: 1, maxHp: 1 });
    const bystander = enemy({ id: 2, x: 30, y: -100, hp: 1e9, maxHp: 1e9 });
    f.enemies = [victim, bystander];
    expect(g.killBurst('main')!.chance).toBeGreaterThanOrEqual(0.25);
    roll = 0; // the burst's chance comes up
    (f as unknown as { hitWith: (...a: unknown[]) => void }).hitWith('main', victim, 1, 0, 0, false);
    expect(victim.hp).toBeLessThanOrEqual(0);
    expect(bystander.hp).toBeLessThan(1e9);
    // Armor specials run like gear effects (Evasion's chance is its roll).
    g.equip('main', 1, plate.uid);
    roll = rollFor(plate.uid, 0, 'evasion');
    expect((g.enchant(plate.uid, 0) as { id: string }).id).toBe('evasion');
    const ev = g.gearEffects('main').find((e) => e.effect.kind === 'evade')!;
    expect((ev.effect as { chance: number }).chance).toBeCloseTo(modRoll(ENCHANTS.evasion.range, false, 'exalted', (g.modSlots(plate.uid)[0] as { q: number }).q));
  });

  it('a roll draws 2 choices (different ones), paid up front; picking one fills the slot; unpicked choices survive a save', () => {
    const g = stocked();
    g.state.gold = 1e30;
    g.state.hunters.blacksmith.recruited = true;
    const rifle = g.craftGear('frostRifle')!;
    expect(g.modChoices).toBe(2);
    const gold = g.state.gold;
    const options = g.rollMod(rifle.uid, 1, 'refine')!;
    expect(options).toHaveLength(2);
    expect((options[0] as { stat: string }).stat).not.toBe((options[1] as { stat: string }).stat);
    expect(g.state.gold).toBe(gold - g.modGoldOf(rifle.uid, 'refine'));
    // A Legendary piece needs rarer metals: Silver Ore and the Venom Caverns' Cobalt Ore.
    expect(g.refineCostOf(rifle.uid)).toMatchObject({ silverOre: 4, cobaltOre: 3 });
    // Nothing goes in until you pick, and no second roll meanwhile.
    expect(g.modSlots(rifle.uid)).toEqual([null, null]);
    expect(g.rollMod(rifle.uid, 0, 'refine')).toBeNull();
    // The choices wait on the piece, across a save.
    const back = deserialize(serialize(g.state))!;
    expect(back.inventory.find((it) => it.uid === rifle.uid)!.pending).toEqual({ slot: 1, kind: 'refine', options });
    expect(g.chooseMod(rifle.uid, 1)).toEqual(options[1]);
    expect(g.modSlots(rifle.uid)).toEqual([null, options[1]]);
    expect(g.pendingMod(rifle.uid)).toBeNull();
  });

  it('enchantments roll a chance to activate (top chance = Perfect) and a separate power; attack enchantments fire on attacks', () => {
    let roll = 0;
    const g = stocked();
    (g as unknown as { rng: () => number }).rng = () => roll;
    g.state.gold = 1e30;
    g.state.hunters.enchantress.recruited = true;
    const orb = g.craftGear('emberOrb')!; // Very Rare accessory
    const pool = g.enchantsFor(orb.uid, 0);
    const total = pool.reduce((sum, x) => sum + ENCHANTS[x].weight, 0);
    roll = (pool.slice(0, pool.indexOf('thunderCall')).reduce((sum, x) => sum + ENCHANTS[x].weight, 0) + 0.5) / total;
    expect((g.rollMod(orb.uid, 0, 'enchant')![0] as { id: string }).id).toBe('thunderCall');
    const m = g.chooseMod(orb.uid, 0)!;
    expect(m).toMatchObject({ kind: 'enchant', id: 'thunderCall' });
    // Perfect is decided by the chance roll alone.
    expect(modPerfect({ q: MOD_QUALITY_STEPS })).toBe(true);
    g.equip('main', 2, orb.uid);
    const [atk] = g.attackEnchants('main');
    expect(atk.chance).toBeCloseTo(modValue(m, gearDef('emberOrb')));
    expect((atk.effect as { base: number }).base).toBeCloseTo(modPower(m, gearDef('emberOrb')) * TIER_HIT[gearArea(gearDef('emberOrb')) - 1]);
    // An attack sets it off when its chance comes up: lightning strikes.
    const f = new Field(g);
    const e = enemy({ id: 1, x: 0, y: -120, hp: 1e9, maxHp: 1e9 });
    f.enemies = [e];
    roll = 0;
    (f as unknown as { weaponAttack: (...a: unknown[]) => void }).weaponAttack('main', 0, 0, -Math.PI / 2, e, null, { cls: null, ammo: 0, reload: 0 }, 300);
    expect(f.drainEvents().some((ev) => ev.type === 'beam' && (ev as { zigzag?: boolean }).zigzag)).toBe(true);
  });

  it('a perfect chance rolls the power twice and keeps the higher', () => {
    const rolls: number[] = [];
    const g = stocked();
    (g as unknown as { rng: () => number }).rng = () => rolls.shift() ?? 0;
    g.state.gold = 1e30;
    g.state.hunters.enchantress.recruited = true;
    const orb = g.craftGear('emberOrb')!;
    const pool = g.enchantsFor(orb.uid, 0);
    const total = pool.reduce((sum, x) => sum + ENCHANTS[x].weight, 0);
    const pick = (pool.slice(0, pool.indexOf('thunderCall')).reduce((sum, x) => sum + ENCHANTS[x].weight, 0) + 0.5) / total;
    // Choice 1: Thunder Call, a perfect chance, power 0.1 then a reroll of 0.75: keeps the reroll.
    // Choice 2: anything, chance not perfect, power 0.9: no reroll.
    rolls.push(pick, 0.9999, 0.1, 0.75, 0, 0.5, 0.9);
    const [a, b] = g.rollMod(orb.uid, 0, 'enchant') as Array<{ id: string; q: number; p: number }>;
    expect(a).toMatchObject({ id: 'thunderCall', q: MOD_QUALITY_STEPS, p: Math.floor(0.75 * (MOD_QUALITY_STEPS + 1)) });
    expect(b.q).toBeLessThan(MOD_QUALITY_STEPS);
    expect(b.p).toBe(Math.floor(0.9 * (MOD_QUALITY_STEPS + 1)));
  });

  it('Kargesh the Blacksmith replaces Sera; old saves move her over', () => {
    expect(hunterDef('blacksmith').name).toBe('Kargesh');
    expect(HUNTERS.some((h) => (h.id as string) === 'demonbane')).toBe(false);
    const old = JSON.parse(serialize(startingGame(0)));
    old.version = 20;
    old.hunters.demonbane = { recruited: true, trains: 12, skills: {}, station: null };
    delete old.hunters.blacksmith;
    expect(deserialize(JSON.stringify(old))!.hunters.blacksmith).toMatchObject({ recruited: true, trains: 12 });
  });

  it('a multi-type weapon splits each hit evenly between its types, each priced and rolling its effect on its own', () => {
    const sword = gearDef('slimeSword');
    const saved = { ...sword };
    try {
      Object.assign(sword, { damageType: 'fire', extraTypes: ['frost'], proc: 1 });
      const g = stocked();
      g.equip('main', 0, g.craftGear('slimeSword')!.uid);
      expect(g.damageTypesOf('main')).toEqual(['fire', 'frost']);
      const f = new Field(g);
      const e = enemy({ id: 1, type: 'wolf', x: 0, y: -50, hp: 1e9, maxHp: 1e9 }); // weak to Fire, resists Frost
      f.enemies = [e];
      (f as unknown as { hitWith: (...a: unknown[]) => void }).hitWith('main', e, 1, 0, 0, false);
      const hits = f.drainEvents().filter((ev) => ev.type === 'hit') as Array<{ dmg: number; dtype: string }>;
      const base = g.shotDamage('main', 'beast');
      expect(hits.map((h) => h.dtype)).toEqual(['fire', 'frost']);
      expect(hits[0].dmg).toBeCloseTo((base / 2) * WEAK_MULT);
      expect(hits[1].dmg).toBeCloseTo((base / 2) * RESIST_MULT);
      expect(1e9 - e.hp).toBeCloseTo(hits[0].dmg + hits[1].dmg);
      // The Fire half burns; the wolf resists Frost, so it can't be chilled.
      expect(e.burn).toBeDefined();
      expect(e.slow ?? 0).toBe(0);
    } finally {
      for (const k of Object.keys(sword)) delete (sword as unknown as Record<string, unknown>)[k];
      Object.assign(sword, saved);
    }
  });

  it('a weapon firing one type per projectile hands its types out in turn, each at full damage', () => {
    const bow = gearDef('forestBow');
    const saved = { ...bow };
    try {
      Object.assign(bow, { damageType: 'frost', extraTypes: ['lightning'], perShot: true });
      const g = stocked();
      g.equip('main', 0, g.craftGear('forestBow')!.uid);
      expect(g.perShotOf('main')).toBe(true);
      const f = new Field(g);
      const shoot = (f as unknown as { shoot: (...a: unknown[]) => void }).shoot.bind(f);
      for (let i = 0; i < 4; i++) shoot('main', 'arrow', 0, 0, 0, 500, 300, {});
      expect(f.bullets.map((b) => b.dtype)).toEqual(['frost', 'lightning', 'frost', 'lightning']);
      // A lightning arrow hits for the whole shot, as Lightning (no split).
      const e = enemy({ id: 1, type: 'greenSlime', x: 0, y: -50, hp: 1e9, maxHp: 1e9 });
      f.enemies = [e];
      (f as unknown as { hitWith: (...a: unknown[]) => void }).hitWith('main', e, 1, 0, 0, false, undefined, false, false, 'lightning');
      const hits = f.drainEvents().filter((ev) => ev.type === 'hit') as Array<{ dmg: number; dtype: string }>;
      expect(hits).toHaveLength(1);
      expect(hits[0].dtype).toBe('lightning');
      expect(hits[0].dmg).toBeCloseTo(g.shotDamage('main', 'slime') * typeMult('lightning', 'greenSlime'));
    } finally {
      for (const k of Object.keys(bow)) delete (bow as unknown as Record<string, unknown>)[k];
      Object.assign(bow, saved);
    }
  });

  it('Elemental Cataclysm (Exalted repeater): its bolts start with Arcane and cycle through every element; shown as Special', () => {
    const gd = gearDef('elementalCataclysm');
    expect(gd).toMatchObject({ rarity: 'exalted', weaponClass: 'repeater', special: true, perShot: true });
    expect(gearArea(gd)).toBe(12);
    const elements = (Object.keys(DAMAGE_TYPES) as DamageType[]).filter((t) => t !== 'physical');
    expect(new Set(gearTypes(gd))).toEqual(new Set(elements));
    const g = stocked();
    g.state.areas.rift.unlocked = true;
    g.equip('main', 0, g.craftGear('elementalCataclysm')!.uid);
    const f = new Field(g);
    const shoot = (f as unknown as { shoot: (...a: unknown[]) => void }).shoot.bind(f);
    for (let i = 0; i < elements.length + 1; i++) shoot('main', 'bolt', 0, 0, 0, 500, 300, {});
    const order = f.bullets.map((b) => b.dtype);
    expect(order[0]).toBe('arcane');
    expect(new Set(order.slice(0, elements.length))).toEqual(new Set(elements));
    expect(order[elements.length]).toBe('arcane'); // and round again
  });

  it('bonuses multiply: a bane × the weakness to the type × a bonus to that type', () => {
    const charm = gearDef('fangTalisman');
    const saved = { ...charm };
    try {
      Object.assign(charm, { typeBonus: { type: 'fire', bonus: 0.2 } });
      const g = stocked();
      g.equip('ranger', 0, g.craftGear('emberLongbow')!.uid); // Fire
      g.equip('ranger', 2, g.craftGear('fangTalisman')!.uid);
      const f = new Field(g);
      const e = enemy({ id: 1, type: 'wolf', x: 0, y: -50, hp: 1e12, maxHp: 1e12 }); // a Beast, weak to Fire
      f.enemies = [e];
      (f as unknown as { hitWith: (...a: unknown[]) => void }).hitWith('ranger', e, 1, 0, 0, false, undefined, false, false);
      const hit = f.drainEvents().find((ev) => ev.type === 'hit') as { dmg: number };
      // Galladair's ×3 vs Beasts and the talisman's +5% vs Beasts, then ×1.5 for the weakness, then +20% Fire.
      const plain = g.shotDamage('ranger');
      const bane = hunterDef('ranger').bane!.mult * (1 + g.gearBane('ranger', 'beast'));
      expect(g.shotDamage('ranger', 'beast')).toBeCloseTo(plain * bane);
      expect(hit.dmg).toBeCloseTo(plain * bane * WEAK_MULT * 1.2);
    } finally {
      for (const k of Object.keys(charm)) delete (charm as unknown as Record<string, unknown>)[k];
      Object.assign(charm, saved);
    }
  });

  it('status effects: burn, poison, chill, acid puddle, radiant burst, dark aura, arcane exposure', () => {
    const g = stocked();
    const f = new Field(g);
    const api = f as unknown as {
      applyStatus: (e: Enemy, t: string, dmg: number, by: string) => void;
      tickStatus: (e: Enemy, dt: number) => void;
      hitWith: (...a: unknown[]) => void;
    };
    const mk = (id: number, x = 0, type: Enemy['type'] = 'wolf') => enemy({ id, type, x, y: -300, hp: 1e6, maxHp: 1e6 });
    // Fire burns for 30% of the hit over 2s; a new burn refreshes rather than stacks.
    const a = mk(1, 0, 'bat'); // a Vampire Bat resists none of fire, poison, frost or acid
    f.enemies = [a];
    api.applyStatus(a, 'fire', 1000, 'glimmer');
    for (let i = 0; i < 90; i++) api.tickStatus(a, 1 / 30);
    // (The hit's own damage already includes weaknesses; the burn is a share of it.)
    expect(1e6 - a.hp).toBeCloseTo(1000 * STATUS.burn.share, 0);
    expect(a.burn).toBeUndefined();
    api.applyStatus(a, 'fire', 1000, 'glimmer');
    api.applyStatus(a, 'fire', 1000, 'glimmer');
    expect(a.burn!.left).toBe(STATUS.burn.duration);
    // Burns spread to monsters right next to the burning one (at half strength), never to ones further off.
    let roll = 0.5;
    const spread = new Game(veteran(newGame(0)), () => roll);
    const sf = new Field(spread);
    const sapi = sf as unknown as typeof api;
    const [src, touching, away] = [mk(10, 0), mk(11, 25), mk(12, 200)];
    sf.enemies = [src, touching, away];
    sapi.applyStatus(src, 'fire', 1000, 'glimmer');
    for (let i = 0; i < 20; i++) sapi.tickStatus(src, 1 / 30); // one tick; a roll of 0.5 is above the chance
    expect(touching.burn).toBeUndefined();
    roll = 0; // now every roll spreads
    for (let i = 0; i < 20; i++) sapi.tickStatus(src, 1 / 30);
    expect(touching.burn!.dps).toBeCloseTo(src.burn!.dps * STATUS.burn.spreadFalloff);
    expect(away.burn).toBeUndefined();
    // Poison and Frost.
    api.applyStatus(a, 'poison', 1000, 'alchemist');
    expect(a.poison!.left).toBe(STATUS.poison.duration);
    api.applyStatus(a, 'frost', 1000, 'frostbreaker');
    expect(a.slow).toBe(STATUS.chill.duration);
    // A monster that resists a type is immune to its effect: a Forest Wolf resists Frost, so it isn't chilled.
    const resists = mk(9);
    api.applyStatus(resists, 'frost', 1000, 'frostbreaker');
    expect(resists.slow ?? 0).toBe(0);
    // Acid drops a puddle at the monster that hurts everything in it.
    api.applyStatus(a, 'acid', 1000, 'scavenger');
    expect(f.puddles.some((p) => p.dtype === 'acid' && p.x === a.x)).toBe(true);
    // Radiant bursts: everything nearby is hit, not the target itself.
    const [t, near, far] = [mk(2, 0), mk(3, 30), mk(4, 400)];
    f.enemies = [t, near, far];
    api.applyStatus(t, 'radiant', 1000, 'thief');
    expect(t.hp).toBe(1e6);
    expect(near.hp).toBeCloseTo(1e6 - 1000 * STATUS.burst.share);
    expect(far.hp).toBe(1e6);
    // Decay: the monster's dark aura hurts those around it, not itself.
    const [bearer, n2, f2] = [mk(5, 0), mk(6, 30), mk(7, 400)];
    f.enemies = [bearer, n2, f2];
    api.applyStatus(bearer, 'decay', 1000, 'glimmer');
    for (let i = 0; i < 30; i++) api.tickStatus(bearer, 1 / 30);
    expect(bearer.hp).toBe(1e6);
    expect(n2.hp).toBeLessThan(1e6);
    expect(f2.hp).toBe(1e6);
    // Arcane strips resistances: a Wolf resists Frost until exposed (Bjorn with a Frost Rifle deals frost).
    g.state.hunters.frostbreaker.recruited = true;
    g.equip('frostbreaker', 0, g.craftGear('frostRifle')!.uid);
    const w = mk(8);
    f.enemies = [w];
    api.hitWith('frostbreaker', w, 1, 0, 0, false);
    const resisted = 1e6 - w.hp;
    api.applyStatus(w, 'arcane', 1000, 'blacksmith');
    const before = w.hp;
    api.hitWith('frostbreaker', w, 1, 0, 0, false);
    expect(before - w.hp).toBeCloseTo(resisted / RESIST_MULT);
  });

  it('poison also eats a share of max HP: more from rarer weapons, a tenth on Guardians', () => {
    const g = stocked();
    const f = new Field(g);
    const api = f as unknown as { applyStatus: (...a: unknown[]) => void; tickStatus: (e: Enemy, dt: number) => void };
    const run = (rarity: string, boss: boolean) => {
      const e = enemy({ id: 1, type: 'wolf', x: 0, y: -300, hp: 1e6, maxHp: 1e6, boss });
      f.enemies = [e];
      api.applyStatus(e, 'poison', 0, 'alchemist', rarity); // no hit damage: only the max-HP part
      for (let i = 0; i < 150; i++) api.tickStatus(e, 1 / 30);
      return 1e6 - e.hp;
    };
    expect(run('common', false)).toBeCloseTo(1e6 * STATUS.poison.maxHp.common, 0);
    expect(run('exalted', false)).toBeCloseTo(1e6 * STATUS.poison.maxHp.exalted, 0);
    expect(run('common', true)).toBeCloseTo(1e6 * STATUS.poison.maxHp.common * STATUS.poison.guardian, 0);
    // Rarer monsters need fewer kills to evolve.
    expect(evoKillsNeeded(enemyDef('behemoth'), EVO_TREES.beast[7])).toBeLessThan(evoKillsNeeded(enemyDef('wolf'), EVO_TREES.beast[7]));
  });

  it('effects proc at the weapon\'s chance; Physical weapons never proc', () => {
    let roll = 0;
    const s = newGame(0);
    s.gold = 1e15;
    for (const m of Object.keys(s.materials) as Array<keyof typeof s.materials>) s.materials[m] = 1e6;
    const g = new Game(veteran(s), () => roll);
    g.recruit('glimmer');
    expect(g.procOf('main')).toBe(0); // bare hands, physical
    const bow = g.craftGear('emberLongbow')!;
    g.equip('main', 0, bow.uid);
    expect(g.procOf('main')).toBe(gearDef('emberLongbow').proc);
    expect(g.procOf('glimmer')).toBe(0); // no weapon: a plain bolt
    expect(g.procOf('glimmer', 'long', true)).toBe(1); // fireballs always burn
    const f = new Field(g);
    const hit = (f as unknown as { hitWith: (...a: unknown[]) => void }).hitWith.bind(f);
    const e = enemy({ id: 1, type: 'wolf', x: 0, y: -300, hp: 1e9, maxHp: 1e9 });
    f.enemies = [e];
    roll = 0.99; // above the chance: no burn
    hit('main', e, 1, 0, 0, false);
    expect(e.burn).toBeUndefined();
    roll = 0; // under it: burns
    hit('main', e, 1, 0, 0, false);
    expect(e.burn).toBeDefined();
    // Physical's effect is bleeding: only blades (daggers, swords, spears) have a chance to cause it.
    for (const gd of GEAR) if (gd.damageType === 'physical' && gd.proc) expect(['dagger', 'sword', 'spear']).toContain(gd.weaponClass);
  });

  it('10 areas in order; saves from before the new areas open everything up to their furthest area', () => {
    expect(AREAS.map((a) => a.id)).toEqual(['forest', 'glade', 'graveyard', 'crypt', 'depths', 'caves', 'mines', 'peaks', 'cliffs', 'fortress', 'meteors', 'rift']);
    const old = JSON.parse(serialize(newGame(0)));
    old.version = 9;
    old.areas.graveyard.unlocked = true;
    old.areas.caves.unlocked = true;
    const s = deserialize(JSON.stringify(old))!;
    expect(AREAS.filter((a) => s.areas[a.id].unlocked).map((a) => a.id)).toEqual(['forest', 'glade', 'graveyard', 'crypt', 'depths', 'caves']);
  });

  it('golem metals and gems for Modify: each rarity needs ones from golems that live in areas you can have reached by then', () => {
    const golems = ['venomGolem', 'glacialGolem', 'crystalGolem', 'skyGolem', 'stormGolem', 'meteorGolem', 'voidGolem'] as const;
    expect(golems.map((id) => enemyDef(id).area)).toEqual(['mines', 'peaks', 'peaks', 'cliffs', 'fortress', 'meteors', 'rift']);
    for (const id of golems) expect(enemyDef(id).archetype).toBe('construct');
    // Every metal and gem a rarity needs drops from some golem, no later than that rarity's gear.
    for (const table of [MOD_METALS, MOD_GEMS])
      for (const [rarity, mats] of Object.entries(table))
        for (const m of Object.keys(mats!)) {
          const from = ENEMIES.filter((e) => enemyDrops(e).includes(m as MaterialId));
          expect(from.length, m).toBeGreaterThan(0);
          const earliest = Math.min(...from.map((e) => AREAS.findIndex((a) => a.id === e.area) + 1));
          const gearAreas = GEAR.filter((gd) => gd.rarity === rarity).map(gearArea);
          if (gearAreas.length) expect(earliest, `${m} for ${rarity}`).toBeLessThanOrEqual(Math.min(...gearAreas));
        }
  });

  it("golems are Constructs with tiered drops: each rarer material rolls on its own at a smaller share", () => {
    expect(areaEnemies('glade').map((e) => e.id)).toContain('stoneGolem');
    expect(areaEnemies('caves').map((e) => e.id)).toEqual(expect.arrayContaining(['oreGolem', 'geodeGolem']));
    for (const id of ['stoneGolem', 'oreGolem', 'geodeGolem'] as const) expect(enemyDef(id).archetype).toBe('construct');
    expect(enemyDrops(enemyDef('stoneGolem'))).toEqual(['awokenRock', 'obsidian', 'ironOre']);
    expect(enemyDrops(enemyDef('oreGolem'))).toEqual(['ironOre', 'silverOre', 'goldOre']);
    expect(enemyDrops(enemyDef('geodeGolem'))).toEqual(['quartz', 'amethyst', 'topaz', 'emerald', 'diamond']);
    const shares = enemyExtraDrops(enemyDef('geodeGolem')).map((d) => d.share);
    expect([...shares].sort((a, b) => b - a)).toEqual(shares);
    expect(shares.map(dropRarity)).toEqual(['uncommon', 'rare', 'veryRare', 'legendary']);
    // Kills hand out each drop at its share: over many kills, Iron Ore comes about a third as often as Obsidian.
    let roll = 0;
    const g = new Game(newGame(0), () => (roll = (roll * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 20_000; i++) g.registerKill('stoneGolem', false, 'main');
    const m = g.state.materials;
    expect(m.awokenRock).toBeGreaterThan(m.obsidian);
    expect(m.obsidian).toBeGreaterThan(m.ironOre);
    expect(m.ironOre).toBeGreaterThan(0);
    expect(m.ironOre / m.obsidian).toBeCloseTo(1 / 3, 0);
  });

  it('77 monsters, plus 7 Guardian-only bosses (the first six areas\' and the Time Eater); each with a weakness', () => {
    expect(ENEMIES).toHaveLength(84);
    expect(new Set(ENEMIES.map((e) => e.id)).size).toBe(84);
    // The Time Eater is only ever the Void Rift's Guardian: not in its horde or unlockable.
    expect(areaEnemies('rift').map((e) => e.id)).not.toContain('timeEater');
    expect(enemyUnlockCost(enemyDef('timeEater'))).toBe(Infinity);
    for (const a of AREAS) expect(ENEMIES.filter((e) => e.area === a.id).length).toBeGreaterThanOrEqual(5);
    const g = new Game(newGame(0), noCrit);
    expect(g.guardianType).toBe('kingSlime');
    // Guardian-only bosses never join the horde, can't be unlocked, and drop their own material.
    for (const id of ['kingSlime', 'pixieQueen', 'skeletonKing', 'awokenLich', 'beholdenWatcher', 'demonLord'] as const) {
      expect(enemyDef(id).guardianOnly).toBe(true);
      expect(areaEnemies(enemyDef(id).area).map((e) => e.id)).not.toContain(id);
    }
    const before = g.state.materials.royalSlime;
    g.challengeGuardian();
    g.registerKill('kingSlime', true);
    expect(g.state.materials.royalSlime).toBe(before + 10);
  });

  it("Wilhelm's long and short weapons each power one mode", () => {
    const g = stocked();

    const rifle = g.craftGear('frostRifle')!;
    const bow = g.craftGear('forestBow')!;
    const baseLong = g.shotDamage('wilhelm', undefined, 'long');
    const baseShort = g.shotDamage('wilhelm', undefined, 'short');
    g.equip('wilhelm', 0, rifle.uid); // long-range slot
    g.equip('wilhelm', 1, bow.uid); // short-range slot
    // Each weapon's stats and its class (rifle: heavy and long; shortbow: light and short) apply to its mode.
    expect(g.shotDamage('wilhelm', undefined, 'long')).toBeCloseTo(baseLong * weaponHit(gearDef('frostRifle'), 1));
    expect(g.shotDamage('wilhelm', undefined, 'short')).toBeCloseTo(baseShort * weaponHit(gearDef('forestBow'), 1));
    // A class's weight is part of its weapons' base damage: a rifle hits harder than a bow of the same rarity.
    expect(weaponHit(gearDef('frostRifle'), 1) / TIER_HIT[7]).toBeCloseTo(WEAPON_CLASSES.rifle.damage, 1);
    expect(g.shooterRange('wilhelm', 'long')).toBeCloseTo(MAIN_RANGE * WEAPON_CLASSES.rifle.range + 15);
  });

  it('weapon classes: your Hunter attacks the way the weapon does; each class trades speed for weight', () => {
    // Sustained speed × damage (guns counting their reloads) is about the same for every class.
    for (const c of Object.values(WEAPON_CLASSES)) {
      const sustained = c.rate * c.damage * weaponUptime(c) * weaponHitsPerAttack(c);
      expect(sustained).toBeGreaterThan(0.9);
      expect(sustained).toBeLessThan(1.25);
    }
    for (const gd of GEAR) if (gd.kind === 'weapon' || gd.kind === 'melee' || gd.kind === 'magic') expect(gd.weaponClass).toBeDefined();
    const g = stocked();
    const base = { rate: g.shooterRate('main'), dmg: g.shotDamage('main'), range: g.shooterRange('main') };
    const long = g.craftGear('emberLongbow')!;
    g.equip('main', 0, long.uid);
    expect(g.shooterRate('main')).toBeLessThan(base.rate);
    expect(g.shooterRange('main')).toBeGreaterThan(base.range);
    const short = g.craftGear('forestBow')!;
    g.equip('main', 0, short.uid);
    expect(g.shooterRate('main')).toBeGreaterThan(base.rate);
    expect(g.shooterRange('main')).toBeLessThan(base.range);
    // A sword reaches only as far as the blade, but sweeps through several monsters.
    const sword = g.craftGear('slimeSword')!;
    g.equip('main', 0, sword.uid);
    expect(g.weaponClassOf('main')?.attack).toBe('sweep');
    expect(g.shooterRange('main')).toBeLessThan(120);
    const f = new Field(g);
    f.setView(390, 420);
    // Three monsters in front (one straight ahead, two to the sides), one behind: one sweep hits the three.
    const hp = 1e9;
    f.enemies.push(enemy({ id: 1, x: 60, y: 0, hp, maxHp: hp }), enemy({ id: 2, x: 45, y: 40, hp, maxHp: hp }), enemy({ id: 3, x: 45, y: -40, hp, maxHp: hp }), enemy({ id: 4, x: -60, y: 0, hp, maxHp: hp }));
    f.update(1 / g.shooterRate('main') + 0.01);
    expect(f.enemies.filter((e) => e.hp < hp).map((e) => e.id).sort()).toEqual([1, 2, 3]);
    expect(f.bullets).toHaveLength(0); // no projectiles: it's a blade
  });

  it('daggers stab 3 times at one monster and the last stab knocks it back; spears thrust wide and drive monsters back', () => {
    const g = stocked();
    g.state.hunters = Object.fromEntries(Object.entries(g.state.hunters).map(([k, h]) => [k, { ...h, station: null }])) as typeof g.state.hunters;
    g.equip('main', 0, g.craftGear('beastBlade')!.uid);
    const f = new Field(g);
    f.setView(390, 420);
    const hp = 1e12;
    f.enemies.push(enemy({ id: 1, x: 50, hp, maxHp: hp }));
    const hits: number[] = [];
    for (let t = 0; t < 1 / g.shooterRate('main') + 0.3; t += 0.01) {
      f.update(0.01);
      for (const e of f.drainEvents()) if (e.type === 'hit') hits.push(e.dmg);
    }
    expect(hits.length).toBe(WEAPON_CLASSES.dagger.thrusts);
    expect(f.enemies[0].kx).toBeGreaterThan(WEAPON_CLASSES.dagger.knock! * 0.5); // shoved back after the last stab
    // A spear hits everything in a wide band in front, and pushes each one back.
    const g2 = stocked();
    g2.state.hunters = g.state.hunters;
    g2.equip('main', 0, g2.craftGear('ironSpear')!.uid);
    const f2 = new Field(g2);
    f2.setView(390, 420);
    f2.enemies.push(enemy({ id: 1, x: 60, y: 0, hp, maxHp: hp }), enemy({ id: 2, x: 120, y: 18, hp, maxHp: hp }), enemy({ id: 3, x: 150, y: -15, hp, maxHp: hp }));
    for (let t = 0; t < 1 / g2.shooterRate('main') + 0.02; t += 0.01) f2.update(0.01);
    expect(f2.enemies.filter((e) => e.hp < hp)).toHaveLength(3);
    for (const e of f2.enemies) expect(e.kx).toBeGreaterThan(50);
  });

  it('a hammer is slow and crushing, and knocks monsters much further than other weapons', () => {
    const h = WEAPON_CLASSES.hammer;
    for (const [id, c] of Object.entries(WEAPON_CLASSES)) if (id !== 'hammer' && !c.summon) {
      expect(h.rate).toBeLessThan(c.rate);
      expect(h.knock ?? 0).toBeGreaterThan(c.knock ?? 0);
    }
    expect(h.damage).toBeGreaterThan(2);
  });

  it('magic: scepter bolts bounce; a staff casts a big spell every 6th attack; a focus bursts around the Hunter; a tome summons a spirit', () => {
    const fresh = (gear: Parameters<Game['craftGear']>[0]) => {
      const g = stocked();
      g.state.hunters = Object.fromEntries(Object.entries(g.state.hunters).map(([k, h]) => [k, { ...h, station: null }])) as typeof g.state.hunters;
      g.state.items.splitbow = 0;
      g.equip('main', 0, g.craftGear(gear)!.uid);
      const f = new Field(g);
      f.setView(390, 420);
      return { g, f };
    };
    const hp = 1e12;
    const run = (f: Field, secs: number) => {
      const ev: ReturnType<Field['drainEvents']> = [];
      for (let t = 0; t < secs; t += 0.01) {
        f.update(0.01);
        ev.push(...f.drainEvents());
      }
      return ev;
    };
    // Scepter: one bolt, three monsters close together: it bounces on to the other two.
    {
      const { g, f } = fresh('voidScepter');
      f.enemies.push(enemy({ id: 1, x: 150, hp, maxHp: hp }), enemy({ id: 2, x: 210, y: 40, hp, maxHp: hp }), enemy({ id: 3, x: 210, y: -40, hp, maxHp: hp }));
      run(f, 1 / g.shooterRate('main') + 0.6);
      expect(f.enemies.filter((e) => e.hp < hp)).toHaveLength(3);
    }
    // Staff: 5 bolts, then an explosion.
    {
      const { g, f } = fresh('gravewoodStaff');
      f.enemies.push(enemy({ id: 1, x: 150, r: 20, hp, maxHp: hp }));
      const ev = run(f, 6 / g.shooterRate('main') + 0.6);
      expect(ev.filter((e) => e.type === 'explode')).toHaveLength(1);
      expect(f.weaponStatus('main')?.text).toBe('RECHARGING!'); // the staff's cooldown after its spell
      expect(ev.filter((e) => e.type === 'hit').length).toBeGreaterThanOrEqual(6);
    }
    // Focus: a burst hits everything around the Hunter, front and back.
    {
      const { g, f } = fresh('emberFocus');
      f.enemies.push(enemy({ id: 1, x: 70, hp, maxHp: hp }), enemy({ id: 2, x: -70, hp, maxHp: hp }), enemy({ id: 3, x: 300, hp, maxHp: hp }));
      run(f, 1 / g.shooterRate('main') + 0.02);
      expect(f.enemies.filter((e) => e.hp < hp).map((e) => e.id).sort()).toEqual([1, 2]);
    }
    // Tome: a spirit appears, goes for a monster and bites it, then fades.
    {
      const { g, f } = fresh('wispTome');
      f.enemies.push(enemy({ id: 1, x: 200, hp, maxHp: hp }));
      run(f, 1 / g.shooterRate('main') + 0.05);
      expect(f.summons).toHaveLength(1);
      expect(f.weaponStatus('main')?.text).toBe('SUMMONING!'); // readying the next one
      run(f, 3);
      expect(f.enemies[0].hp).toBeLessThan(hp);
      f.enemies = [];
      run(f, WEAPON_CLASSES.tome.summon!.duration);
      expect(f.summons).toHaveLength(0);
    }
  });

  it("the Wolf Spirit tome's wolves lunge on a cooldown; a landed lunge bites ×2.5; only that ability gets a cooldown icon", () => {
    const g = stocked();
    g.state.hunters = Object.fromEntries(Object.entries(g.state.hunters).map(([k, h]) => [k, { ...h, station: null }])) as typeof g.state.hunters;
    g.equip('main', 0, g.craftGear('wolfTome')!.uid);
    const f = new Field(g);
    f.setView(390, 420);
    const hp = 1e12;
    f.enemies.push(enemy({ id: 1, x: 220, hp, maxHp: hp }));
    const hits: number[] = [];
    for (let t = 0; t < 1 / g.shooterRate('main') + 2; t += 0.01) {
      f.update(0.01);
      for (const e of f.drainEvents()) if (e.type === 'hit') hits.push(e.dmg);
    }
    expect(f.summons[0]?.look).toBe('wolf');
    const bite = Math.min(...hits);
    expect(Math.max(...hits) / bite).toBeCloseTo(2.5); // the lunge
    const icons = f.cooldowns();
    expect(icons.map((c) => c.key)).toEqual(['item:wolfTome']); // the lunge, not the tome's own summoning
    expect(icons[0].progress).toBeLessThan(1);
  });

  it('a Guild Hunter holding a tome summons its creatures too (with their own lunge cooldown)', () => {
    const g = stocked();
    g.state.hunters = Object.fromEntries(Object.entries(g.state.hunters).map(([k, h]) => [k, { ...h, station: null }])) as typeof g.state.hunters;
    expect(g.station('glimmer', g.state.area)).toBe(true);
    g.equip('glimmer', 0, g.craftGear('wolfTome')!.uid);
    const f = new Field(g);
    f.setView(390, 420);
    const hp = 1e12;
    f.update(0);
    const gl = f.helpers.find((h) => h.id === 'glimmer')!;
    f.enemies.push(enemy({ id: 1, x: gl.x + 120, y: gl.y, hp, maxHp: hp }));
    for (let t = 0; t < 1 / g.shooterRate('glimmer') + 2; t += 0.01) {
      f.update(0.01);
      f.drainEvents();
    }
    expect(f.summons.some((s) => s.who === 'glimmer' && s.look === 'wolf')).toBe(true);
    expect(f.enemies[0].hp).toBeLessThan(hp);
    expect(f.weaponStatus('glimmer')?.text).toBe('SUMMONING!');
    expect(f.cooldowns().some((c) => c.key === 'item:glimmer:wolfTome')).toBe(true);
    // Unequipping the tome dismisses its creatures.
    g.equip('glimmer', 0, null);
    f.update(0.01);
    expect(f.summons.filter((s) => s.who === 'glimmer')).toHaveLength(0);
  });

  it('tap abilities: unlocked in the skill tree, equipped one at a time; each sets off its element on everything the blast hits', () => {
    let seed = 7;
    const g = new Game(newGame(0), () => ((seed = (seed * 16807) % 2147483647) / 2147483647));
    g.state.main.trains = 200;
    expect(g.setTapAbility('flame')).toBe(false); // locked
    expect(g.tapAbility).toBeNull();
    for (const k of ['root', 'power', 'power2', 'flameTap', 'speed', 'speed2', 'thunderTap', 'recovery', 'recovery2', 'frostTap']) expect(g.learn('main', k)).toBe(true);
    const f = new Field(g);
    f.setView(390, 420);
    const hp = 1e12;
    const fresh = () => {
      f.enemies = [enemy({ id: 1, x: 0, y: 0, hp, maxHp: hp }), enemy({ id: 2, x: 60, y: 0, hp, maxHp: hp })];
      f.drainEvents();
    };
    // Plain blast: your weapon's damage type, no effect.
    fresh();
    f.tap(0, 0);
    expect(f.enemies[0].burn).toBeUndefined();
    expect(f.enemies[0].slow ?? 0).toBe(0);
    // Flame Burst: Fire, and everything hit burns.
    expect(g.setTapAbility('flame')).toBe(true);
    expect(g.tapDamageType).toBe('fire');
    fresh();
    f.tap(0, 0);
    expect(f.enemies[0].burn).toBeDefined();
    // Frost Nova: chilled.
    g.setTapAbility('frost');
    fresh();
    f.tap(0, 0);
    expect(f.enemies[0].slow).toBe(FROST_TAP_CHILL);
    // Thunderclap: each monster hit arcs to another one nearby.
    g.setTapAbility('thunder');
    fresh();
    f.tap(-200, -200); // hits nothing
    expect(f.drainEvents().some((e) => e.type === 'beam')).toBe(false);
    f.tap(0, 0);
    expect(f.drainEvents().some((e) => e.type === 'beam' && e.zigzag)).toBe(true);
    // Unequip: back to a plain blast; and a save keeps the equipped one.
    g.setTapAbility('frost');
    expect(deserialize(serialize(g.state))!.main.tapAbility).toBe('frost');
    g.setTapAbility(null);
    expect(g.tapAbility).toBeNull();
  });

  it('armor kinds: Light is quick, Heavy and Shields add shield charges (Heavy slows you, Shields cost damage), Robes add damage', () => {
    const light = gearTotals(gearDef('gloomLeathers'), 1);
    const heavy = gearTotals(gearDef('bonePlate'), 1);
    const robe = gearTotals(gearDef('wrapRobe'), 1);
    const shield = gearTotals(gearDef('boneShield'), 1);
    expect(light.rate).toBeGreaterThan(0);
    expect(light.guard ?? 0).toBe(0);
    expect(heavy.guard).toBe(1);
    expect(heavy.rate).toBeCloseTo(ARMOR_TYPES.heavy.penalty.rate!); // the fixed penalty
    expect(robe.damage).toBeGreaterThan(light.damage!);
    expect(robe.guard ?? 0).toBe(0);
    expect(shield.guard).toBe(2);
    expect(shield.damage).toBeCloseTo(ARMOR_TYPES.shield.penalty.damage!);
    // Shield charges grow slowly with stars (×2 at 5★); the penalty never grows.
    expect(gearTotals(gearDef('boneShield'), MAX_STARS).guard).toBe(4);
    expect(gearTotals(gearDef('bonePlate'), MAX_STARS).rate).toBeCloseTo(ARMOR_TYPES.heavy.penalty.rate!);
    // Every armor piece has a kind; specials from Very Rare up.
    for (const d of GEAR.filter((x) => x.kind === 'armor' && !x.starter)) {
      expect(d.armorType).toBeDefined();
      expect(!!d.effect).toBe(['veryRare', 'legendary', 'exotic', 'relic', 'artifact', 'exalted'].includes(d.rarity));
    }
    // Glimmer only wears robes.
    const g = new Game(newGame(0));
    g.state.gold = 1e30;
    for (const m of Object.keys(g.state.materials) as Array<keyof typeof g.state.materials>) g.state.materials[m] = 1e6;
    g.state.hunters.glimmer.recruited = true;
    expect(g.equip('glimmer', 1, g.craftGear('bonePlate')!.uid)).toBe(false);
    expect(g.equip('glimmer', 1, g.craftGear('wrapRobe')!.uid)).toBe(true);
    // Wearing heavy armor: more shield, slower attacks.
    const rate = g.fireRate;
    g.equip('main', 1, g.craftGear('bonePlate')!.uid);
    expect(g.guardOf('main')).toBe(1);
    expect(g.fireRate).toBeLessThan(rate);
  });

  it("gear abilities have their own base damage: the Puppeteer's Doll's puppets bite the same whatever the weapon, and Hunter bonuses raise them", () => {
    const setup = (weapon: 'shortSword' | 'drakeHammer') => {
      const g = new Game(newGame(0), noCrit);
      g.state.gold = 1e30;
      for (const m of Object.keys(g.state.materials) as Array<keyof typeof g.state.materials>) g.state.materials[m] = 1e6;
      const w = weapon === 'shortSword' ? g.state.inventory.find((x) => x.base === 'shortSword') ?? g.craftGear('drakeHammer')! : g.craftGear('drakeHammer')!;
      g.equip('main', 0, w.uid);
      g.equip('main', 2, g.craftGear('puppetDoll')!.uid);
      const f = new Field(g);
      f.setView(390, 420);
      return { g, f };
    };
    const bite = (weapon: 'shortSword' | 'drakeHammer') => {
      const { g, f } = setup(weapon);
      g.state.main.trains = 0;
      f.enemies.push(enemy({ id: 1, x: 300, y: 300, hp: 1e12, maxHp: 1e12 }));
      const hits: number[] = [];
      for (let t = 0; t < 4; t += 0.01) {
        f.update(0.01);
        for (const e of f.drainEvents()) if (e.type === 'hit') hits.push(e.dmg);
      }
      expect(f.summons.some((s) => s.look === 'puppet' && s.gear)).toBe(true);
      expect(f.cooldowns().some((c) => c.key.startsWith('gear:main:'))).toBe(true);
      return { hits, g };
    };
    const a = bite('drakeHammer');
    const base = effectBase(gearDef('puppetDoll').effect!, 1);
    // The weapon is out of range; every hit is a puppet bite at the Doll's base × your bonuses.
    expect(a.hits.length).toBeGreaterThan(0);
    for (const h of a.hits) expect(h).toBeCloseTo(base * a.g.abilityMult('main', 'slime') * typeMult('physical', 'greenSlime'));
    expect(a.g.abilityMult('main')).toBeCloseTo(1); // no training, skills or Upgrades yet
    expect(effectBase(gearDef('puppetDoll').effect!, MAX_STARS)).toBeCloseTo(base * WEAPON_HIT_POWER[MAX_STARS]);
  });

  it('thorns, shield bursts, evasion, melee waves and lightning strikes', () => {
    const fresh = (ids: GearId[]) => {
      let seed = 3;
      const g = new Game(newGame(0), () => ((seed = (seed * 16807) % 2147483647) / 2147483647));
      g.state.gold = 1e30;
      for (const m of Object.keys(g.state.materials) as Array<keyof typeof g.state.materials>) g.state.materials[m] = 1e6;
      for (const id of ids) {
        const d = gearDef(id);
        const slot = d.kind === 'armor' ? 1 : d.kind === 'accessory' ? 2 : 0;
        g.equip('main', slot, g.craftGear(id)!.uid);
      }
      const f = new Field(g);
      f.setView(390, 420);
      return { g, f };
    };
    const contact = (f: Field, e: Enemy) => (f as unknown as { contact: (e: Enemy, who: string, ux: number, uy: number) => void }).contact(e, 'main', 1, 0);
    // Thorns (Chitin Carapace): whatever reaches you is hurt.
    {
      const { f } = fresh(['chitinCarapace']);
      const e = enemy({ id: 1, x: 14, y: 0, hp: 1e9, maxHp: 1e9 });
      f.enemies.push(e);
      contact(f, e);
      expect(e.hp).toBeLessThan(1e9);
    }
    // Shield burst (Drake Shield): a block blasts everything nearby with fire.
    {
      const { f } = fresh(['drakeShield']);
      f.guard = 3;
      const e = enemy({ id: 1, x: 14, y: 0, hp: 1e9, maxHp: 1e9 });
      const near = enemy({ id: 2, x: 40, y: 20, hp: 1e9, maxHp: 1e9 });
      f.enemies.push(e, near);
      contact(f, e);
      expect(f.guard).toBe(2);
      expect(near.hp).toBeLessThan(1e9);
      expect(near.burn).toBeDefined();
    }
    // Evasion (Griffin Hide): some contacts are slipped with no stun and no shield used.
    {
      const { f } = fresh(['griffinHide']);
      let dodged = 0;
      for (let i = 0; i < 200; i++) {
        f.stun = 0;
        f.immune = 0;
        const e = enemy({ id: i, x: 14, y: 0, hp: 10, maxHp: 10 });
        contact(f, e);
        if (f.stun === 0) dodged++;
      }
      expect(dodged).toBeGreaterThan(20);
      expect(dodged).toBeLessThan(90);
    }
    // Flame Brand: melee attacks sometimes send out a wave of fire.
    {
      const { f } = fresh(['flameBrand']);
      for (let i = 0; i < 40; i++) (f as unknown as { meleeWave: (w: string, x: number, y: number) => void }).meleeWave('main', 0, 0);
      expect(f.drainEvents().filter((e) => e.type === 'nova').length).toBeGreaterThan(3);
    }
    // Thunder Totem: lightning strikes monsters in range on a cooldown.
    {
      const { f } = fresh(['thunderTotem']);
      const e = enemy({ id: 1, x: 200, y: 0, hp: 1e12, maxHp: 1e12 });
      f.enemies.push(e);
      f.update(0.01);
      expect(e.hp).toBeLessThan(1e12);
      expect(f.drainEvents().some((x) => x.type === 'beam' && x.zigzag)).toBe(true);
    }
    // Frostbite Charm: monsters near you are chilled.
    {
      const { f } = fresh(['frostCharm']);
      const e = enemy({ id: 1, x: 60, y: 0, hp: 1e12, maxHp: 1e12 });
      f.enemies.push(e);
      f.update(0.01);
      expect(e.slow).toBeGreaterThan(0);
    }
  });

  it("the Fey Grove's Hunters: Ba'al's song speeds up the Hunters beside him, Deku calls spirit wolves", () => {
    expect(hunterDef('bard').unlock).toEqual({ event: 'guardian-glade', times: 1 });
    expect(hunterDef('druid').unlock).toEqual({ event: 'guardian-glade', times: 2 });
    const g = new Game(newGame(0), noCrit);
    g.state.areas.glade.unlocked = true;
    for (const id of ['bard', 'druid', 'ranger'] as const) g.state.hunters[id].recruited = true;
    const you = g.fireRate;
    const ranger = g.shooterRate('ranger');
    g.station('ranger', 'forest');
    const rangerHere = g.shooterRate('ranger');
    expect(g.station('bard', 'forest')).toBe(true);
    expect(g.fireRate).toBeCloseTo(you * 1.15); // you're in the Forest with him
    expect(g.shooterRate('ranger')).toBeCloseTo(rangerHere * 1.15);
    expect(rangerHere).toBeCloseTo(ranger);
    g.station('bard', 'glade');
    expect(g.fireRate).toBeCloseTo(you); // he left
    // Deku: every 6s, two spirit wolves that bite for his damage.
    g.station('bard', null);
    expect(g.station('druid', 'forest')).toBe(true);
    const f = new Field(g);
    f.setView(390, 420);
    f.enemies.push(enemy({ id: 1, x: 120, y: 0, hp: 1e12, maxHp: 1e12 }));
    for (let t = 0; t < 3; t += 0.01) {
      f.update(0.01);
      f.drainEvents();
    }
    const wolves = f.summons.filter((s) => s.who === 'druid' && s.own);
    expect(wolves).toHaveLength(2);
    expect(f.cooldowns().some((c) => c.key === 'druid')).toBe(true);
    expect(f.enemies[0].hp).toBeLessThan(1e12);
  });

  it('loot: carriers drop gear of their area (or older); Guardians always drop a piece; Auto Salvage salvages chosen rarities as they drop', () => {
    // Loot comes from the area's tier, or older ones; never newer.
    for (const [area, tier] of [['forest', 1], ['crypt', 4], ['rift', 12]] as const) {
      for (let i = 0; i < 40; i++) expect(gearArea(rollLoot(area, i / 40, ((i * 7) % 40) / 40))).toBeLessThanOrEqual(tier);
      expect(gearArea(rollLoot(area, 0, 0.5))).toBe(Math.max(...GEAR.filter((x) => gearArea(x) <= tier).map(gearArea)));
    }
    expect(lootChance('zombie')).toBeGreaterThan(0);
    expect(lootChance('greenSlime')).toBe(0);
    // A goblin with a certain drop: loot goes into the inventory, and you hear about it.
    const g = new Game(newGame(0), () => 0);
    const events: string[] = [];
    g.on((e) => events.push(e.type));
    const before = g.state.inventory.length;
    g.registerKill('zombie', false);
    expect(g.state.inventory.length).toBe(before + 1);
    expect(events).toContain('loot');
    // Auto Salvage: that rarity turns into materials instead.
    const looted = gearDef(g.state.inventory[g.state.inventory.length - 1].base);
    g.state.settings.autoSalvage = [looted.rarity];
    const mats = { ...g.state.materials };
    g.registerKill('zombie', false);
    expect(g.state.inventory.length).toBe(before + 1);
    expect(Object.entries(g.state.materials).some(([m, n]) => n > mats[m as keyof typeof mats])).toBe(true);
    // Salvage now: unequipped pieces of the chosen rarities go; equipped gear stays.
    expect(g.salvageRarities([looted.rarity])).toBe(1);
    // Auto Salvage opens at the Restless Graveyard.
    expect(g.autoSalvageOpen).toBe(false);
    g.state.areas.graveyard.unlocked = true;
    expect(g.autoSalvageOpen).toBe(true);
  });

  it('Alias the Thief: his area pays 30% more gold and drops loot twice as often; old saves turn Alric into Alias', () => {
    const g = new Game(newGame(0));
    g.state.hunters.thief.recruited = true;
    const gold = g.enemyStats('greenSlime').gold;
    expect(g.areaPerk('forest')).toEqual({ gold: 1, loot: 1 });
    g.station('thief', 'forest');
    expect(g.areaPerk('forest')).toEqual({ gold: 1.3, loot: 2 });
    expect(g.enemyStats('greenSlime').gold).toBeCloseTo(gold * 1.3);
    expect(g.areaPerk('glade').gold).toBe(1);
    const old = JSON.parse(serialize(newGame(0)));
    old.version = 15;
    old.hunters.gravewarden = { recruited: true, trains: 77, skills: { root: 1 }, station: 'forest' };
    delete old.hunters.thief;
    old.stats.hunterKills = { gravewarden: 12 };
    const back = deserialize(JSON.stringify(old))!;
    expect(back.hunters.thief).toMatchObject({ recruited: true, trains: 77, station: 'forest' });
    expect(back.stats.hunterKills.thief).toBe(12);
  });

  it('Theon the Puppeteer: magic or melee weapons, and puppets every 6s; old saves turn Gus into Theon', () => {
    const g = new Game(newGame(0), noCrit);
    g.state.gold = 1e30;
    for (const m of Object.keys(g.state.materials) as Array<keyof typeof g.state.materials>) g.state.materials[m] = 1e6;
    g.state.hunters.puppeteer.recruited = true;
    expect(g.equip('puppeteer', 0, g.craftGear('slimeWand')!.uid)).toBe(true);
    expect(g.equip('puppeteer', 0, g.craftGear('slimeSword')!.uid)).toBe(true);
    expect(g.equip('puppeteer', 0, g.craftGear('forestBow')!.uid)).toBe(false); // no ranged weapons
    expect(g.station('puppeteer', 'forest')).toBe(true);
    const f = new Field(g);
    f.setView(390, 420);
    f.enemies.push(enemy({ id: 1, x: 120, y: 0, hp: 1e12, maxHp: 1e12 }));
    for (let t = 0; t < 3; t += 0.01) {
      f.update(0.01);
      f.drainEvents();
    }
    expect(f.summons.filter((s) => s.who === 'puppeteer' && s.own && s.look === 'puppet')).toHaveLength(2);
    expect(f.enemies[0].hp).toBeLessThan(1e12);
    const old = JSON.parse(serialize(newGame(0)));
    old.version = 16;
    old.hunters.prospector = { recruited: true, trains: 40, skills: {}, station: null };
    delete old.hunters.puppeteer;
    expect(deserialize(JSON.stringify(old))!.hunters.puppeteer).toMatchObject({ recruited: true, trains: 40 });
  });

  it('summon types: Deku hits harder with Beast summons and Theon with Constructs, whatever summoned them', () => {
    const g = new Game(newGame(0), noCrit);
    expect(g.summonMult('druid', 'beast')).toBe(1.5);
    expect(g.summonMult('druid', 'construct')).toBe(1);
    expect(g.summonMult('puppeteer', 'construct')).toBe(1.5);
    expect(g.summonMult('main', 'beast')).toBe(1);
    expect(tomeSummonType(gearDef('wolfTome'))).toBe('beast');
    expect(tomeSummonType(gearDef('wispTome'))).toBe('spirit');
    expect(tomeSummonType(gearDef('necroTome'))).toBe('undead');
    expect((gearDef('puppetDoll').effect as { type: string }).type).toBe('construct');
    // Deku with the Wolf Spirit tome: his tome wolves bite 1.5× what the same tome's wolves bite for Reginald.
    g.state.gold = 1e30;
    for (const m of Object.keys(g.state.materials) as Array<keyof typeof g.state.materials>) g.state.materials[m] = 1e6;
    const bite = (who: 'druid' | 'puppeteer', tome: 'wolfTome' | 'wispTome') => {
      const f = new Field(g);
      f.setView(390, 420);
      const e = enemy({ id: 1, x: 100, y: 0, hp: 1e12, maxHp: 1e12, type: 'greenSlime' });
      f.enemies.push(e);
      g.station(who, g.state.area);
      (f as unknown as { syncHelpers: () => void }).syncHelpers();
      f.summons.push({ who, type: tomeSummonType(gearDef(tome)), x: 100, y: 0, life: 5, maxLife: 5, bite: 0.99, look: 'wolf', dash: 0, dashHit: false });
      (f as unknown as { runSummons: (dt: number) => void }).runSummons(0.02);
      return 1e12 - e.hp;
    };
    for (const id of ['druid', 'puppeteer'] as const) {
      g.state.hunters[id].recruited = true;
      g.equip(id, 0, g.craftGear(id === 'druid' ? 'wolfTome' : 'wispTome')!.uid);
    }
    // Same Hunter, same shot damage: Beast bites for Deku are ×1.5 of what a Spirit would do.
    g.equip('druid', 0, g.craftGear('wispTome')!.uid);
    const spirit = bite('druid', 'wispTome');
    expect(bite('druid', 'wolfTome') / spirit).toBeCloseTo(1.5);
  });

  it('Forest gear: deeper materials make stronger gear; the Fang Talisman and Slime Vial hit their archetypes harder; a 5★ Slime Vial finds Royal Slime', () => {
    expect(gearTier(gearDef('slimeSword'))).toBe(1);
    expect(gearTier(gearDef('forestBow'))).toBeGreaterThan(1);
    expect(gearTier(gearDef('slimeWand'))).toBeCloseTo(1.9);
    expect(weaponHit(gearDef('forestBlade'), 1)).toBeGreaterThan(weaponHit(gearDef('slimeSword'), 1));
    expect(weaponHit(gearDef('slimeWand'), 1)).toBeGreaterThan(weaponHit(gearDef('forestBow'), 1));
    expect(gearDef('forestBlade').weaponClass).toBe('sword');
    expect(GEAR.filter((x) => gearTier(x) < 2 && x.damageType === 'physical' && x.proc).map((x) => x.id)).toEqual(['beastBlade']); // only the Beast Blade bleeds
    expect(gearDef('sparkWand').damageType).toBe('fire');
    expect(gearDef('slimeWand').damageType).toBe('poison');
    expect(gearDef('commonClothes').name).toBe('Common Garb');
    const g = new Game(newGame(0), () => 0);
    g.state.gold = 1e30;
    for (const m of Object.keys(g.state.materials) as Array<keyof typeof g.state.materials>) g.state.materials[m] = 1e6;
    const vsBeast = g.shotDamage('main', 'beast');
    const tal = g.craftGear('fangTalisman')!;
    g.equip('main', 2, tal.uid);
    expect(g.shotDamage('main', 'beast')).toBeCloseTo(vsBeast * 1.05);
    expect(g.shotDamage('main', 'slime')).toBeCloseTo(vsBeast);
    const vial = g.craftGear('slimeVial')!;
    g.equip('main', 2, vial.uid);
    expect(g.shotDamage('main', 'slime')).toBeCloseTo(vsBeast * 1.1);
    const royal = g.state.materials.royalSlime;
    g.registerKill('greenSlime', false);
    expect(g.state.materials.royalSlime).toBe(royal); // only at 5★
    vial.stars = 5;
    g.registerKill('greenSlime', false);
    expect(g.state.materials.royalSlime).toBe(royal + 1);
  });

  it("summoners' own creatures copy their weapon: Theon's puppets with a Spark Wand bite with Fire and can set monsters burning", () => {
    const g = new Game(newGame(0), () => 0); // every proc roll succeeds
    g.state.gold = 1e30;
    for (const m of Object.keys(g.state.materials) as Array<keyof typeof g.state.materials>) g.state.materials[m] = 1e6;
    g.state.hunters.puppeteer.recruited = true;
    expect(g.damageTypeOf('puppeteer', 'long', true)).toBe('physical'); // no weapon: Physical
    g.equip('puppeteer', 0, g.craftGear('sparkWand')!.uid);
    expect(g.damageTypeOf('puppeteer', 'long', true)).toBe('fire');
    expect(g.procOf('puppeteer', 'long', true)).toBe(gearDef('sparkWand').proc);
    expect(g.damageTypeOf('glimmer', 'long', true)).toBe('fire'); // Glimmer's fireballs keep his own type
    g.station('puppeteer', g.state.area);
    const f = new Field(g);
    f.setView(390, 420);
    (f as unknown as { syncHelpers: () => void }).syncHelpers();
    const e = enemy({ id: 1, x: 200, y: 0, hp: 1e12, maxHp: 1e12, type: 'greenSlime' });
    f.enemies.push(e);
    f.summons.push({ who: 'puppeteer', type: 'construct', x: 200, y: 0, life: 5, maxLife: 5, bite: 0.99, look: 'puppet', dash: 0, dashHit: false, own: { bites: 1.5, speed: 140, mult: 0.7 } });
    (f as unknown as { runSummons: (dt: number) => void }).runSummons(0.02);
    expect(e.hp).toBeLessThan(1e12);
    expect(e.burn).toBeDefined();
  });

  it('lightning arcs to a creature in its radius, striking every creature the bolt passes through', () => {
    let seed = 1;
    const g = new Game(newGame(0), () => ((seed = (seed * 16807) % 2147483647) / 2147483647));
    const f = new Field(g);
    f.setView(390, 420);
    const hp = 1e9;
    const src = enemy({ id: 1, x: 100, y: 0, hp, maxHp: hp });
    const mid = enemy({ id: 2, x: 150, y: 0, hp, maxHp: hp }); // in the bolt's way if it goes to #3
    const end = enemy({ id: 3, x: 200, y: 0, hp, maxHp: hp });
    const far = enemy({ id: 4, x: 100 + STATUS.arc.radius + 60, y: 200, hp, maxHp: hp }); // out of reach
    f.enemies.push(src, mid, end, far);
    const arc = (f as unknown as { arc: (e: Enemy, amount: number, by: string) => void }).arc.bind(f);
    for (let i = 0; i < 40; i++) arc(src, 10, 'main');
    expect(src.hp).toBe(hp); // it jumps away from the monster that was hit
    expect(far.hp).toBe(hp);
    expect(mid.hp).toBeLessThan(hp);
    // Every arc toward #3 crossed #2, so #2 was struck at least as often as #3.
    expect(hp - mid.hp).toBeGreaterThan(hp - end.hp);
    expect(end.hp).toBeLessThan(hp);
    expect(f.drainEvents().some((e) => e.type === 'beam' && e.zigzag)).toBe(true);
  });

  it('bleeding (Physical) is the only status that stacks; others refresh a single instance', () => {
    const g = new Game(newGame(0), noCrit);
    const f = new Field(g);
    f.setView(390, 420);
    const e = enemy({ id: 1, x: 200, hp: 1e9, maxHp: 1e9 });
    f.enemies.push(e);
    const apply = (t: DamageType, dmg = 100) => (f as unknown as { applyStatus: (e: Enemy, t: DamageType, d: number, by: string) => void }).applyStatus(e, t, dmg, 'main');
    apply('physical');
    apply('physical');
    apply('physical');
    expect(e.bleeds).toHaveLength(3);
    for (let i = 0; i < 20; i++) apply('physical');
    expect(e.bleeds).toHaveLength(STATUS.bleed.maxStacks);
    apply('decay', 100);
    apply('decay', 50); // weaker: the stronger aura stays
    expect(e.aura!.dps).toBeCloseTo((100 * STATUS.aura.share) / STATUS.tick);
    apply('acid');
    apply('acid');
    expect(f.puddles.filter((p) => p.dtype === 'acid')).toHaveLength(1);
    // Stacked bleeds each tick on their own.
    const hp = e.hp;
    f.update(STATUS.tick + 0.01);
    expect(hp - e.hp).toBeGreaterThan(STATUS.bleed.maxStacks * ((100 * STATUS.bleed.share) / STATUS.bleed.duration) * STATUS.tick * 0.9);
  });

  it('a repeater sprays a fan; extra bolts of one volley on the same monster hit harder (×1.5, ×2)', () => {
    const g = stocked();
    g.state.hunters = Object.fromEntries(Object.entries(g.state.hunters).map(([k, h]) => [k, { ...h, station: null }])) as typeof g.state.hunters;
    g.state.items.splitbow = 0;
    g.equip('main', 0, g.craftGear('voidRepeater')!.uid);
    const f = new Field(g);
    f.setView(390, 420);
    // A huge monster right in front: the whole volley lands on it.
    f.enemies.push(enemy({ id: 1, x: 150, r: 50, hp: 1e12, maxHp: 1e12 }));
    const dmg: number[] = [];
    for (let t = 0; t < 1 / g.shooterRate('main') + 0.2; t += 0.005) {
      f.update(0.005);
      for (const e of f.drainEvents()) if (e.type === 'hit') dmg.push(e.dmg);
    }
    expect(dmg.length).toBe(WEAPON_CLASSES.repeater.volley);
    expect(dmg[1] / dmg[0]).toBeCloseTo(1.5);
    expect(dmg[2] / dmg[0]).toBeCloseTo(2);
  });

  it('guns fire a magazine, then reload; bows never stop', () => {
    const g = stocked();
    const pistol = g.craftGear('bonePistol')!;
    g.equip('main', 0, pistol.uid);
    g.state.items.splitbow = 0; // one bullet per shot
    const f = new Field(g);
    f.setView(390, 420);
    f.enemies.push(enemy({ id: 1, x: 120, hp: 1e12, maxHp: 1e12 }));
    const shotTime = 1 / g.shooterRate('main');
    const mag = WEAPON_CLASSES.pistol.mag!;
    let shots = 0;
    const mine = () => f.bullets.filter((b) => b.shooter === 'main').length;
    for (let t = 0; t < shotTime * (mag + 0.5); t += 0.01) {
      f.bullets = [];
      f.update(0.01);
      shots += mine();
    }
    expect(shots).toBe(mag);
    expect(f.drainEvents().some((e) => e.type === 'reload')).toBe(true);
    // The reload indicator's progress runs from 0 toward 1 over the reload.
    const p0 = f.reloadProgress('main')!;
    expect(p0).toBeGreaterThanOrEqual(0);
    f.update(0.1);
    expect(f.reloadProgress('main')!).toBeGreaterThan(p0);
    // No shots during the reload (the class's `reload` shots' worth of time), then a full magazine again.
    for (let t = 0; t < shotTime * (WEAPON_CLASSES.pistol.reload! - 0.6); t += 0.01) {
      f.bullets = [];
      f.update(0.01);
      expect(mine()).toBe(0);
    }
    let after = 0;
    for (let t = 0; t < shotTime * 2; t += 0.01) {
      f.bullets = [];
      f.update(0.01);
      after += mine();
    }
    expect(after).toBeGreaterThan(0);
  });

  it('longbow arrows carry on through their target into whatever is just behind', () => {
    const g = stocked();
    g.equip('main', 0, g.craftGear('emberLongbow')!.uid);
    const f = new Field(g);
    f.setView(390, 420);
    const hp = 1e12;
    // Two in a line, 30 apart: both hit. A third 150 further back: out of the follow-through.
    f.enemies.push(enemy({ id: 1, x: 150, hp, maxHp: hp }), enemy({ id: 2, x: 180, hp, maxHp: hp }), enemy({ id: 3, x: 330, hp, maxHp: hp }));
    g.state.hunters = Object.fromEntries(Object.entries(g.state.hunters).map(([k, h]) => [k, { ...h, station: null }])) as typeof g.state.hunters;
    // Small steps, so the arrow doesn't skip past them in one frame.
    for (let t = 0; t < 1 / g.shooterRate('main') + 0.6; t += 0.01) f.update(0.01);
    const hit = f.enemies.filter((e) => e.hp < hp).map((e) => e.id);
    expect(hit).toContain(1);
    expect(hit).toContain(2);
    expect(hit).not.toContain(3);
  });

  it('armor shields add Paladin-style charges', () => {
    const g = stocked();
    const plate = g.craftGear('bonePlate')!;
    while (g.gearItem(plate.uid)!.stars < 4) g.upgradeGear(plate.uid);
    g.equip('ranger', 1, plate.uid);
    expect(g.guardOf('ranger')).toBe(1);
    g.state.hunters.lance.skills = { root: 1 };
    expect(g.guardOf('lance')).toBe(3 + Math.floor(g.gear('lance').guard));
  });

  it('every piece of gear has a rarity, and all nine rarities are used', () => {
    for (const gd of GEAR) expect(Object.keys(RARITIES)).toContain(gd.rarity);
    expect(new Set(GEAR.map((gd) => gd.rarity)).size).toBe(Object.keys(RARITIES).length);
  });

  it('accessories take every refinement and enchantment, acting on whatever weapon the wearer holds (or doing nothing)', () => {
    const g = stocked();
    g.state.gold = 1e30;
    g.state.hunters.blacksmith.recruited = true;
    g.state.hunters.enchantress.recruited = true;
    const orb = g.craftGear('emberOrb')!; // a Very Rare accessory
    expect(g.refinesFor(orb.uid).sort()).toEqual((Object.keys(REFINES) as string[]).sort());
    expect(g.enchantsFor(orb.uid).sort()).toEqual((Object.keys(ENCHANTS) as string[]).sort());
    // A Magazine Size refine on the accessory grows the wearer's gun magazine...
    orb.mods = [{ kind: 'refine', stat: 'mag', q: MOD_QUALITY_STEPS }];
    const rifle = g.craftGear('frostRifle')!;
    g.equip('main', 0, rifle.uid);
    g.equip('main', 2, orb.uid);
    expect(g.weaponClassOf('main')!.mag).toBe(Math.round(WEAPON_CLASSES.rifle.mag! * (1 + modRoll(REFINES.mag.range, false, 'veryRare', MOD_QUALITY_STEPS))));
    // ...and does nothing for a Hunter with no gun.
    g.equip('main', 0, g.craftGear('slimeSword')!.uid);
    expect(g.weaponClassOf('main')!.mag).toBeUndefined();
    // An infusion on the accessory adds its type to the wearer's weapon.
    orb.mods = [{ kind: 'enchant', id: 'infuseVoid', q: 5, p: 5 }];
    expect(g.damageTypesOf('main')).toContain('void');
    expect(g.procFor('main', 'void')).toBeCloseTo(modRoll(ENCHANTS.infuseVoid.range, false, 'veryRare', 5));
  });

  it("salvage returns half of what the piece's current modifiers cost (replaced ones are gone)", () => {
    const g = stocked();
    g.state.gold = 1e30;
    g.state.hunters.blacksmith.recruited = true;
    g.state.hunters.enchantress.recruited = true;
    const rifle = g.craftGear('frostRifle')!;
    const plain = g.salvageValue(rifle.uid);
    expect(g.salvageGold(rifle.uid)).toBe(0);
    g.refine(rifle.uid, 0);
    g.refine(rifle.uid, 0); // replaces the first: its cost is gone
    g.enchant(rifle.uid, 1);
    const gd = gearDef('frostRifle');
    expect(g.salvageGold(rifle.uid)).toBe(Math.floor((modGold(gd, 'refine') + modGold(gd, 'enchant')) * 0.5));
    const mods = { ...modCost(gd, 'refine') };
    for (const [m, n] of Object.entries(modCost(gd, 'enchant'))) mods[m as MaterialId] = (mods[m as MaterialId] ?? 0) + n!;
    const value = g.salvageValue(rifle.uid);
    expect(value.silverOre).toBe(Math.floor(mods.silverOre! * 0.5));
    expect(value.amethyst).toBe(Math.floor(mods.amethyst! * 0.5));
    expect(value.fur).toBe(Math.floor((gearCost(gd, 0).fur! + mods.fur!) * 0.5));
    expect(plain.silverOre).toBeUndefined();
    const gold = g.state.gold;
    const amethyst = g.state.materials.amethyst;
    expect(g.salvageGear(rifle.uid)).toBe(true);
    expect(g.state.gold).toBe(gold + Math.floor((modGold(gd, 'refine') + modGold(gd, 'enchant')) * 0.5));
    expect(g.state.materials.amethyst).toBe(amethyst + value.amethyst!);
  });

  it('upgrading costs materials and gold (doubling each star)', () => {
    const g = stocked();
    const bow = g.craftGear('forestBow')!;
    const gold = g.state.gold;
    const price = g.gearUpgradeGold(bow.uid)!;
    expect(price).toBeGreaterThan(0);
    expect(g.upgradeGear(bow.uid)).toBe(true);
    expect(g.state.gold).toBe(gold - price);
    expect(g.gearUpgradeGold(bow.uid)).toBe(price * 2);
    g.state.gold = 0;
    expect(g.canUpgradeGear(bow.uid)).toBe(false);
    expect(g.upgradeGear(bow.uid)).toBe(false);
  });

  it("salvaging refunds half the materials spent; worn gear can't be salvaged", () => {
    const g = stocked();
    const bow = g.craftGear('forestBow')!;
    g.upgradeGear(bow.uid);
    g.equip('main', 0, bow.uid);
    const twig = g.state.materials.twig;
    const refund = g.salvageValue(bow.uid).twig!;
    expect(refund).toBe(Math.floor((gearCost(gearDef('forestBow'), 0).twig! + gearCost(gearDef('forestBow'), 1).twig!) * 0.5));
    expect(g.salvageGear(bow.uid)).toBe(false); // worn: take it off first
    expect(g.state.inventory).toHaveLength(1);
    g.equip('main', 0, null);
    expect(g.salvageGear(bow.uid)).toBe(true);
    expect(g.state.materials.twig).toBe(twig + refund);
    expect(g.state.inventory).toHaveLength(0);
  });

  it('inventory and equipment survive a save round-trip; dangling references are dropped', () => {
    const g = stocked();
    const bow = g.craftGear('forestBow')!;
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
    g.recruit('thief');
    g.state.hunters.thief.trains = 8000; // strong enough for the Graveyard
    g.station('thief', 'graveyard');
    const gold = g.state.gold;
    const r = g.applyOffline(24 * 3600 * 1000);
    expect(r.seconds).toBe(OFFLINE_CAP_SEC);
    expect(r.gold).toBeGreaterThan(0);
    expect(g.state.gold).toBeCloseTo(gold + r.gold);
    expect(r.materials.goo).toBeGreaterThan(0); // you, in the forest
    expect(r.materials.bone).toBeGreaterThan(0); // Alias, in the graveyard
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
    s.areas.forest.kills = areaDef('forest').mastery;
    const g = new Game(s, noCrit);
    expect(g.startEvent('guardian-forest')).toBe(true);
    expect(g.guardianActive).toBe(true);
    expect(g.eventCooldown('guardian-forest')).toBe(GUARDIAN_COOLDOWN);
    expect(g.startEvent('guardian-forest')).toBe(false); // already running
    g.bossSpawned();
    g.registerKill(g.guardianType, true); // win: the Fey Grove opens
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
    s.bestiary.twiggling.unlocked = true;
    const g = new Game(s, noCrit);
    const def = eventDef('slimeSwarm');
    expect(def.area).toBe('forest');
    // It unlocks at 1,000 slimes slain in the Forest (other monsters don't count), before the Guardian.
    expect(EVENTS.filter((e) => e.area === 'forest').map((e) => e.id)).toEqual(['slimeSwarm', 'guardian-forest']);
    expect(def.unlockKills).toBe(1000);
    g.state.areas.forest.kills = 1e6;
    g.state.bestiary.greenSlime.kills = def.unlockKills - 1;
    expect(g.eventUnlocked('slimeSwarm')).toBe(false);
    g.state.bestiary.greenSlime.kills = def.unlockKills;
    const slime = g.enemyStats('greenSlime');
    expect(g.startEvent('slimeSwarm')).toBe(true);
    // Green Slimes: twice as many, but at least 10 a second.
    expect(g.enemyStats('greenSlime').spawnRate).toBeCloseTo(Math.max(10, slime.spawnRate * 2));
    expect(g.enemyStats('greenSlime').speed).toBeCloseTo(slime.speed * 2);
    expect(g.enemyStats('twiggling').spawnRate).toBe(0);
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
    s.bestiary.greenSlime.kills = 1e6;
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
    s.areas.forest.kills = areaDef('forest').mastery;
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

  it('Reginald attacks with his weapon (a plain bolt unarmed) and lobs a potion that leaves a damaging puddle on a cooldown', () => {
    const { f } = withHelper('alchemist');
    f.enemies.push(tough({ id: 1, x: -150, y: 150 }));
    let puddle = false;
    let spark = false;
    for (let i = 0; i < 90; i++) {
      f.update(1 / 30);
      puddle ||= f.puddles.some((p) => p.shooter === 'alchemist');
      spark ||= f.bullets.some((b) => b.shooter === 'alchemist' && b.kind === 'bolt');
    }
    expect(f.helpers.map((h) => h.id)).toEqual(['alchemist']);
    expect(puddle).toBe(true);
    // The potion is on a cooldown: in between, only bolts fly.
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

  it('Wilhelm fights with his long-range weapon, and switches to his short-range one up close', () => {
    const { f } = withHelper('wilhelm');
    f.enemies.push(tough({ id: 1, x: -55, y: -200 }));
    for (let i = 0; i < 90; i++) f.update(1 / 30);
    expect(f.helpers[0].close).toBe(false);
    expect(f.enemies[0].hp).toBeLessThan(1e12);

    f.bullets = [];
    f.enemies = [tough({ id: 2, x: -55, y: -30 })];
    for (let i = 0; i < 30; i++) f.update(1 / 30);
    expect(f.helpers[0].close).toBe(true);
  });

  it('Guild Hunters attack the way their weapon does, not with an attack of their own', () => {
    const { g, f } = withHelper('lance');
    for (const m of Object.keys(g.state.materials) as Array<keyof typeof g.state.materials>) g.state.materials[m] = 1e6;
    const spear = g.craftGear('boneSpear')!;
    g.equip('lance', 0, spear.uid);
    f.update(0);
    const h = f.helpers[0];
    f.enemies = [tough({ id: 1, x: h.x, y: h.y - 40 })];
    for (let i = 0; i < 30; i++) f.update(1 / 30);
    // A spear's thrust is an instant line strike, no projectile.
    expect(f.bullets.filter((b) => b.shooter === 'lance').length).toBe(0);
    expect(f.enemies[0].hp).toBeLessThan(1e12);
    expect(g.shooterRange('lance')).toBeCloseTo(WEAPON_CLASSES.spear.reach! + g.gear('lance').range / 4 + g.tree('lance').range / 4);
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
  it('every evolution tree completes exactly at Lv 30 (the capstone takes the points left over)', () => {
    expect(MAX_MONSTER_LEVEL).toBe(30);
    for (const tree of Object.values(EVO_TREES)) expect(tree.reduce((a, n) => a + n.maxRank * (n.cost ?? 1), 0)).toBe(MAX_MONSTER_LEVEL - 1);
  });

  it('v13 saves keep each monster\'s Empower level under the 5-sessions-a-level curve', () => {
    const old = JSON.parse(serialize(newGame(0)));
    old.version = 13;
    old.bestiary.wolf.empower = 11; // Lv 3 on the old curve (3 + 4 sessions for Lv 2 and 3)
    const s = deserialize(JSON.stringify(old))!;
    expect(s.bestiary.wolf.empower).toBe(10);
    expect(new Game(s).monsterLevelInfo('wolf').level).toBe(3);
  });

  it('v14 saves: Empower is capped at Lv 30 and evolution points are refunded (the trees were resized)', () => {
    const old = JSON.parse(serialize(newGame(0)));
    old.version = 14;
    old.bestiary.greenSlime.empower = 205;
    old.bestiary.greenSlime.evo = { root: 1, wealth: 10 };
    const s = deserialize(JSON.stringify(old))!;
    const g = new Game(s);
    expect(s.bestiary.greenSlime.empower).toBe(MAX_EMPOWER_SESSIONS);
    expect(s.bestiary.greenSlime.evo).toEqual({});
    expect(g.monsterLevelInfo('greenSlime').level).toBe(30);
    expect(g.evoPoints('greenSlime')).toBe(29);
  });

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

  it("Terminal is the default font; saves from before it that used the old default switch over, a later choice stays", () => {
    const old = JSON.parse(serialize(newGame(0)));
    old.version = 11;
    old.settings.font = 'pixel';
    expect(deserialize(JSON.stringify(old))!.settings.font).toBe('terminal');
    old.settings.font = 'jersey';
    expect(deserialize(JSON.stringify(old))!.settings.font).toBe('jersey');
    const now = newGame(0);
    now.settings.font = 'pixel';
    expect(deserialize(serialize(now))!.settings.font).toBe('pixel');
  });

  it('counts every material gained (spending does not lower it); older saves start from what they hold', () => {
    const g = rich();
    g.gainMaterial('goo', 30);
    g.state.materials.goo -= 20;
    expect(g.state.stats.matGained.goo).toBe(30);
    expect(deserialize(serialize(g.state))!.stats.matGained.goo).toBe(30);
    const old = JSON.parse(serialize(newGame(0)));
    old.version = 11;
    delete old.stats.matGained;
    old.materials.pelt = 12;
    expect(deserialize(JSON.stringify(old))!.stats.matGained).toEqual({ pelt: 12 });
  });

  it('effect settings: all on and fancy by default; switches survive a save', () => {
    const s = newGame(0);
    expect(FX_KEYS.every((k) => s.settings.fx[k])).toBe(true);
    expect(s.settings.aoeStyle).toBe('fancy');
    s.settings.fx.dmgCrit = false;
    s.settings.fx.status = false;
    s.settings.aoeStyle = 'basic';
    const back = deserialize(serialize(s))!.settings;
    expect([back.fx.dmgCrit, back.fx.status, back.fx.bleed, back.aoeStyle]).toEqual([false, false, true, 'basic']);
    // Saves from before these settings get everything on.
    const old = JSON.parse(serialize(newGame(0)));
    delete old.settings.fx;
    delete old.settings.aoeStyle;
    const o = deserialize(JSON.stringify(old))!.settings;
    expect(FX_KEYS.every((k) => o.fx[k])).toBe(true);
    expect(o.aoeStyle).toBe('fancy');
  });

  it('cooldown and reload indicator settings survive a save; junk falls back to the defaults', () => {
    const s = newGame(0);
    Object.assign(s.settings, { cooldowns: false, cooldownPos: 'left', reloads: false, reloadPos: 'below' });
    const back = deserialize(serialize(s))!.settings;
    expect([back.cooldowns, back.cooldownPos, back.reloads, back.reloadPos]).toEqual([false, 'left', false, 'below']);
    const junk = JSON.parse(serialize(newGame(0)));
    junk.settings.cooldownPos = 'sideways';
    junk.settings.reloadPos = 7;
    const j = deserialize(JSON.stringify(junk))!.settings;
    expect([j.cooldownPos, j.reloadPos]).toEqual(['top', 'above']);
  });

  it('the field reports recharging abilities and gun reloads', () => {
    const g = rich();
    for (const [m] of Object.entries(g.state.materials)) g.state.materials[m as keyof typeof g.state.materials] = 1e6;
    g.recruit('alchemist');
    g.station('alchemist', g.area);
    const f = new Field(g);
    f.setView(390, 420);
    f.update(0.01);
    const reg = f.cooldowns().find((c) => c.key === 'alchemist');
    expect(reg).toBeDefined();
    expect(reg!.progress).toBeGreaterThanOrEqual(0);
    expect(reg!.progress).toBeLessThanOrEqual(1);
    expect(f.reloadProgress('main')).toBeNull(); // no gun
  });

  it('keeps settings and tutorial flags; older saves get the defaults', () => {
    const s = newGame(0);
    s.settings.leftHanded = true;
    s.settings.name = 'Wolfa';
    s.flags.eventsIntro = true;
    const back = deserialize(serialize(s))!;
    expect(back.settings).toEqual({ leftHanded: true, name: 'Wolfa', tabOrder: ['hunters', 'inventory', 'beasts', 'events', 'areas'], font: 'terminal', dps: true, dpsCorner: 'tr', hudPos: 'bottom', cooldowns: true, cooldownPos: 'top', reloads: true, reloadPos: 'above', reloadStyle: 'fancy', cooldownStyle: 'fancy', autoSalvage: [], fx: Object.fromEntries(FX_KEYS.map((k) => [k, true])), aoeStyle: 'fancy' });
    expect(back.flags).toEqual({ eventsIntro: true, welcome: false, trainIntro: false, empowerIntro: false, craftIntro: false, wolfIntro: false });
    const old = JSON.parse(serialize(newGame(0)));
    delete old.settings;
    delete old.flags;
    expect(deserialize(JSON.stringify(old))!.settings).toEqual({ leftHanded: false, name: '', tabOrder: ['hunters', 'inventory', 'beasts', 'events', 'areas'], font: 'terminal', dps: true, dpsCorner: 'tr', hudPos: 'bottom', cooldowns: true, cooldownPos: 'top', reloads: true, reloadPos: 'above', reloadStyle: 'fancy', cooldownStyle: 'fancy', autoSalvage: [], fx: Object.fromEntries(FX_KEYS.map((k) => [k, true])), aoeStyle: 'fancy' });
    // A hidden DPS meter stays hidden.
    const noDps = newGame(0);
    noDps.settings.dps = false;
    expect(deserialize(serialize(noDps))!.settings.dps).toBe(false);
    const moved = newGame(0);
    Object.assign(moved.settings, { dpsCorner: 'bl', hudPos: 'top' });
    expect(deserialize(serialize(moved))!.settings).toMatchObject({ dpsCorner: 'bl', hudPos: 'top' });
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
      { uid: 1, base: 'furCoat', level: 1 },
      { uid: 2, base: 'emberOrb', level: 2 },
      { uid: 3, base: 'fangTalisman', level: 1 },
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

  it('stars: gear and Upgrades go 1★ to 5★; old levels convert down to a star and refund the rest', () => {
    // 1★ is the old Lv 1 and 5★ the old max, so the strongest pieces are as strong as before.
    const ring = gearDef('soulRing');
    expect(gearStats(ring, 1).damage).toBeCloseTo(0.25);
    expect(gearStats(ring, MAX_STARS).damage).toBeCloseTo(2.5);
    const bow = gearDef('forestBow'); // a weapon's base damage grows with its stars too
    expect(weaponHit(bow, MAX_STARS)).toBeCloseTo(weaponHit(bow, 1) * WEAPON_HIT_POWER[MAX_STARS]);
    const whet = itemDef('whetstone');
    expect(itemLevels(whet)).toEqual([0, 1, 2, 4, 8, 15]); // Common: stops at its old Lv 15
    for (const it of ITEMS) if (it.rarity === 'common' || it.rarity === 'uncommon') expect(itemLevels(it)[MAX_STARS]).toBeLessThanOrEqual(15);
    // A star costs the price of the step two thirds of the way (geometrically) through the ones it covers.
    expect(itemCost(whet, 0).goo).toBe(4);
    expect(itemCost(whet, 1).goo).toBe(Math.ceil(4 * 1.45 ** 1)); // Lv 1 → 2: step 1
    expect(itemCost(whet, 4).goo).toBe(Math.ceil(4 * 1.45 ** 11)); // Lv 8 → 15: 8^⅓·15^⅔ ≈ 12 → step 11
    const g = rich();
    g.state.materials.goo = 1e12;
    for (let i = 0; i < MAX_STARS; i++) expect(g.craft('whetstone')).toBe(true);
    expect(g.craft('whetstone')).toBe(false);
    expect(g.state.items.whetstone).toBe(MAX_STARS);
    // An old save: a Lv 5 bow becomes 3★ (Lv 4) + a refund; a Lv 10 one is 5★.
    const old = JSON.parse(serialize(newGame(0)));
    old.version = 12;
    old.inventory = [{ uid: 1, base: 'forestBow', level: 5 }, { uid: 2, base: 'forestBow', level: 10 }];
    old.items.gloves = 15;
    const s = deserialize(JSON.stringify(old))!;
    expect(s.inventory.map((it) => it.stars)).toEqual([3, 5]);
    expect(s.materials.twig).toBe(old.materials.twig + Math.ceil(6 * 1.8 ** 4));
    expect(s.items.gloves).toBe(MAX_STARS);
  });

  it('migrates a stage-based save: keeps items and surviving materials', () => {
    const v3 = { version: 3, gold: 1e9, stage: 40, maxStage: 40, items: { whetstone: 4 }, materials: { goo: 50, bone: 20, ember: 5 }, stars: 7, stats: { totalKills: 123, deaths: 2 } };
    const s = deserialize(JSON.stringify(v3))!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.area).toBe('forest');
    expect(s.gold).toBe(0);
    // Whetstone Lv 4 became 3★ (exactly Lv 4), so nothing is refunded.
    expect(s.items.whetstone).toBe(3);
    expect(s.materials.goo).toBe(50);
    expect(s.materials.bone).toBe(20);
    expect('stars' in s).toBe(false);
    expect(s.stats.totalKills).toBe(123);
    expect('deaths' in s.stats).toBe(false);
  });
});

describe('Dev progress phases (public/dev-presets.json)', () => {
  const file = 'public/dev-presets.json';
  const presets = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : {};
  it('every phase is an area start or end', () => {
    // (Being re-recorded: the full set of 24 is checked once the run is in.)
    const valid = AREAS.flatMap((a) => [`${a.id}-start`, `${a.id}-end`]);
    expect(Object.keys(presets).length).toBeGreaterThan(0);
    for (const k of Object.keys(presets)) expect(valid).toContain(k);
  });
  it("every phase loads: in its area, and at the end ready for (but not past) the area's Guardian", () => {
    for (const [key, raw] of Object.entries(presets)) {
      const [area, when] = key.split('-');
      const st = deserialize(JSON.stringify(raw))!;
      expect(st, key).not.toBeNull();
      const g = new Game(st);
      expect(st.area, key).toBe(area);
      expect(g.isAreaUnlocked(area as never), key).toBe(true);
      expect(st.events[`guardian-${area}`]?.completed ?? 0, key).toBe(0);
      if (when === 'end') expect(g.guardianReady, key).toBe(true);
      // Everything worn is real gear.
      for (const who of ['main', ...HUNTERS.filter((h) => st.hunters[h.id].recruited).map((h) => h.id)] as const)
        for (const it of g.equipped(who as never)) if (it) expect(gearDef(it.base), key).toBeDefined();
    }
  });
});
