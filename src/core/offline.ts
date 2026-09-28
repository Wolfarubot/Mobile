import {
  isBossStage,
  MAX_TICKETS,
  monsterGold,
  monsterHp,
  OFFLINE_CAP_SEC,
  OFFLINE_EFFICIENCY,
  RESPAWN_DELAY,
  TICKET_REGEN_SEC,
} from './balance';
import type { GameState } from './state';

/** The stage slayers grind while nobody is watching: bosses need the player. */
export function farmStage(state: Pick<GameState, 'stage'>): number {
  return isBossStage(state.stage) ? Math.max(1, state.stage - 1) : state.stage;
}

/** Advances minigame ticket regeneration by `seconds`, mutating the state. Returns tickets gained. */
export function regenTickets(state: Pick<GameState, 'tickets' | 'ticketProgress'>, seconds: number): number {
  if (state.tickets >= MAX_TICKETS) {
    state.ticketProgress = 0;
    return 0;
  }
  const before = state.tickets;
  state.ticketProgress += Math.max(0, seconds);
  const gained = Math.floor(state.ticketProgress / TICKET_REGEN_SEC);
  state.tickets = Math.min(MAX_TICKETS, state.tickets + gained);
  state.ticketProgress = state.tickets >= MAX_TICKETS ? 0 : state.ticketProgress % TICKET_REGEN_SEC;
  return state.tickets - before;
}

export interface OfflineResult {
  /** Seconds that counted (after the cap). */
  seconds: number;
  /** Real seconds away, before the cap. */
  away: number;
  kills: number;
  gold: number;
}

/**
 * Idle progress while the app was closed: slayers keep farming the current
 * (non-boss) stage at their base DPS, limited by the monster respawn rate,
 * at OFFLINE_EFFICIENCY of the online rate.
 */
export function computeOffline(state: Pick<GameState, 'stage'>, dps: number, awaySec: number): OfflineResult {
  const away = Math.max(0, awaySec);
  const seconds = Math.min(away, OFFLINE_CAP_SEC);
  const stage = farmStage(state);
  const timePerKill = monsterHp(stage) / Math.max(dps, 1e-9) + RESPAWN_DELAY;
  const kills = dps > 0 ? Math.floor((seconds * OFFLINE_EFFICIENCY) / timePerKill) : 0;
  return { seconds, away, kills, gold: kills * monsterGold(stage) };
}
