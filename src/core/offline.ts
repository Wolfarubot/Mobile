import {
  enemyGold,
  enemyHp,
  isBossStage,
  MAX_TICKETS,
  OFFLINE_CAP_SEC,
  OFFLINE_EFFICIENCY,
  TICKET_REGEN_SEC,
  zoneFor,
  type MaterialId,
} from './balance';
import type { GameState } from './state';

/** The stage the hero grinds while nobody is watching: bosses need the player. */
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

export interface CombatRates {
  stage: number;
  /** Expected damage per second. */
  dps: number;
  /** Enemies per second arriving on the field. */
  spawnRate: number;
  goldMult: number;
  dropChance: number;
}

export interface OfflineResult {
  /** Seconds that counted (after the cap). */
  seconds: number;
  /** Real seconds away, before the cap. */
  away: number;
  kills: number;
  gold: number;
  material: MaterialId;
  materials: number;
}

/**
 * Idle progress while the app was closed: the hero keeps farming the current
 * (non-boss) stage. Kills are limited both by damage and by how fast enemies
 * spawn, at OFFLINE_EFFICIENCY of the online rate.
 */
export function computeOffline(r: CombatRates, awaySec: number): OfflineResult {
  const away = Math.max(0, awaySec);
  const seconds = Math.min(away, OFFLINE_CAP_SEC);
  const stage = farmStage(r.stage);
  const killRate = Math.min(r.spawnRate, r.dps / enemyHp(stage));
  const kills = Math.floor(seconds * OFFLINE_EFFICIENCY * killRate);
  return {
    seconds,
    away,
    kills,
    gold: Math.floor(kills * enemyGold(stage) * r.goldMult),
    material: zoneFor(stage).material,
    materials: Math.floor(kills * r.dropChance),
  };
}
