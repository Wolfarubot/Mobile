import { it } from 'vitest';
import { GEAR, UNBOUND_GEAR, gearArea, gearDef, weaponHit, type GearId } from '../../src/core/balance';
it('starters', () => {
  for (const id of ['shortSword', 'shortBow']) {
    const d = gearDef(id as GearId), u = gearDef(`u_${id}` as GearId);
    const cls = d.weaponClass;
    const woods = Math.max(...GEAR.filter((g) => g.weaponClass === cls && gearArea(g) === 1 && !g.starter).map((g) => weaponHit(g, 1)), 0);
    const uw = Math.max(...UNBOUND_GEAR.filter((g) => g.weaponClass === cls && gearArea(g) === 13).map((g) => weaponHit(g, 1)), 0);
    console.log(id, weaponHit(d, 1), '->', weaponHit(u, 1), '| class best Woods', woods, 'Unbound Woods', uw, '| u builtIn', JSON.stringify(u.builtIn ?? []), 'tier', u.tier, 'starter', u.starter);
  }
  const c = gearDef('u_commonClothes' as GearId); console.log('garb', JSON.stringify(c.stats), c.builtIn ?? []);
});
