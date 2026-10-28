import { AREAS, areaEnemies, GEAR, gearArea, gearDef, gearTypes, HUNTERS, slotAccepts, typeMult, type GearId } from '../src/core/balance';
import type { Game } from '../src/core/game';
import type { GearMod, Wearer } from '../src/core/state';

/**
 * The pacing bot's gear, played the way a player keeping up would: every slot (weapon, armor and accessory) holds
 * the craftable piece that gives that Hunter the most damage per second, weapons weighed by how well their damage
 * types suit the area's monsters; worn pieces are upgraded, and once Refine and Enchant open, every modifier slot
 * is filled with the best of each roll's choices. Shared by the pacing sim and the Guardian damage test.
 */

/** How much better a new piece from the same area must be before it replaces what's worn. */
const SWAP_MARGIN = 1.3;
/** A Refine or Enchant roll is made only while it costs at most this share of your gold. */
const MOD_BUDGET = 0.05;

/** How well a piece's damage types suit the area's monsters (their average weakness or resistance; 1 for none). */
function typeFit(game: Game, base: GearId): number {
  const types = gearTypes(gearDef(base));
  if (!types.length) return 1;
  const here = areaEnemies(game.area);
  return types.reduce((sum, t) => sum + here.reduce((s, e) => s + typeMult(t, e.id), 0) / here.length, 0) / types.length;
}

/** A piece's worth to a Hunter in a slot: their damage per second wearing it there (a copy, for a moment). */
function worth(game: Game, who: Wearer, slot: number, base: GearId, stars: number, uid?: number): number {
  const s = game.state;
  const eq = (s.equipment[who] ??= []);
  const prev = eq[slot] ?? null;
  const temp = uid === undefined;
  const id = temp ? -999 : uid;
  if (temp) s.inventory.push({ uid: id, base, stars });
  eq[slot] = id;
  const dps = game.dpsOf(who as never);
  eq[slot] = prev;
  if (temp) s.inventory.pop();
  return dps * typeFit(game, base);
}

/** Fill every slot with the best gear it can craft, upgrade what's worn, then fill its modifier slots. */
export function botGear(game: Game): void {
  const s = game.state;
  const wearers: Wearer[] = ['main', ...HUNTERS.filter((h) => s.hunters[h.id].recruited).map((h) => h.id)];
  // Only the newest two areas' gear is weighed (older pieces never win, and it keeps this quick).
  const tier = AREAS.findIndex((a) => a.id === game.area) + 1;
  for (const who of wearers) {
    game.slotsOf(who).forEach((slot, i) => {
      const current = game.equipped(who)[i];
      const options = GEAR.filter((gd) => slotAccepts(slot, gd) && gearArea(gd) >= tier - 1 && game.canCraftGear(gd.id));
      if (!options.length) return;
      // Weighed at the stars of what's worn, so a new piece is judged by what it'll be once upgraded.
      const stars = current?.stars ?? 1;
      const best = options.map((gd) => ({ gd, v: worth(game, who, i, gd.id, stars) })).sort((a, b) => b.v - a.v)[0];
      // Gear from a newer area always replaces older gear; between pieces of the same area, swap only for a real
      // step up, as every new piece has to be upgraded (and modified) again.
      const margin = current && gearArea(best.gd) <= gearArea(gearDef(current.base)) ? SWAP_MARGIN : 1;
      if (!current || best.v > margin * worth(game, who, i, current.base, current.stars, current.uid)) {
        const item = game.craftGear(best.gd.id)!;
        game.equip(who, i, item.uid);
        if (current) game.salvageGear(current.uid);
      }
    });
  }
  for (const who of wearers) for (const it of game.equipped(who)) if (it) while (game.upgradeGear(it.uid));
  if (!game.refineOpen && !game.enchantOpen) return;
  for (const who of wearers)
    for (const it of game.equipped(who)) {
      if (!it) continue;
      const slots = game.modSlots(it.uid);
      slots.forEach((mod, k) => {
        if (mod) return;
        // Refines and Enchants in turn across the slots (whichever is open).
        const kind = (k % 2 === 0 && game.refineOpen) || !game.enchantOpen ? 'refine' : 'enchant';
        if (game.modGoldOf(it.uid, kind) > s.gold * MOD_BUDGET) return;
        const options = game.rollMod(it.uid, k, kind);
        if (!options) return;
        // Take the choice that does the most for this Hunter.
        const mods = (it.mods = game.modSlots(it.uid));
        let pick = 0;
        let top = -1;
        options.forEach((o: GearMod, j: number) => {
          mods[k] = o;
          const v = game.dpsOf(who as never);
          if (v > top) {
            top = v;
            pick = j;
          }
        });
        mods[k] = null;
        game.chooseMod(it.uid, pick);
      });
    }
}
