import { describe, expect, it } from 'vitest';
import { BOSS_TIME, KILLS_PER_STAGE, MAX_TICKETS, OFFLINE_CAP_SEC, TICKET_REGEN_SEC } from '../src/core/balance';
import { Game } from '../src/core/game';
import { deserialize, newGame, serialize } from '../src/core/state';

const noCrit = () => 0.99;

function killCurrent(g: Game) {
  g.state.monsterHp = 0.0001;
  g.tap();
  g.tick(1); // respawn
}

describe('Game', () => {
  it('clears a stage after enough kills and awards gold', () => {
    const g = new Game(newGame(0), noCrit);
    for (let i = 0; i < KILLS_PER_STAGE; i++) killCurrent(g);
    expect(g.state.stage).toBe(2);
    expect(g.state.maxStage).toBe(2);
    expect(g.state.gold).toBeGreaterThan(0);
  });

  it('drops back and farms after a failed boss, then can retry', () => {
    const s = newGame(0);
    s.stage = 5;
    const g = new Game(s, noCrit);
    g.state.monsterHp = g.maxHp;
    g.state.bossTimer = BOSS_TIME;
    g.tick(BOSS_TIME + 1);
    expect(g.state.stage).toBe(4);
    expect(g.canFightBoss).toBe(true);
    killCurrent(g);
    expect(g.state.stage).toBe(4); // farming doesn't advance
    g.fightBoss();
    expect(g.state.stage).toBe(5);
    expect(g.isBoss).toBe(true);
  });

  it('buying heroes costs gold and adds DPS', () => {
    const g = new Game(newGame(0), noCrit);
    g.state.gold = 1000;
    expect(g.dps).toBe(0);
    expect(g.buyHero(0)).toBe(true);
    expect(g.dps).toBeGreaterThan(0);
    expect(g.state.gold).toBeLessThan(1000);
    expect(g.buyHero(5)).toBe(false); // locked
  });

  it('computes capped offline gold and regenerates tickets', () => {
    const s = newGame(0);
    s.heroes[0] = 10;
    s.tickets = 0;
    const g = new Game(s, noCrit);
    const day = 24 * 3600 * 1000;
    const r = g.applyOffline(day);
    expect(r.seconds).toBe(OFFLINE_CAP_SEC);
    expect(r.gold).toBeGreaterThan(0);
    expect(g.state.tickets).toBe(MAX_TICKETS);

    const g2 = new Game({ ...newGame(0), tickets: 0 }, noCrit);
    g2.applyOffline(TICKET_REGEN_SEC * 1000 * 1.5);
    expect(g2.state.tickets).toBe(1);
  });

  it('minigame rewards grant gold and a capped frenzy', () => {
    const g = new Game(newGame(0), noCrit);
    const base = g.dps;
    const r = g.grantMinigame('horde', 1000, 1234);
    expect(r.gold).toBeGreaterThan(0);
    expect(g.state.frenzyTime).toBe(300);
    expect(g.state.stats.best.horde).toBe(1234);
    g.state.heroes[0] = 1;
    expect(g.dps).toBeGreaterThan(base);
  });

  it('prestige resets progress but keeps shards', () => {
    const s = newGame(0);
    s.maxStage = 80;
    s.stage = 80;
    s.gold = 1e12;
    s.heroes[0] = 100;
    const g = new Game(s, noCrit);
    const shards = g.prestige();
    expect(shards).toBeGreaterThan(0);
    expect(g.state.stage).toBe(1);
    expect(g.state.gold).toBe(0);
    expect(g.state.shards).toBe(shards);
    expect(g.state.stats.prestiges).toBe(1);
  });

  it('save round-trips and tolerates garbage', () => {
    const s = newGame(0);
    s.gold = 42;
    s.heroes[2] = 3;
    const back = deserialize(serialize(s));
    expect(back?.gold).toBe(42);
    expect(back?.heroes[2]).toBe(3);
    expect(deserialize('not json')).toBeNull();
    expect(deserialize(JSON.stringify({ gold: 5, heroes: [1] }))?.heroes.length).toBe(s.heroes.length);
  });
});
