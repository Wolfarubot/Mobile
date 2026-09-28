import { it } from 'vitest';
import { Field } from '../src/core/field';
import { Game } from '../src/core/game';
import { newGame } from '../src/core/state';
import type { AreaId } from '../src/core/balance';

it.runIf(!!process.env.CALIBRATE)('live field vs farm model', () => {
  const rows: string[] = [];
  for (const [area, power, extra] of [
    ['forest', 5, []], ['forest', 20, []], ['graveyard', 20, []], ['graveyard', 40, []], ['graveyard', 60, []], ['graveyard', 90, ['zombie', 'bat']],
    ['caves', 90, []], ['caves', 130, []],
  ] as Array<[AreaId, number, string[]]>) {
    const s = newGame(0);
    s.main.trains = power;
    s.main.skills.speed = 2;
    for (const a of ['forest', 'graveyard', 'caves'] as AreaId[]) s.areas[a].unlocked = true;
    for (const id of extra) (s.bestiary as Record<string, { unlocked: boolean }>)[id].unlocked = true;
    s.area = area;
    const g = new Game(s, Math.random);
    const f = new Field(g);
    f.setView(390, 420);
    let stuns = 0;
    let downTime = 0;
    const T = 300;
    for (let t = 0; t < T; t += 1 / 30) {
      g.tick(1 / 30);
      f.update(1 / 30);
      if (f.stunned) downTime += 1 / 30;
      for (const e of f.drainEvents()) if (e.type === 'stun' && e.who === 'main') stuns++;
    }
    const kills = s.areas[area].kills;
    const m = g.farmRates(area, ['main'], 1);
    rows.push(`${area} p${power}${extra.length ? '+' + extra.join('/') : ''}: live kills/s ${(kills / T).toFixed(3)} KO/s ${(stuns / T).toFixed(3)} down ${(downTime / T).toFixed(2)} | model kills/s ${m.killsTotal.toFixed(3)} KO/s ${(m.stuns.main ?? 0).toFixed(3)} down ${(m.stunned.main ?? 0).toFixed(2)}`);
  }
  console.log(rows.join('\n'));
}, 600_000);
