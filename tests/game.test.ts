import { describe, expect, it } from 'vitest';
import { BOSS_TIME, enemyDef, ESCAPES_TO_RETREAT, itemCost, itemDef, KILLS_PER_STAGE, MAX_TICKETS, OFFLINE_CAP_SEC, STUN_IMMUNITY, TICKET_REGEN_SEC } from '../src/core/balance';
import { Field } from '../src/core/field';
import { Game } from '../src/core/game';
import { deserialize, newGame, serialize } from '../src/core/state';

const noCrit = () => 0.99;

describe('Game progression', () => {
  it('clears a stage after enough kills and auto-advances', () => {
    const g = new Game(newGame(0), noCrit);
    for (let i = 0; i < KILLS_PER_STAGE; i++) g.registerKill('slime', false);
    expect(g.state.stage).toBe(2);
    expect(g.state.maxStage).toBe(2);
    expect(g.state.gold).toBeGreaterThan(0);
  });

  it('a boss stage only clears by killing the boss; timing out retreats', () => {
    const s = newGame(0);
    s.stage = s.maxStage = 5;
    const g = new Game(s, noCrit);
    for (let i = 0; i < KILLS_PER_STAGE * 2; i++) g.registerKill('slime', false);
    expect(g.state.stage).toBe(5);
    g.bossSpawned();
    g.tick(BOSS_TIME + 1);
    expect(g.state.stage).toBe(4);
    expect(g.state.autoAdvance).toBe(false);
    g.setStage(5);
    expect(g.state.autoAdvance).toBe(true);
    g.bossSpawned();
    const r = g.registerKill('slime', true);
    expect(r.amount).toBeGreaterThan(0);
    expect(g.state.stage).toBe(6);
  });

  it('farming an earlier stage does not advance', () => {
    const s = newGame(0);
    s.stage = s.maxStage = 8;
    const g = new Game(s, noCrit);
    g.setStage(7);
    for (let i = 0; i < KILLS_PER_STAGE; i++) g.registerKill('slime', false);
    expect(g.state.stage).toBe(7);
  });

  it("kills drop the enemy type's own material", () => {
    const always = new Game(newGame(0), () => 0);
    always.registerKill('skeleton', false);
    expect(always.state.materials.bone).toBe(1);
    const never = new Game(newGame(0), () => 0.999);
    never.registerKill('slime', false);
    expect(never.state.materials.goo).toBe(0);
  });

  it('escapes are counted per stage and reset on stage change', () => {
    const s = newGame(0);
    s.maxStage = 3;
    const g = new Game(s, noCrit);
    g.registerEscape();
    g.registerEscape();
    expect(g.state.stageEscapes).toBe(2);
    expect(g.state.stats.escaped).toBe(2);
    g.setStage(2);
    expect(g.state.stageEscapes).toBe(0);
  });

  it('too many escapes on one stage fall back a stage', () => {
    const s = newGame(0);
    s.stage = s.maxStage = 12;
    const g = new Game(s, noCrit);
    for (let i = 0; i < ESCAPES_TO_RETREAT - 1; i++) g.registerEscape();
    expect(g.state.stage).toBe(12);
    g.registerEscape();
    expect(g.state.stage).toBe(11);
    expect(g.state.autoAdvance).toBe(false);
  });
});

