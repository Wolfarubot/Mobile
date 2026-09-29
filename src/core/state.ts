import {
  AREAS,
  ENEMIES,
  EVENTS,
  EVO_TREES,
  GEAR,
  HUNTERS,
  ITEMS,
  MATERIALS,
  SKILL_TREES,
  type AreaId,
  type EnemyId,
  type GearId,
  type HunterId,
  type ItemId,
  type MaterialId,
} from './balance';

export interface EventState {
  cooldown: number;
  runs: number;
  completed: number;
}

export type BuyAmount = 1 | 10 | 100 | 'max';

export interface BestiaryEntry {
  unlocked: boolean;
  /** Empower sessions bought (they set the monster's level). */
  empower: number;
  /** Ranks in each evolution-tree node. */
  evo: Record<string, number>;
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
  level: number;
}

/** Who can wear gear: your Hunter ('main') or a recruited Hunter. */
export type Wearer = 'main' | HunterId;

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
  /** Player preferences (Settings page). */
  settings: {
    leftHanded: boolean;
    /** Your Hunter's name ('' shows as "You"). */
    name: string;
    /** Left-to-right order of the main menu tabs. */
    tabOrder: TabId[];
  };
  /** One-time tutorial moments already shown. */
  flags: {
    eventsIntro: boolean;
    /** The first-launch welcome has been shown. */
    welcome: boolean;
    /** The "you can train your Hunter" tip has been shown. */
    trainIntro: boolean;
  };
  /** Per event: seconds of cooldown left, times started and times completed (a Guardian beaten, a swarm survived). */
  events: Record<string, EventState>;
  buyAmount: BuyAmount;
  stats: {
    totalKills: number;
    totalGold: number;
    taps: number;
    escaped: number;
    guardians: number;
    /** Kills per Hunter (you are 'main'). */
    hunterKills: Partial<Record<Wearer, number>>;
  };
}

export const SAVE_VERSION = 11;

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
    bestiary: byId(ENEMIES, (id) => ({ unlocked: ENEMIES.find((e) => e.id === id)!.unlock === 0, empower: 0, evo: {} })),
    hunters: byId(HUNTERS, () => ({ recruited: false, trains: 0, skills: {}, station: null })),
    materials: zeroes(MATERIALS),
    items: zeroes(ITEMS),
    inventory: [],
    equipment: {},
    nextGearUid: 1,
    lastSeen: now,
    settings: { leftHanded: false, name: '', tabOrder: [...TAB_IDS] },
    flags: { eventsIntro: false, welcome: false, trainIntro: false },
    events: Object.fromEntries(EVENTS.map((e) => [e.id, { cooldown: 0, runs: 0, completed: 0 }])),
    buyAmount: 1,
    stats: { totalKills: 0, totalGold: 0, taps: 0, escaped: 0, guardians: 0, hunterKills: {} },
  };
}

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
  if (!saved || typeof saved !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(saved)) {
    const node = SKILL_TREES[who].find((n) => n.id === k);
    if (node && typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = Math.min(node.maxRank, Math.floor(v));
  }
  return out;
}

/** Parses a save, filling in fields missing from older versions. Returns null if unusable. */
export function deserialize(raw: string | null | undefined, now = Date.now()): GameState | null {
  if (!raw) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || typeof data.gold !== 'number') return null;

  const base = newGame(now);
  const stats = { ...base.stats, ...((data.stats as object) ?? {}) };
  for (const k of ['deaths', 'prestiges', 'best']) delete (stats as Record<string, unknown>)[k];
  // Per-Hunter kills arrived after v5; older saves start them at 0.
  stats.hunterKills = Object.fromEntries(
    Object.entries(stats.hunterKills && typeof stats.hunterKills === 'object' ? stats.hunterKills : {}).filter(
      ([k, v]) => (k === 'main' || HUNTERS.some((h) => h.id === k)) && typeof v === 'number' && Number.isFinite(v),
    ),
  );

  if (((data.version as number) ?? 1) < 4) {
    // Before v4 progress was stage-based; it doesn't map onto areas. Keep the things
    // that still mean the same: forged items, materials that still exist, Arena progress, stats.
    base.items = mergeNumbers(base.items, data.items);
    base.materials = mergeNumbers(base.materials, data.materials);
    base.lastSeen = typeof data.lastSeen === 'number' ? data.lastSeen : now;
    base.stats = stats;
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
    },
    flags: {
      eventsIntro: !!(data.flags as { eventsIntro?: unknown } | undefined)?.eventsIntro,
      // Anyone with a save from before the welcome existed has already started playing.
      welcome: (data.flags as { welcome?: unknown } | undefined)?.welcome !== false,
      trainIntro: (data.flags as { trainIntro?: unknown } | undefined)?.trainIntro !== false,
    },
    events: Object.fromEntries(
      EVENTS.map((e) => {
        const saved = (data.events as Record<string, Partial<Record<keyof EventState, unknown>>> | undefined)?.[e.id];
        const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
        // Older saves didn't count completions: a Guardian with any later area open was beaten at least once.
        const at = AREAS.findIndex((a) => a.id === e.area);
        const beaten = e.kind === 'guardian' && AREAS.some((a, i) => i > at && (data.areas as Record<string, { unlocked?: boolean }> | undefined)?.[a.id]?.unlocked);
        const completed = typeof saved?.completed === 'number' ? num(saved.completed) : beaten ? 1 : 0;
        return [e.id, { cooldown: num(saved?.cooldown), runs: num(saved?.runs), completed }];
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
  // v6 -> v7: the old Arena (minigame tickets, Stars, Hangar, Frenzy) was replaced by area events.
  for (const k of ['upgrades', 'tickets', 'ticketProgress', 'frenzyTime', 'stars', 'bh']) delete (state as unknown as Record<string, unknown>)[k];
  const savedHunters = (data.hunters ?? {}) as Record<string, { trains?: unknown; level?: unknown }>;
  for (const [id, h] of Object.entries(state.hunters) as Array<[string, HunterState & { level?: number }]>) {
    const saved = savedHunters[id] ?? {};
    h.trains = typeof saved.trains === 'number' ? saved.trains : typeof saved.level === 'number' ? saved.level : 0;
    h.skills = trees ? cleanSkills(id as HunterId, h.skills) : {};
    delete h.level;
  }
  // v4 -> v5: gear is new. Keep only well-formed pieces and slot references to pieces that exist.
  state.inventory = Array.isArray(data.inventory)
    ? (data.inventory as GearItem[]).filter((g) => g && typeof g.uid === 'number' && GEAR.some((d) => d.id === g.base) && typeof g.level === 'number')
    : [];
  const uids = new Set(state.inventory.map((g) => g.uid));
  state.equipment = {};
  if (data.equipment && typeof data.equipment === 'object')
    for (const [who, slots] of Object.entries(data.equipment as Record<string, unknown>))
      if (Array.isArray(slots)) state.equipment[who as Wearer] = slots.map((u) => (typeof u === 'number' && uids.has(u) ? u : null));
  // v10 -> v11: Swarm and Bounty became Empower; each level bought carries over as an Empower session.
  // Evolution ranks are kept only for nodes that exist.
  for (const e of ENEMIES) {
    const b = state.bestiary[e.id] as BestiaryEntry & { swarm?: unknown; bounty?: unknown };
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
    b.empower = n(b.empower) + n(b.swarm) + n(b.bounty);
    delete b.swarm;
    delete b.bounty;
    const evo = b.evo && typeof b.evo === 'object' ? b.evo : {};
    b.evo = Object.fromEntries(
      EVO_TREES[e.archetype].flatMap((node) => {
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
  return state;
}
