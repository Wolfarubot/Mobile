import { canvasFont } from '../../render/fx';
import { drawFramedSegments } from '../../render/hudBars';
import { drawArt, drawBursts, drawHunter, stepBursts, type Burst } from './art';
import type { MinigameApi, MinigameGame } from './shell';

/**
 * Reginald's Clockwork Tower (the Ascendant Steps): a gear bar swings from side to side above the tower. Tap to drop
 * it; whatever hangs past the bar below is shaved off, so the bars get narrower. A drop that lands within a few
 * pixels of dead centre meshes perfectly: 2 points, and the bar grows back a little. A drop that misses the tower
 * altogether costs a heart (and the next bar comes down at the same width). Faster every few bars. All pack art:
 * each bar is the UI pack's framed bar in brass, the tower stands on the Ascendant Steps' floating island, a perfect
 * mesh gives off the puff effect, and Reginald watches from his idle animation.
 */

export const CT_INTRO =
  "<p>Reginald is building a clockwork tower! A gear bar swings above it: <b>tap</b> to drop it on the stack.</p><p>Whatever hangs over the edge is shaved off, so line them up. Land one dead on the bar below for a <b>perfect mesh</b>: 2 points, and the bar grows back a little.</p><p>Missing the tower altogether costs a heart.</p>";

/** The Ascendant Steps' floating island (public/backgrounds/cliffs), under the tower. */
const ISLAND = 'backgrounds/cliffs/island';
/** The bars' brass: the newest one bright, the ones below it darker. */
const BRASS = '#e0b050';
const BRASS_OLD = '#a8803a';
const BRASS_FRAME = '#c8a060';
const BAR_H = 22;
const START_W = 0.55;
/** How close (as a share of the bar's width) a drop must land to the one below to mesh perfectly. */
const PERFECT = 0.06;
const PERFECT_GROW = 0.05;

interface Bar {
  x: number;
  w: number;
}

interface Chip {
  x: number;
  y: number;
  w: number;
  vx: number;
  vy: number;
  rot: number;
  t: number;
}

