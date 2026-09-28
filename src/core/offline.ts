import { OFFLINE_CAP_SEC, type AreaId, type HunterId, type MaterialId } from './balance';

/** Real seconds away, and how many of them count toward offline progress. */
export function capAway(awaySec: number): { away: number; seconds: number } {
  const away = Math.max(0, awaySec);
  return { away, seconds: Math.min(away, OFFLINE_CAP_SEC) };
}

/** What was earned in one area while away, and by whom ('main' is your Hunter). */
export interface AreaOffline {
  area: AreaId;
  hunters: Array<'main' | HunterId>;
  kills: number;
  gold: number;
  materials: Partial<Record<MaterialId, number>>;
  /** Times each Hunter here was knocked out (stunned) while you were away. */
  knockouts: Partial<Record<'main' | HunterId, number>>;
}

export interface OfflineResult {
  /** Seconds that counted (after the cap). */
  seconds: number;
  /** Real seconds away, before the cap. */
  away: number;
  kills: number;
  gold: number;
  materials: Partial<Record<MaterialId, number>>;
  /** Per-area breakdown, your area first. */
  areas: AreaOffline[];
  /** Total knockouts across all Hunters. */
  knockouts: number;
}
