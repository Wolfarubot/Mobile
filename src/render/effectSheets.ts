/**
 * Animated magic effects: one-row sheets of square frames in public/effects/<key>.png (CraftPix magic effect
 * packs, see SOURCE.txt there). `box` is the effect's bounding box within a frame [x, y, w, h], for sizing.
 */
export interface EffectSheet {
  frame: number;
  frames: number;
  box: [number, number, number, number];
}

export const EFFECTS = {
  explosion: { frame: 72, frames: 10, box: [6, 4, 59, 64] },
  fireball: { frame: 72, frames: 8, box: [4, 40, 53, 23] },
  lightning: { frame: 72, frames: 10, box: [0, 0, 71, 72] },
  sunstrike: { frame: 72, frames: 10, box: [9, 0, 58, 72] },
  blackhole: { frame: 72, frames: 8, box: [11, 11, 52, 52] },
  shield: { frame: 72, frames: 8, box: [14, 14, 49, 49] },
  puff: { frame: 72, frames: 8, box: [1, 19, 68, 53] },
  ice: { frame: 72, frames: 8, box: [24, 0, 27, 72] },
  spikes: { frame: 72, frames: 10, box: [11, 46, 42, 26] },
  poison: { frame: 72, frames: 10, box: [18, 18, 38, 50] },
  cloudStart: { frame: 72, frames: 10, box: [0, 15, 72, 57] },
  cloudCycle: { frame: 72, frames: 10, box: [0, 7, 72, 65] },
  cloudFinish: { frame: 72, frames: 10, box: [0, 7, 72, 65] },
} satisfies Record<string, EffectSheet>;

export type EffectKey = keyof typeof EFFECTS;
