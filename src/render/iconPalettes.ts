/**
 * The ability packs' colour schemes, for redrawing an icon in another scheme (the cooldown icons, src/render/cdIcons.ts).
 * Each pack is two classes of 50 icons, and each half is drawn in exactly five colours, listed darkest first. Generated
 * from public/icons/ab-*; HUNTER_SCHEME is each Hunter's skill tree scheme (tools/icons/skill_sources.json).
 */
export const PACK_PALETTES: Record<string, string[]> = {
  'ab-alchemist-shaman:1': ["#300f0a", "#550f0a", "#9b1a0a", "#a58c27", "#efd8a1"],
  'ab-alchemist-shaman:2': ["#080c3f", "#1f240a", "#276468", "#a58c27", "#efd8a1"],
  'ab-cavalier-monk:1': ["#300f0a", "#773421", "#ab5c1c", "#ef692f", "#efd69f"],
  'ab-cavalier-monk:2': ["#300f0a", "#684c3c", "#927e6a", "#efb775", "#efd69f"],
  'ab-engineer-psionic:1': ["#080c3f", "#392a1c", "#9b1a0a", "#a56243", "#efd8a1"],
  'ab-engineer-psionic:2': ["#080c3f", "#39571c", "#384cbc", "#3c9f9c", "#efd8a1"],
  'ab-geo-aero:1': ["#36170c", "#773421", "#a56243", "#efb775", "#efd8a1"],
  'ab-geo-aero:2': ["#080c3f", "#24187c", "#384cbc", "#3c9f9c", "#efd8a1"],
  'ab-gunslinger-druid:1': ["#080c3f", "#550f0a", "#9b1a0a", "#ef3a0c", "#efd8a1"],
  'ab-gunslinger-druid:2': ["#36170c", "#724113", "#a58c27", "#efac28", "#efd8a1"],
  'ab-hunter-warrior:1': ["#1f240a", "#39571c", "#a58c27", "#efac28", "#efd8a1"],
  'ab-hunter-warrior:2': ["#300f0a", "#550f0a", "#9b1a0a", "#ef692f", "#efd8a1"],
  'ab-paladin-dk:1': ["#300f0a", "#550f0a", "#ab5c1c", "#efac28", "#efd8a1"],
  'ab-paladin-dk:2': ["#300f0a", "#550f0a", "#39571c", "#3c9f9c", "#efd8a1"],
  'ab-priest-bard:1': ["#36170c", "#724113", "#ab5c1c", "#efac28", "#efd8a1"],
  'ab-priest-bard:2': ["#080c3f", "#183f39", "#a58c27", "#efac28", "#efd8a1"],
  'ab-pyro-hydro:1': ["#57100a", "#9c1a0a", "#ef3a0c", "#efab28", "#efd8a1"],
  'ab-pyro-hydro:2': ["#2a1d0d", "#183f39", "#276468", "#3c9f9c", "#efd8a1"],
  'ab-rogue-warlock:1': ["#1f240a", "#183f39", "#9b1a0a", "#ef692f", "#efd8a1"],
  'ab-rogue-warlock:2': ["#080c3f", "#24187c", "#6b3ab3", "#c084e2", "#efd8a1"],
};

/** Each Hunter's skill tree colour scheme: a key of PACK_PALETTES. */
export const HUNTER_SCHEME: Record<string, string> = {
  main: 'ab-hunter-warrior:2',
  alchemist: 'ab-alchemist-shaman:1',
  ranger: 'ab-hunter-warrior:1',
  bard: 'ab-priest-bard:2',
  druid: 'ab-gunslinger-druid:2',
  thief: 'ab-rogue-warlock:1',
  lance: 'ab-paladin-dk:1',
  glimmer: 'ab-pyro-hydro:1',
  puppeteer: 'ab-rogue-warlock:2',
  wilhelm: 'ab-gunslinger-druid:1',
  celeste: 'ab-engineer-psionic:2',
  blacksmith: 'ab-engineer-psionic:1',
  scavenger: 'ab-cavalier-monk:2',
  enchantress: 'ab-alchemist-shaman:2',
  osteomancer: 'ab-paladin-dk:2',
  haunter: 'ab-rogue-warlock:2',
  bloodblade: 'ab-hunter-warrior:2',
  artificer: 'ab-engineer-psionic:1',
  archivist: 'ab-priest-bard:1',
  gambler: 'ab-priest-bard:2',
  lichlord: 'ab-paladin-dk:2',
  spaceslime: 'ab-rogue-warlock:2',
  alien: 'ab-engineer-psionic:2',
  riftwalker: 'ab-geo-aero:2',
};
