import type { Wearer } from '../core/state';
import { gearIconUrl } from '../render/sprites';
import { hunterDef } from '../core/balance';

/**
 * Each Hunter's own icon (keys into public/icons/<pack>/<NNN>.png), all from the class ability packs so they
 * read as one set. Kept apart from EMOJI_ICONS because Hunters share emoji with other things (🏹 bows,
 * 🛡️ shields, 🎯 crit…), which keep their own icons.
 */
export const HUNTER_ICONS: Record<Wearer, string> = {
  main: 'ab-hunter-warrior/026',
  alchemist: 'ab-alchemist-shaman/010',
  ranger: 'ab-hunter-warrior/004',
  bard: 'ab-priest-bard/086',
  druid: 'ab-gunslinger-druid/069',
  thief: 'ab-rogue-warlock/009',
  lance: 'ab-paladin-dk/001',
  glimmer: 'ab-pyro-hydro/003',
  puppeteer: 'ab-rogue-warlock/085',
  wilhelm: 'ab-gunslinger-druid/013',
  celeste: 'ab-engineer-psionic/081',
  blacksmith: 'ab-engineer-psionic/006',
  scavenger: 'ab-cavalier-monk/089',
  enchantress: 'ab-alchemist-shaman/069',
  osteomancer: 'ab-paladin-dk/095',
  frostbreaker: 'ab-pyro-hydro/058',
  bloodblade: 'ab-hunter-warrior/060',
  artificer: 'ab-engineer-psionic/028',
};

/** A Hunter's icon as HTML (an <img>), falling back to their emoji. */
export function hunterIconHtml(who: Wearer, cls = 'ei'): string {
  const emoji = who === 'main' ? '🧑' : hunterDef(who).icon;
  const url = gearIconUrl(HUNTER_ICONS[who]);
  return url ? `<img class="${cls}" src="${url}" alt="${emoji}">` : emoji;
}