describe('Shops', () => {
  it('gold upgrades raise combat stats and respect max levels', () => {
    const g = new Game(newGame(0), noCrit);
    g.state.gold = 1e12;
    const dmg = g.damage;
    expect(g.buyUpgrade('power')).toBe(true);
    expect(g.damage).toBeGreaterThan(dmg);
    g.state.buyAmount = 'max';
    g.buyUpgrade('haste');
    expect(g.state.upgrades.haste).toBe(60);
    expect(g.buyUpgrade('haste')).toBe(false);
  });

  it('crafting spends materials and applies item effects', () => {
    const g = new Game(newGame(0), noCrit);
    expect(g.craft('lure')).toBe(false);
    const cost = itemCost(itemDef('lure'), 0).goo!;
    g.state.materials.goo = cost;
    const spawn = g.spawnRate;
    expect(g.craft('lure')).toBe(true);
    expect(g.state.materials.goo).toBe(0);
    expect(g.spawnRate).toBeGreaterThan(spawn);
    g.state.materials.bone = 1000;
    g.state.materials.ember = 1000;
    g.craft('splitbow');
    expect(g.projectiles).toBe(2);
  });

  it('bestiary: unlocking adds a new enemy type; swarm and bounty change its stats', () => {
    const g = new Game(newGame(0), noCrit);
    expect(g.unlockedEnemies).toEqual(['slime']);
    expect(g.unlockEnemy('skeleton')).toBe(false);
    g.state.gold = 1e9;
    const spawnBefore = g.spawnRate;
    expect(g.unlockEnemy('skeleton')).toBe(true);
    expect(g.unlockedEnemies).toEqual(['slime', 'skeleton']);
    expect(g.spawnRate).toBeGreaterThan(spawnBefore);
    expect(g.bossType).toBe('skeleton');
    expect(g.unlockedMaterials).toEqual(['goo', 'bone']);

    const before = g.enemyStats('slime');
    expect(g.buyEnemyUpgrade('slime', 'swarm')).toBe(true);
    expect(g.enemyStats('slime').spawnRate).toBeGreaterThan(before.spawnRate);
    expect(g.buyEnemyUpgrade('slime', 'bounty')).toBe(true);
    const after = g.enemyStats('slime');
    expect(after.gold).toBeGreaterThan(before.gold);
    expect(after.speed).toBeGreaterThan(before.speed);
    expect(after.dropChance).toBeGreaterThan(before.dropChance);
    expect(g.buyEnemyUpgrade('imp', 'swarm')).toBe(false); // still locked
  });

  it('enemy types differ in hp, speed and gold', () => {
    const g = new Game(newGame(0), noCrit);
    expect(g.enemyStats('golem').hp).toBeGreaterThan(g.enemyStats('slime').hp);
    expect(g.enemyStats('imp').speed).toBeGreaterThan(g.enemyStats('slime').speed);
    expect(g.enemyStats('horror').gold).toBeGreaterThan(g.enemyStats('skeleton').gold);
    expect(enemyDef('slime').unlockCost).toBe(0);
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

  it('prestige resets progress and the bestiary but keeps shards, items and materials', () => {
    const s = newGame(0);
    s.bestiary.skeleton.unlocked = true;
    s.maxStage = s.stage = 80;
    s.gold = 1e12;
    s.upgrades.power = 100;
    s.items.whetstone = 3;
    s.materials.goo = 50;
    s.stars = 9;
    const g = new Game(s, noCrit);
    const shards = g.prestige();
    expect(shards).toBeGreaterThan(0);
    expect(g.state.stage).toBe(1);
    expect(g.state.gold).toBe(0);
    expect(g.state.upgrades.power).toBe(0);
    expect(g.state.items.whetstone).toBe(3);
    expect(g.state.materials.goo).toBe(50);
    expect(g.state.stars).toBe(9);
    expect(g.state.bestiary.skeleton.unlocked).toBe(false);
  });
});

describe('Offline & minigames', () => {
  it('computes capped offline gold and materials, and regenerates tickets', () => {
    const s = newGame(0);
    s.upgrades.power = 20;
    s.tickets = 0;
    const g = new Game(s, noCrit);
    const r = g.applyOffline(24 * 3600 * 1000);
    expect(r.seconds).toBe(OFFLINE_CAP_SEC);
    expect(r.gold).toBeGreaterThan(0);
    expect(r.materials.goo).toBeGreaterThan(0);
    expect(g.state.materials.goo).toBe(r.materials.goo);
    expect(g.state.tickets).toBe(MAX_TICKETS);

    const g2 = new Game({ ...newGame(0), tickets: 0 }, noCrit);
    g2.applyOffline(TICKET_REGEN_SEC * 1000 * 1.5);
    expect(g2.state.tickets).toBe(1);
  });

  it('offline kills are capped by the spawn rate, and weak hunters let most escape', () => {
    const strong = new Game({ ...newGame(0), upgrades: { power: 500, haste: 0, nerves: 0 } }, noCrit);
    const r = strong.applyOffline(3600 * 1000);
    expect(r.kills).toBeLessThanOrEqual(Math.ceil(3600 * strong.spawnRate));
    expect(r.kills).toBeGreaterThan(3600 * strong.spawnRate * 0.4);

    const s = newGame(0);
    s.stage = s.maxStage = 30;
    const weak = new Game(s, noCrit);
    expect(weak.applyOffline(3600 * 1000).kills).toBeLessThan(3600 * weak.spawnRate * 0.05);
  });

  it('minigame payouts grant gold, frenzy, materials and stars', () => {
    const g = new Game(newGame(0), noCrit);
    const r = g.grantMinigame({ id: 'skysiege', score: 1234, units: 1000, materials: { goo: 7, bone: 2 }, stars: 5 });
    expect(r.gold).toBeGreaterThan(0);
    expect(g.state.frenzyTime).toBe(300);
    expect(g.state.materials.goo).toBe(7);
    expect(g.state.stars).toBe(5);
    expect(g.state.stats.best.skysiege).toBe(1234);
  });
});

describe('Field', () => {
  it('spawns a horde, shoots it down and reports kills', () => {
    const g = new Game(newGame(0), noCrit);
    g.state.upgrades.power = 30;
    const f = new Field(g);
    f.setView(390, 420);
    for (let i = 0; i < 20 * 30; i++) {
      g.tick(1 / 30);
      f.update(1 / 30);
    }
    const kills = f.drainEvents().filter((e) => e.type === 'kill').length;
    expect(kills).toBeGreaterThan(5);
    expect(g.state.stats.totalKills).toBe(kills);
  });

  it('an enemy reaching the Hunter stuns them and flees; unkilled runners escape', () => {
    const s = newGame(0);
    s.stage = s.maxStage = 31; // far too tough for a fresh Hunter (and not a boss stage)
    const g = new Game(s, noCrit);
    const f = new Field(g);
    f.setView(390, 420);
    let stunned = false;
    for (let i = 0; i < 40 * 30; i++) {
      g.tick(1 / 30);
      f.update(1 / 30);
      stunned ||= f.stunned;
    }
    const events = f.drainEvents();
    expect(stunned).toBe(true);
    expect(events.some((e) => e.type === 'stun')).toBe(true);
    expect(g.state.stats.escaped).toBeGreaterThan(0);
    expect(g.state.stage).toBeLessThan(31); // enough got away to force a fall-back
    expect(g.state.autoAdvance).toBe(false);
  });

  it('the Hunter cannot shoot while stunned and is briefly immune afterwards', () => {
    const g = new Game(newGame(0), noCrit);
    const f = new Field(g);
    f.setView(390, 420);
    const enemy = (id: number, x: number) => ({ id, type: 'slime' as const, x, y: 0, hp: 1e9, maxHp: 1e9, r: 10, speed: 40, boss: false, fleeing: false, flash: 0, kx: 0, ky: 0, phase: 0 });
    f.enemies.push(enemy(1, 20));
    f.update(1 / 30);
    expect(f.stunned).toBe(true);
    expect(f.enemies[0].fleeing).toBe(true);
    const bullets = f.bullets.length;
    f.update(0.3);
    expect(f.bullets.length).toBe(bullets); // no new shots while dazed
    f.update(g.stunTime()); // stun wears off
    expect(f.stunned).toBe(false);
    expect(f.immune).toBeCloseTo(STUN_IMMUNITY, 5);
    f.enemies.push(enemy(2, -20));
    f.update(1 / 30);
    expect(f.stunned).toBe(false); // immune: the runner still flees but doesn't stun
    expect(f.enemies.find((e) => e.id === 2)?.fleeing).toBe(true);
  });

  it('bosses stun longer and bounce off instead of fleeing', () => {
    const g = new Game(newGame(0), noCrit);
    const f = new Field(g);
    f.enemies.push({ id: 1, type: 'slime', x: 30, y: 0, hp: 1e9, maxHp: 1e9, r: 28, speed: 40, boss: true, fleeing: false, flash: 0, kx: 0, ky: 0, phase: 0 });
    f.update(1 / 30);
    expect(f.stun).toBeCloseTo(g.stunTime(true), 1);
    expect(f.enemies[0].fleeing).toBe(false);
    expect(f.enemies[0].kx).toBeGreaterThan(0);
  });

  it('tap blasts damage enemies near the tap', () => {
    const g = new Game(newGame(0), noCrit);
    const f = new Field(g);
    f.enemies.push({ id: 1, type: 'slime', x: 100, y: 0, hp: 1, maxHp: 1, r: 10, speed: 0, boss: false, fleeing: false, flash: 0, kx: 0, ky: 0, phase: 0 });
    f.enemies.push({ id: 2, type: 'slime', x: -100, y: 0, hp: 1, maxHp: 1, r: 10, speed: 0, boss: false, fleeing: false, flash: 0, kx: 0, ky: 0, phase: 0 });
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
    const back = deserialize(serialize(s));
    expect(back?.gold).toBe(42);
    expect(back?.items.gloves).toBe(3);
    expect(deserialize('not json')).toBeNull();
  });

  it('migrates a v2 save: Vitality becomes Steady Nerves, bestiary defaults', () => {
    const v2 = newGame(0) as unknown as Record<string, unknown>;
    v2.version = 2;
    v2.upgrades = { power: 12, haste: 3, vitality: 7 };
    delete v2.bestiary;
    const s = deserialize(JSON.stringify(v2))!;
    expect(s.version).toBe(3);
    expect(s.upgrades).toEqual({ power: 12, haste: 3, nerves: 7 });
    expect(s.bestiary.slime.unlocked).toBe(true);
    expect(s.bestiary.skeleton.unlocked).toBe(false);
  });

  it('migrates a v1 prototype save, keeping shards and stats', () => {
    const v1 = JSON.stringify({ gold: 999, stage: 40, heroes: [5], shards: 7, stats: { totalKills: 123 } });
    const s = deserialize(v1)!;
    expect(s.version).toBe(3);
    expect(s.stage).toBe(1);
    expect(s.gold).toBe(0);
    expect(s.shards).toBe(7);
    expect(s.stats.totalKills).toBe(123);
  });
});
