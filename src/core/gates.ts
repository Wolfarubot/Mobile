import type { AreaId } from './balance';

/**
 * Gated areas (the Forbidden Crypt): walls close off the corners of the view, and monsters come in only through
 * the middle third of each side, a gate in each of the four walls. The walls are drawn by the background and
 * walked around by the field, so both take them from here, in view pixels (origin top-left).
 */
export const GATED: ReadonlySet<AreaId> = new Set<AreaId>(['crypt']);

/** How deep the walls' tops are (the top and bottom walls, and the side walls), and the wall face below a top. */
export const WALL_ROOF = 40;
export const WALL_SIDE = 34;
export const WALL_FACE = 38;

/** [x, y, w, h] in view pixels. */
export type WallRect = [number, number, number, number];

/**
 * The walls of a w×h view: an L in each corner, along the outer third of both sides. The top walls show their
 * face below them (they're tall); the bottom ones show only their tops. Each gate is the middle third of its side.
 */
export function gateWalls(w: number, h: number): WallRect[] {
  const gx = Math.round(w / 3);
  const gy = Math.round(h / 3);
  const top = WALL_ROOF + WALL_FACE;
  return [
    [0, 0, gx, top],
    [w - gx, 0, gx, top],
    [0, 0, WALL_SIDE, gy],
    [w - WALL_SIDE, 0, WALL_SIDE, gy],
    [0, h - WALL_ROOF, gx, WALL_ROOF],
    [w - gx, h - WALL_ROOF, gx, WALL_ROOF],
    [0, h - gy, WALL_SIDE, gy],
    [w - WALL_SIDE, h - gy, WALL_SIDE, gy],
  ];
}

/** Whether a w×h view's point (x, y) lies in one of the gates' passages, from the edge in to `depth` (0–0.5) of the way. */
export function inGatePassage(x: number, y: number, w: number, h: number, depth: number): boolean {
  const across = (v: number, len: number) => v > len / 3 && v < (len * 2) / 3;
  const near = (v: number, len: number) => v < len * depth || v > len * (1 - depth);
  return (across(x, w) && near(y, h)) || (across(y, h) && near(x, w));
}
