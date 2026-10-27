import { canvasFont } from '../../render/fx';
import type { MinigameApi, MinigameGame } from './shell';

/**
 * Reginald's Clockwork Tower (the Ascendant Steps): a gear bar swings from side to side above the tower. Tap to drop
 * it; whatever hangs past the bar below is shaved off, so the bars get narrower. A drop that lands within a few
 * pixels of dead centre meshes perfectly: 2 points, and the bar grows back a little. A drop that misses the tower
 * altogether costs a heart (and the next bar comes down at the same width). Faster every few bars.
 */

export const CT_INTRO =
  "<p>Reginald is building a clockwork tower! A gear bar swings above it: <b>tap</b> to drop it on the stack.</p><p>Whatever hangs over the edge is shaved off, so line them up. Land one dead on the bar below for a <b>perfect mesh</b>: 2 points, and the bar grows back a little.</p><p>Missing the tower altogether costs a heart.</p>";

/** A cog (ab-engineer-psionic), turning in the corner. */
const CT_ICON = 'ab-engineer-psionic/001';
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
  let flash = 0;
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
      flash = 0.35;
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

  /** A gear bar: a brass band with teeth along the top and bottom, and a few rivets. */
  const drawBar = (g: CanvasRenderingContext2D, x: number, y: number, w: number, shade = 0) => {
    const hh = h();
    const tooth = 6 * k();
    const n = Math.max(1, Math.floor(w / (tooth * 2)));
    const step = w / n;
    g.fillStyle = shade ? '#9a7a3a' : '#c99a44';
    for (let i = 0; i < n; i++) {
      const tx = x - w / 2 + i * step + (step - tooth) / 2;
      g.fillRect(tx, y - hh - tooth * 0.5, tooth, tooth * 0.6);
      g.fillRect(tx, y - tooth * 0.1, tooth, tooth * 0.6);
    }
    const grad = g.createLinearGradient(0, y - hh, 0, y);
    grad.addColorStop(0, shade ? '#b8944c' : '#f0cb6a');
    grad.addColorStop(1, shade ? '#6e5426' : '#a87828');
    g.fillStyle = grad;
    g.fillRect(x - w / 2, y - hh, w, hh);
    g.strokeStyle = '#4a3410';
    g.lineWidth = 2;
    g.strokeRect(x - w / 2, y - hh, w, hh);
    g.fillStyle = '#5a4018';
    for (let i = 0; i < n; i += 2) g.fillRect(x - w / 2 + i * step + step / 2 - 2, y - hh / 2 - 2, 4, 4);
  };

  return {
    titleSuffix: () => `${stack.length - 1} bar${stack.length === 2 ? '' : 's'}`,
    tap() {
      if (falling) return;
      falling = { x: swing.x, y: barY(stack.length) - 150 * k(), w: swing.w, vy: 0 };
    },
    step(dt) {
      flash = Math.max(0, flash - dt);
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
      // The tower's plinth.
      const py = barY(0);
      g.fillStyle = 'rgba(40,46,70,0.85)';
      g.fillRect(api.W / 2 - api.W * 0.34, py, api.W * 0.68, 18 * k());
      for (let i = 0; i < stack.length; i++) {
        const y = barY(i + 1);
        if (y < -h() || y > api.H + h()) continue;
        drawBar(g, stack[i].x, y + h(), stack[i].w, i === stack.length - 1 ? 0 : 1);
      }
      if (flash > 0) {
        g.globalAlpha = flash / 0.35;
        g.fillStyle = '#ffe08a';
        const t = top();
        g.fillRect(t.x - t.w / 2 - 4, barY(stack.length) - 4, t.w + 8, h() + 8);
        g.globalAlpha = 1;
      }
      for (const c of chips) {
        g.save();
        g.translate(c.x, c.y);
        g.rotate(c.rot);
        g.globalAlpha = Math.max(0, 1 - c.t / 2);
        drawBar(g, 0, h() / 2, c.w, 1);
        g.restore();
      }
      // The swinging bar on its chain, or the one dropping.
      if (falling) drawBar(g, falling.x, falling.y + h(), falling.w);
      else {
        const sy = barY(stack.length) - 150 * k();
        g.strokeStyle = 'rgba(220,220,230,0.7)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(api.W / 2, sy - 90 * k());
        g.lineTo(swing.x, sy - h());
        g.stroke();
        drawBar(g, swing.x, sy, swing.w);
      }
      // Reginald, minding the works.
      api.icon(CT_ICON, api.W - 46 * k(), api.H - 64, 52 * k());
      g.font = canvasFont(Math.round(13 * k()), 700);
      g.textAlign = 'center';
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillText('Tap to drop', api.W / 2, api.H - 36);
    },
  };
}
