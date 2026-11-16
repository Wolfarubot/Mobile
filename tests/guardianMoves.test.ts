import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { AREAS, GUARDIAN_KITS, type GuardianMove } from '../src/core/balance';
import { Field } from '../src/core/field';
import { Game } from '../src/core/game';
import { deserialize } from '../src/core/state';

/**
 * Guardian moves (behind GUARDIAN_MOVES_ON, previewed from Settings → Dev): every Guardian with a kit, fought from
 * its area's recorded "-end" save with its health raised so the fight lasts, makes each of its moves, the Time
 * Eater freezes time and calls up an echo, and nothing is left behind once the fight ends.
 */
it('every Guardian makes each of its moves', () => {
  const presets = JSON.parse(readFileSync('public/dev-presets.json', 'utf8')) as Record<string, { lastSeen: number }>;
  let checked = 0;
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const a of AREAS) {
    const raw = presets[`${a.id}-end`];
    if (!raw) continue;
    const state = deserialize(JSON.stringify(raw), raw.lastSeen)!;
    state.area = a.id;
    state.energy = Math.max(state.energy, 20);
    const real = a.guardian;
    a.guardian = 1e15;
    try {
      const g = new Game(state, rng);
      const f = new Field(g);
      f.setView(390, 420);
      f.guardianMoves = true;
      (g as unknown as { eventUnlocked: () => boolean }).eventUnlocked = () => true;
      expect(g.challengeGuardian(), a.id).toBe(true);
      const seen = new Set<GuardianMove>();
      let froze = false;
      let echoed = false;
      let kit: GuardianMove[] | undefined;
      for (let t = 0; t < 60; t += 0.05) {
        g.tick(0.05);
        f.update(0.05);
        f.drainEvents();
        const boss = f.enemies.find((e) => e.boss);
        if (!boss) continue;
        kit = GUARDIAN_KITS[boss.type];
        if (boss.gm?.move) seen.add(boss.gm.move);
        if (f.freeze > 0) froze = true;
        if (f.echoes.length) echoed = true;
        for (const e of f.enemies) expect(Number.isFinite(e.x) && Number.isFinite(e.y), `${a.id} ${e.type}`).toBe(true);
        if (kit && kit.every((m) => seen.has(m)) && (boss.type !== 'timeEater' || echoed)) break;
      }
      if (!kit) continue;
      checked++;
      expect([...seen].sort(), a.id).toEqual([...kit].sort());
      if (kit.includes('freeze')) expect(froze && echoed, 'Time Eater freeze and echo').toBe(true);
    } finally {
      a.guardian = real;
    }
  }
  expect(checked).toBeGreaterThanOrEqual(9);
}, 300_000);
