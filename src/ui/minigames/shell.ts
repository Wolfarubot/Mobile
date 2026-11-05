import { overrideMusic, setMusicRate, type TrackId } from '../music';
import { setBattleSfx } from '../sound';
import { buzz } from '../haptics';
import { holdOrientation, releaseOrientation } from '../orientation';
import type { AreaId } from '../../core/balance';
import { areaBackground, type DecorOpts } from '../../render/backgrounds';
import { gearImage } from '../../render/sprites';
import { mgArt } from './dpad';
import { canvasFont } from '../../render/fx';
import { tx, txt } from '../../core/textRegistry';

/**
 * The frame every minigame runs in: a full-screen canvas over its area's painted background, a HUD (score, lives,
 * Quit), an intro card with Start, and a results card with Collect. A game only says how it steps, draws and
 * reacts to taps, and reports points and lost lives through the api.
 */

/**
 * How a game lays out on a landscape screen (portrait is always the whole screen):
 * - wide: a stage as wide as the screen and about a portrait screen's height, drawn scaled to fit;
 * - center: a portrait-shaped stage in the middle, the area's background either side;
 * - split: the wide stage, with the D-pad on the handedness side and the game on the other half (dpad.ts).
 */
export type LandscapeLayout = 'wide' | 'center' | 'split';

export interface MinigameApi {
  /** The stage's size (the screen in portrait; see LandscapeLayout), and a size factor (1 at a 400px-wide phone). */
  readonly W: number;
  readonly H: number;
  readonly k: number;
  /** How the stage is laid out: 'portrait', or the game's landscape layout. */
  readonly layout: 'portrait' | LandscapeLayout;
  /** Settings → Handedness is left (the D-pad goes on the left in a split layout). */
  readonly leftHanded: boolean;
  /** Seconds since Start. */
  readonly t: number;
  readonly score: number;
  readonly lives: number;
  addScore(n: number, x?: number, y?: number): void;
  loseLife(x?: number, y?: number): void;
  /** A floating text that rises and fades. */
  pop(x: number, y: number, text: string, color: string): void;
  end(): void;
  /** An icon (public/icons/<pack>/<NNN>.png), drawn centred at (x, y), `size` across; false while it loads. */
  icon(key: string, x: number, y: number, size: number, alpha?: number): boolean;
}

export interface MinigameGame {
  step(dt: number): void;
  draw(g: CanvasRenderingContext2D): void;
  tap(x: number, y: number): void;
  /** The finger moving while it's down (after its tap), for games that follow it. */
  drag?(x: number, y: number): void;
  /** Shown after the game's title at the top (e.g. the time left). */
  titleSuffix?(): string;
}

/** Where the game's title sits, near the top; games keep their own art below `TITLE_Y + 14`. */
export const TITLE_Y = 72;

export interface MinigameSpec {
  title: string;
  /** The intro card's text (HTML). */
  intro: string;
  area: AreaId;
  /** A lighter background: only some of the area's decor (the game draws its own big objects). */
  decor?: DecorOpts;
  /**
   * A room to play in instead of the area (public/minigames/<room>.png, and <room>-wide.png on a landscape screen),
   * scaled up to cover the screen.
   */
  room?: string;
  /** Lives to start with (0: none shown; the game ends itself). */
  lives: number;
  best: number;
  /** Called on Start with the api; returns the running game. */
  create(api: MinigameApi): MinigameGame;
  /** When it's over: pays out and returns the results text (HTML). */
  onEnd(score: number): string;
  onClose(): void;
  /** Its own music while it's open. */
  music?: TrackId;
  /** How it lays out on a landscape screen (center if not given). */
  landscape?: LandscapeLayout;
}

/** A landscape stage's height in stage units: about a portrait phone's play area, scaled to the screen's height. */
const LAND_STAGE_H = 540;
/** A centred (portrait-shaped) stage's widest, in stage units. */
const LAND_CENTER_W = 440;
/** Room kept clear at each side of a centred stage, for a camera notch (as the main screen's). */
const LAND_EDGE = 28;

/** The pixel heart the HUD's lives use, also drawn in the pop when a life is lost. */
const HEART = new Image();
HEART.src = `${import.meta.env.BASE_URL}ui/heart.png`;

interface Pop {
  /** Draw the HUD heart after the text. */
  heart?: boolean;
  x: number;
  y: number;
  t: number;
  text: string;
  color: string;
}

