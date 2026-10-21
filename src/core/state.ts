import {
  ASCENDED_TREES,
  SLAYER_TREE,
  AREAS,
  ENEMIES,
  EVENTS,
  MONSTER_EVO_TREES,
  GEAR,
  GEAR_COST_GROWTH,
  GEAR_STAR_POWER,
  gearDef,
  itemCost,
  itemLevels,
  MAX_STARS,
  modSlotCount,
  MOD_QUALITY_STEPS,
  REFINES,
  ENCHANTS,
  type EnchantId,
  type RefineStat,
  starsFromLevel,
  HUNTERS,
  ITEMS,
  MATERIALS,
  SKILL_TREES,
  RARITIES,
  type Rarity,
  type AreaId,
  type EnemyId,
  type GearId,
  type HunterId,
  type ItemDef,
  type ItemId,
  type MaterialId,
  TAP_ABILITIES,
  type TapAbilityId,
  MAX_EMPOWER_SESSIONS,
  levelFromTrains,
  EMPOWER_SESSIONS_PER_LEVEL,
  skillNode,
} from './balance';

export interface EventState {
  cooldown: number;
  runs: number;
  completed: number;
  /** A minigame's best score. */
  best?: number;
}

export type BuyAmount = 1 | 10 | 100 | 'max';

export interface BestiaryEntry {
  unlocked: boolean;
  /** Empower sessions bought (they set the monster's level). */
  empower: number;
  /** Ranks in each evolution-tree node. */
  evo: Record<string, number>;
  /** How many of this monster have been slain (on the field, stationed and offline). */
  kills: number;
}

export interface AreaState {
  unlocked: boolean;
  /** Kills here (by anyone) toward challenging the area's Guardian. */
  kills: number;
  /** Lifetime stats for the Areas tab. */
  gold: number;
  escaped: number;
  knockouts: number;
}

/** Gold training and the skill points spent from it (see levelFromTrains). */
export interface Training {
  /** Training sessions so far: each adds damage; enough of them raise the level. */
  trains: number;
  /** Ranks bought in each skill-tree node (by node id). */
  skills: Record<string, number>;
  /** Guild Hunters: `trains` when they ascended (their level curve restarts from there). */
  ascendAt?: number;
  /** Ranks in their ascended tree. */
  skills2?: Record<string, number>;
  /** Your Hunter: the tap ability equipped (unlocked in the skill tree; none = a plain blast). */
  tapAbility?: TapAbilityId;
}

export interface HunterState extends Training {
  recruited: boolean;
  /** Area they're stationed in, earning in the background (null = resting). */
  station: AreaId | null;
}

/** One crafted piece of equipment in the inventory. */
export interface GearItem {
  uid: number;
  base: GearId;
  /** 1★ when crafted, up to MAX_STARS. */
  stars: number;
  /** Modifier slots (Very Rare and up, see MOD_SLOTS): each empty (null) or holding a modifier. */
  mods?: Array<GearMod | null>;
  /** A paid-for roll waiting on you to pick one of its choices (kept if you close the window). */
  pending?: PendingMod;
}

/** A modifier on a piece of gear: a Refine stat (Kargesh) or an Enchantment (Marceline). */
/** `q` is its rolled quality step (0 to MOD_QUALITY_STEPS; the top step is a perfect roll). */
/** Enchantments also roll `p`, their power step (an infusion's bonus, an ability's damage). */
export type GearMod = { kind: 'refine'; stat: RefineStat; q: number } | { kind: 'enchant'; id: EnchantId; q: number; p?: number };

/** A roll's choices for a slot, waiting to be picked. */
export interface PendingMod {
  slot: number;
  kind: 'refine' | 'enchant';
  options: GearMod[];
}

/** Who can wear gear: your Hunter ('main') or a recruited Hunter. */
export type Wearer = 'main' | HunterId;

/** Totals from simulated time on an area's battlefield, for one group of Hunters at one strength (`sig`). */
export interface FieldSample {
  group: Wearer[];
  /** The group's strength and the area's monsters when it was measured (Game.sampleSig). */
  sig: string;
  /** Seconds of battle measured. */
  seconds: number;
  kills: Partial<Record<EnemyId, number>>;
  gold: number;
  materials: Partial<Record<MaterialId, number>>;
  /** Knockouts, seconds spent knocked out, and kills, per Hunter. */
  stuns: Partial<Record<Wearer, number>>;
  down: Partial<Record<Wearer, number>>;
  hunterKills: Partial<Record<Wearer, number>>;
}

/** The main menu tabs, in their default order. */
export const TAB_IDS = ['hunters', 'inventory', 'beasts', 'events', 'areas'] as const;
export type TabId = (typeof TAB_IDS)[number];

/** A saved tab order, keeping known tabs once each and appending any that are missing. */
function readTabOrder(v: unknown): TabId[] {
  // The Inventory tab used to be called Equipment.
  const renamed = Array.isArray(v) ? v.map((t) => (t === 'equipment' ? 'inventory' : t)) : v;
  const saved = Array.isArray(renamed) ? renamed.filter((t): t is TabId => (TAB_IDS as readonly unknown[]).includes(t)) : [];
  const order = [...new Set(saved)];
  for (const t of TAB_IDS) if (!order.includes(t)) order.push(t);
  return order;
}

