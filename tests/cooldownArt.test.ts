import { existsSync } from 'node:fs';
import { expect, it } from 'vitest';
import { effectCooldown, GEAR, HUNTERS } from '../src/core/balance';
import { COUNTER_ART, DASH_ART, gearCooldownArt, specialTint, TAP_ART, UNIQUE_ART, WALL_ART } from '../src/core/cooldownArt';
import { HUNTER_SCHEME, PACK_PALETTES } from '../src/render/iconPalettes';

const exists = (art: string) => existsSync(`public/icons/${art}.png`);

it('every recharging gear ability has an ability-pack icon', () => {
  const bad = GEAR.flatMap((g) => (g.effect && effectCooldown(g.effect) !== null ? [g] : []))
    .filter((g) => {
      const look = gearCooldownArt(g.effect!, 'main');
      return !look || !exists(look.art);
    })
    .map((g) => g.name);
  expect(bad).toEqual([]);
  for (const art of [...Object.values(TAP_ART), ...Object.values(COUNTER_ART), WALL_ART, DASH_ART, ...Object.values(UNIQUE_ART)]) expect(exists(art), art).toBe(true);
});

it("summons and dice take their Hunter's skill tree colours; other specials their damage type's", () => {
  for (const h of HUNTERS) {
    if (!h.special) continue;
    const tint = specialTint(h.id, h.special);
    if (h.special.summon || h.special.kind === 'dice') expect(tint).toEqual({ hunter: h.id });
    else expect(tint).toBe(h.special.damageType);
    expect(PACK_PALETTES[HUNTER_SCHEME[h.id]]).toHaveLength(5);
  }
});
