import type { MaterialId } from '../core/balance';
import type { Game } from '../core/game';

export interface MinigameResult {
  score: number;
  /** Reward units, roughly "monsters slain"; converted to gold + frenzy by the Game. */
  units: number;
  /** One-line recap shown on the results screen. */
  summary: string;
  /** Materials collected (before any Game-side bonuses). */
  materials?: Partial<Record<MaterialId, number>>;
  /** Stars for the minigame's own upgrade tree. */
  stars?: number;
}

export interface MinigameInstance {
  update(dt: number, w: number, h: number): void;
  render(g: CanvasRenderingContext2D, w: number, h: number): void;
  down(x: number, y: number): void;
  move(x: number, y: number): void;
  up(x: number, y: number): void;
  readonly finished: boolean;
  result(): MinigameResult;
}

export interface MinigameDef {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  howTo: string;
  /** Short line about what the game pays out, shown on its Arena card. */
  rewards: string;
  create(w: number, h: number, game: Game): MinigameInstance;
}
