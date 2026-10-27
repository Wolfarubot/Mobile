import type { DamageType } from '../core/balance';

/**
 * Which sound plays for each moment in the game, and how: the clip (a file in public/sfx, or null for silence), its
 * volume (1 = as recorded), the least time between two plays in ms (a play sooner is skipped), a random pitch
 * spread (0.1 = up to 10% higher or lower), a fixed pitch shift in semitones and its length (1 = as recorded,
 * 1.5 = half as long again, same pitch). Edited in the Pocket Hunter Sound Board (an Artifact) and copied here.
 * Volumes are levelled by loudness, taking the louder of the standard measure (EBU R128, loudest 400 ms) and the
 * loudest 50 ms less 5 dB, so short clicks and hits aren't underrated: big moments -14 LUFS, tab and stuns -17 to
 * -19, the constant combat sounds -20, and the two heard most, a button press -21 and a monster slain -23.
 */
export type SfxEvent =
  | 'button'
  | 'tab'
  | 'train'
  | 'levelUp'
  | 'empower'
  | 'learn'
  | 'craft'
  | 'recruit'
  | 'unlock'
  | 'eventStart'
  | 'eventWon'
  | 'guardianAppears'
  | 'guardianEscapes'
  | 'gearDrop'
  | 'kill'
  | 'guardianKill'
  | 'tap'
  | 'explosion'
  | 'block'
  | 'stunned'
  | 'allyStunned'
  | 'meleeSwing'
  | 'rangedShot'
  | 'magicFire'
  | 'magicFrost'
  | 'magicLightning'
  | 'magicPoison'
  | 'magicAcid'
  | 'magicRadiant'
  | 'magicArcane'
  | 'magicDecay'
  | 'magicVoid'
  | 'magicPhysical';

export interface SfxSpec {
  clip: string | null;
  gain: number;
  gap: number;
  jitter: number;
  pitch: number;
  length: number;
}

export const SFX: Record<SfxEvent, SfxSpec> = {
  button: { clip: 'navigate', gain: 0.41, gap: 0, jitter: 0.21, pitch: 0.5, length: 0.8 },
  tab: { clip: 'rpg-ui-hover', gain: 0.34, gap: 170, jitter: 0.19, pitch: -6, length: 1.55 },
  train: { clip: 'rpg-ui-use-item', gain: 0.78, gap: 1210, jitter: 0.3, pitch: -3, length: 0.8 },
  levelUp: { clip: 'rpg-battle-claw', gain: 1.1, gap: 400, jitter: 0, pitch: -8.5, length: 1.85 },
  empower: { clip: 'rpg-ui-use-item', gain: 0.71, gap: 1140, jitter: 0.16, pitch: -2.5, length: 1.25 },
  learn: { clip: 'rpg-ui-decline', gain: 0.75, gap: 60, jitter: 0.05, pitch: 0, length: 1.35 },
  craft: { clip: 'rpg-ui-equip', gain: 0.69, gap: 60, jitter: 0.3, pitch: -1, length: 1.55 },
  recruit: { clip: 'rpg-battle-encounter', gain: 0.76, gap: 400, jitter: 0, pitch: 0, length: 0.55 },
  unlock: { clip: 'rpg-move-teleport', gain: 0.62, gap: 400, jitter: 0, pitch: 0, length: 1 },
  eventStart: { clip: 'rpg-battle-encounter', gain: 0.56, gap: 400, jitter: 0, pitch: 0, length: 1 },
  eventWon: { clip: 'rpg-buff-def-buff', gain: 1.32, gap: 400, jitter: 0, pitch: 0, length: 1 },
  guardianAppears: { clip: 'rpg-buff-atk-buff', gain: 0.34, gap: 1000, jitter: 0, pitch: -3.5, length: 0.85 },
  guardianEscapes: { clip: 'rpg-battle-flee', gain: 1.48, gap: 1000, jitter: 0, pitch: 1, length: 1.4 },
  gearDrop: { clip: 'coin', gain: 0.88, gap: 150, jitter: 0, pitch: 0, length: 1 },
  kill: { clip: 'hurt-ally', gain: 0.294, gap: 720, jitter: 0.12, pitch: 0, length: 1.1 },
  guardianKill: { clip: 'boss-kill', gain: 0.7, gap: 300, jitter: 0, pitch: 0, length: 1.75 },
  tap: { clip: 'block', gain: 0.98, gap: 510, jitter: 0.3, pitch: 0, length: 1.1 },
  explosion: { clip: 'explosion', gain: 1.95, gap: 140, jitter: 0.1, pitch: 0, length: 1 },
  block: { clip: 'rpg-ui-unequip', gain: 0.7, gap: 150, jitter: 0.06, pitch: 3, length: 0.75 },
  stunned: { clip: 'hurt-ally', gain: 0.98, gap: 400, jitter: 0, pitch: 0, length: 1 },
  allyStunned: { clip: 'hurt-ally', gain: 0.78, gap: 300, jitter: 0.06, pitch: 0, length: 1 },
  meleeSwing: { clip: 'rpg-move-attack', gain: 0.47, gap: 150, jitter: 0.12, pitch: 0, length: 1 },
  rangedShot: { clip: 'rpg-battle-miss-evade', gain: 0.51, gap: 150, jitter: 0.1, pitch: 4, length: 0.6 },
  magicFire: { clip: 'rpg-magic-fire-explosion', gain: 0.46, gap: 250, jitter: 0.08, pitch: 0, length: 0.5 },
  magicFrost: { clip: 'rpg-magic-ice-explosion', gain: 0.58, gap: 250, jitter: 0.08, pitch: 0, length: 0.6 },
  magicLightning: { clip: 'rpg-magic-thunder', gain: 0.3, gap: 250, jitter: 0.08, pitch: 0, length: 0.4 },
  magicPoison: { clip: 'rpg-magic-poison', gain: 0.46, gap: 250, jitter: 0.08, pitch: 0, length: 0.5 },
  magicAcid: { clip: 'rpg-magic-water', gain: 0.35, gap: 250, jitter: 0.08, pitch: 2, length: 0.5 },
  magicRadiant: { clip: 'rpg-buff-heal', gain: 0.46, gap: 250, jitter: 0.08, pitch: 0, length: 0.6 },
  magicArcane: { clip: 'rpg-buff-absorb', gain: 0.39, gap: 250, jitter: 0.08, pitch: 2, length: 0.4 },
  magicDecay: { clip: 'rpg-buff-debuff', gain: 0.48, gap: 250, jitter: 0.08, pitch: 0, length: 0.4 },
  magicVoid: { clip: 'rpg-buff-sleep', gain: 0.38, gap: 250, jitter: 0.08, pitch: -4, length: 0.45 },
  magicPhysical: { clip: 'rpg-magic-earth', gain: 0.45, gap: 250, jitter: 0.08, pitch: 0, length: 0.45 },
};

/** The moment for magic of each element (spells, spell blasts, elemental taps, lightning from the sky). */
export const MAGIC_SFX: Record<DamageType, SfxEvent> = {
  physical: 'magicPhysical',
  fire: 'magicFire',
  acid: 'magicAcid',
  frost: 'magicFrost',
  radiant: 'magicRadiant',
  poison: 'magicPoison',
  arcane: 'magicArcane',
  decay: 'magicDecay',
  lightning: 'magicLightning',
  void: 'magicVoid',
};
