import { MAX_TICKETS, OFFLINE_CAP_SEC, TICKET_REGEN_SEC, type MaterialId } from './balance';
import type { GameState } from './state';

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

/** Real seconds away, and how many of them count toward offline progress. */
export function capAway(awaySec: number): { away: number; seconds: number } {
  const away = Math.max(0, awaySec);
  return { away, seconds: Math.min(away, OFFLINE_CAP_SEC) };
}

export interface OfflineResult {
  /** Seconds that counted (after the cap). */
  seconds: number;
  /** Real seconds away, before the cap. */
  away: number;
  kills: number;
  gold: number;
  materials: Partial<Record<MaterialId, number>>;
}