export function clockworkTower(api: MinigameApi): MinigameGame {
  const k = () => api.k;
  const h = () => BAR_H * k();
  const base = () => api.H - 130;
  const stack: Bar[] = [{ x: api.W / 2, w: api.W * START_W }];
  const chips: Chip[] = [];
  let swing = { x: api.W / 2, dir: 1, w: api.W * START_W };
  let falling: { x: number; y: number; w: number; vy: number } | null = null;
  let camera = 0;
  const bursts: Burst[] = [];
  /** Swing speed: quicker every few bars. */
  const speed = () => (180 + Math.min(320, (stack.length - 1) * 14)) * k();
  /** Where a bar sits on screen (the camera follows the top of the tower). */
  const barY = (i: number) => base() - i * h() + camera;
  const top = () => stack[stack.length - 1];

  const land = () => {
    const f = falling!;
    falling = null;
    const below = top();
    const left = Math.max(f.x - f.w / 2, below.x - below.w / 2);
    const right = Math.min(f.x + f.w / 2, below.x + below.w / 2);
    const y = barY(stack.length);
    if (right - left <= 2 * k()) {
      // Missed the tower: it tumbles off.
      chips.push({ x: f.x, y, w: f.w, vx: (f.x < below.x ? -1 : 1) * 120, vy: -60, rot: 0, t: 0 });
      api.loseLife(f.x, y);
      swing = { x: f.x < api.W / 2 ? api.W * 0.85 : api.W * 0.15, dir: f.x < api.W / 2 ? -1 : 1, w: f.w };
      return;
    }
    const perfect = Math.abs(f.x - below.x) <= Math.max(3 * k(), f.w * PERFECT);
    let bar: Bar;
    if (perfect) {
      bar = { x: below.x, w: Math.min(api.W * START_W, f.w * (1 + PERFECT_GROW)) };
      bursts.push({ key: 'puff', x: bar.x, y: y - h() / 2, size: Math.max(60 * k(), bar.w * 0.8), t: 0, dur: 0.45 });
      api.addScore(2, bar.x, y - h());
      api.pop(bar.x, y - h() - 22 * k(), 'Perfect!', '#ffe08a');
    } else {
      bar = { x: (left + right) / 2, w: right - left };
      // The shaved-off piece falls away.
      const cutW = f.w - bar.w;
      const cutX = f.x > below.x ? right + cutW / 2 : left - cutW / 2;
      chips.push({ x: cutX, y, w: cutW, vx: (f.x > below.x ? 1 : -1) * 90, vy: -40, rot: 0, t: 0 });
      api.addScore(1, bar.x, y - h());
    }
    stack.push(bar);
    swing = { x: stack.length % 2 ? api.W * 0.12 : api.W * 0.88, dir: stack.length % 2 ? 1 : -1, w: bar.w };
  };

  /** A bar, its bottom centre at (x, y): the UI pack's framed bar (public/ui/timer-bar.png), its frame and slot in brass. */
  const drawBar = (g: CanvasRenderingContext2D, x: number, y: number, w: number, shade = 0) => {
    const s = Math.max(1, Math.round(k()));
    drawFramedSegments(g, x - w / 2, y - h(), s, w / s, h() / s, [[0, 1, shade ? BRASS_OLD : BRASS]], BRASS_FRAME);
  };

  return {
    titleSuffix: () => `${stack.length - 1} bar${stack.length === 2 ? '' : 's'}`,
    tap() {
      if (falling) return;
      falling = { x: swing.x, y: barY(stack.length) - 150 * k(), w: swing.w, vy: 0 };
    },
    step(dt) {
      stepBursts(bursts, dt);
      if (!falling) {
        swing.x += swing.dir * speed() * dt;
        const lim = swing.w / 2 + 4;
        if (swing.x > api.W - lim) {
          swing.x = api.W - lim;
          swing.dir = -1;
        } else if (swing.x < lim) {
          swing.x = lim;
          swing.dir = 1;
        }
      } else {
        falling.vy += 2600 * k() * dt;
        falling.y += falling.vy * dt;
        if (falling.y >= barY(stack.length)) land();
      }
      // The camera rises with the tower, keeping its top about two-fifths of the way down.
      const want = Math.max(0, stack.length * h() - (base() - api.H * 0.42));
      camera += (want - camera) * Math.min(1, dt * 5);
      for (let i = chips.length - 1; i >= 0; i--) {
        const c = chips[i];
        c.t += dt;
        c.vy += 1200 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.rot += (c.vx > 0 ? 3 : -3) * dt;
        if (c.t > 2) chips.splice(i, 1);
      }
    },
    draw(g) {
      // The floating island the tower stands on.
      const py = barY(0);
      drawArt(g, ISLAND, api.W / 2, py + api.W * 0.18, api.W * 0.42);
      for (let i = 0; i < stack.length; i++) {
        const y = barY(i + 1);
        if (y < -h() || y > api.H + h()) continue;
        drawBar(g, stack[i].x, y + h(), stack[i].w, i === stack.length - 1 ? 0 : 1);
      }
      drawBursts(g, bursts);
      for (const c of chips) {
        g.save();
        g.translate(c.x, c.y);
        g.rotate(c.rot);
        g.globalAlpha = Math.max(0, 1 - c.t / 2);
        drawBar(g, 0, h() / 2, c.w, 1);
        g.restore();
      }
      // The swinging bar, or the one dropping.
      if (falling) drawBar(g, falling.x, falling.y + h(), falling.w);
      else drawBar(g, swing.x, barY(stack.length) - 150 * k(), swing.w);
      // Reginald, minding the works.
      drawHunter(g, 'artificer', api.W - 40 * k(), api.H - 42, 56 * k(), api.t);
      g.font = canvasFont(Math.round(13 * k()), 700);
      g.textAlign = 'center';
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillText('Tap to drop', api.W / 2, api.H - 36);
    },
  };
}
