import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { AREAS, enemyDef, GUARDIAN_ENEMY, HUNTERS, type AreaId } from '../src/core/balance';
import { Field } from '../src/core/field';
import { Game } from '../src/core/game';
import { deserialize } from '../src/core/state';

/**
 * Guardian damage test: `SIM_DPS=out.json npx vitest run tests/guardianDps.test.ts` loads each area's "-end" phase
 * from public/dev-presets.json (the pacing run's save just before its winning Guardian challenge, or SIM_DPS_PRESETS),
 * gives that area's Guardian a huge health pool and lets the team fight it for the full timer, tapping once a
 * second, then moves on. Damage that's a share of the Guardian's own health (poison and the like) grows with it,
 * so each fight runs at two pools (1e9 and 2e9): the difference is that share, the rest is the team's plain damage.
 * The most health the team could bring down in one fight is then plain / (1 - share) (the Time Eater: half that).
 */

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One Guardian fight from a save, the Guardian at `hp` health: the damage dealt and the seconds it lasted. */
function fight(raw: unknown, area: AreaId, hp: number): { dmg: number; secs: number; team: string } {
  const save = raw as { lastSeen: number };
  const state = deserialize(JSON.stringify(raw), save.lastSeen)!;
  state.area = area;
  state.energy = Math.max(state.energy, 20);
  const def = AREAS.find((a) => a.id === area)!;
  const real = def.guardian;
  def.guardian = hp;
  try {
    const g = new Game(state, mulberry(42));
    const f = new Field(g);
    f.setView(390, 420);
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
    for (let t = 0; t < 300 && g.guardianActive; t += 0.05) {
      g.tick(0.05);
      f.update(0.05);
      f.drainEvents();
      const boss = f.enemies.find((e) => e.boss);
      if (boss) {
        maxHp = boss.maxHp;
        left = boss.hp;
        secs += 0.05;
        tapAcc += 0.05;
        while (tapAcc >= 1) {
          tapAcc -= 1;
          f.tap(boss.x, boss.y);
        }
      }
    }
    const team = ['main', ...HUNTERS.filter((h) => state.hunters[h.id].recruited && state.hunters[h.id].station === area).map((h) => h.id)].map((id) => `${id}:${g.levelOf(id as never)}`).join(' ');
    return { dmg: maxHp - Math.max(0, left), secs, team };
  } finally {
    def.guardian = real;
  }
}

it.runIf(!!process.env.SIM_DPS)('Guardian damage at each stage', () => {
  const presets = JSON.parse(readFileSync(process.env.SIM_DPS_PRESETS ?? 'public/dev-presets.json', 'utf8')) as Record<string, unknown>;
  const rows: Array<Record<string, unknown>> = [];
  for (const a of AREAS) {
    const raw = presets[`${a.id}-end`];
    if (!raw) continue;
    const one = fight(raw, a.id, 1e9);
    const two = fight(raw, a.id, 2e9);
    const share = Math.max(0, (two.dmg - one.dmg) / 1e9);
    const plain = Math.max(0, one.dmg - share * 1e9);
    // The Time Eater is beaten at half its health.
    const need = 1 - (enemyDef(GUARDIAN_ENEMY[a.id]).winAt ?? 0);
    const canBeat = plain / Math.max(1e-9, need - share);
    const row = { area: a.id, secs: +one.secs.toFixed(1), plainDps: Math.round(plain / one.secs), plainDmg: Math.round(plain), share: +share.toFixed(4), canBeat: Math.round(canBeat), guardian: a.guardian, ratio: +(canBeat / a.guardian).toFixed(2), team: one.team };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  writeFileSync(process.env.SIM_DPS!, JSON.stringify(rows, null, 1));
}, 0);
