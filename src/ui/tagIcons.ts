import type { Archetype, DamageType, SummonType } from '../core/balance';
import { gearIconUrl } from '../render/sprites';

/**
 * The icons on type and feature tags: all framed ability or status icons (public/icons/<pack>/<NNN>.png), never
 * item sprites, so every tag looks alike. Each is picked to match its type's colour where one fits.
 */
export const DAMAGE_TAG_ICONS: Record<DamageType, string> = {
  physical: 'ab-hunter-warrior/060',
  fire: 'ab-pyro-hydro/009',
  acid: 'ab-alchemist-shaman/010',
  frost: 'ab-pyro-hydro/069',
  radiant: 'ab-priest-bard/047',
  poison: 'ab-hunter-warrior/043',
  arcane: 'ab-rogue-warlock/065',
  decay: 'ab-paladin-dk/073',
  lightning: 'ab-geo-aero/052',
  void: 'ab-rogue-warlock/080',
};
export const SPECIAL_TAG_ICON = 'ab-engineer-psionic/060';

export const SUMMON_TAG_ICONS: Record<SummonType, string> = {
  beast: 'ab-gunslinger-druid/058',
  construct: 'ab-engineer-psionic/064',
  spirit: 'ab-alchemist-shaman/079',
  undead: 'ab-paladin-dk/065',
  elemental: 'ab-geo-aero/061',
};

export const ARCHETYPE_TAG_ICONS: Record<Archetype, string> = {
  slime: 'ab-paladin-dk/079',
  beast: 'ab-gunslinger-druid/061',
  undead: 'ab-paladin-dk/065',
  demon: 'ab-pyro-hydro/037',
  elemental: 'ab-geo-aero/061',
  humanoid: 'ab-cavalier-monk/062',
  plant: 'ab-gunslinger-druid/069',
  dragon: 'ab-cavalier-monk/086',
  construct: 'ab-engineer-psionic/064',
};

export const ARMOR_TAG_ICONS = { light: 'ab-cavalier-monk/059', heavy: 'ab-paladin-dk/011', robe: 'ab-rogue-warlock/076', shield: 'ab-paladin-dk/020' } as const;

export const EFFECT_TAG_ICONS = {
  thorns: 'ab-gunslinger-druid/062',
  block: 'ab-hunter-warrior/085',
  evade: 'ab-cavalier-monk/071',
  pulse: 'ab-priest-bard/045',
  wave: 'ab-pyro-hydro/076',
  strike: 'ab-geo-aero/093',
  chill: 'ab-pyro-hydro/078',
  spell: 'ab-geo-aero/049',
  unique: 'ab-paladin-dk/033',
} as const;

export const FEATURE_TAG_ICONS = { weapon: 'ab-hunter-warrior/053', tweak: 'ab-engineer-psionic/001', ability: 'ab-hunter-warrior/032', finder: 'ab-pyro-hydro/097', spell: 'ab-engineer-psionic/017', builtIn: 'ab-paladin-dk/040' } as const;

/** A tag icon as an <img> (its box crops it to fill). */
export function tagIconHtml(key: string): string {
  return `<img class="ei" src="${gearIconUrl(key)}" alt="" draggable="false">`;
}
