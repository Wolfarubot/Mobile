import { describe, expect, it } from 'vitest';
import { GEAR, gearDef, slotAccepts, BONUS_SLOTS, ASCENDED_TREES, SLAYER_TREE, HUNTERS } from '../src/core/balance';
import { Game } from '../src/core/game';
import { Field, type Enemy } from '../src/core/field';
import { newGame as startingGame } from '../src/core/state';

const noCrit = () => 0.99;
const enemy = (over: Partial<Enemy>): Enemy => ({ id: 1, type: 'greenSlime', x: 100, y: 0, hp: 1, maxHp: 1, r: 10, speed: 0, boss: false, fleeing: false, flash: 0, kx: 0, ky: 0, phase: 0, ...over });
function game(): Game {
  const s = startingGame(0);
  s.inventory = []; s.equipment = {}; s.nextGearUid = 1;
  s.gold = 1e30;
  for (const m of Object.keys(s.materials) as Array<keyof typeof s.materials>) s.materials[m] = 1e6;
  for (const e of Object.values(s.events)) e.completed = 5;
  for (const h of Object.values(s.hunters)) h.met = true;
  for (const a of Object.values(s.areas)) a.unlocked = true;
  s.flags.trainIntro = true;
  return new Game(s, noCrit);
}
function ascend(g: Game, id: 'main' | (typeof HUNTERS)[number]['id']) {
  const t = g.training(id);
  t.trains = 99999; t.ascendAt = 10; t.skills2 = {};
}

describe('second slots', () => {
  it('every Hunter has one; its node says so', () => {
    for (const h of HUNTERS) expect(BONUS_SLOTS[h.id]).toBeTruthy();
    expect(ASCENDED_TREES.druid.find((n) => n.id === 'root')!.desc).toMatch(/off-hand weapon slot \(Tomes\)/);
    expect(SLAYER_TREE.find((n) => n.id === 'root')!.desc).toMatch(/second accessory slot \(any/);
  });
  it('opens with Awakening; Deku off-hand tome summons at half speed with its own damage', () => {
    const g = game();
    g.recruit('druid');
    expect(g.slotsOf('druid')).toHaveLength(3);
    ascend(g, 'druid');
    expect(g.learn('druid', 'root', 'ascended')).toBe(true);
    expect(g.slotsOf('druid')).toHaveLength(4);
    expect(g.slotGroup('druid', 0)).toEqual([0, 3]);
    expect(g.slotOrder('druid').map((o) => o.i)).toEqual([0, 3, 1, 2]);
    const tome = g.craftGear('wispTome')!;
    const wand = GEAR.find((d) => d.weaponClass === 'wand')!;
    expect(slotAccepts(g.slotsOf('druid')[3], gearDef('wispTome'))).toBe(true);
    expect(slotAccepts(g.slotsOf('druid')[3], wand)).toBe(false);
    const before = g.dpsOf('druid');
    expect(g.equip('druid', 3, tome.uid)).toBe(true);
    expect(g.weaponItem('druid', 'off')?.uid).toBe(tome.uid);
    expect(g.weaponItem('druid')).toBeNull();
    expect(g.dpsOf('druid')).toBeGreaterThan(before);
    g.state.hunters.druid.station = g.state.area;
    const f = new Field(g);
    f.setView(390, 420);
    f.update(0);
    const h = f.helpers.find((x) => x.id === 'druid')!;
    f.enemies.push(enemy({ id: 1, x: h.x + 120, y: h.y, hp: 1e15, maxHp: 1e15 }));
    for (let t = 0; t < 2 / g.shooterRate('druid', 'off') + 2; t += 0.01) { f.update(0.01); f.drainEvents(); Object.assign(f.enemies[0], { kx: 0, ky: 0 }); }
    expect(f.summons.some((s) => s.who === 'druid' && s.mode === 'off')).toBe(true);
    // Equipping it in another slot or Hunter takes it out of the off-hand.
    g.recruit('glimmer');
    expect(g.equip('glimmer', 0, tome.uid)).toBe(true);
    expect(g.weaponItem('druid', 'off')).toBeNull();
  });
  it('an off-hand weapon attacks at half speed with its full stats', () => {
    const g = game();
    g.recruit('archivist');
    ascend(g, 'archivist');
    g.learn('archivist', 'root', 'ascended');
    const w = g.craftGear(GEAR.find((d) => d.weaponClass === 'wand' && !d.starter && !d.special)!.id)!;
    const w2 = g.craftGear(w.base)!;
    g.equip('archivist', 0, w.uid);
    g.equip('archivist', 3, w2.uid);
    expect(g.shooterRate('archivist', 'off') / g.shooterRate('archivist')).toBeCloseTo(0.5, 6);
    expect(g.shotDamage('archivist', undefined, 'off')).toBeCloseTo(g.shotDamage('archivist'), 6);
  });
  it('Andrejz: potions only; Reginald two armors; closing hides it', () => {
    const g = game();
    g.recruit('alchemist');
    ascend(g, 'alchemist');
    g.learn('alchemist', 'root', 'ascended');
    const pot = g.craftGear('slimeTonic')!;
    const sl = g.slotsOf('alchemist')[3];
    expect(slotAccepts(sl, gearDef('slimeTonic'))).toBe(true);
    expect(slotAccepts(sl, gearDef('forestShield'))).toBe(false);
    g.equip('alchemist', 3, pot.uid);
    expect(g.wearerOf(pot.uid)).toEqual({ who: 'alchemist', slot: 3 });
    g.training('alchemist').skills2 = {};
    expect(g.slotsOf('alchemist')).toHaveLength(3);
    expect(g.wearerOf(pot.uid)).toBeNull();
    g.recruit('artificer');
    ascend(g, 'artificer');
    g.learn('artificer', 'root', 'ascended');
    const a1 = g.craftGear('plateArmor')!;
    const a2 = g.craftGear('leatherArmor')!;
    g.equip('artificer', 1, a1.uid);
    const one = g.gear('artificer').stun;
    g.equip('artificer', 3, a2.uid);
    expect(g.gear('artificer').stun).toBeGreaterThan(one);
  });
});