export interface GameState {
  version: number;
  gold: number;
  /** Where your main Hunter is fighting. */
  area: AreaId;
  areas: Record<AreaId, AreaState>;
  /** Your Hunter's training and skills. */
  main: Training;
  /** Which enemy types spawn and their Swarm/Bounty levels. */
  bestiary: Record<EnemyId, BestiaryEntry>;
  hunters: Record<HunterId, HunterState>;
  materials: Record<MaterialId, number>;
  items: Record<ItemId, number>;
  /** Every crafted piece of gear, equipped or not. */
  inventory: GearItem[];
  /** Gear uid in each of a Hunter's slots (null = empty), indexed like their slot list. */
  equipment: Partial<Record<Wearer, Array<number | null>>>;
  nextGearUid: number;
  /** Epoch ms of the last save; used to compute offline progress. */
  lastSeen: number;
  /**
   * What a background copy of the battlefield measured for the group farming each area (see sampler.ts): offline
   * gains and stationed Hunters earn at these rates instead of the estimate in Game.farmRates.
   */
  samples: Partial<Record<AreaId, FieldSample>>;
  /** Player preferences (Settings page). */
  settings: {
    leftHanded: boolean;
    /** Your Hunter's name ('' shows as "You"). */
    name: string;
    /** Left-to-right order of the main menu tabs. */
    tabOrder: TabId[];
    /** Font chosen in Settings (an id from ui/fonts). */
    font: string;
    /** The DPS meter on the battlefield, and which corner it sits in. */
    dps: boolean;
    dpsCorner: DpsCorner;
    /** The pick-up pop-ups (materials just gained) on the battlefield, and which corner they sit in. */
    pickups: boolean;
    pickupCorner: DpsCorner;
    /** Where the event timer and Guardian health bar go: the battlefield's top or bottom edge. */
    hudPos: HudPos;
    /** Cooldown icons on the battlefield (abilities recharging), and which edge they sit on. */
    cooldowns: boolean;
    cooldownPos: CooldownPos;
    /** "RELOADING!" over Hunters whose gun is reloading, and whether it's above or below them. */
    reloads: boolean;
    reloadPos: ReloadPos;
    /** 'fancy' adds effects (pixels at the reload text's fading edge, a glowing line on refilling icons). */
    reloadStyle: IndicatorStyle;
    /** The reload indicator's "SUMMONING!" for tomes (off by default: summoning isn't a reload). */
    summonText: boolean;
    cooldownStyle: IndicatorStyle;
    /** Rarities of looted gear to salvage the moment it drops (Equipment → Auto Salvage, from the Restless Graveyard). */
    autoSalvage: Rarity[];
    /** Which visual effects show (damage numbers by kind, status effects by kind). All on by default. */
    fx: Record<FxKey, boolean>;
    /** Area effects (puddles, explosions, fireballs, bursts, auras): pixel squares ('fancy') or plain circles ('basic'). */
    aoeStyle: IndicatorStyle;
    /** Menu look: parchment & wood tinted by the area (default), or the original flat cards. */
    uiStyle: UiStyle;
    /** A white outline round Hunters, monsters and their projectiles, for legibility: how strong (Low by default). */
    clarity: ClarityLevel;
    /** Vibration on button presses and battlefield taps (Medium by default). */
    haptics: HapticLevel;
    /** Sound effects: off, or how loud (Medium by default). */
    sound: SoundLevel;
    /** Background music: off, or how loud (Medium by default). */
    music: SoundLevel;
  };
  /** One-time tutorial moments already shown. */
  flags: {
    eventsIntro: boolean;
    /** The first-launch welcome has been shown. */
    welcome: boolean;
    /** The "you can train your Hunter" tip has been shown. */
    trainIntro: boolean;
    /** Empower is unlocked (100 slimes slain) and its intro has been shown. */
    empowerIntro: boolean;
    /** The "you can craft your first item" tip has been shown. */
    craftIntro: boolean;
    /** The tip shown when you can first afford to unlock the wolf (also explains the full-screen menu). */
    wolfIntro: boolean;
  };
  /** Per event: seconds of cooldown left, times started and times completed (a Guardian beaten, a swarm survived). */
  events: Record<string, EventState>;
  /** What the player has already looked at, so new things can be flagged with a "!". */
  seen: SeenState;
  /** Blessings from Kargesh's and Marceline's minigames: extra quality rolls for your next Refine / Enchant. */
  blessings: { refine: number; enchant: number };
  buyAmount: BuyAmount;
  stats: {
    totalKills: number;
    totalGold: number;
    taps: number;
    escaped: number;
    guardians: number;
    /** Kills per Hunter (you are 'main'). */
    hunterKills: Partial<Record<Wearer, number>>;
    /** Pieces of gear looted from monsters. */
    looted?: number;
    /** Every material ever gained, per material (spending doesn't lower it). */
    matGained: Partial<Record<MaterialId, number>>;
  };
}

export const SAVE_VERSION = 27;

/** Things already looked at: Journal entries read, recipes, monsters and events seen, and gear up to a uid. */
export interface SeenState {
  journal: string[];
  recipes: string[];
  beasts: string[];
  /** Ready events already seen in the Events tab (an event leaves this list when it next runs or cools down). */
  events: string[];
  /** Gear with a uid up to this has been seen in the Equipment list. */
  gearUid: number;
  /** Set once the lists above have been filled for a save from before they existed (everything counts as seen). */
  init: boolean;
}

/** Gear that was replaced, and what saves holding it get instead. */
const RENAMED_GEAR: Record<string, GearItem['base']> = {
  huntingBow: 'forestBow',
  fangDagger: 'beastBlade',
  goblinSword: 'slimeSword',
  apprenticeWand: 'slimeWand',
  leatherVest: 'furCoat',
  apprenticeRobe: 'furCoat',
  luckyCharm: 'fangTalisman',
};