export function runMinigame(spec: MinigameSpec): void {
  const root = document.createElement('div');
  root.className = 'minigame';
  root.innerHTML = `
    <canvas></canvas>
    <i class="mg-safe"></i>
    <div class="mg-hud"><span class="mg-score">0</span><span class="mg-lives"></span><button class="mg-quit">${tx('minigame.screen.quit')}</button></div>
    <div class="mg-intro"><div class="mg-card"><h2>${spec.title}</h2>${spec.intro}<p class="mg-best">${spec.best > 0 ? tx('minigame.screen.best', { score: spec.best }) : ''}</p><button class="buy mg-go">${tx('minigame.screen.start')}</button></div></div>`;
  document.body.appendChild(root);
  // The screen stays the way round it opened (portrait or landscape) until the game closes.
  holdOrientation();
  // Its own music, and quiet from the battlefield behind it.
  if (spec.music) overrideMusic(spec.music);
  setBattleSfx(false);
  const canvas = root.querySelector('canvas')!;
  const g = canvas.getContext('2d')!;
  const scoreEl = root.querySelector<HTMLElement>('.mg-score')!;
  const livesEl = root.querySelector<HTMLElement>('.mg-lives')!;

  /** The screen's width; the game's height is the screen above the phone's bottom bar (`full` runs under it). */
  let screenW = 0;
  let screenH = 0;
  let full = 0;
  /** The stage the game plays on (its own units), and where it's drawn: scaled by `scale`, `ox` in from the left. */
  let W = 0;
  let H = 0;
  let scale = 1;
  let ox = 0;
  let layout: MinigameApi['layout'] = 'portrait';
  const leftHanded = document.body.classList.contains('left-handed');
  let bg: HTMLCanvasElement | null = null;
  const safe = root.querySelector<HTMLElement>('.mg-safe')!;
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    screenW = root.clientWidth;
    full = root.clientHeight;
    screenH = full - safe.offsetHeight;
    canvas.width = Math.round(screenW * dpr);
    canvas.height = Math.round(full * dpr);
    canvas.style.width = `${screenW}px`;
    canvas.style.height = `${full}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    bg = null;
    if (screenW > screenH) {
      // Landscape: a stage about a portrait screen's height, scaled to fit. Wide and split stages run edge to
      // edge (the HUD keeps clear of a notch); a centred one keeps clear of it anyway.
      layout = spec.landscape ?? 'center';
      scale = screenH / LAND_STAGE_H;
      H = LAND_STAGE_H;
      W = layout === 'center' ? Math.min((screenW - LAND_EDGE * 2) / scale, LAND_CENTER_W) : screenW / scale;
      ox = (screenW - W * scale) / 2;
    } else {
      layout = 'portrait';
      W = screenW;
      H = screenH;
      scale = 1;
      ox = 0;
    }
  };
  resize();
  window.addEventListener('resize', resize);

  let score = 0;
  let lives = spec.lives;
  let t = 0;
  let running = false;
  let over = false;
  let game: MinigameGame | null = null;
  const pops: Pop[] = [];
  const setHud = () => {
    scoreEl.textContent = String(score);
    livesEl.innerHTML = spec.lives > 0 ? '<i class="mg-heart"></i>'.repeat(Math.max(0, lives)) + '<i class="mg-heart lost"></i>'.repeat(Math.max(0, spec.lives - lives)) : '';
  };
  setHud();

  const api: MinigameApi = {
    get W() {
      return W;
    },
    get H() {
      return H;
    },
    get k() {
      // Its width, or (on a short, wide stage) what a portrait screen of its height would be.
      return Math.max(0.8, Math.min(1.6, Math.min(W, H * 0.75) / 400));
    },
    get layout() {
      return layout;
    },
    leftHanded,
    get t() {
      return t;
    },
    get score() {
      return score;
    },
    get lives() {
      return lives;
    },
    addScore(n, x, y) {
      if (!running) return;
      score += n;
      setHud();
      if (x !== undefined && y !== undefined) api.pop(x, y, `+${n}`, '#9ff0a8');
    },
    loseLife(x, y) {
      if (!running) return;
      lives--;
      setHud();
      if (x !== undefined && y !== undefined) pops.push({ x, y, t: 0, text: '−', color: '#ff6a6a', heart: true });
      if (lives <= 0) end();
    },
    pop(x, y, text, color) {
      pops.push({ x, y, t: 0, text, color });
    },
    end: () => end(),
    icon(key, x, y, size, alpha = 1) {
      const img = gearImage(key);
      if (!img) return false;
      g.save();
      g.globalAlpha *= alpha;
      g.imageSmoothingEnabled = false;
      g.drawImage(img, x - size / 2, y - size / 2, size, size);
      g.restore();
      return true;
    },
  };

  const end = () => {
    if (over) return;
    over = true;
    running = false;
    const text = spec.onEnd(score);
    const box = document.createElement('div');
    box.className = 'mg-intro';
    box.innerHTML = `<div class="mg-card"><h2>${tx('minigame.screen.done')}</h2><p class="mg-final">${txt('minigame.screen.points', { n: score })}</p>${text}<button class="buy mg-collect">${tx('minigame.screen.collect')}</button></div>`;
    root.appendChild(box);
    box.querySelector('.mg-collect')!.addEventListener('click', close);
  };
  let frame = 0;
  const close = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
    root.remove();
    releaseOrientation();
    setMusicRate(1);
    overrideMusic(null);
    setBattleSfx(true);
    spec.onClose();
  };
  // Quit mid-round ends it (and pays what you've scored); before starting, it just closes.
  root.querySelector('.mg-quit')!.addEventListener('click', () => (running ? end() : over ? undefined : close()));
  root.querySelector('.mg-go')!.addEventListener('click', () => {
    root.querySelector('.mg-intro')!.remove();
    game = spec.create(api);
    running = true;
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (!running || !game) return;
    // A buzz for every tap in play (Settings → Haptics), as on the battlefield.
    buzz();
    const r = canvas.getBoundingClientRect();
    game.tap((e.clientX - r.left - ox) / scale, (e.clientY - r.top) / scale);
    held = e.pointerId;
  });
  // A finger held down and moving: games that follow it (Meteor Bounce's Norm) get each move.
  let held: number | null = null;
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== held || !running || !game?.drag) return;
    const r = canvas.getBoundingClientRect();
    game.drag((e.clientX - r.left - ox) / scale, (e.clientY - r.top) / scale);
  });
  for (const t of ['pointerup', 'pointercancel'] as const) canvas.addEventListener(t, (e) => e.pointerId === held && (held = null));

  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (running && game) {
      t += dt;
      game.step(dt);
    }
    // A scaled background is laid out bigger, then drawn shrunk to fit (everything in it smaller, further off).
    const bgScale = spec.decor?.scale ?? 1;
    const room = spec.room ? mgArt(screenW > full ? `${spec.room}-wide` : spec.room) : null;
    if (!spec.room && !bg) bg = areaBackground(spec.area, Math.round(screenW / bgScale), Math.round(full / bgScale), spec.decor);
    if (room) {
      const s = Math.max(screenW / room.naturalWidth, full / room.naturalHeight);
      const smooth = g.imageSmoothingEnabled;
      g.imageSmoothingEnabled = false;
      g.drawImage(room, Math.round((screenW - room.naturalWidth * s) / 2), Math.round((full - room.naturalHeight * s) / 2), Math.round(room.naturalWidth * s), Math.round(room.naturalHeight * s));
      g.imageSmoothingEnabled = smooth;
    } else if (bg) g.drawImage(bg, 0, 0, screenW, full);
    else {
      g.fillStyle = '#2a3a2a';
      g.fillRect(0, 0, screenW, full);
    }
    // The game draws on its stage: in landscape, scaled to the screen's height (and centred, when it's narrower).
    g.save();
    g.translate(ox, 0);
    g.scale(scale, scale);
    if (layout === 'center') {
      // A centred stage stands out a little from the background either side.
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(-6, 0, 6, full / scale);
      g.fillRect(W, 0, 6, full / scale);
    }
    // Nothing the game draws spills out past a centred stage's sides.
    if (layout === 'center') {
      g.beginPath();
      g.rect(0, 0, W, full / scale);
      g.clip();
    }
    if (game) {
      game.draw(g);
      // The game's title (its name, without the emoji), outlined so it reads over anything.
      const suffix = game.titleSuffix?.();
      const title = spec.title.replace(/^[^\p{L}]+/u, '').toUpperCase() + (suffix ? ` · ${suffix}` : '');
      g.font = canvasFont(Math.round(18 * api.k), 700);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 5;
      g.lineJoin = 'round';
      g.strokeStyle = '#000';
      g.strokeText(title, W / 2, TITLE_Y);
      g.fillStyle = '#9ff0a8';
      g.fillText(title, W / 2, TITLE_Y);
      g.textBaseline = 'alphabetic';
    }
    g.font = `bold ${Math.round(18 * api.k)}px monospace`;
    g.textAlign = 'center';
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      p.t += dt;
      if (p.t > 0.8) {
        pops.splice(i, 1);
        continue;
      }
      g.globalAlpha = 1 - p.t / 0.8;
      const py = p.y - 30 - p.t * 40;
      // A life lost: a minus and the HUD's heart side by side, centred together.
      const hw = p.heart ? Math.round(22 * api.k) : 0;
      const tw = g.measureText(p.text).width;
      const px = p.heart ? p.x - hw / 2 - 1 : p.x;
      g.fillStyle = '#000';
      g.fillText(p.text, px + 1, py + 1);
      g.fillStyle = p.color;
      g.fillText(p.text, px, py);
      if (p.heart && HEART.complete && HEART.naturalWidth) {
        const hh = (hw * HEART.naturalHeight) / HEART.naturalWidth;
        g.imageSmoothingEnabled = false;
        g.drawImage(HEART, Math.round(px + tw / 2 + 1), Math.round(py - hh * 0.8), hw, hh);
      }
    }
    g.globalAlpha = 1;
    g.restore();
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
}

/** Rounded panel helper for games that draw boards and buttons. */
export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
