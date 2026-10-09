import type { Wearer } from '../core/state';

/**
 * Hunters on the battlefield: weapon-free idle animations (public/hunters/<id>.png), composed from CraftPix's
 * swordsman, mage and archer packs and recoloured per Hunter (the game draws each Hunter's real weapon in
 * their hands). 4 rows (down, left, right, up) of square frames; `box` is the character's bounding
 * box within a frame [x, y, w, h].
 */
export interface HunterSheet {
  frame: number;
  /** Frames in each row (down, left, right, up). */
  frames: number[];
  box: [number, number, number, number];
}

export const HUNTER_SHEETS: Partial<Record<Wearer, HunterSheet>> = {
  main: { frame: 64, frames: [12, 12, 12, 4], box: [23, 19, 18, 25] },
  ranger: { frame: 64, frames: [12, 12, 12, 4], box: [20, 19, 24, 25] },
  alchemist: { frame: 64, frames: [12, 12, 12, 4], box: [20, 20, 24, 24] },
  bard: { frame: 64, frames: [12, 12, 12, 4], box: [20, 20, 24, 24] },
  druid: { frame: 64, frames: [12, 12, 12, 4], box: [22, 19, 18, 25] },
  thief: { frame: 64, frames: [12, 12, 12, 4], box: [20, 17, 24, 27] },
  lance: { frame: 64, frames: [12, 12, 12, 4], box: [23, 20, 18, 24] },
  glimmer: { frame: 64, frames: [12, 12, 12, 4], box: [21, 20, 22, 25] },
  puppeteer: { frame: 64, frames: [12, 12, 12, 4], box: [20, 20, 24, 24] },
  wilhelm: { frame: 64, frames: [12, 12, 12, 4], box: [20, 17, 24, 27] },
  celeste: { frame: 64, frames: [12, 12, 12, 4], box: [20, 20, 24, 24] },
  blacksmith: { frame: 64, frames: [12, 12, 12, 4], box: [23, 20, 18, 24] },
  scavenger: { frame: 64, frames: [12, 12, 12, 4], box: [20, 17, 24, 27] },
  enchantress: { frame: 64, frames: [12, 12, 12, 4], box: [21, 20, 22, 25] },
  frostbreaker: { frame: 64, frames: [12, 12, 12, 4], box: [22, 19, 19, 25] },
};
