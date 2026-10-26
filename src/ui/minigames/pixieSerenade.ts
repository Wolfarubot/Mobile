import type { MinigameApi, MinigameGame } from './shell';
import { mgArt } from './dpad';
import { HUNTER_SHEETS } from '../../render/hunterSheets';
import { SHEETS } from '../../render/monsterSheets';
import { hunterSheetImage, monsterSheetImage } from '../../render/sprites';
import { drawFramedBar } from '../../render/hudBars';
import { MINIGAME_MUSIC, musicClock, setMusicRate, trackBeat } from '../music';

/**
 * Ba'al's Pixie Serenade (the Fey Grove): pixies fly down three cobbled paths, each reaching the bar on a beat of
 * Ba'al's song, which slowly speeds up (and the pixies come more often: every other beat, then every beat, then
 * off-beats too). Tap a path as its pixie reaches the small bar across it: 1 point anywhere on the blue cobbles
 * round it, 2 right on the bar. A pixie
 * that slips past, or a tap on a path with no pixie there, costs a heart. Everything on screen is from the asset
 * packs: the paths (CraftPix's path & road tileset), the bars (the event timers' framed bar) and the music notes (the
 * UI packs), the Grove's pixies and Ba'al, who plays from the corner. The Grove's trees and scenery keep to the sides.
 */

export const PS_INTRO = '<p>Pixies fly down three paths. <b>Tap a path</b> as its pixie reaches the <b>bar</b> across it: 1 point anywhere on the blue cobbles, 2 right on the bar.</p><p>A pixie that slips past, or a tap on an empty path, costs a heart.</p>';

/** The Grove behind it, with a clear column down the middle for the paths (trees and scenery at the sides only). */
export const PS_DECOR = { bands: 9, density: 1, clear: 0.7 };

/** Each path's colour, for the music notes a hit sends up from Ba'al's guitar. */
const COLORS = ['#ff8ad8', '#8ad8ff', '#c8ff8a'];
/** Ba'al's guitar. */
const GUITAR = 'instruments/092';

/** How wide the paths' cobbled road is, in their tiles' pixels (the tiles are widened to it). */
const ROAD = 30;

/** A path tile tinted toward a path's colour (its cobbles take on the bar's colour), made once per tile and colour. */
const tintedPaths = new Map<string, HTMLCanvasElement>();
function pathIn(name: string, color: string): HTMLCanvasElement | null {
  const img = mgArt(name);
  if (!img) return null;
  const key = `${name}:${color}`;
  let c = tintedPaths.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    // Keep the tile's own shape (multiply fills the transparent margin too).
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(img, 0, 0);
    tintedPaths.set(key, c);
  }
  return c;
}

/** The white music note (the platformer UI pack's), tinted a path's colour, made once per colour. */
const tinted = new Map<string, HTMLCanvasElement>();
function noteIn(color: string): HTMLCanvasElement | null {
  const img = mgArt('note');
  if (!img) return null;
  let c = tinted.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    tinted.set(color, c);
  }
  return c;
}

/** The song speeds up this much per second played, up to MAX_TEMPO times its own tempo. */
const TEMPO_RAMP = 0.0025;
const MAX_TEMPO = 1.3;

/**
 * Which half-beats get a pixie, by seconds played: every other beat to begin with, then most beats, every beat, and
 * more and more off-beats.
 */
function pixieOn(halfBeat: number, t: number): boolean {
  const onBeat = halfBeat % 2 === 0;
  if (t < 15) return halfBeat % 4 === 0;
  if (t < 35) return onBeat && (halfBeat % 4 === 0 || Math.random() < 0.5);
  if (t < 60) return onBeat;
  return onBeat || Math.random() < Math.min(0.35, (t - 60) * 0.006);
}

