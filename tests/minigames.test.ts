import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { newGame } from '../src/core/state';
import { bladeStorm, segCircle } from '../src/minigames/blades';
import { skySiege } from '../src/minigames/skysiege';
import { powerStrike } from '../src/minigames/strike';

// Minigame internals are private; tests poke at them to set up exact scenarios.
/* eslint-disable @typescript-eslint/no-explicit-any */

const game = () => new Game(newGame(0));

describe('Sky Siege', () => {
  it('hangar upgrades shape the run', () => {
    const g = game();
    g.state.bh.shield = 2;
    g.state.bh.endurance = 1;
    g.state.bh.cannons = 2;
    const run: any = skySiege.create(400, 800, g);
    expect(run.lives).toBe(3);
    expect(run.duration).toBe(70);
    run.update(0.2, 400, 800);
    expect(run.shots.length).toBeGreaterThanOrEqual(3); // three streams
  });

  it('kills drop gems that are collected and boosted by Treasure Hunter', () => {
    const g = game();
    g.state.bh.treasure = 4; // +100%
    const run: any = skySiege.create(400, 800, g);
    run.foes.push({ kind: 'spinner', x: 200, y: 600, vx: 0, vy: 0, hp: 1, maxHp: 1, r: 16, t: 0, fireT: 99, flash: 0, holdY: 0 });
    run.ship = { x: 200, y: 640 };
    run.shots.push({ x: 200, y: 610, vx: 0, vy: 0 });
    run.spawnT = 99;
    for (let i = 0; i < 60; i++) run.update(1 / 60, 400, 800);
    expect(run.kills).toBe(1);
    expect(run.gemsCollected).toBeGreaterThanOrEqual(1);
    const r = run.result();
    expect(r.materials.goo).toBe(run.gemsCollected * 1 * 2); // gem worth 1 at stage 1, x2 treasure
    expect(r.stars).toBeGreaterThanOrEqual(0);
  });

  it('only drops materials of enemies the player has unlocked', () => {
    const g = game();
    g.state.bestiary.skeleton.unlocked = true;
    g.state.bestiary.imp.unlocked = true;
    expect(g.unlockedMaterials).toEqual(['goo', 'bone', 'ember']);
  });

  it('getting hit costs a life; losing the last one ends the run', () => {
    const run: any = skySiege.create(400, 800, game());
    run.ship = { x: 200, y: 600 };
    run.enemyShots.push({ x: 200, y: 600, vx: 0, vy: 0 });
    run.spawnT = 99;
    run.update(1 / 60, 400, 800);
    expect(run.lives).toBe(0);
    expect(run.finished).toBe(true);
  });

  it('relative drag moves the ship without teleporting it under the finger', () => {
    const run: any = skySiege.create(400, 800, game());
    const start = { ...run.ship };
    run.down(50, 50);
    run.move(60, 50);
    expect(run.ship.x).toBeCloseTo(start.x + 12.5);
    expect(run.ship.y).toBeCloseTo(start.y);
  });
});

describe('Blade Storm', () => {
  it('slices along a swipe and penalises bombs', () => {
    const g: any = bladeStorm.create(400, 800, game());
    const thing = (x: number, bomb = false) => ({ x, y: 400, vx: 0, vy: 0, r: 25, bomb, look: g.looks[0], spin: 0, dead: false });
    g.things = [thing(100), thing(200), thing(300)];
    g.down(50, 400);
    g.move(350, 400);
    g.up();
    expect(g.slices).toBe(3);
    expect(g.score).toBe(60);
    const t0 = g.time;
    g.things = [thing(200, true)];
    g.down(150, 400);
    g.move(250, 400);
    expect(g.time).toBe(t0 - 5);
  });

  it('segment/circle intersection', () => {
    expect(segCircle(0, 0, 10, 0, 5, 3, 4)).toBe(true);
    expect(segCircle(0, 0, 10, 0, 5, 5, 4)).toBe(false);
  });
});

describe('Power Strike', () => {
  it('rewards perfect timing and finishes after 12 swings', () => {
    const g: any = powerStrike.create(400, 800, game());
    g.marker = g.zoneCenter;
    g.down();
    expect(g.perfects).toBe(1);
    for (let i = 0; i < 11; i++) {
      g.pause = 0;
      g.marker = g.zoneCenter > 0.5 ? 0 : 1;
      g.down();
    }
    g.update(1, 400, 800);
    expect(g.finished).toBe(true);
  });
});
