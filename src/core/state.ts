import {
  AREAS,
  ENEMIES,
  EVENTS,
  GEAR,
  HUNTERS,
  ITEMS,
  MATERIALS,
  SKILLS,
  type AreaId,
  type EnemyId,
  type GearId,
  type HunterId,
  type ItemId,
  type MaterialId,
  type SkillId,
} from './balance';

export interface EventState {
  cooldown: number;
  runs: number;
  completed: number;
}

export type BuyAmount = 1 | 10 | 100 | 'max';

export interface BestiaryEntry {
  unlocked: boolean;
  swarm: number;
  bounty: number;
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
  /** Skill points spent per skill. */
  skills: Partial<Record<SkillId, number>>;
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
  settings: { leftHanded: boolean };
  /** One-time tutorial moments already shown. */
  flags: { eventsIntro: boolean };
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

export const SAVE_VERSION = 7;

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
    bestiary: byId(ENEMIES, (id) => ({ unlocked: ENEMIES.find((e) => e.id === id)!.unlock === 0, swarm: 0, bounty: 0 })),
    hunters: byId(HUNTERS, () => ({ recruited: false, trains: 0, skills: {}, station: null })),
    materials: zeroes(MATERIALS),
    items: zeroes(ITEMS),
    inventory: [],
    equipment: {},
    nextGearUid: 1,
    lastSeen: now,
    settings: { leftHanded: false },
    flags: { eventsIntro: false },
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

function cleanSkills(saved: unknown): Partial<Record<SkillId, number>> {
  if (!saved || typeof saved !== 'object') return {};
  return Object.fromEntries(
    Object.entries(saved).filter(([k, v]) => SKILLS.some((d) => d.id === k) && typeof v === 'number' && Number.isFinite(v) && v >= 0),
  );
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
    settings: { leftHanded: !!(data.settings as { leftHanded?: unknown } | undefined)?.leftHanded },
    flags: { eventsIntro: !!(data.flags as { eventsIntro?: unknown } | undefined)?.eventsIntro },
    events: Object.fromEntries(
      EVENTS.map((e) => {
        const saved = (data.events as Record<string, Partial<Record<keyof EventState, unknown>>> | undefined)?.[e.id];
        const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
        // Older saves didn't count completions: a Guardian whose next area is open was beaten at least once.
        const beaten = e.kind === 'guardian' && AREAS.some((a, i) => AREAS[i - 1]?.id === e.area && (data.areas as Record<string, { unlocked?: boolean }> | undefined)?.[a.id]?.unlocked);
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
  state.main = {
    trains: typeof main?.trains === 'number' ? main.trains : typeof oldPower === 'number' ? oldPower : 0,
    skills: cleanSkills(main?.skills),
  };
  // v6 -> v7: the old Arena (minigame tickets, Stars, Hangar, Frenzy) was replaced by area events.
  for (const k of ['upgrades', 'tickets', 'ticketProgress', 'frenzyTime', 'stars', 'bh']) delete (state as unknown as Record<string, unknown>)[k];
  const savedHunters = (data.hunters ?? {}) as Record<string, { trains?: unknown; level?: unknown }>;
  for (const [id, h] of Object.entries(state.hunters) as Array<[string, HunterState & { level?: number }]>) {
    const saved = savedHunters[id] ?? {};
    h.trains = typeof saved.trains === 'number' ? saved.trains : typeof saved.level === 'number' ? saved.level : 0;
    h.skills = cleanSkills(h.skills);
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
  state.nextGearUid = Math.max(typeof data.nextGearUid === 'number' ? data.nextGearUid : 1, ...state.inventory.map((g) => g.uid + 1));
  if (!Number.isFinite(state.gold) || state.gold < 0) state.gold = 0;
  if (!(state.area in state.areas) || !state.areas[state.area].unlocked) state.area = 'forest';
  return state;
}
