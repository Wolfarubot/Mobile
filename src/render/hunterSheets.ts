import type { Wearer } from '../core/state';

/**
 * Hunters on the battlefield: weapon-free idle animations (public/hunters/<id>.png), composed from CraftPix's
 * swordsman, mage, archer and vampire packs and recoloured per Hunter (the game draws each Hunter's real weapon in
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
  bard: { frame: 64, frames: [12, 12, 12, 4], box: [20, 19, 24, 25] },
  alchemist: { frame: 64, frames: [12, 12, 12, 4], box: [23, 19, 18, 25] },
  druid: { frame: 64, frames: [12, 12, 12, 4], box: [22, 19, 18, 25] },
  thief: { frame: 64, frames: [12, 12, 12, 4], box: [20, 20, 24, 24] },
  lance: { frame: 64, frames: [12, 12, 12, 4], box: [20, 17, 23, 28] },
  glimmer: { frame: 64, frames: [12, 12, 12, 4], box: [20, 20, 24, 24] },
  puppeteer: { frame: 64, frames: [12, 12, 12, 4], box: [20, 18, 23, 26] },
  wilhelm: { frame: 64, frames: [12, 12, 12, 4], box: [20, 17, 24, 28] },
  celeste: { frame: 64, frames: [12, 12, 12, 4], box: [20, 20, 24, 24] },
  blacksmith: { frame: 64, frames: [12, 12, 12, 4], box: [23, 20, 18, 24] },
  scavenger: { frame: 64, frames: [12, 12, 12, 4], box: [20, 17, 24, 27] },
  enchantress: { frame: 64, frames: [12, 12, 12, 4], box: [21, 20, 22, 25] },
  osteomancer: { frame: 64, frames: [4, 4, 4, 4], box: [20, 17, 23, 27] },
  frostbreaker: { frame: 64, frames: [12, 12, 12, 4], box: [23, 20, 18, 24] },
  bloodblade: { frame: 64, frames: [4, 4, 4, 4], box: [12, 16, 39, 28] },
};
