/**
 * Which sound plays for each moment in the game, and how: the clip (a file in public/sfx, or null for silence), its
 * volume (1 = as recorded), the least time between two plays in ms (a play sooner is skipped) and a random pitch
 * spread (0.1 = up to 10% higher or lower). Edited in the Sound Effects editor (an Artifact) and copied here.
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
  | 'allyStunned';

export interface SfxSpec {
  clip: string | null;
  gain: number;
  gap: number;
  jitter: number;
}

export const SFX: Record<SfxEvent, SfxSpec> = {
  button: { clip: 'click', gain: 0.5, gap: 40, jitter: 0 },
  tab: { clip: 'navigate', gain: 0.4, gap: 40, jitter: 0 },
  train: { clip: 'power-up', gain: 0.6, gap: 60, jitter: 0 },
  levelUp: { clip: 'fanfare', gain: 0.75, gap: 400, jitter: 0 },
  empower: { clip: 'power-up', gain: 0.6, gap: 60, jitter: 0 },
  learn: { clip: 'power-up', gain: 0.6, gap: 60, jitter: 0 },
  craft: { clip: 'power-up', gain: 0.6, gap: 60, jitter: 0 },
  recruit: { clip: 'fanfare', gain: 0.75, gap: 400, jitter: 0 },
  unlock: { clip: 'fanfare', gain: 0.75, gap: 400, jitter: 0 },
  eventStart: { clip: null, gain: 0.7, gap: 400, jitter: 0 },
  eventWon: { clip: 'fanfare', gain: 0.75, gap: 400, jitter: 0 },
  guardianAppears: { clip: null, gain: 0.8, gap: 1000, jitter: 0 },
  guardianEscapes: { clip: 'defeat', gain: 0.9, gap: 1000, jitter: 0 },
  gearDrop: { clip: 'coin', gain: 0.5, gap: 150, jitter: 0 },
  kill: { clip: 'kill', gain: 0.35, gap: 110, jitter: 0.12 },
  guardianKill: { clip: 'boss-kill', gain: 0.85, gap: 300, jitter: 0 },
  tap: { clip: 'zap', gain: 0.3, gap: 120, jitter: 0.08 },
  explosion: { clip: 'explosion', gain: 0.8, gap: 140, jitter: 0.1 },
  block: { clip: 'block', gain: 0.55, gap: 150, jitter: 0.06 },
  stunned: { clip: 'hurt', gain: 0.7, gap: 400, jitter: 0 },
  allyStunned: { clip: 'hurt-ally', gain: 0.5, gap: 300, jitter: 0.06 },
};
