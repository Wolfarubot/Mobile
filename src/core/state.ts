import { HEROES, MAX_TICKETS, monsterHp } from './balance';

export type BuyAmount = 1 | 10 | 100 | 'max';

export interface GameState {
  version: number;
  gold: number;
  stage: number;
  maxStage: number;
  /** Kills in the current stage; the stage clears at KILLS_PER_STAGE. */
  kills: number;
  /** True after failing a boss: stay on the current stage until the player retries. */
  farming: boolean;
  monsterHp: number;
  bossTimer: number;
  tapLevel: number;
  heroes: number[];
  shards: number;
  tickets: number;
  /** Seconds accumulated toward the next minigame ticket. */
  ticketProgress: number;
  frenzyTime: number;
  /** Epoch ms of the last save; used to compute offline progress. */
  lastSeen: number;
  buyAmount: BuyAmount;
  stats: {
    totalKills: number;
    totalGold: number;
    taps: number;
    prestiges: number;
    best: Record<string, number>;
  };
}

export const SAVE_VERSION = 1;

export function newGame(now = Date.now()): GameState {
  return {
    version: SAVE_VERSION,
    gold: 0,
    stage: 1,
    maxStage: 1,
    kills: 0,
    farming: false,
    monsterHp: monsterHp(1),
    bossTimer: 0,
    tapLevel: 1,
    heroes: HEROES.map(() => 0),
    shards: 0,
    tickets: MAX_TICKETS,
    ticketProgress: 0,
    frenzyTime: 0,
    lastSeen: now,
    buyAmount: 1,
    stats: { totalKills: 0, totalGold: 0, taps: 0, prestiges: 0, best: {} },
  };
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** Parses a save, filling in any fields missing from older versions. Returns null if unusable. */
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
  const state: GameState = {
    ...base,
    ...data,
    stats: { ...base.stats, ...(data.stats ?? {}) },
    version: SAVE_VERSION,
  };
  // New heroes may have been added since this save was written.
  state.heroes = HEROES.map((_, i) => data.heroes?.[i] ?? 0);
  if (!Number.isFinite(state.gold) || state.gold < 0) state.gold = 0;
  return state;
}
