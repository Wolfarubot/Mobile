import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { AREAS, enemyDef, GEAR, gearArea, gearDef, GUARDIAN_ENEMY, HUNTERS, slotAccepts, type AreaId } from '../src/core/balance';
import { Field } from '../src/core/field';
import { Game } from '../src/core/game';
import { deserialize } from '../src/core/state';
import { botGear, worth } from './botGear';

/**
 * Guardian damage test: `SIM_DPS=out.json npx vitest run tests/guardianDps.test.ts` loads each area's "-end" phase
 * from public/dev-presets.json (the pacing run's save just before its winning Guardian challenge, or SIM_DPS_PRESETS),
 * gives that area's Guardian a huge health pool and lets the team fight it for the full timer, tapping it once a
 * second (SIM_DPS_TAPS to change), then moves on. Damage that's a share of the Guardian's own health (poison and the like) grows with it,
 * so each fight runs at two pools (POOL and twice that): the difference is that share, the rest is the team's plain damage.
 * The most health the team could bring down in one fight is then plain / (1 - share) (the Time Eater: half that).
 */

/** Taps on the Guardian a second (SIM_DPS_TAPS; 2 is a player really going for it). */
const TAPS = Number(process.env.SIM_DPS_TAPS ?? 1);
const REGEAR = !!process.env.SIM_DPS_REGEAR;
const FULLGEAR = !!process.env.SIM_DPS_FULLGEAR;
const STARS = Number(process.env.SIM_DPS_STARS ?? 0);
const BEST = !!process.env.SIM_DPS_BEST;
/**
 * SIM_DPS_AREAGEAR: every Hunter in the fight wears gear from the Guardian's own area: in each slot the piece of that
 * area's that does the most for them (weighed as the pacing bot weighs it), the weapon at 4 stars and everything else
 * at 3, no modifiers. A baseline for the Guardians' health.
 */
const AREAGEAR = !!process.env.SIM_DPS_AREAGEAR;
/** Fights per measurement (SIM_DPS_RUNS), each with its own random rolls, averaged. */
const RUNS = Number(process.env.SIM_DPS_RUNS ?? 1);
/** The Guardian's health in the test: far more than any team brings down in one fight (then twice that). */
const POOL = Number(process.env.SIM_DPS_POOL ?? 1e13);
/** SIM_DPS_MOVES: the Guardians fight with their moves (GUARDIAN_KITS), to compare the fights' pacing with and without. */
const MOVES = !!process.env.SIM_DPS_MOVES;
/** SIM_DPS_AREAS: only these areas (comma-separated). */
const ONLY = process.env.SIM_DPS_AREAS?.split(',');

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One Guardian fight from a save, the Guardian at `hp` health: the damage dealt (and by taps directly), and the seconds it lasted. */
function fight(raw: unknown, area: AreaId, hp: number, seed = 42): { dmg: number; tapped: number; secs: number; team: string; gear: string; downShare: number; kos: number } {
  const save = raw as { lastSeen: number };
  const state = deserialize(JSON.stringify(raw), save.lastSeen)!;
  state.area = area;
  state.energy = Math.max(state.energy, 20);
  const def = AREAS.find((a) => a.id === area)!;
  const real = def.guardian;
  def.guardian = hp;
  try {
    const g = new Game(state, mulberry(seed));
    // SIM_DPS_REGEAR: first gear up the way a player keeping up would (tests/botGear.ts), with the save's own gold
    // and materials: the best craftable piece in every slot, upgraded, every modifier slot filled.
    // SIM_DPS_FULLGEAR: geared like the day-90 Time Eater team instead: the same routine with plenty of gold and of
    // every material found so far, so every slot holds the best piece its recipes allow, fully upgraded, with
    // every modifier slot filled (the materials are put back after).
    if (FULLGEAR) {
      const mats = { ...state.materials };
      const gold = state.gold;
      for (const m of Object.keys(state.materials) as Array<keyof typeof state.materials>) if (state.materials[m] > 0 || (state.stats.matGained[m] ?? 0) > 0) state.materials[m] = 1e12;
      state.gold = 1e300;
      for (let i = 0; i < 4; i++) botGear(g);
      // SIM_DPS_STARS: and every worn piece at that many stars at most (3 is about what a player keeping up has).
      if (STARS) for (const it of state.inventory) it.stars = Math.min(it.stars, STARS);
      state.materials = mats;
      state.gold = gold;
    } else if (REGEAR) for (let i = 0; i < 4; i++) botGear(g);
    if (AREAGEAR) {
      const tier = AREAS.findIndex((x) => x.id === area) + 1;
      const wearers = ['main', ...HUNTERS.filter((h) => state.hunters[h.id].recruited && state.hunters[h.id].station === area).map((h) => h.id)] as const;
      let uid = 9e8;
      for (const who of wearers) {
        const eqs = state.equipment as unknown as Record<string, (number | null)[]>;
        const eq = (eqs[who] ??= []);
        g.slotsOf(who as never).forEach((slot, i) => {
          const weapon = slot.kind !== 'armor' && slot.kind !== 'accessory';
          const stars = weapon ? 4 : 3;
          // not pieces made from the Guardian's own drop (you can't have them before you've beaten it)
          const drop = enemyDef(GUARDIAN_ENEMY[area]).material;
          // the area's own pieces; for a slot it makes none for, the latest area's before it that does
          let options: typeof GEAR = [];
          // the same kind of weapon the Hunter already fights with, where the area makes one (a sword
          // swapped in for a focus only looks better on paper: up close the Guardian keeps knocking them down)
          const worn = eq[i] != null ? state.inventory.find((it) => it.uid === eq[i]) : undefined;
          const kind = worn ? gearDef(worn.base).weaponClass : undefined;
          for (let t = tier; t >= 1 && !options.length; t--) {
            options = GEAR.filter((gd) => slotAccepts(slot, gd) && gearArea(gd) === t && !(drop in gd.recipe));
            if (weapon && kind && options.some((gd) => gd.weaponClass === kind)) options = options.filter((gd) => gd.weaponClass === kind);
          }
          if (!options.length) return;
          const best = options.map((gd) => ({ gd, v: worth(g, who as never, i, gd.id, stars) })).sort((x, y) => y.v - x.v)[0];
          const id = uid++;
          state.inventory.push({ uid: id, base: best.gd.id, stars });
          eq[i] = id;
        });
      }
    }
    // SIM_DPS_BEST: the three Guild Hunters with the most damage fight beside you, as a player going for the Guardian
    // would pick (the bot stations by gold earned).
    if (BEST) {
      for (const h of HUNTERS) if (state.hunters[h.id].station === area) g.station(h.id, null);
      const best = HUNTERS.filter((h) => state.hunters[h.id].recruited).sort((x, y) => g.dpsOf(y.id) - g.dpsOf(x.id));
      let n = 0;
      for (const h of best) if (n < 3 && g.station(h.id, area)) n++;
    }
    const f = new Field(g);
    f.setView(390, 420);
    f.guardianMoves = MOVES;
    // A moment on the field first, so everyone is in place.
    for (let t = 0; t < 3; t += 0.05) {
      g.tick(0.05);
      f.update(0.05);
      f.drainEvents();
    }
    // The challenge, whether or not its mastery is reached yet.
    (g as unknown as { eventUnlocked: () => boolean }).eventUnlocked = () => true;
    if (!g.challengeGuardian()) throw new Error(`${area}: couldn't challenge`);
    let maxHp = 0;
    let left = 0;
    let secs = 0;
    let tapAcc = 0;
    let tapped = 0;
    // How much of the fight the Hunters spend knocked down (each Hunter's share, averaged), and how many knockouts.
    let down = 0;
    let present = 0;
    let kos = 0;
    for (let t = 0; t < 300 && g.guardianActive; t += 0.05) {
      g.tick(0.05);
      f.update(0.05);
      for (const ev of f.drainEvents()) if (ev.type === 'stun') kos++;
      for (const who of ['main', ...f.helpers.map((h) => h.id)] as const) {
        present += 0.05;
        if (f.isDown(who as never)) down += 0.05;
      }
      const boss = f.enemies.find((e) => e.boss);
      if (boss) {
        maxHp = boss.maxHp;
        left = boss.hp;
        secs += 0.05;
        tapAcc += 0.05 * TAPS;
        while (tapAcc >= 1) {
          tapAcc -= 1;
          const before = boss.hp;
          f.tap(boss.x, boss.y);
          tapped += before - Math.max(0, boss.hp);
        }
      }
    }
    const gear = ['main', ...HUNTERS.filter((h) => state.hunters[h.id].recruited && state.hunters[h.id].station === area).map((h) => h.id)].map((id) => g.equipped(id as never).map((it) => (it ? `${gearDef(it.base).name} ${it.stars}* ${(it.mods ?? []).filter(Boolean).length}m` : '-')).join('/')).join(' | ');
    const team = ['main', ...HUNTERS.filter((h) => state.hunters[h.id].recruited && state.hunters[h.id].station === area).map((h) => h.id)].map((id) => `${id}:${g.levelOf(id as never)}`).join(' ');
    return { dmg: maxHp - Math.max(0, left), tapped, secs, team, gear, downShare: down / Math.max(1e-9, present), kos };
  } finally {
    def.guardian = real;
  }
}

