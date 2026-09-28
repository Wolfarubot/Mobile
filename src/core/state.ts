import { BH_UPGRADES, ITEMS, MATERIALS, MAX_TICKETS, UPGRADES, type BhUpgradeId, type ItemId, type MaterialId, type UpgradeId } from './balance';

export type BuyAmount = 1 | 10 | 100 | 'max';

export interface GameState {
  version: number;
  gold: number;
  stage: number;
  /** Highest stage unlocked; the player can move freely between 1 and this. */
  maxStage: number;
  /** Kills toward clearing the current stage. */
  stageKills: number;
  /** Move on automatically after clearing a stage. Turned off by dying or by stepping back. */
  autoAdvance: boolean;
  bossTimer: number;
  upgrades: Record<UpgradeId, number>;
  materials: Record<MaterialId, number>;
  items: Record<ItemId, number>;
  shards: number;
  tickets: number;
  /** Seconds accumulated toward the next minigame ticket. */
  ticketProgress: number;
  frenzyTime: number;
  /** Bullet hell meta-progression. */
  stars: number;
  bh: Record<BhUpgradeId, number>;
  /** Epoch ms of the last save; used to compute offline progress. */
  lastSeen: number;
  buyAmount: BuyAmount;
  stats: {
    totalKills: number;
    totalGold: number;
    taps: number;
    prestiges: number;
    deaths: number;
    best: Record<string, number>;
  };
}

export const SAVE_VERSION = 2;

const zeroes = <K extends string>(ids: { id: K }[]): Record<K, number> =>
  Object.fromEntries(ids.map((x) => [x.id, 0])) as Record<K, number>;

export function newGame(now = Date.now()): GameState {
  return {
    version: SAVE_VERSION,
    gold: 0,
    stage: 1,
    maxStage: 1,
    stageKills: 0,
    autoAdvance: true,
    bossTimer: 0,
    upgrades: zeroes(UPGRADES),
    materials: zeroes(MATERIALS),
    items: zeroes(ITEMS),
    shards: 0,
    tickets: MAX_TICKETS,
    ticketProgress: 0,
    frenzyTime: 0,
    stars: 0,
    bh: zeroes(BH_UPGRADES),
    lastSeen: now,
    buyAmount: 1,
    stats: { totalKills: 0, totalGold: 0, taps: 0, prestiges: 0, deaths: 0, best: {} },
  };
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** Parses a save, filling in fields missing from older versions. Returns null if unusable. */
export function deserialize(raw: string | null | undefined, now = Date.now()): GameState | null {
  if (!raw) return null;
  let data: Partial<GameState>;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || typeof data.gold !== 'number') return null;

  const base = newGame(now);
  if ((data.version ?? 1) < 2) {
    // v1 was the single-monster prototype: its progress doesn't map onto the new game.
    // Keep lifetime stats, tickets and shards; everything else starts fresh.
    base.stats = { ...base.stats, ...(data.stats ?? {}) };
    base.shards = data.shards ?? 0;
    base.tickets = data.tickets ?? base.tickets;
    base.lastSeen = data.lastSeen ?? now;
    return base;
  }

  const state: GameState = {
    ...base,
    ...data,
    upgrades: { ...base.upgrades, ...(data.upgrades ?? {}) },
    materials: { ...base.materials, ...(data.materials ?? {}) },
    items: { ...base.items, ...(data.items ?? {}) },
    bh: { ...base.bh, ...(data.bh ?? {}) },
    stats: { ...base.stats, ...(data.stats ?? {}) },
    version: SAVE_VERSION,
  };
  if (!Number.isFinite(state.gold) || state.gold < 0) state.gold = 0;
  state.stage = Math.min(Math.max(1, state.stage), state.maxStage);
  return state;
}
