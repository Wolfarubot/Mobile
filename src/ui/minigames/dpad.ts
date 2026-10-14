import type { MinigameApi } from './shell';

/**
 * The minigames' D-pad (Grave Robbing, Puppet Show): four stone buttons with white arrows from the platformer UI
 * pack (public/minigames/), sinking while pressed. Also loads the other minigame art there.
 */
export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const DIR_LIST = Object.keys(DIRS) as Dir[];

const artImgs = new Map<string, HTMLImageElement>();
/** A picture from public/minigames/, once it has loaded. */
export function mgArt(name: string): HTMLImageElement | null {
  let img = artImgs.get(name);
  if (!img) {
    img = new Image();
    img.src = `${import.meta.env.BASE_URL}minigames/${name}.png`;
    artImgs.set(name, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

const DPAD_ART = ['stone-btn', 'stone-btn-down', ...DIR_LIST.map((d) => `arrow-${d}`)];

export interface Dpad {
  /** Centre and button size. */
  x: number;
  y: number;
  b: number;
}

/** The D-pad near the bottom of the screen; `size` scales its buttons (1: 68px at a 400px-wide phone). */
/** Room kept clear under the D-pad, so its down button isn't right against the phone's own (home, back) buttons. */
const DPAD_LIFT = 48;

export function dpadAt(api: MinigameApi, size = 1): Dpad {
  const b = Math.min(68 * size * api.k, api.W * 0.29);
  return { x: api.W / 2, y: api.H - b * 1.62 - DPAD_LIFT * api.k, b };
}

/** The top of the D-pad (so games can keep their art clear of it). */
export function dpadTop(api: MinigameApi, size = 1): number {
  const p = dpadAt(api, size);
  return p.y - p.b * 1.62 - 14 * api.k;
}

export function buttonAt(p: Dpad, d: Dir): { x: number; y: number } {
  const [dx, dy] = DIRS[d];
  return { x: p.x + dx * p.b * 1.08, y: p.y + dy * p.b * 1.08 };
}

/** The button a tap landed on, if any (a little generous round each). */
export function dpadHit(p: Dpad, x: number, y: number): Dir | null {
  let best: Dir | null = null;
  let bestD = p.b * 0.75;
  for (const d of DIR_LIST) {
    const b = buttonAt(p, d);
    const dist = Math.hypot(x - b.x, y - b.y);
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best;
}

/**
 * The four buttons; a button with `pressed[d] > 0` is drawn pushed in, and one in `lit` (pressing itself to show
 * a pattern) also glows a lighter shade.
 */
export function drawDpad(g: CanvasRenderingContext2D, p: Dpad, pressed: Record<Dir, number>, lit?: Partial<Record<Dir, number>>): void {
  // Every button state and arrow starts loading at once, so a press never shows a missing picture.
  for (const name of DPAD_ART) mgArt(name);
  g.imageSmoothingEnabled = false;
  for (const d of DIR_LIST) {
    const b = buttonAt(p, d);
    const down = pressed[d] > 0;
    const btn = mgArt(down ? 'stone-btn-down' : 'stone-btn');
    const s = p.b;
    if (btn) {
      g.drawImage(btn, Math.round(b.x - s / 2), Math.round(b.y - s / 2), s, s);
      if ((lit?.[d] ?? 0) > 0) {
        // Lighter: the same button brightened.
        g.filter = 'brightness(1.32) saturate(0.85)';
        g.drawImage(btn, Math.round(b.x - s / 2), Math.round(b.y - s / 2), s, s);
        g.filter = 'none';
      }
    }
    const arrow = mgArt(`arrow-${d}`);
    if (arrow) {
      // The arrow sits on the button's face (lower when pressed), with a dark drop shadow.
      const as = s * 0.62;
      const ax = Math.round(b.x - as / 2);
      const ay = Math.round(b.y - as / 2 - s * (down ? 0 : 0.06));
      g.filter = 'brightness(0) opacity(0.55)';
      g.drawImage(arrow, ax + 2, ay + 2, as, as);
      g.filter = 'none';
      g.drawImage(arrow, ax, ay, as, as);
    }
  }
}
