import { existsSync } from 'node:fs';
import { expect, it } from 'vitest';
import { ASCEND_NODE, ASCENDED_TREES, HUNTERS, MAIN_ASCEND_NODE, SKILL_TREES, SLAYER_TREE } from '../src/core/balance';
import { NODE_SPRITES } from '../src/core/nodeSprites';

/** Each Hunter's base tree (with its Ascend node) and Ascended tree, keyed as in NODE_SPRITES. */
const trees = (): Array<[string, string, string[]]> =>
  (['main', ...HUNTERS.map((h) => h.id)] as const).flatMap((who) => [
    [who, who, [...SKILL_TREES[who], who === 'main' ? MAIN_ASCEND_NODE : ASCEND_NODE].map((n) => n.id)],
    [who, `${who}+`, (who === 'main' ? SLAYER_TREE : ASCENDED_TREES[who]).map((n) => n.id)],
  ]);

it('every Hunter skill node has a pixel icon that exists', () => {
  const missing = trees().flatMap(([, tree, ids]) =>
    ids.filter((id) => {
      const key = NODE_SPRITES[`${tree}/${id}`];
      return !key || !existsSync(`public/icons/${key}.png`);
    }).map((id) => `${tree}/${id}`),
  );
  expect(missing).toEqual([]);
});

it("no icon repeats within a Hunter's two trees", () => {
  const repeats: string[] = [];
  for (const who of new Set(trees().map(([w]) => w))) {
    const seen = new Map<string, string>();
    for (const [w, tree, ids] of trees())
      if (w === who)
        for (const id of ids) {
          const key = NODE_SPRITES[`${tree}/${id}`];
          if (seen.has(key)) repeats.push(`${tree}/${id} = ${seen.get(key)}`);
          seen.set(key, `${tree}/${id}`);
        }
  }
  expect(repeats).toEqual([]);
});
