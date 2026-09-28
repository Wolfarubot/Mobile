import { isBossStage, MAX_TICKETS, OFFLINE_CAP_SEC, OFFLINE_EFFICIENCY, TICKET_REGEN_SEC, type MaterialId } from './balance';
import type { EnemyStats } from './game';
import type { GameState } from './state';

/** The stage the Hunter grinds while nobody is watching: bosses need the player. */
export function farmStage(stage: number): number {
  return isBossStage(stage) ? Math.max(1, stage - 1) : stage;
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
  materials: Partial<Record<MaterialId, number>>;
}

/**
 * Idle progress while the app was closed. The Hunter can only chew through so
 * much HP per second: if the horde brings more HP than that, the rest escape.
 * Every enemy type is killed at the same fraction, at OFFLINE_EFFICIENCY of the online rate.
 */
export function computeOffline(dps: number, roster: EnemyStats[], awaySec: number): OfflineResult {
  const away = Math.max(0, awaySec);
  const seconds = Math.min(away, OFFLINE_CAP_SEC);
  const hpPerSec = roster.reduce((sum, e) => sum + e.spawnRate * e.hp, 0);
  const fraction = hpPerSec > 0 ? Math.min(1, dps / hpPerSec) : 0;
  let kills = 0;
  let gold = 0;
  const materials: Partial<Record<MaterialId, number>> = {};
  for (const e of roster) {
    const k = Math.floor(e.spawnRate * fraction * seconds * OFFLINE_EFFICIENCY);
    kills += k;
    gold += k * e.gold;
    const m = Math.floor(k * e.dropChance);
    if (m > 0) materials[e.material] = (materials[e.material] ?? 0) + m;
  }
  return { seconds, away, kills, gold: Math.floor(gold), materials };
}
