import type { Wearer } from '../core/state';

/**
 * Hunters on the battlefield: weapon-free idle animations (public/hunters/<id>.png), composed from CraftPix's
 * swordsman, mage and archer packs and recoloured per Hunter (the game draws each Hunter's real weapon in
 * their hands). 4 rows (down, left, right, up) of square frames; `box` is the character's bounding
 * box within a frame [x, y, w, h]. Some Hunters use side-view knights, wizards, ninjas and yokai instead
 * (one idle row facing right, mirrored when they aim left; drawn at the same height).
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
  ranger: { frame: 64, frames: [12, 12, 12, 4], box: [20, 19, 24, 25] },
  alchemist: { frame: 64, frames: [12, 12, 12, 4], box: [20, 20, 24, 24] },
  bard: { frame: 64, frames: [12, 12, 12, 4], box: [20, 20, 24, 24] },
  druid: { frame: 96, frames: [7], box: [31, 25, 36, 71], side: true },
  thief: { frame: 128, frames: [9], box: [47, 64, 25, 64], side: true },
  lance: { frame: 128, frames: [4], box: [12, 64, 43, 64], side: true },
  glimmer: { frame: 128, frames: [7], box: [33, 62, 33, 66], side: true },
  puppeteer: { frame: 128, frames: [8], box: [29, 62, 52, 66], side: true },
  wilhelm: { frame: 64, frames: [12, 12, 12, 4], box: [20, 17, 24, 27] },
  celeste: { frame: 128, frames: [7], box: [35, 65, 30, 63], side: true },
  blacksmith: { frame: 128, frames: [4], box: [12, 64, 43, 64], side: true },
  scavenger: { frame: 96, frames: [6], box: [27, 28, 35, 68], side: true },
  enchantress: { frame: 128, frames: [8], box: [24, 49, 53, 79], side: true },
  frostbreaker: { frame: 128, frames: [4], box: [12, 64, 43, 64], side: true },
};
