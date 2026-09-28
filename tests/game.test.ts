import { describe, expect, it } from 'vitest';
import { BOSS_TIME, itemCost, itemDef, KILLS_PER_STAGE, MAX_TICKETS, OFFLINE_CAP_SEC, TICKET_REGEN_SEC } from '../src/core/balance';
import { Field } from '../src/core/field';
import { Game } from '../src/core/game';
import { deserialize, newGame, serialize } from '../src/core/state';

const noCrit = () => 0.99;

describe('Game progression', () => {
  it('clears a stage after enough kills and auto-advances', () => {
    const g = new Game(newGame(0), noCrit);
    for (let i = 0; i < KILLS_PER_STAGE; i++) g.registerKill(false);
    expect(g.state.stage).toBe(2);
    expect(g.state.maxStage).toBe(2);
    expect(g.state.gold).toBeGreaterThan(0);
  });

  it('a boss stage only clears by killing the boss; timing out retreats', () => {
    const s = newGame(0);
    s.stage = s.maxStage = 5;
    const g = new Game(s, noCrit);
    for (let i = 0; i < KILLS_PER_STAGE * 2; i++) g.registerKill(false);
    expect(g.state.stage).toBe(5);
    g.bossSpawned();
    g.tick(BOSS_TIME + 1);
    expect(g.state.stage).toBe(4);
    expect(g.state.autoAdvance).toBe(false);
    g.setStage(5);
    expect(g.state.autoAdvance).toBe(true);
    g.bossSpawned();
    const r = g.registerKill(true);
    expect(r.amount).toBeGreaterThan(0);
    expect(g.state.stage).toBe(6);
  });

  it('dying retreats one stage and farming does not advance', () => {
    const s = newGame(0);
    s.stage = s.maxStage = 8;
    const g = new Game(s, noCrit);
    g.playerDied();
    expect(g.state.stage).toBe(7);
    for (let i = 0; i < KILLS_PER_STAGE; i++) g.registerKill(false);
    expect(g.state.stage).toBe(7);
    expect(g.state.stats.deaths).toBe(1);
  });

  it('kills drop the zone material according to drop chance', () => {
    const s = newGame(0);
    s.stage = s.maxStage = 15; // Bone Caverns
    const always = new Game(s, () => 0);
    always.registerKill(false);
    expect(always.state.materials.bone).toBe(1);
    const never = new Game(newGame(0), () => 0.999);
    never.registerKill(false);
    expect(never.state.materials.goo).toBe(0);
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

  it('bullet hell upgrades cost stars', () => {
    const g = new Game(newGame(0), noCrit);
    expect(g.buyBh('shield')).toBe(false);
    g.state.stars = 100;
    expect(g.buyBh('shield')).toBe(true);
    expect(g.state.bh.shield).toBe(1);
  });

  it('prestige resets progress but keeps shards, items and materials', () => {
    const s = newGame(0);
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
    expect(r.materials).toBeGreaterThan(0);
    expect(g.state.materials.goo).toBe(r.materials);
    expect(g.state.tickets).toBe(MAX_TICKETS);

    const g2 = new Game({ ...newGame(0), tickets: 0 }, noCrit);
    g2.applyOffline(TICKET_REGEN_SEC * 1000 * 1.5);
    expect(g2.state.tickets).toBe(1);
  });

  it('offline kills are capped by the spawn rate', () => {
    const s = newGame(0);
    s.upgrades.power = 500; // one-shots everything
    const g = new Game(s, noCrit);
    const r = g.applyOffline(3600 * 1000);
    expect(r.kills).toBeLessThanOrEqual(Math.ceil(3600 * g.spawnRate));
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

  it('an undefended hero gets overrun and retreats', () => {
    const s = newGame(0);
    s.stage = s.maxStage = 12;
    const g = new Game(s, noCrit);
    const f = new Field(g);
    f.setView(390, 420);
    for (let i = 0; i < 120 * 30 && g.state.stage === 12; i++) {
      g.tick(1 / 30);
      f.update(1 / 30);
    }
    expect(g.state.stage).toBe(11);
    expect(g.state.stats.deaths).toBe(1);
  });

  it('tap blasts damage enemies near the tap', () => {
    const g = new Game(newGame(0), noCrit);
    const f = new Field(g);
    f.enemies.push({ id: 1, x: 100, y: 0, hp: 1, maxHp: 1, r: 10, speed: 0, boss: false, flash: 0, kx: 0, ky: 0, phase: 0 });
    f.enemies.push({ id: 2, x: -100, y: 0, hp: 1, maxHp: 1, r: 10, speed: 0, boss: false, flash: 0, kx: 0, ky: 0, phase: 0 });
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

  it('migrates a v1 prototype save, keeping shards and stats', () => {
    const v1 = JSON.stringify({ gold: 999, stage: 40, heroes: [5], shards: 7, stats: { totalKills: 123 } });
    const s = deserialize(v1)!;
    expect(s.version).toBe(2);
    expect(s.stage).toBe(1);
    expect(s.gold).toBe(0);
    expect(s.shards).toBe(7);
    expect(s.stats.totalKills).toBe(123);
  });
});