const zeroes = <K extends string>(ids: { id: K }[]): Record<K, number> =>
  Object.fromEntries(ids.map((x) => [x.id, 0])) as Record<K, number>;

const byId = <K extends string, V>(ids: { id: K }[], make: (id: K, i: number) => V): Record<K, V> =>
  Object.fromEntries(ids.map((x, i) => [x.id, make(x.id, i)])) as Record<K, V>;

export function newGame(now = Date.now()): GameState {
  return {
    version: SAVE_VERSION,
    gold: 0,
    area: 'forest',
    areas: byId(AREAS, (_, i) => ({ unlocked: i === 0, kills: 0, gold: 0, escaped: 0, knockouts: 0 })),
    main: { trains: 0, skills: {} },
    bestiary: byId(ENEMIES, (id) => ({ unlocked: ENEMIES.find((e) => e.id === id)!.unlock === 0, empower: 0, evo: {}, kills: 0 })),
    hunters: byId(HUNTERS, () => ({ recruited: false, trains: 0, skills: {}, station: null })),
    materials: zeroes(MATERIALS),
    items: zeroes(ITEMS),
    // Starting gear: a Short Sword and Common Clothes on your Hunter, and a Short Bow to try.
    inventory: [
      { uid: 1, base: 'shortSword', stars: 1 },
      { uid: 2, base: 'commonClothes', stars: 1 },
      { uid: 3, base: 'shortBow', stars: 1 },
    ],
    equipment: { main: [1, 2, null] },
    nextGearUid: 4,
    lastSeen: now,
    samples: {},
    settings: { leftHanded: false, name: '', tabOrder: [...TAB_IDS], font: 'terminal', dps: true, dpsCorner: 'tr', pickups: true, pickupCorner: 'bl', hudPos: 'bottom', cooldowns: true, cooldownPos: 'top', reloads: true, reloadPos: 'above', reloadStyle: 'fancy', summonText: false, cooldownStyle: 'fancy', autoSalvage: [], fx: allFx(), aoeStyle: 'fancy', uiStyle: 'parchment', clarity: 'low', haptics: 'medium', sound: 'medium', music: 'medium' },
    flags: { eventsIntro: false, welcome: false, trainIntro: false, empowerIntro: false, craftIntro: false, wolfIntro: false },
    blessings: { refine: 0, enchant: 0 },
    events: Object.fromEntries(EVENTS.map((e) => [e.id, { cooldown: 0, runs: 0, completed: 0 }])),
    seen: { journal: [], recipes: [], beasts: [], events: [], gearUid: 3, init: true },
    buyAmount: 1,
    stats: { totalKills: 0, totalGold: 0, taps: 0, escaped: 0, guardians: 0, hunterKills: {}, matGained: {} },
  };
}

export const COOLDOWN_POSITIONS = ['top', 'bottom', 'left', 'right'] as const;
export const DPS_CORNERS = ['tl', 'tr', 'bl', 'br'] as const;
export type DpsCorner = (typeof DPS_CORNERS)[number];
export const HUD_POSITIONS = ['top', 'bottom'] as const;
export type HudPos = (typeof HUD_POSITIONS)[number];
export type CooldownPos = (typeof COOLDOWN_POSITIONS)[number];
export const RELOAD_POSITIONS = ['above', 'below'] as const;
export const INDICATOR_STYLES = ['fancy', 'basic'] as const;
export type IndicatorStyle = (typeof INDICATOR_STYLES)[number];
export const UI_STYLES = ['parchment', 'classic'] as const;
export type UiStyle = (typeof UI_STYLES)[number];
/** The Clarity Border's strengths: how opaque the white outline round characters and projectiles is. */
export const CLARITY_LEVELS = ['off', 'low', 'moderate', 'strong'] as const;
export type ClarityLevel = (typeof CLARITY_LEVELS)[number];
/** Haptic feedback on presses and taps: off, or how strong. */
export const HAPTIC_LEVELS = ['off', 'light', 'medium', 'strong'] as const;
export type HapticLevel = (typeof HAPTIC_LEVELS)[number];
/** Sound effect volume: off, or how loud. */
export const SOUND_LEVELS = ['off', 'low', 'medium', 'high'] as const;
export type SoundLevel = (typeof SOUND_LEVELS)[number];
export type ReloadPos = (typeof RELOAD_POSITIONS)[number];

/** Effect switches in Settings: the damage numbers and status effect groups, and each kind within them. */
export const FX_KEYS = [
  'damage',
  'dmgNormal',
  'dmgCrit',
  'dmgResist',
  'dmgWeak',
  'status',
  'burn',
  'poison',
  'bleed',
  'chill',
  'acid',
  'radiant',
  'decay',
  'arcane',
  'void',
] as const;
export type FxKey = (typeof FX_KEYS)[number];
const allFx = (): Record<FxKey, boolean> => Object.fromEntries(FX_KEYS.map((k) => [k, true])) as Record<FxKey, boolean>;

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** Merge saved records onto defaults, ignoring ids that no longer exist. */
function mergeRecord<K extends string, V extends object>(base: Record<K, V>, saved: unknown): Record<K, V> {
  const out = { ...base };
  if (saved && typeof saved === 'object')
    for (const [k, v] of Object.entries(saved)) if (k in out && v && typeof v === 'object') out[k as K] = { ...out[k as K], ...v };
  return out;
}

