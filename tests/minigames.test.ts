import { describe, expect, it } from 'vitest';
import { bladeStorm, segCircle } from '../src/minigames/blades';
import { hordeRush } from '../src/minigames/horde';
import { powerStrike } from '../src/minigames/strike';

// Minigame internals are private; tests poke at them to set up exact scenarios.
/* eslint-disable @typescript-eslint/no-explicit-any */

describe('Horde Rush', () => {
  it('smashes a group for a combo and unleashes a Nova when charged', () => {
    const g: any = hordeRush.create(400, 800);
    g.update(0.01, 400, 800);
    const mob = (x: number, y: number) => ({ x, y, r: 20, hp: 1, speed: 0, golden: false, look: g.looks[0], t: 0, hurt: 0 });
    g.mobs = [mob(100, 100), mob(110, 110), mob(95, 120), mob(380, 700)];
    g.down(100, 110);
    expect(g.kills).toBe(3);
    expect(g.score).toBe(90); // 3 kills x 10 x combo 3

    g.charge = 30;
    g.spawnAcc = -1e9; // no new spawns during the check
    g.mobs = [mob(20, 200), mob(380, 780)];
    g.down(200, 420); // the tower
    for (let i = 0; i < 60; i++) g.update(1 / 60, 400, 800);
    expect(g.kills).toBe(5);
    expect(g.mobs.length).toBe(0);
    expect(g.result().units).toBe(5);
  });

  it('ends when the tower falls', () => {
    const g: any = hordeRush.create(400, 800);
    g.lives = 0;
    expect(g.finished).toBe(true);
  });
});

describe('Blade Storm', () => {
  it('slices along a swipe and penalises bombs', () => {
    const g: any = bladeStorm.create(400, 800);
    const thing = (x: number, bomb = false) => ({ x, y: 400, vx: 0, vy: 0, r: 25, bomb, look: g.looks[0], spin: 0, dead: false });
    g.things = [thing(100), thing(200), thing(300)];
    g.down(50, 400);
    g.move(350, 400);
    g.up();
    expect(g.slices).toBe(3);
    expect(g.score).toBe(60); // 3x10 + 3-slice bonus of 30

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
    const g: any = powerStrike.create(400, 800);
    g.marker = g.zoneCenter;
    g.down();
    expect(g.perfects).toBe(1);
    expect(g.streak).toBe(1);
    for (let i = 0; i < 11; i++) {
      g.pause = 0;
      g.marker = g.zoneCenter > 0.5 ? 0 : 1; // far from the zone: miss
      g.down();
    }
    expect(g.streak).toBe(0);
    g.update(1, 400, 800);
    expect(g.finished).toBe(true);
    expect(g.result().units).toBeGreaterThan(0);
  });
});
