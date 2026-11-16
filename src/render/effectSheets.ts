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
  // Melee: a spear's thrust (left to right), a hammer's impact and a giant fist punching down from a portal.
  thrust: { frame: 72, frames: 8, box: [0, 22, 72, 28] },
  smash: { frame: 72, frames: 10, box: [0, 4, 72, 66] },
  fist: { frame: 72, frames: 10, box: [9, 1, 52, 71] },
  // Spells: a lightning arc (drawn stretched between two points, fading out at its far end; frames 4-9 are the
  // bolt), an arrow volley, an acid splash, an element orb (tinted), shards bursting apart and a frost spray.
  arc: { frame: 72, frames: 10, box: [1, 28, 70, 31] },
  arrows: { frame: 72, frames: 8, box: [4, 0, 57, 72] },
  acid: { frame: 72, frames: 10, box: [0, 7, 72, 65] },
  orb: { frame: 72, frames: 8, box: [20, 20, 31, 31] },
  shards: { frame: 72, frames: 4, box: [26, 24, 20, 24] },
  frost: { frame: 72, frames: 8, box: [17, 47, 36, 25] },
  /** A Focus's burst: a shockwave ring blasting out (the traps pack's barrel blast, whitened to take any element's tint). */
  shockwave: { frame: 48, frames: 8, box: [2, 0, 46, 48] },
  /** Decay's aura: a ring of rot-purple smoke puffing out round the monster (the barrel's smoke blast, recoloured). */
  rot: { frame: 48, frames: 8, box: [1, 2, 42, 43] },
  // From CraftPix's Elemental Combat Spells, Elemental Magic Projectiles and Magic Shields and Healing Spells packs
  // (one row cut from each, frames padded square): ice spikes bursting up, a monster frozen into an ice cube, rocks
  // falling and breaking, flaming meteors raining down, a fire spray (facing right, turned to aim), a Valkyrie's
  // wings spreading, thorny vines lashing up, and a burst of ice shards.
  icespikes: { frame: 80, frames: 12, box: [10, 2, 59, 76] },
  icecube: { frame: 64, frames: 19, box: [21, 0, 35, 55] },
  stones: { frame: 96, frames: 12, box: [19, 18, 52, 78] },
  meteor: { frame: 96, frames: 12, box: [18, 16, 54, 80] },
  firebreath: { frame: 64, frames: 10, box: [6, 1, 54, 62] },
  wings: { frame: 64, frames: 8, box: [0, 5, 63, 46] },
  vines: { frame: 112, frames: 11, box: [32, 0, 33, 102] },
  iceburst: { frame: 80, frames: 5, box: [23, 31, 39, 39] },
  // More from the same three packs (see SOURCE.txt): magic weapons' shots by element (a lightning bolt, a fireball
  // with its impact, an icicle, a falling rock with its impact, a ray of light), the Lightning Ball spell (its loop and
  // burst), Poison Spray (the acid splash, sideways), gear pulses (the lightning and flaming spheres; the grey copy of
  // the flaming one takes any element's tint), a melee weapon's Elemental Wave (grey, tinted per element), the Eye of
  // Flame's eye, and Gideon's Bone Spikes (the traps pack's steel spike trap).
  boltcast: { frame: 128, frames: 3, box: [62, 37, 10, 26] },
  lightningball: { frame: 128, frames: 7, box: [41, 35, 49, 56] },
  lightningburst: { frame: 128, frames: 8, box: [18, 21, 90, 77] },
  rockfist: { frame: 96, frames: 11, box: [6, 6, 79, 90] },
  acidsplash: { frame: 64, frames: 7, box: [10, 14, 46, 38] },
  eyefire: { frame: 48, frames: 11, box: [12, 14, 25, 33] },
  firebolt: { frame: 64, frames: 7, box: [12, 30, 37, 15] },
  fireboom: { frame: 64, frames: 6, box: [13, 19, 37, 30] },
  icicle: { frame: 80, frames: 1, box: [35, 34, 21, 7] },
  rayburst: { frame: 64, frames: 2, box: [27, 5, 11, 43] },
  lightsphere: { frame: 128, frames: 10, box: [11, 5, 111, 112] },
  flamesphere: { frame: 96, frames: 10, box: [4, 2, 88, 86] },
  'flamesphere-grey': { frame: 96, frames: 10, box: [4, 2, 88, 86] },
  wave: { frame: 64, frames: 10, box: [17, 6, 30, 57] },
  bonespikes: { frame: 32, frames: 6, box: [0, 0, 32, 31] },
} satisfies Record<string, EffectSheet>;

export type EffectKey = keyof typeof EFFECTS;