it.runIf(!!process.env.SIM_DPS)('Guardian damage at each stage', () => {
  const presets = JSON.parse(readFileSync(process.env.SIM_DPS_PRESETS ?? 'public/dev-presets.json', 'utf8')) as Record<string, unknown>;
  const rows: Array<Record<string, unknown>> = [];
  for (const a of AREAS) {
    if (ONLY && !ONLY.includes(a.id)) continue;
    const raw = presets[`${a.id}-end`];
    if (!raw) continue;
    const avg = (hp: number) => {
      const fights = Array.from({ length: RUNS }, (_, i) => fight(raw, a.id, hp, 42 + i));
      return { ...fights[0], dmg: fights.reduce((sum, x) => sum + x.dmg, 0) / RUNS, tapped: fights.reduce((sum, x) => sum + x.tapped, 0) / RUNS };
    };
    const one = avg(POOL);
    const two = avg(2 * POOL);
    const share = Math.max(0, (two.dmg - one.dmg) / POOL);
    const plain = Math.max(0, one.dmg - share * POOL);
    // The Time Eater is beaten at half its health.
    const need = 1 - (enemyDef(GUARDIAN_ENEMY[a.id]).winAt ?? 0);
    const canBeat = plain / Math.max(1e-9, need - share);
    const row = { area: a.id, secs: +one.secs.toFixed(1), plainDps: Math.round(plain / one.secs), plainDmg: Math.round(plain), share: +share.toFixed(4), canBeat: Math.round(canBeat), guardian: a.guardian, ratio: +(canBeat / a.guardian).toFixed(2), tapShare: +(one.tapped / Math.max(1, one.dmg)).toFixed(2), down: +one.downShare.toFixed(3), kos: one.kos, team: one.team, gear: one.gear };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  writeFileSync(process.env.SIM_DPS!, JSON.stringify(rows, null, 1));
}, 0);