export function pixieSerenade(api: MinigameApi): MinigameGame {
  /** Each pixie reaches the bar at `at` (seconds into the song), falling `v` pixels per second of song. */
  const notes: Array<{ lane: number; y: number; at: number; v: number; hit: boolean; phase: number }> = [];
  const track = MINIGAME_MUSIC.pixieSerenade;
  const beat = trackBeat(track) ?? 0.6;
  /** Where the song is: the music's own clock while it plays, otherwise counted here (music off or loading). */
  let clock = 0;
  let tempo = 1;
  /** The next half-beat to place a pixie on (or not), once the song is known. */
  let nextHalf = -1;
  let lastLane = -1;
  let lastAt = -Infinity;
  /** Whether the clock is the song's (rather than counted here). */
  let onSong = false;
  const flash = [0, 0, 0];
  /** Notes floating up out of Ba'al's guitar after each hit. */
  const floaters: Array<{ x: number; y: number; vx: number; vy: number; t: number; color: string; sway: number }> = [];
  let strum = 0;
  /** Ba'al plays from the bottom-left corner, beside the paths. */
  const baal = () => ({ x: Math.max(34 * api.k, api.W * 0.12), y: api.H - 24 });
  const guitarAt = () => ({ x: baal().x + 6 * api.k, y: baal().y - 28 * api.k });
  const lineY = () => api.H - 150;
  /** The paths' pixel scale (the tiles are 48px wide), and how far apart they run (close together, in the middle). */
  const pathScale = () => Math.max(1, Math.round(Math.min(api.W, 480) / 200));
  const spacing = () => Math.round((ROAD + 10) * pathScale());
  const laneX = (i: number) => Math.round(api.W / 2 + (i - 1) * spacing());
  /** Pixels per second of song (the song itself speeding up makes them faster still). */
  const speed = () => Math.min(520, 200 + 4 * api.t) * api.k;
  /** The okay range either side of the ribbon (the blue cobbles)… */
  const window = () => 46 * api.k;
  /** …and the small framed bar across each path (twice its pixels): a pixie on it is perfect. */
  const BAR_S = 2;
  const bar = () => ({ w: Math.round((ROAD * pathScale()) / BAR_S), h: 12 });
  const perfect = () => (bar().h * BAR_S) / 2;

  /** Ba'al at the bottom, facing you, with the guitar across them (rocking as they strum). */
  const drawBaal = (g: CanvasRenderingContext2D) => {
    const b = baal();
    const sheet = HUNTER_SHEETS.bard;
    const img = hunterSheetImage('bard');
    g.imageSmoothingEnabled = false;
    if (sheet && img && img.complete && img.naturalWidth) {
      const F = sheet.frame;
      const col = Math.floor(api.t * 8) % sheet.frames[0];
      const [bx, by, bw, bh] = sheet.box;
      const k = (88 * api.k) / Math.max(bw, bh);
      g.drawImage(img, col * F, 0, F, F, b.x - (bx + bw / 2) * k, b.y + 4 - (by + bh) * k, F * k, F * k);
    }
    // The guitar in front of them, neck up to their left; it jolts with each strum.
    const at = guitarAt();
    g.save();
    g.translate(at.x, at.y);
    g.rotate(-0.15 + Math.sin(strum * 40) * strum * 0.5);
    api.icon(GUITAR, 0, 0, 58 * api.k);
    g.restore();
  };

  /**
   * One path, top to bottom of the screen, tinted its colour: the pale cobbles, with the darker blue cobbles over
   * the okay range. Tiled in whole pixels (brighter for a moment when tapped).
   */
  const drawPath = (g: CanvasRenderingContext2D, i: number) => {
    const lane = pathIn('path-lane', COLORS[i]);
    const ok = pathIn('path-lane-ok', COLORS[i]);
    if (!lane || !ok) return;
    const s = pathScale();
    const th = 48 * s;
    const y0 = Math.round(lineY() - window());
    const y1 = Math.round(lineY() + window());
    const at = (img: HTMLCanvasElement) => Math.round(laneX(i) - (img.width * s) / 2);
    if (flash[i] > 0) g.filter = 'brightness(1.25)';
    // Tiles run up from the okay range, so it always meets the pale path on a tile edge, and on off the top.
    for (let y = y0 - th; y > -th; y -= th) g.drawImage(lane, at(lane), y, lane.width * s, th);
    for (let y = y0; y < y1; y += th) {
      const h = Math.min(th, y1 - y);
      g.drawImage(ok, 0, 0, ok.width, h / s, at(ok), y, ok.width * s, h);
    }
    // On past the bottom of the screen (under the phone's bottom bar too).
    for (let y = y1; y < api.H + 160; y += th) g.drawImage(lane, at(lane), y, lane.width * s, th);
    g.filter = 'none';
  };

  return {
    tap(x) {
      // The nearest path (a tap well off to the side of them all does nothing).
      let lane = 0;
      for (let i = 1; i < 3; i++) if (Math.abs(x - laneX(i)) < Math.abs(x - laneX(lane))) lane = i;
      if (Math.abs(x - laneX(lane)) > spacing() * 0.9) return;
      flash[lane] = 0.15;
      let best: (typeof notes)[number] | null = null;
      for (const n of notes) if (!n.hit && n.lane === lane && Math.abs(n.y - lineY()) <= window() && (!best || Math.abs(n.y - lineY()) < Math.abs(best.y - lineY()))) best = n;
      if (!best) {
        api.loseLife(laneX(lane), lineY());
        return;
      }
      best.hit = true;
      const dead = Math.abs(best.y - lineY()) <= perfect();
      api.addScore(dead ? 2 : 1, laneX(lane), lineY());
      // Ba'al strums, and notes drift up out of the guitar (more for a perfect hit), to either side of Ba'al.
      strum = 0.25;
      const at = guitarAt();
      for (let i = 0; i < (dead ? 3 : 2); i++) {
        const side = i % 2 ? 1 : -1;
        floaters.push({ x: at.x + side * 22 * api.k, y: at.y + 6 * api.k, vx: side * (10 + Math.random() * 25) * api.k, vy: -(70 + Math.random() * 50) * api.k, t: 0, color: COLORS[lane], sway: Math.random() * 6 });
      }
    },
    step(dt) {
      // The song slowly speeds up.
      tempo = Math.min(MAX_TEMPO, 1 + TEMPO_RAMP * api.t);
      setMusicRate(tempo);
      const heard = musicClock(track);
      const half = beat / 2;
      if (heard && !onSong && nextHalf >= 0) {
        // The song has just started (it was still loading): move the pixies already flying onto its beats, by whole
        // half-beats, so they barely jump.
        const shift = Math.round((heard.pos - clock) / half);
        for (const n of notes) n.at += shift * half;
        nextHalf += shift;
        lastAt += shift * half;
      }
      onSong = !!heard;
      clock = heard ? heard.pos : clock + dt * tempo;
      // Pixies set off so each reaches the bar on its half-beat (as far ahead as the fall from the top takes).
      const v = speed();
      const fall = (lineY() + 20) / v;
      if (nextHalf < 0) nextHalf = Math.ceil((clock + fall) / half);
      for (; nextHalf * half <= clock + fall; nextHalf++) {
        if (!pixieOn(nextHalf, api.t)) continue;
        const at = nextHalf * half;
        // Not the same path twice in quick succession.
        let lane = Math.floor(Math.random() * 3);
        if (lane === lastLane && at - lastAt < beat * 0.75) lane = (lane + 1 + Math.floor(Math.random() * 2)) % 3;
        lastLane = lane;
        lastAt = at;
        notes.push({ lane, y: -20, at, v, hit: false, phase: Math.random() * 10 });
      }
      for (const n of notes) {
        n.y = lineY() - (n.at - clock) * n.v;
        n.phase += dt;
      }
      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        if (!n.hit && n.y > lineY() + window()) {
          n.hit = true;
          api.loseLife(laneX(n.lane), lineY());
        }
        if (n.hit || n.y > api.H + 30) notes.splice(i, 1);
      }
      for (let i = 0; i < 3; i++) flash[i] = Math.max(0, flash[i] - dt);
      strum = Math.max(0, strum - dt);
      for (const f of floaters) {
        f.t += dt;
        f.x += (f.vx + Math.sin((f.t + f.sway) * 5) * 22 * api.k) * dt;
        f.y += f.vy * dt;
      }
      for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].t > 1.4) floaters.splice(i, 1);
    },
    draw(g) {
      g.imageSmoothingEnabled = false;
      for (let i = 0; i < 3; i++) drawPath(g, i);
      // A small framed bar across each path, in its colour: the perfect spot.
      const b = bar();
      for (let i = 0; i < 3; i++) drawFramedBar(g, Math.round(laneX(i) - (b.w * BAR_S) / 2), Math.round(lineY() - (b.h * BAR_S) / 2), BAR_S, b.w, b.h, 1, COLORS[i]);
      // The pixies, fluttering down their paths (the Grove's pixie; facing alternate ways by path).
      const sheet = SHEETS.pixie;
      const img = monsterSheetImage('pixie');
      if (sheet && img.complete && img.naturalWidth) {
        const F = sheet.frame;
        const [bx, by, bw, bh] = sheet.box;
        const k = (56 * api.k) / Math.max(bw, bh);
        for (const n of notes) {
          const col = Math.floor(n.phase * 10) % sheet.cols;
          g.save();
          g.translate(laneX(n.lane) + Math.sin(n.phase * 4) * 4 * api.k, n.y);
          if (n.lane === 0) g.scale(-1, 1);
          g.drawImage(img, col * F, 0, F, F, -(bx + bw / 2) * k, -(by + bh / 2) * k, F * k, F * k);
          g.restore();
        }
      }
      drawBaal(g);
      // Music notes drifting up from the guitar, in the path's colour.
      const ns = Math.max(2, Math.round(3 * api.k));
      for (const f of floaters) {
        const c = noteIn(f.color);
        if (!c) continue;
        g.globalAlpha = Math.max(0, Math.min(1, (1.4 - f.t) / 0.5));
        g.drawImage(c, Math.round(f.x - (c.width * ns) / 2), Math.round(f.y - (c.height * ns) / 2), c.width * ns, c.height * ns);
      }
      g.globalAlpha = 1;
    },
  };
}
