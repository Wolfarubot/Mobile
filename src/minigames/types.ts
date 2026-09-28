export interface MinigameResult {
  score: number;
  /** Reward units, roughly "monsters slain"; converted to gold + frenzy by the Game. */
  units: number;
  /** One-line recap shown on the results screen. */
  summary: string;
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
  create(w: number, h: number): MinigameInstance;
}
