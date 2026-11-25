import type { Wearer } from '../core/state';

/**
 * Hunters on the battlefield: weapon-free idle animations (public/hunters/<id>.png), built from CraftPix's
 * top-down packs (tools/hunter-sprites/, laid out by its install.py) (the game draws each Hunter's real weapon in
 * their hands). 4 rows (down, left, right, up) of square frames; `box` is the character's bounding
 * box within a frame [x, y, w, h]. Every Hunter is a top-down 4-direction character in the same style
 * (the `side` option, one idle row mirrored to face left, remains for side-view art).
 */
export interface HunterSheet {
  frame: number;
  /** Frames in each row (down, left, right, up), or the one row of a side-view sheet. */
  frames: number[];
  /** One row facing right (mirrored to face left), from the side-view packs. */
  side?: boolean;
  box: [number, number, number, number];
}

export const HUNTER_SHEETS: Partial<Record<Wearer, HunterSheet>> = {
  main: { frame: 64, frames: [12, 12, 12, 4], box: [23, 19, 18, 25] },
  ranger: { frame: 64, frames: [12, 12, 12, 4], box: [20, 20, 24, 24] },
  bard: { frame: 64, frames: [4, 4, 4, 4], box: [15, 9, 36, 37] },
  alchemist: { frame: 64, frames: [12, 12, 12, 4], box: [21, 17, 24, 27] },
  druid: { frame: 64, frames: [12, 12, 12, 4], box: [24, 19, 19, 25] },
  thief: { frame: 64, frames: [12, 12, 12, 4], box: [22, 18, 21, 26] },
  lance: { frame: 64, frames: [12, 12, 12, 4], box: [21, 18, 23, 26] },
  glimmer: { frame: 64, frames: [12, 12, 12, 12], box: [25, 22, 15, 23] },
  puppeteer: { frame: 64, frames: [12, 12, 12, 6], box: [23, 19, 20, 25] },
  wilhelm: { frame: 64, frames: [12, 12, 12, 4], box: [24, 19, 17, 25] },
  celeste: { frame: 64, frames: [12, 12, 12, 4], box: [21, 20, 22, 25] },
  blacksmith: { frame: 64, frames: [6, 6, 6, 2], box: [23, 17, 19, 27] },
  scavenger: { frame: 64, frames: [12, 12, 12, 6], box: [23, 20, 20, 24] },
  enchantress: { frame: 64, frames: [12, 12, 12, 12], box: [22, 18, 21, 27] },
  osteomancer: { frame: 64, frames: [4, 4, 4, 4], box: [20, 17, 23, 27] },
  haunter: { frame: 64, frames: [12, 12, 12, 4], box: [21, 16, 24, 28] },
  bloodblade: { frame: 64, frames: [12, 12, 12, 4], box: [23, 20, 19, 24] },
  artificer: { frame: 64, frames: [12, 12, 12, 4], box: [20, 20, 25, 24] },
  archivist: { frame: 64, frames: [12, 12, 12, 12], box: [23, 17, 19, 28] },
  gambler: { frame: 64, frames: [12, 12, 12, 6], box: [24, 20, 17, 24] },
  spaceslime: { frame: 64, frames: [8, 8, 8, 8], box: [14, 17, 35, 23] },
  lichlord: { frame: 64, frames: [4, 4, 4, 4], box: [18, 6, 29, 38] },
  alien: { frame: 64, frames: [4, 4, 4, 4], box: [18, 15, 27, 29] },
  riftwalker: { frame: 64, frames: [6, 6, 6, 6], box: [14, 7, 36, 33] },
};
