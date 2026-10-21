/**
 * Sound effects: short retro clips from public/sfx, played through Web Audio at the volume set in Settings. Which
 * clip plays for each moment, and how loud, is in sfxConfig.ts (edited in the Sound Effects editor).
 * Browsers (and phone web views) only allow audio after the player touches the screen, so the audio context is
 * started on the first press and the clips are loaded then; anything played before that is silently dropped.
 * Battlefield sounds can fire many times a second, so each sound has a minimum gap between plays, a little random
 * pitch so repeats don't grate, and a cap on how many play at once.
 */
import { SFX, type SfxEvent } from './sfxConfig';
import { pitchRate, stretchFactor, timeStretch } from './stretch';

/** At most this many sounds at once. */
const MAX_VOICES = 8;

/** Overall sound effect volume, 0 (off) to 1 (Settings: Audio and Sound effects together). */
let volume = 0.64;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** Each moment's clip, decoded, and stretched for its pitch shift and length where it has one. */
const buffers = new Map<SfxEvent, AudioBuffer>();
const lastPlayed = new Map<SfxEvent, number>();
let voices = 0;
/** Called once audio has started (the music player waits for it). */
const onStart: Array<(ctx: AudioContext) => void> = [];
/** When a sound other than a button click last played (a button that plays its own sound skips the click). */
let lastSpecial = -Infinity;

export function setSfxVolume(v: number): void {
  volume = v;
  if (master) master.gain.value = v;
}

/** Starts audio on the first press (browsers need a gesture) and loads the clips. Call once at startup. */
export function initSound(): void {
  const start = () => {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      for (const fn of onStart) fn(ctx);
      for (const clip of new Set(Object.values(SFX).map((s) => s.clip))) {
        if (!clip) continue;
        fetch(`${import.meta.env.BASE_URL}sfx/${clip}.mp3`)
          .then((r) => r.arrayBuffer())
          .then((data) => ctx!.decodeAudioData(data))
          .then((buf) => {
            for (const [id, spec] of Object.entries(SFX) as Array<[SfxEvent, (typeof SFX)[SfxEvent]]>) if (spec.clip === clip) buffers.set(id, shaped(buf, spec.pitch, spec.length));
          })
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

/**
 * Plays the sound for a moment in the game (or not: when sound effects are off, the moment has no clip, it's too
 * soon after the last one, or too many are playing).
 */
export function sfx(id: SfxEvent): void {
  const spec = SFX[id];
  if (volume <= 0 || !spec.clip || !ctx || !master || ctx.state !== 'running' || document.hidden) return;
  const buf = buffers.get(id);
  if (!buf || voices >= MAX_VOICES) return;
  const now = performance.now();
  if (now - (lastPlayed.get(id) ?? -Infinity) < spec.gap) return;
  lastPlayed.set(id, now);
  if (id !== 'button' && id !== 'tab') lastSpecial = now;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = pitchRate(spec.pitch) * (1 + (Math.random() * 2 - 1) * spec.jitter);
  const gain = ctx.createGain();
  gain.gain.value = spec.gain;
  src.connect(gain).connect(master);
  voices++;
  src.onended = () => {
    voices--;
    gain.disconnect();
  };
  src.start();
}

/** A clip stretched so that, played at its pitch shift's rate, it comes out at `length` times as long. */
function shaped(buf: AudioBuffer, pitch: number, length: number): AudioBuffer {
  const factor = stretchFactor(pitch, length);
  if (Math.abs(factor - 1) < 1e-3 || !ctx) return buf;
  const chans = timeStretch(Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)), factor, buf.sampleRate);
  const out = ctx.createBuffer(chans.length, chans[0].length, buf.sampleRate);
  chans.forEach((ch, c) => out.getChannelData(c).set(ch));
  return out;
}

/**
 * A button's press sound, played just after the press is handled, so a button with its own sound (Train,
 * Empower, Craft...) plays only that one.
 */
export function pressSound(id: 'button' | 'tab'): void {
  const at = performance.now();
  setTimeout(() => {
    if (lastSpecial < at) sfx(id);
  }, 0);
}
