import type { AreaId } from '../../core/balance';
import { areaBackground, type DecorOpts } from '../../render/backgrounds';
import { gearImage } from '../../render/sprites';
import { canvasFont } from '../../render/fx';

/**
 * The frame every minigame runs in: a full-screen canvas over its area's painted background, a HUD (score, lives,
 * Quit), an intro card with Start, and a results card with Collect. A game only says how it steps, draws and
 * reacts to taps, and reports points and lost lives through the api.
 */

export interface MinigameApi {
  /** Screen size in CSS pixels, and a size factor (1 at a 400px-wide phone). */
  readonly W: number;
  readonly H: number;
  readonly k: number;
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
  /** Lives to start with (0: none shown; the game ends itself). */
  lives: number;
  best: number;
  /** Called on Start with the api; returns the running game. */
  create(api: MinigameApi): MinigameGame;
  /** When it's over: pays out and returns the results text (HTML). */
  onEnd(score: number): string;
  onClose(): void;
}

interface Pop {
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
    <div class="mg-hud"><span class="mg-score">0</span><span class="mg-lives"></span><button class="mg-quit">Quit</button></div>
    <div class="mg-intro"><div class="mg-card"><h2>${spec.title}</h2>${spec.intro}<p class="mg-best">${spec.best > 0 ? `Best: ${spec.best}` : ''}</p><button class="buy mg-go">Start</button></div></div>`;
  document.body.appendChild(root);
  const canvas = root.querySelector('canvas')!;
  const g = canvas.getContext('2d')!;
  const scoreEl = root.querySelector<HTMLElement>('.mg-score')!;
  const livesEl = root.querySelector<HTMLElement>('.mg-lives')!;

  let W = 0;
  let H = 0;
  let bg: HTMLCanvasElement | null = null;
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = root.clientWidth;
    H = root.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    bg = null;
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
      return Math.max(0.8, Math.min(1.6, W / 400));
    },
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
      if (x !== undefined && y !== undefined) api.pop(x, y, '−❤️', '#ff6a6a');
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
    box.innerHTML = `<div class="mg-card"><h2>All done!</h2><p class="mg-final">${score} point${score === 1 ? '' : 's'}</p>${text}<button class="buy mg-collect">Collect</button></div>`;
    root.appendChild(box);
    box.querySelector('.mg-collect')!.addEventListener('click', close);
  };
  let frame = 0;
  const close = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
    root.remove();
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
    const r = canvas.getBoundingClientRect();
    game.tap(e.clientX - r.left, e.clientY - r.top);
  });

  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (running && game) {
      t += dt;
      game.step(dt);
    }
    if (!bg) bg = areaBackground(spec.area, Math.round(W), Math.round(H), spec.decor);
    if (bg) g.drawImage(bg, 0, 0, W, H);
    else {
      g.fillStyle = '#2a3a2a';
      g.fillRect(0, 0, W, H);
    }
    if (game) {
      game.draw(g);
      // The game's title (its name, without the emoji), outlined so it reads over anything.
      const suffix = game.titleSuffix?.();
      const title = spec.title.replace(/^[^\p{L}]+/u, '').toUpperCase() + (suffix ? ` · ${suffix}` : '');
      g.font = canvasFont(Math.round(18 * api.k), 700);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 4;
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
      g.fillStyle = '#000';
      g.fillText(p.text, p.x + 1, p.y - 30 - p.t * 40 + 1);
      g.fillStyle = p.color;
      g.fillText(p.text, p.x, p.y - 30 - p.t * 40);
    }
    g.globalAlpha = 1;
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