function mergeNumbers<K extends string>(base: Record<K, number>, saved: unknown): Record<K, number> {
  const out = { ...base };
  if (saved && typeof saved === 'object')
    for (const [k, v] of Object.entries(saved)) if (k in out && typeof v === 'number' && Number.isFinite(v)) out[k as K] = v;
  return out;
}

/** Keeps only ranks in nodes that exist in this wearer's tree, capped at each node's max. */
function cleanSkills(who: Wearer, saved: unknown): Record<string, number> {
  return cleanRanks(SKILL_TREES[who], saved);
}

/** Saved ranks, kept only for nodes of `nodes` and capped at their max. */
function cleanRanks(nodes: ReadonlyArray<{ id: string; maxRank: number }>, saved: unknown): Record<string, number> {
  if (!saved || typeof saved !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(saved)) {
    const node = nodes.find((n) => n.id === k);
    if (node && typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = Math.min(node.maxRank, Math.floor(v));
  }
  return out;
}

/** Parses a save, filling in fields missing from older versions. Returns null if unusable. */
/** Upgrades: old saves hold levels (converted to stars, refunding the levels above); newer ones hold stars. */
function convertItems(state: GameState, oldLevels: boolean): void {
  for (const it of ITEMS) {
    const v = Math.max(0, Math.floor(state.items[it.id] || 0));
    if (!oldLevels) {
      state.items[it.id] = Math.min(MAX_STARS, v);
      continue;
    }
    const { stars, refund } = starsFromLevel(itemLevels(it), v, it.recipe, it.growth);
    state.items[it.id] = stars;
    addMaterials(state, refund);
  }
}

/**
 * Upgrades since removed (they boosted every Hunter's combat stats; gear, skills and abilities do that now), as
 * they were: a save that crafted one gets back every material it cost.
 */
const REMOVED_UPGRADES: Record<string, Pick<ItemDef, 'maxLevel' | 'recipe' | 'growth'>> = {
  whetstone: { maxLevel: 15, recipe: { goo: 4 }, growth: 1.45 },
  gloves: { maxLevel: 15, recipe: { goo: 6, pelt: 2 }, growth: 1.5 },
  bonemail: { maxLevel: 10, recipe: { bone: 8, flesh: 4 }, growth: 1.6 },
  splitbow: { maxLevel: 5, recipe: { bone: 10, wing: 6 }, growth: 3 },
  lance: { maxLevel: 5, recipe: { chitin: 8, frost: 4 }, growth: 2.2 },
  lantern: { maxLevel: 10, recipe: { ecto: 8, fur: 6 }, growth: 1.8 },
  graveWhetstone: { maxLevel: 8, recipe: { bone: 12, flesh: 8 }, growth: 1.6 },
  batwingGloves: { maxLevel: 8, recipe: { wing: 10, bone: 6 }, growth: 1.65 },
  engine: { maxLevel: 20, recipe: { shade: 10, void: 5, soul: 3 }, growth: 1.7 },
};

/** Refunds the removed Upgrades a save holds (old saves hold levels, newer ones stars). */
function refundRemovedUpgrades(state: GameState, saved: unknown, oldLevels: boolean): void {
  if (!saved || typeof saved !== 'object') return;
  for (const [id, old] of Object.entries(REMOVED_UPGRADES)) {
    const v = Math.max(0, Math.floor(Number((saved as Record<string, unknown>)[id]) || 0));
    if (!v) continue;
    const def = { id: `removed:${id}`, ...old } as unknown as ItemDef;
    let stars = Math.min(MAX_STARS, v);
    if (oldLevels) {
      const conv = starsFromLevel(itemLevels(def), v, def.recipe, def.growth);
      stars = conv.stars;
      addMaterials(state, conv.refund);
    }
    for (let s = 0; s < stars; s++) addMaterials(state, itemCost(def, s));
  }
}

function addMaterials(state: GameState, add: Partial<Record<MaterialId, number>>): void {
  for (const [m, n] of Object.entries(add) as [MaterialId, number][]) if (m in state.materials) state.materials[m] += n;
}

/** A saved value if it's one of the allowed ones, else the default. */
function pick<T extends string>(allowed: readonly T[], v: unknown, fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

/** A saved modifier, if well-formed (ones from before rolls count as middling). */
function parseMod(m: unknown): GearMod | null {
  const x = m as { kind?: string; stat?: string; id?: string; q?: number; p?: number } | null;
  if (!x) return null;
  const step = (v: unknown) => (typeof v === 'number' ? Math.max(0, Math.min(MOD_QUALITY_STEPS, Math.round(v))) : Math.round(MOD_QUALITY_STEPS / 2));
  const q = step(x.q);
  // Virulence, Binding and Haste moved from Refine to Enchant: kept, with their rolls.
  if (x.kind === 'refine' && (x.stat === 'status' || x.stat === 'summonDur' || x.stat === 'cooldown')) return { kind: 'enchant', id: x.stat === 'status' ? 'virulence' : x.stat === 'cooldown' ? 'haste' : 'binding', q, p: q };
  if (x.kind === 'refine' && x.stat && x.stat in REFINES) return { kind: 'refine', stat: x.stat as RefineStat, q };
  if (x.kind === 'enchant' && x.id && x.id in ENCHANTS) return { kind: 'enchant', id: x.id as EnchantId, q, p: step(x.p) };
  return null;
}

export function deserialize(raw: string | null | undefined, now = Date.now()): GameState | null {
  if (!raw) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || typeof data.gold !== 'number') return null;
  // v15 -> v16: Alric the Gravewarden became Alias the Thief; he keeps Alric's place (recruited, training, gear, kills).
  // v17 -> v18: the first three areas' monsters were revamped. Each replaced monster's progress (unlocked,
  // Empower, evolutions, kills) passes to the one that took its place; Red Gel becomes Scrap.
  const best = data.bestiary as Record<string, unknown> | undefined;
  for (const [from, to] of [['redSlime', 'twiggling'], ['killerBee', 'brownBear'], ['boar', 'unicorn'], ['mandragora', 'manTrap'], ['ghoul', 'cultist'], ['ghost', 'graveWraith'], ['banshee', 'possessedArmor']])
    if (best && typeof best === 'object' && from in best && !(to in best)) {
      best[to] = best[from];
      delete best[from];
    }
  const mats = data.materials as Record<string, unknown> | undefined;
  if (mats && typeof mats.redgel === 'number') {
    mats.scrap = (typeof mats.scrap === 'number' ? mats.scrap : 0) + mats.redgel;
    delete mats.redgel;
  }
  // v16 -> v17: Gus the Prospector became Theon the Puppeteer, the same way.
  const hk = (data.stats as { hunterKills?: Record<string, unknown> } | undefined)?.hunterKills;
  // v20 -> v21: Sera the Demonbane became Kargesh the Blacksmith.
  for (const [from, to] of [['gravewarden', 'thief'], ['prospector', 'puppeteer'], ['demonbane', 'blacksmith']])
    for (const m of [data.hunters, data.equipment, hk] as Array<Record<string, unknown> | undefined>)
      if (m && typeof m === 'object' && from in m && !(to in m)) {
        m[to] = m[from];
        delete m[from];
      }

  const base = newGame(now);
  const stats = { ...base.stats, ...((data.stats as object) ?? {}) };
  for (const k of ['deaths', 'prestiges', 'best']) delete (stats as Record<string, unknown>)[k];
  // Per-Hunter kills arrived after v5; older saves start them at 0.
  stats.hunterKills = Object.fromEntries(
    Object.entries(stats.hunterKills && typeof stats.hunterKills === 'object' ? stats.hunterKills : {}).filter(
      ([k, v]) => (k === 'main' || HUNTERS.some((h) => h.id === k)) && typeof v === 'number' && Number.isFinite(v),
    ),
  );

  // Materials gained arrived in v12: older saves start from what they hold now.
  const gained = (stats.matGained && typeof stats.matGained === 'object' ? stats.matGained : {}) as Record<string, unknown>;
  stats.matGained = {};
  const held = (data.materials ?? {}) as Record<string, unknown>;
  for (const m of MATERIALS) {
    const had = typeof gained[m.id] === 'number' && Number.isFinite(gained[m.id]) ? (gained[m.id] as number) : 0;
    const now = typeof held[m.id] === 'number' && Number.isFinite(held[m.id]) ? (held[m.id] as number) : 0;
    if (Math.max(had, now) > 0) stats.matGained[m.id] = Math.max(had, now);
  }

  if (((data.version as number) ?? 1) < 4) {
    // Before v4 progress was stage-based; it doesn't map onto areas. Keep the things
    // that still mean the same: forged items, materials that still exist, Arena progress, stats.
    base.items = mergeNumbers(base.items, data.items);
    base.materials = mergeNumbers(base.materials, data.materials);
    base.lastSeen = typeof data.lastSeen === 'number' ? data.lastSeen : now;
    base.stats = stats;
    convertItems(base, true);
    refundRemovedUpgrades(base, data.items, true);
    return base;
  }

  const state: GameState = {
    ...base,
    ...(data as Partial<GameState>),
    areas: mergeRecord(base.areas, data.areas),
    bestiary: mergeRecord(base.bestiary, data.bestiary),
    hunters: mergeRecord(base.hunters, data.hunters),
    materials: mergeNumbers(base.materials, data.materials),
    items: mergeNumbers(base.items, data.items),
    stats,
    settings: {
      leftHanded: !!(data.settings as { leftHanded?: unknown } | undefined)?.leftHanded,
      name: String((data.settings as { name?: unknown } | undefined)?.name ?? '').slice(0, 16),
      tabOrder: readTabOrder((data.settings as { tabOrder?: unknown } | undefined)?.tabOrder),
      font: (() => {
        const f = (data.settings as { font?: unknown } | undefined)?.font;
        // v11 -> v12: Terminal became the default font, so the old default moves over with it.
        if (((data.version as number) ?? 1) < 12 && (f === undefined || f === 'pixel')) return 'terminal';
        return typeof f === 'string' && /^[a-z0-9-]{1,20}$/.test(f) ? f : 'terminal';
      })(),
      dps: (data.settings as { dps?: unknown } | undefined)?.dps !== false,
      dpsCorner: pick(DPS_CORNERS, (data.settings as { dpsCorner?: unknown } | undefined)?.dpsCorner, 'tr'),
      pickups: (data.settings as { pickups?: unknown } | undefined)?.pickups !== false,
      pickupCorner: pick(DPS_CORNERS, (data.settings as { pickupCorner?: unknown } | undefined)?.pickupCorner, 'bl'),
      hudPos: pick(HUD_POSITIONS, (data.settings as { hudPos?: unknown } | undefined)?.hudPos, 'bottom'),
      cooldowns: (data.settings as { cooldowns?: unknown } | undefined)?.cooldowns !== false,
      cooldownPos: pick(COOLDOWN_POSITIONS, (data.settings as { cooldownPos?: unknown } | undefined)?.cooldownPos, 'top'),
      reloads: (data.settings as { reloads?: unknown } | undefined)?.reloads !== false,
      reloadPos: pick(RELOAD_POSITIONS, (data.settings as { reloadPos?: unknown } | undefined)?.reloadPos, 'above'),
      reloadStyle: pick(INDICATOR_STYLES, (data.settings as { reloadStyle?: unknown } | undefined)?.reloadStyle, 'fancy'),
      summonText: (data.settings as { summonText?: unknown } | undefined)?.summonText === true,
      cooldownStyle: pick(INDICATOR_STYLES, (data.settings as { cooldownStyle?: unknown } | undefined)?.cooldownStyle, 'fancy'),
      autoSalvage: (() => {
        const a = (data.settings as { autoSalvage?: unknown } | undefined)?.autoSalvage;
        return Array.isArray(a) ? (Object.keys(RARITIES) as Rarity[]).filter((r) => a.includes(r)) : [];
      })(),
      fx: (() => {
        const saved = ((data.settings as { fx?: unknown } | undefined)?.fx ?? {}) as Record<string, unknown>;
        return Object.fromEntries(FX_KEYS.map((k) => [k, saved[k] !== false])) as Record<FxKey, boolean>;
      })(),
      aoeStyle: pick(INDICATOR_STYLES, (data.settings as { aoeStyle?: unknown } | undefined)?.aoeStyle, 'fancy'),
      uiStyle: pick(UI_STYLES, (data.settings as { uiStyle?: unknown } | undefined)?.uiStyle, 'parchment'),
      clarity: pick(CLARITY_LEVELS, (data.settings as { clarity?: unknown } | undefined)?.clarity, 'low'),
      haptics: pick(HAPTIC_LEVELS, (data.settings as { haptics?: unknown } | undefined)?.haptics, 'medium'),
      sound: pick(SOUND_LEVELS, (data.settings as { sound?: unknown } | undefined)?.sound, 'medium'),
      music: pick(SOUND_LEVELS, (data.settings as { music?: unknown } | undefined)?.music, 'medium'),
    },
    flags: {
      eventsIntro: !!(data.flags as { eventsIntro?: unknown } | undefined)?.eventsIntro,
      // Anyone with a save from before the welcome existed has already started playing.
      welcome: (data.flags as { welcome?: unknown } | undefined)?.welcome !== false,
      trainIntro: (data.flags as { trainIntro?: unknown } | undefined)?.trainIntro !== false,
      // Saves from before per-monster kill counts already had Empower (then Swarm/Bounty) available.
      empowerIntro: (data.flags as { empowerIntro?: unknown } | undefined)?.empowerIntro !== false,
      // Saves from before this tip already knew about crafting.
      craftIntro: (data.flags as { craftIntro?: unknown } | undefined)?.craftIntro !== false,
      // Saves from before this tip already had the wolf within reach.
      wolfIntro: (data.flags as { wolfIntro?: unknown } | undefined)?.wolfIntro !== false,
    },
    seen: (() => {
      const s = (data.seen ?? {}) as Partial<Record<keyof SeenState, unknown>>;
      const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
      return {
        journal: strs(s.journal),
        recipes: strs(s.recipes),
        beasts: strs(s.beasts),
        events: strs(s.events),
        gearUid: typeof s.gearUid === 'number' && Number.isFinite(s.gearUid) ? s.gearUid : 0,
        init: s.init === true,
      };
    })(),
    blessings: (() => {
      const b = (data.blessings ?? {}) as Partial<Record<'refine' | 'enchant', unknown>>;
      const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(3, Math.floor(v))) : 0);
      return { refine: n(b.refine), enchant: n(b.enchant) };
    })(),
    events: Object.fromEntries(
      EVENTS.map((e) => {
        const saved = (data.events as Record<string, Partial<Record<keyof EventState, unknown>>> | undefined)?.[e.id];
        const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
        // Older saves didn't count completions: a Guardian with any later area open was beaten at least once.
        const at = AREAS.findIndex((a) => a.id === e.area);
        const beaten = e.kind === 'guardian' && AREAS.some((a, i) => i > at && (data.areas as Record<string, { unlocked?: boolean }> | undefined)?.[a.id]?.unlocked);
        const completed = typeof saved?.completed === 'number' ? num(saved.completed) : beaten ? 1 : 0;
        return [e.id, { cooldown: num(saved?.cooldown), runs: num(saved?.runs), completed, ...(num(saved?.best) > 0 ? { best: num(saved?.best) } : {}) }];
      }),
    ),
    version: SAVE_VERSION,
  };
  // v5 -> v6: Power levels and Hunter levels become training sessions; skills start unspent
  // (Rapid Fire / Steady Nerves are replaced by skill points).
  const oldPower = (data.upgrades as Record<string, unknown> | undefined)?.power;
  const main = data.main as Partial<Training> | undefined;
  // v7 -> v8: flat skills became skill trees; points spent before are refunded (skills reset).
  const trees = ((data.version as number) ?? 1) >= 8;
  state.main = {
    trains: typeof main?.trains === 'number' ? main.trains : typeof oldPower === 'number' ? oldPower : 0,
    skills: trees ? cleanSkills('main', main?.skills) : {},
  };
  // v22 -> v23: your Hunter's trees went five wide and their ranks were rebalanced, so their points are refunded
  // (tap abilities already unlocked stay unlocked).
  if (((data.version as number) ?? 1) < 23) {
    state.main.skills = Object.fromEntries(Object.entries(state.main.skills).filter(([id]) => id === 'ascend' || skillNode('main', id)?.ability));
    if (main?.skills2) main.skills2 = {};
  }
  // v25 -> v26, v26 -> v27: your Hunter's first tree was rebuilt from the Skill Trees editor (new layout, links and
  // values), so its points are refunded again; tap abilities already unlocked, and Ascend, stay.
  else if (((data.version as number) ?? 1) < 27)
    state.main.skills = Object.fromEntries(Object.entries(state.main.skills).filter(([id]) => id === 'ascend' || skillNode('main', id)?.ability));
  if (TAP_ABILITIES.some((t) => t.id === main?.tapAbility)) state.main.tapAbility = main!.tapAbility;
  // Becoming the Slayer: keep a sane point where it happened, and only ranks in the Slayer's tree.
  if (typeof main?.ascendAt === 'number' && Number.isFinite(main.ascendAt) && main.ascendAt >= 0 && main.ascendAt <= state.main.trains) {
    state.main.ascendAt = main.ascendAt;
    state.main.skills2 = cleanRanks(SLAYER_TREE, main.skills2);
  }
  // v6 -> v7: the old Arena (minigame tickets, Stars, Hangar, Frenzy) was replaced by area events.
  for (const k of ['upgrades', 'tickets', 'ticketProgress', 'frenzyTime', 'stars', 'bh']) delete (state as unknown as Record<string, unknown>)[k];
  const savedHunters = (data.hunters ?? {}) as Record<string, { trains?: unknown; level?: unknown }>;
  for (const [id, h] of Object.entries(state.hunters) as Array<[string, HunterState & { level?: number }]>) {
    const saved = savedHunters[id] ?? {};
    h.trains = typeof saved.trains === 'number' ? saved.trains : typeof saved.level === 'number' ? saved.level : 0;
    h.skills = trees ? cleanSkills(id as HunterId, h.skills) : {};
    // v26 -> v27: every Guild Hunter's trees were redesigned around what they do best, so their points are refunded.
    const redesigned = ((data.version as number) ?? 1) < 27;
    if (redesigned) h.skills = {};
    delete h.level;
    // Ascension: keep a sane point where it happened, and only ranks in nodes that exist.
    if (typeof h.ascendAt === 'number' && Number.isFinite(h.ascendAt) && h.ascendAt >= 0 && h.ascendAt <= h.trains) {
      h.skills2 = redesigned ? {} : cleanRanks(ASCENDED_TREES[id as HunterId], h.skills2);
    } else {
      delete h.ascendAt;
      delete h.skills2;
    }
  }
  // v4 -> v5: gear is new. Keep only well-formed pieces and slot references to pieces that exist.
  // v12 -> v13: gear and Upgrades use stars instead of levels (converted, with the levels above a star refunded).
  const oldLevels = ((data.version as number) ?? 1) < 13;
  state.inventory = Array.isArray(data.inventory)
    ? (data.inventory as Array<GearItem & { level?: number }>)
        // v19 -> v20: the Forest's gear was replaced; old pieces become their nearest new one.
        .map((g) => (g && typeof g.base === 'string' && g.base in RENAMED_GEAR ? { ...g, base: RENAMED_GEAR[g.base] } : g))
        .filter((g) => g && typeof g.uid === 'number' && GEAR.some((d) => d.id === g.base) && typeof (oldLevels ? g.level : g.stars) === 'number')
        .map((g) => {
          if (!oldLevels) {
            const item: GearItem = { uid: g.uid, base: g.base, stars: Math.max(1, Math.min(MAX_STARS, Math.floor(g.stars))) };
            // Modifiers: only well-formed ones, in the slots the piece has.
            const slots = modSlotCount(gearDef(g.base));
            if (slots > 0 && g.pending && Array.isArray(g.pending.options) && typeof g.pending.slot === 'number' && g.pending.slot < slots) {
              const options = g.pending.options.map((m) => parseMod(m)).filter((m): m is GearMod => !!m);
              if (options.length) item.pending = { slot: g.pending.slot, kind: g.pending.kind === 'enchant' ? 'enchant' : 'refine', options };
            }
            if (Array.isArray(g.mods) && slots > 0)
              item.mods = Array.from({ length: slots }, (_, i) => parseMod(g.mods![i]));
            return item;
          }
          const def = gearDef(g.base);
          const { stars, refund } = starsFromLevel(GEAR_STAR_POWER, Math.max(1, g.level!), def.recipe, GEAR_COST_GROWTH);
          addMaterials(state, refund);
          return { uid: g.uid, base: g.base, stars };
        })
    : [];
  convertItems(state, oldLevels);
  refundRemovedUpgrades(state, data.items, oldLevels);
  // v24 -> v25: Adamantite and Orichalcum traded places (Orichalcum now drops in the Ascendant Steps, Adamantite in
  // the Meteor Field, and recipes swapped with them), so what you held swaps too and keeps its place in the climb.
  if (((data.version as number) ?? 1) < 25) [state.materials.adamantite, state.materials.orichalcum] = [state.materials.orichalcum, state.materials.adamantite];
  const uids = new Set(state.inventory.map((g) => g.uid));
  state.equipment = {};
  if (data.equipment && typeof data.equipment === 'object')
    for (const [who, slots] of Object.entries(data.equipment as Record<string, unknown>))
      if (Array.isArray(slots)) state.equipment[who as Wearer] = slots.map((u) => (typeof u === 'number' && uids.has(u) ? u : null));
  // v23 -> v24: Pip the Scavenger became Sciirj the Monk, who fights with melee weapons: anything else he held
  // goes back to the inventory.
  const monk = state.equipment.scavenger;
  if (monk?.[0] != null) {
    const held = state.inventory.find((g) => g.uid === monk[0]);
    if (!held || gearDef(held.base).kind !== 'melee') monk[0] = null;
  }
  // v10 -> v11: Swarm and Bounty became Empower; each level bought carries over as an Empower session.
  // Evolution ranks are kept only for nodes that exist.
  for (const e of ENEMIES) {
    const b = state.bestiary[e.id] as BestiaryEntry & { swarm?: unknown; bounty?: unknown };
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
    b.empower = n(b.empower) + n(b.swarm) + n(b.bounty);
    // v13 -> v14: Empower levels went from the Hunter curve (3, 4, 5 … sessions per level) to 5 per level,
    // capped at Lv 41. Monsters keep their level.
    if (((data.version as number) ?? 1) < 14 && b.empower > 0) b.empower = Math.min(MAX_EMPOWER_SESSIONS, (levelFromTrains(b.empower).level - 1) * EMPOWER_SESSIONS_PER_LEVEL);
    // v14 -> v15: monsters top out at Lv 30 and the evolution trees were resized, so points are refunded.
    b.empower = Math.min(MAX_EMPOWER_SESSIONS, b.empower);
    if (((data.version as number) ?? 1) < 15) b.evo = {};
    // v21 -> v22: the Fire Drake became the Broodmother, a Beast, so its Dragon evolutions are refunded.
    if (((data.version as number) ?? 1) < 22 && e.id === 'fireDrake') b.evo = {};
    // v26 -> v27: every archetype's evolution tree got its own shape, so evolution points are refunded.
    if (((data.version as number) ?? 1) < 27) b.evo = {};
    b.kills = n(b.kills);
    delete b.swarm;
    delete b.bounty;
    const evo = b.evo && typeof b.evo === 'object' ? b.evo : {};
    b.evo = Object.fromEntries(
      MONSTER_EVO_TREES[e.id].flatMap((node) => {
        const r = Math.min(node.maxRank, n((evo as Record<string, unknown>)[node.id]));
        return r > 0 ? [[node.id, r]] : [];
      }),
    );
  }
  // v9 -> v10: new areas were added between the old ones. Everything before your furthest area is open.
  const furthest = AREAS.reduce((last, a, i) => (state.areas[a.id].unlocked ? i : last), 0);
  for (let i = 0; i <= furthest; i++) state.areas[AREAS[i].id].unlocked = true;
  // v8 -> v9: Glimmer's slots went from Robe · Focus · Focus to Magic weapon · Robe · Accessory.
  const glimmer = state.equipment.glimmer;
  if (((data.version as number) ?? 1) < 9 && glimmer) state.equipment.glimmer = [null, glimmer[0] ?? null, glimmer[1] ?? null];
  state.nextGearUid = Math.max(typeof data.nextGearUid === 'number' ? data.nextGearUid : 1, ...state.inventory.map((g) => g.uid + 1));
  if (!Number.isFinite(state.gold) || state.gold < 0) state.gold = 0;
  if (!(state.area in state.areas) || !state.areas[state.area].unlocked) state.area = 'forest';
  state.samples = cleanSamples(data.samples);
  return state;
}

