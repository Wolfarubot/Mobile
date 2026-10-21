import type { SoundLevel } from '../core/state';

/**
 * Sound effects: short retro clips from public/sfx, played through Web Audio at the volume picked in Settings.
 * Browsers (and phone web views) only allow audio after the player touches the screen, so the audio context is
 * started on the first press and the clips are loaded then; anything played before that is silently dropped.
 * Battlefield sounds can fire many times a second, so each sound has a minimum gap between plays, a little random
 * pitch so repeats don't grate, and a cap on how many play at once.
 */
export type SoundId =
  | 'click'
  | 'navigate'
  | 'coin'
  | 'powerUp'
  | 'fanfare'
  | 'kill'
  | 'bossKill'
  | 'explosion'
  | 'zap'
  | 'hurt'
  | 'hurtAlly'
  | 'block'
  | 'defeat';

interface SoundSpec {
  file: string;
  /** Loudness, before the Settings volume (evens out the clips' own levels). */
  gain: number;
  /** Least time between two plays, in ms: a play sooner than this is skipped. */
  gap: number;
  /** Random pitch spread (0.1 = up to 10% higher or lower). */
  jitter?: number;
}

const SOUNDS: Record<SoundId, SoundSpec> = {
  /** A button press. */
  click: { file: 'click', gain: 0.5, gap: 40 },
  /** Switching tabs or sub-tabs. */
  navigate: { file: 'navigate', gain: 0.4, gap: 40 },
  /** A piece of gear dropped. */
  coin: { file: 'coin', gain: 0.5, gap: 150 },
  /** Training, Empower, a skill or evolution node, crafting: anything that makes you stronger. */
  powerUp: { file: 'power-up', gain: 0.6, gap: 60 },
  /** The big moments: a level up, a Hunter recruited, an area or monster unlocked, an event won. */
  fanfare: { file: 'fanfare', gain: 0.75, gap: 400 },
  /** A monster slain. */
  kill: { file: 'kill', gain: 0.35, gap: 110, jitter: 0.12 },
  /** A Guardian slain. */
  bossKill: { file: 'boss-kill', gain: 0.85, gap: 300 },
  /** A fireball, a potion or an explosion going off. */
  explosion: { file: 'explosion', gain: 0.8, gap: 140, jitter: 0.1 },
  /** Your tap's blast. */
  zap: { file: 'zap', gain: 0.3, gap: 120, jitter: 0.08 },
  /** Your Hunter stunned. */
  hurt: { file: 'hurt', gain: 0.7, gap: 400 },
  /** A Guild Hunter stunned. */
  hurtAlly: { file: 'hurt-ally', gain: 0.5, gap: 300, jitter: 0.06 },
  /** A shield blocking a hit. */
  block: { file: 'block', gain: 0.55, gap: 150, jitter: 0.06 },
  /** A Guardian got away (a Guardian Challenge failed). */
  defeat: { file: 'defeat', gain: 0.9, gap: 1000 },
};

const VOLUME: Record<SoundLevel, number> = { off: 0, low: 0.35, medium: 0.7, high: 1 };
/** At most this many sounds at once. */
const MAX_VOICES = 8;

let level: SoundLevel = 'medium';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<SoundId, AudioBuffer>();
const lastPlayed = new Map<SoundId, number>();
let voices = 0;
/** Called once audio has started (the music player waits for it). */
const onStart: Array<(ctx: AudioContext) => void> = [];
/** When a sound other than a button click last played (a button that plays its own sound skips the click). */
let lastSpecial = -Infinity;

export function setSound(l: SoundLevel): void {
  level = l;
  if (master) master.gain.value = VOLUME[l];
}

/** Starts audio on the first press (browsers need a gesture) and loads the clips. Call once at startup. */
export function initSound(): void {
  const start = () => {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = VOLUME[level];
      master.connect(ctx.destination);
      for (const fn of onStart) fn(ctx);
      for (const [id, spec] of Object.entries(SOUNDS) as Array<[SoundId, SoundSpec]>) {
        fetch(`${import.meta.env.BASE_URL}sfx/${spec.file}.mp3`)
          .then((r) => r.arrayBuffer())
          .then((data) => ctx!.decodeAudioData(data))
          .then((buf) => buffers.set(id, buf))
          .catch(() => {});
      }
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  };
  document.addEventListener('pointerdown', start, true);
  // No sound while the app is in the background.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend().catch(() => {});
    else void ctx.resume().catch(() => {});
  });
}

/** Runs `fn` with the audio context once audio has started (right away if it already has). */
export function whenAudioStarts(fn: (ctx: AudioContext) => void): void {
  if (ctx) fn(ctx);
  else onStart.push(fn);
}

/** Plays a sound effect (or not: when sound is off, too soon after the last one, or too many are playing). */
export function sfx(id: SoundId, volume = 1): void {
  if (level === 'off' || !ctx || !master || ctx.state !== 'running' || document.hidden) return;
  const buf = buffers.get(id);
  if (!buf || voices >= MAX_VOICES) return;
  const spec = SOUNDS[id];
  const now = performance.now();
  if (now - (lastPlayed.get(id) ?? -Infinity) < spec.gap) return;
  lastPlayed.set(id, now);
  if (id !== 'click' && id !== 'navigate') lastSpecial = now;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (spec.jitter) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * spec.jitter;
  const gain = ctx.createGain();
  gain.gain.value = spec.gain * volume;
  src.connect(gain).connect(master);
  voices++;
  src.onended = () => {
    voices--;
    gain.disconnect();
  };
  src.start();
}

/**
 * A button's press sound, played just after the press is handled, so a button with its own sound (Train,
 * Empower, Craft...) plays only that one.
 */
export function pressSound(id: 'click' | 'navigate'): void {
  const at = performance.now();
  setTimeout(() => {
    if (lastSpecial < at) sfx(id);
  }, 0);
}
