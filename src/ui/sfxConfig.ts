/**
 * Which sound plays for each moment in the game, and how: the clip (a file in public/sfx, or null for silence), its
 * volume (1 = as recorded), the least time between two plays in ms (a play sooner is skipped), a random pitch
 * spread (0.1 = up to 10% higher or lower), a fixed pitch shift in semitones and its length (1 = as recorded,
 * 1.5 = half as long again, same pitch). Edited in the Pocket Hunter Sound Board (an Artifact) and copied here.
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
  pitch: number;
  length: number;
}

export const SFX: Record<SfxEvent, SfxSpec> = {
  button: { clip: 'click', gain: 0.5, gap: 40, jitter: 0, pitch: 0, length: 1 },
  tab: { clip: 'navigate', gain: 0.4, gap: 40, jitter: 0, pitch: 0, length: 1 },
  train: { clip: 'power-up', gain: 0.6, gap: 60, jitter: 0, pitch: 0, length: 1 },
  levelUp: { clip: 'fanfare', gain: 0.75, gap: 400, jitter: 0, pitch: 0, length: 1 },
  empower: { clip: 'power-up', gain: 0.6, gap: 60, jitter: 0, pitch: 0, length: 1 },
  learn: { clip: 'power-up', gain: 0.6, gap: 60, jitter: 0, pitch: 0, length: 1 },
  craft: { clip: 'power-up', gain: 0.6, gap: 60, jitter: 0, pitch: 0, length: 1 },
  recruit: { clip: 'fanfare', gain: 0.75, gap: 400, jitter: 0, pitch: 0, length: 1 },
  unlock: { clip: 'fanfare', gain: 0.75, gap: 400, jitter: 0, pitch: 0, length: 1 },
  eventStart: { clip: null, gain: 0.7, gap: 400, jitter: 0, pitch: 0, length: 1 },
  eventWon: { clip: 'fanfare', gain: 0.75, gap: 400, jitter: 0, pitch: 0, length: 1 },
  guardianAppears: { clip: null, gain: 0.8, gap: 1000, jitter: 0, pitch: 0, length: 1 },
  guardianEscapes: { clip: 'defeat', gain: 0.9, gap: 1000, jitter: 0, pitch: 0, length: 1 },
  gearDrop: { clip: 'coin', gain: 0.5, gap: 150, jitter: 0, pitch: 0, length: 1 },
  kill: { clip: 'kill', gain: 0.35, gap: 110, jitter: 0.12, pitch: 0, length: 1 },
  guardianKill: { clip: 'boss-kill', gain: 0.85, gap: 300, jitter: 0, pitch: 0, length: 1 },
  tap: { clip: 'zap', gain: 0.3, gap: 120, jitter: 0.08, pitch: 0, length: 1 },
  explosion: { clip: 'explosion', gain: 0.8, gap: 140, jitter: 0.1, pitch: 0, length: 1 },
  block: { clip: 'block', gain: 0.55, gap: 150, jitter: 0.06, pitch: 0, length: 1 },
  stunned: { clip: 'hurt', gain: 0.7, gap: 400, jitter: 0, pitch: 0, length: 1 },
  allyStunned: { clip: 'hurt-ally', gain: 0.5, gap: 300, jitter: 0.06, pitch: 0, length: 1 },
};