/** Keeps well-formed samples of areas and Hunters that exist (they're only measurements: anything odd is dropped). */
function cleanSamples(saved: unknown): Partial<Record<AreaId, FieldSample>> {
  const out: Partial<Record<AreaId, FieldSample>> = {};
  if (!saved || typeof saved !== 'object') return out;
  const wearers = new Set<string>(['main', ...HUNTERS.map((h) => h.id)]);
  const counts = <K extends string>(v: unknown, ok: (k: string) => boolean): Partial<Record<K, number>> => {
    const r: Partial<Record<K, number>> = {};
    if (v && typeof v === 'object') for (const [k, n] of Object.entries(v)) if (ok(k) && typeof n === 'number' && Number.isFinite(n) && n >= 0) r[k as K] = n;
    return r;
  };
  const enemies = new Set<string>(ENEMIES.map((e) => e.id));
  const mats = new Set<string>(MATERIALS.map((m) => m.id));
  for (const a of AREAS) {
    const v = (saved as Record<string, Partial<FieldSample>>)[a.id];
    if (!v || typeof v !== 'object' || !Array.isArray(v.group) || typeof v.sig !== 'string') continue;
    if (typeof v.seconds !== 'number' || !(v.seconds > 0) || typeof v.gold !== 'number' || !Number.isFinite(v.gold)) continue;
    const group = v.group.filter((w): w is Wearer => typeof w === 'string' && wearers.has(w));
    if (!group.length || group.length !== v.group.length) continue;
    out[a.id] = {
      group,
      sig: v.sig,
      seconds: v.seconds,
      kills: counts<EnemyId>(v.kills, (k) => enemies.has(k)),
      gold: Math.max(0, v.gold),
      materials: counts<MaterialId>(v.materials, (k) => mats.has(k)),
      stuns: counts<Wearer>(v.stuns, (k) => wearers.has(k)),
      down: counts<Wearer>(v.down, (k) => wearers.has(k)),
      hunterKills: counts<Wearer>(v.hunterKills, (k) => wearers.has(k)),
    };
  }
  return out;
}
