import type { AreaId } from '../core/balance';
import { whenAudioStarts } from './sound';

/**
 * Background music: looping tracks in public/music (rendered from the MIDI pack, each cut to exactly one loop
 * with its reverb tail folded back onto the start, so it loops without a seam). Each area has its own track, a
 * Guardian Challenge a battle theme (harder ones for later areas, and the Time Eater its own), and a swarm a
 * goofy chase. Changing track crossfades. A decoded track takes ~20 MB, so only the playing track and the one
 * fading out are kept.
 */
export type TrackId =
  | 'woodForestTown'
  | 'spiritForest'
  | 'maliciousScheme'
  | 'hiddenCavern'
  | 'dangerousCave'
  | 'volcanicCrater'
  | 'dwarvenMine'
  | 'longJourney'
  | 'travelingTheSky'
  | 'royalCastle'
  | 'darkFactory'
  | 'demonKingCastle'
  | 'battleTheme'
  | 'battleTheme2'
  | 'battleTheme3'
  | 'battleTheme4'
  | 'theEvilOne'
  | 'goofyMonster';

/** Each track's file and loop length in seconds (from its MIDI: the last note, to the nearest half beat). */
const TRACKS: Record<TrackId, { file: string; loop: number }> = {
  woodForestTown: { file: 'wood-forest-town', loop: 59.4286 },
  spiritForest: { file: 'spirit-forest', loop: 81.2903 },
  maliciousScheme: { file: 'malicious-scheme', loop: 71.2088 },
  hiddenCavern: { file: 'hidden-cavern', loop: 81.8182 },
  dangerousCave: { file: 'dangerous-cave', loop: 79.2857 },
  volcanicCrater: { file: 'volcanic-crater', loop: 85.5445 },
  dwarvenMine: { file: 'dwarven-mine', loop: 50.7692 },
  longJourney: { file: 'long-journey', loop: 45.6923 },
  travelingTheSky: { file: 'traveling-the-sky', loop: 70.073 },
  royalCastle: { file: 'royal-castle', loop: 77.1428 },
  darkFactory: { file: 'dark-factory', loop: 62.8038 },
  demonKingCastle: { file: 'demon-king-castle', loop: 90 },
  battleTheme: { file: 'battle-theme', loop: 60.8219 },
  battleTheme2: { file: 'battle-theme-2', loop: 46.4189 },
  battleTheme3: { file: 'battle-theme-3', loop: 85.0485 },
  battleTheme4: { file: 'battle-theme-4', loop: 85.2175 },
  theEvilOne: { file: 'the-evil-one', loop: 82.649 },
  goofyMonster: { file: 'goofy-monster', loop: 32 },
};

/** Each area's own track. */
export const AREA_MUSIC: Record<AreaId, TrackId> = {
  forest: 'woodForestTown',
  glade: 'spiritForest',
  graveyard: 'maliciousScheme',
  crypt: 'hiddenCavern',
  depths: 'dangerousCave',
  caves: 'volcanicCrater',
  mines: 'dwarvenMine',
  peaks: 'longJourney',
  cliffs: 'travelingTheSky',
  fortress: 'royalCastle',
  meteors: 'darkFactory',
  rift: 'demonKingCastle',
};

/** Each area's Guardian Challenge: the battle themes grow fiercer through the areas; the Time Eater has its own. */
export const GUARDIAN_MUSIC: Record<AreaId, TrackId> = {
  forest: 'battleTheme',
  glade: 'battleTheme',
  graveyard: 'battleTheme',
  crypt: 'battleTheme2',
  depths: 'battleTheme2',
  caves: 'battleTheme2',
  mines: 'battleTheme3',
  peaks: 'battleTheme3',
  cliffs: 'battleTheme3',
  fortress: 'battleTheme4',
  meteors: 'battleTheme4',
  rift: 'theEvilOne',
};

/** A swarm event's track. */
export const SWARM_MUSIC: TrackId = 'goofyMonster';

/** Music's gain at full volume: it sits under the sound effects. */
const MAX_GAIN = 0.6;
const FADE_SEC = 1.5;

/** Music volume, 0 (off) to 1 (Settings: Audio and Music together). */
let volume = 0.56;
let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
/** The track that should be playing, and the one that is. */
let wanted: TrackId | null = null;
let playing: { id: TrackId; src: AudioBufferSourceNode; gain: GainNode } | null = null;
const buffers = new Map<TrackId, AudioBuffer>();
const loading = new Set<TrackId>();
/** Tracks fading out (kept until they've stopped). */
const fading = new Set<TrackId>();

export function setMusicVolume(v: number): void {
  volume = v;
  if (bus && ctx) bus.gain.setTargetAtTime(v * MAX_GAIN, ctx.currentTime, 0.05);
  update();
}

/** Asks for a track (or silence); it plays once audio has started and the track has loaded. */
export function playMusic(id: TrackId | null): void {
  if (id === wanted) return;
  wanted = id;
  update();
}

whenAudioStarts((c) => {
  ctx = c;
  bus = c.createGain();
  bus.gain.value = volume * MAX_GAIN;
  bus.connect(c.destination);
  update();
});

function update(): void {
  if (!ctx || !bus) return;
  const id = volume <= 0 ? null : wanted;
  if (playing?.id === id) return;
  if (!id) return fadeOut();
  const buf = buffers.get(id);
  if (!buf) return load(id);
  fadeOut();
  const src = ctx.createBufferSource();
  src.buffer = buf;
  // Some decoders add a few ms of silence at the start: loop from the first sound, exactly one loop long.
  const lead = leadIn(buf);
  src.loop = true;
  src.loopStart = lead;
  src.loopEnd = Math.min(buf.duration, lead + TRACKS[id].loop);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_SEC);
  src.connect(gain).connect(bus);
  src.start(0, lead);
  playing = { id, src, gain };
  // Keep only what's playing and what's fading out.
  for (const k of buffers.keys()) if (k !== id && !fading.has(k)) buffers.delete(k);
}

function fadeOut(): void {
  if (!playing || !ctx) return;
  const { id, src, gain } = playing;
  playing = null;
  fading.add(id);
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_SEC);
  src.stop(ctx.currentTime + FADE_SEC + 0.05);
  src.onended = () => {
    gain.disconnect();
    fading.delete(id);
    if (playing?.id !== id) buffers.delete(id);
  };
}

function load(id: TrackId): void {
  if (loading.has(id) || !ctx) return;
  loading.add(id);
  fetch(`${import.meta.env.BASE_URL}music/${TRACKS[id].file}.mp3`)
    .then((r) => r.arrayBuffer())
    .then((data) => ctx!.decodeAudioData(data))
    .then((buf) => {
      loading.delete(id);
      // Only keep it if it's still wanted (the player may have moved on while it loaded).
      if (wanted !== id) return;
      buffers.set(id, buf);
      update();
    })
    .catch(() => loading.delete(id));
}

/** Seconds of decoder padding before the first sound (at most ~0.06s; the tracks start on a note). */
function leadIn(buf: AudioBuffer): number {
  const d = buf.getChannelData(0);
  const max = Math.min(d.length, Math.round(buf.sampleRate * 0.06));
  for (let i = 0; i < max; i++) if (Math.abs(d[i]) > 1e-4) return i / buf.sampleRate;
  return 0;
}
