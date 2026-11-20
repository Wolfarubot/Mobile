import { expect, it } from 'vitest';
import { AREAS, ENEMIES, enemyDrops, GEAR, gearArea, ITEMS, MATERIALS, type EnemyDef, type MaterialId } from '../src/core/balance';

/** Every monster, area by area, each area's in unlock order (its Guardian last). */
const monsters = (): EnemyDef[] =>
  AREAS.flatMap((a) =>
    ENEMIES.filter((e) => e.area === a.id).sort((x, y) => (x.unlock ?? Infinity) - (y.unlock ?? Infinity)),
  );

it('every monster has a drop of its own: one no monster met before it drops', () => {
  const seen = new Set<MaterialId>();
  const without: string[] = [];
  for (const e of monsters()) {
    const drops = enemyDrops(e);
    if (!drops.some((m) => !seen.has(m))) without.push(`${e.name} (${e.area})`);
    for (const m of drops) seen.add(m);
  }
  expect(without).toEqual([]);
});

it('every material a monster drops goes into something you can craft', () => {
  const used = new Set<string>();
  for (const r of [...GEAR.map((g) => g.recipe), ...ITEMS.map((i) => i.recipe)]) for (const m of Object.keys(r ?? {})) used.add(m);
  const dropped = new Set(ENEMIES.flatMap((e) => enemyDrops(e)));
  const unused = MATERIALS.filter((m) => dropped.has(m.id as MaterialId) && !used.has(m.id)).map((m) => m.name);
  expect(unused).toEqual([]);
});

it("each area's first monster unlocks at least 3 of its recipes, with what the areas before it gave", () => {
  const earlier = new Set<MaterialId>();
  const short: string[] = [];
  AREAS.forEach((a, i) => {
    const first = ENEMIES.filter((e) => e.area === a.id && e.unlock === 0 && !e.guardianOnly);
    const have = new Set<MaterialId>([...earlier, ...first.flatMap((e) => enemyDrops(e))]);
    const gear = GEAR.filter((g) => !g.unboundOf && !g.starter && gearArea(g) === i + 1);
    const open = gear.filter((g) => (Object.keys(g.recipe) as MaterialId[]).every((m) => have.has(m)));
    if (open.length < 3) short.push(`${a.name}: ${open.length}`);
    for (const e of ENEMIES.filter((e) => e.area === a.id)) for (const m of enemyDrops(e)) earlier.add(m);
  });
  expect(short).toEqual([]);
});
