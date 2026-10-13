import type { MinigameApi, MinigameGame } from './shell';
import { roundRect } from './shell';
import { HUNTER_SHEETS } from '../../render/hunterSheets';
import { SHEETS, sheetRow } from '../../render/monsterSheets';
import { hunterSheetImage, monsterSheetImage } from '../../render/sprites';

/**
 * Alias's Grave Robbing (the Restless Graveyard): Alias creeps between nine headstones in a 3×3 grid, moved one
 * spot at a time with the four arrows of a D-pad. Loot turns up at the graves (1 point, a golden urn 3): step onto
 * it to grab it before it sinks back. The ground cracks and shakes where a skeleton is about to burst up; be
 * standing there when it does and it costs a heart. Faster and busier as the clock runs down; sixty seconds.
 */

export const GR_TIME = 60;
/** Just the ground's small details (weeds, cracks, little bones): the graves are the game's own. */
export const GR_DECOR = { bands: 1, density: 0.6 };
export const GR_INTRO = `<p>Move Alias between the graves with the <b>arrows</b>. Step onto loot to grab it: 1 point, a golden urn 3.</p><p>Where the ground <b>cracks and shakes</b>, a skeleton is about to burst out: be standing there and it costs a heart. You have ${GR_TIME} seconds.</p>`;

/** The Graveyard's headstones, one per spot. */
const STONES = ['grave1', 'grave3', 'grave4', 'grave2', 'grave5', 'grave6', 'grave4', 'grave1', 'grave3'];
const stoneImgs = new Map<string, HTMLImageElement>();
function stone(name: string): HTMLImageElement {
  let img = stoneImgs.get(name);
  if (!img) {
    img = new Image();
    img.src = `${import.meta.env.BASE_URL}backgrounds/graveyard/${name}.png`;
    stoneImgs.set(name, img);
  }
  return img;
}

/** Seconds of warning (cracks and shaking ground) before a skeleton bursts, and how long it stays up. */
const RISE = 0.12;
const UP = 0.7;
const SINK = 0.25;

interface Burst {
  spot: number;
  /** Seconds until it bursts (warning while > 0), then seconds since. */
  t: number;
  warn: number;
  /** It already caught Alias. */
  hit: boolean;
}

interface Loot {
  spot: number;
  gold: boolean;
  life: number;
}

interface Dirt {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  size: number;
  color: string;
}

type Dir = 'up' | 'down' | 'left' | 'right';
const DIRS: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function graveRobbing(api: MinigameApi): MinigameGame {
  let at = 4;
  /** Where Alias is walking from (for the slide between spots), and how far along. */
  let from = 4;
  let slide = 1;
  let facing: Dir = 'down';
  const pressed: Record<Dir, number> = { up: 0, down: 0, left: 0, right: 0 };
  const bursts: Burst[] = [];
  const loot: Loot[] = [];
  const dirt: Dirt[] = [];
  let burstIn = 1.2;
  let lootIn = 0.4;

  const grid = () => {
    const top = 96;
    const bottom = api.H - 210 * api.k;
    const size = Math.min(api.W / 3.2, (bottom - top) / 3);
    return { size, x0: (api.W - size * 3) / 2, y0: top + (bottom - top - size * 3) / 2 };
  };
  /** Where Alias stands at a spot (in front of its headstone). */
  const spotAt = (i: number) => {
    const c = grid();
    return { x: c.x0 + (i % 3) * c.size + c.size / 2, y: c.y0 + Math.floor(i / 3) * c.size + c.size * 0.78 };
  };
  const pad = () => ({ x: api.W / 2, y: api.H - 105 * api.k, b: 52 * api.k });
  const buttonAt = (d: Dir) => {
    const p = pad();
    const [dx, dy] = DIRS[d];
    return { x: p.x + dx * p.b * 1.08, y: p.y + dy * p.b * 1.08 };
  };

  const kickDirt = (x: number, y: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const sp = (60 + Math.random() * 140) * api.k;
      dirt.push({ x: x + (Math.random() - 0.5) * 20 * api.k, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, size: (2 + Math.random() * 3) * api.k, color: Math.random() < 0.5 ? '#5a4630' : '#3a2c1e' });
    }
  };

  const move = (d: Dir) => {
    pressed[d] = 0.12;
    facing = d;
    const [dx, dy] = DIRS[d];
    const col = (at % 3) + dx;
    const row = Math.floor(at / 3) + dy;
    if (col < 0 || col > 2 || row < 0 || row > 2) return;
    from = at;
    at = row * 3 + col;
    slide = 0;
    // Loot here is grabbed as Alias arrives.
    for (let i = loot.length - 1; i >= 0; i--)
      if (loot[i].spot === at) {
        const p = spotAt(at);
        api.addScore(loot[i].gold ? 3 : 1, p.x, p.y - grid().size * 0.5);
        loot.splice(i, 1);
      }
  };

  /** A skeleton that's out of the ground (bursting or up) at a spot. */
  const upAt = (spot: number) => bursts.find((b) => b.spot === spot && b.t >= 0 && b.t < RISE + UP);

  return {
    tap(x, y) {
      const p = pad();
      let best: Dir | null = null;
      let bestD = p.b * 0.75;
      for (const d of Object.keys(DIRS) as Dir[]) {
        const b = buttonAt(d);
        const dist = Math.hypot(x - b.x, y - b.y);
        if (dist < bestD) {
          bestD = dist;
          best = d;
        }
      }
      if (best) move(best);
    },
    step(dt) {
      if (api.t >= GR_TIME) {
        api.end();
        return;
      }
      slide = Math.min(1, slide + dt / 0.1);
      for (const d of Object.keys(pressed) as Dir[]) pressed[d] = Math.max(0, pressed[d] - dt);

      // New skeletons: more at once and less warning as time goes on, but never every grave.
      burstIn -= dt;
      if (burstIn <= 0) {
        const busy = new Set(bursts.map((b) => b.spot));
        const free = [...Array(9).keys()].filter((i) => !busy.has(i));
        const many = Math.min(4, 1 + Math.floor(api.t / 15));
        for (let n = 0; n < many && free.length > 1; n++) {
          // Often right where Alias is, so standing still isn't safe.
          const pick = n === 0 && free.includes(at) && Math.random() < 0.45 ? at : free[Math.floor(Math.random() * free.length)];
          free.splice(free.indexOf(pick), 1);
          const warn = Math.max(0.55, 1.1 - api.t * 0.009);
          bursts.push({ spot: pick, t: -warn, warn, hit: false });
        }
        burstIn = Math.max(0.6, 1.6 - api.t * 0.016) * (0.8 + Math.random() * 0.4);
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        const before = b.t;
        b.t += dt;
        // The ground trembles before it breaks: a few clods hop up, more as it nears.
        if (b.t < 0 && Math.random() < (1 - -b.t / b.warn) * dt * 30) {
          const p = spotAt(b.spot);
          kickDirt(p.x, p.y, 1);
        }
        if (before < 0 && b.t >= 0) {
          const p = spotAt(b.spot);
          kickDirt(p.x, p.y, 14);
        }
        // Caught: Alias is on the spot while the skeleton is out.
        if (!b.hit && b.t >= 0 && b.t < RISE + UP && at === b.spot && slide >= 0.5) {
          b.hit = true;
          const p = spotAt(b.spot);
          api.loseLife(p.x, p.y - grid().size * 0.4);
        }
        if (b.t >= RISE + UP + SINK) bursts.splice(i, 1);
      }

      // Loot turns up at a grave nobody's bursting from (one or two at a time), and sinks back after a while.
      lootIn -= dt;
      if (lootIn <= 0 && loot.length < 2) {
        const taken = new Set([at, ...loot.map((l) => l.spot), ...bursts.map((b) => b.spot)]);
        const free = [...Array(9).keys()].filter((i) => !taken.has(i));
        if (free.length) loot.push({ spot: free[Math.floor(Math.random() * free.length)], gold: Math.random() < 0.18, life: Math.max(2, 3.6 - api.t * 0.025) });
        lootIn = 0.5 + Math.random() * 0.7;
      }
      for (let i = loot.length - 1; i >= 0; i--) {
        loot[i].life -= dt;
        // A skeleton bursting through it scatters it.
        if (loot[i].life <= 0 || upAt(loot[i].spot)) loot.splice(i, 1);
      }
      for (const d of dirt) {
        d.t += dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += 520 * api.k * dt;
      }
      for (let i = dirt.length - 1; i >= 0; i--) if (dirt[i].t > 0.7) dirt.splice(i, 1);
    },
    draw(g) {
      const c = grid();
      g.imageSmoothingEnabled = false;
      // The clock
      const left = Math.max(0, GR_TIME - api.t);
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(16, 64, api.W - 32, 10);
      g.fillStyle = left < 10 ? '#ff6a6a' : '#e8dcc0';
      g.fillRect(16, 64, (api.W - 32) * (left / GR_TIME), 10);

      // Each grave, back row first: a patch of dug earth and its headstone behind it.
      const draws: Array<{ y: number; draw: () => void }> = [];
      for (let i = 0; i < 9; i++) {
        const p = spotAt(i);
        const b = bursts.find((x) => x.spot === i);
        // Warning: the earth shakes and cracks, more as the burst nears.
        const warning = b && b.t < 0 ? 1 - -b.t / b.warn : 0;
        const shake = warning > 0 ? Math.sin(api.t * 60 + i) * warning * 3 * api.k : 0;
        g.fillStyle = 'rgba(30,22,14,0.55)';
        g.beginPath();
        g.ellipse(p.x + shake, p.y, c.size * 0.32, c.size * 0.12, 0, 0, Math.PI * 2);
        g.fill();
        if (warning > 0) {
          g.strokeStyle = `rgba(20,12,6,${0.4 + warning * 0.6})`;
          g.lineWidth = Math.max(1.5, 2 * api.k);
          g.beginPath();
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2 + i;
            const len = c.size * (0.1 + warning * 0.18);
            g.moveTo(p.x + shake, p.y);
            g.lineTo(p.x + shake + Math.cos(a) * len, p.y + Math.sin(a) * len * 0.4);
          }
          g.stroke();
        }
        const img = stone(STONES[i]);
        if (img.complete && img.naturalWidth) {
          // Whole pixels, the stone about two fifths of a spot tall.
          const px = Math.max(1, Math.round((c.size * 0.42) / img.naturalHeight));
          draws.push({ y: p.y - c.size * 0.2, draw: () => g.drawImage(img, Math.round(p.x - (img.naturalWidth * px) / 2), Math.round(p.y - c.size * 0.16 - img.naturalHeight * px), img.naturalWidth * px, img.naturalHeight * px) });
        }
      }

      // Loot waiting at its grave.
      for (const l of loot) {
        const p = spotAt(l.spot);
        const bob = Math.sin(api.t * 6 + l.spot) * 2 * api.k;
        const fade = Math.min(1, l.life / 0.5);
        draws.push({
          y: p.y - 1,
          draw: () => {
            if (l.gold) {
              g.globalAlpha = 0.5 * fade;
              g.fillStyle = '#ffd34d';
              g.beginPath();
              g.arc(p.x, p.y - c.size * 0.12 + bob, c.size * 0.2, 0, Math.PI * 2);
              g.fill();
            }
            api.icon(l.gold ? 'things/057' : 'resources1/012', p.x, p.y - c.size * 0.12 + bob, c.size * 0.36, fade);
            g.globalAlpha = 1;
          },
        });
      }

      // Skeletons: the top half rises out of the ground (clipped at it), stays a moment, then sinks.
      const skSheet = SHEETS.skeleton;
      const skImg = monsterSheetImage('skeleton');
      for (const b of bursts) {
        if (b.t < 0 || !skSheet || !skImg || !skImg.complete) continue;
        const p = spotAt(b.spot);
        const rise = b.t < RISE ? b.t / RISE : b.t < RISE + UP ? 1 : 1 - (b.t - RISE - UP) / SINK;
        draws.push({
          y: p.y + 0.5,
          draw: () => {
            const [bx, by, bw, bh] = skSheet.box;
            const k = (c.size * 0.72) / bh;
            const F = skSheet.frame;
            const col = Math.floor(b.t * 10) % skSheet.cols;
            const fullH = bh * k;
            // Feet start just under the ground; at its peak, its top half (head, ribs and sword arm) is up.
            const feetY = p.y + fullH * (1 - rise * 0.72);
            g.save();
            g.beginPath();
            g.rect(p.x - c.size, p.y - c.size * 2, c.size * 2, c.size * 2);
            g.clip();
            g.imageSmoothingEnabled = false;
            g.drawImage(skImg, col * F, sheetRow(skSheet, 'D') * F, F, F, p.x - (bx + bw / 2) * k, feetY - (by + bh) * k, F * k, F * k);
            g.restore();
            // A lip of dirt round it.
            g.fillStyle = '#3a2c1e';
            g.beginPath();
            g.ellipse(p.x, p.y + c.size * 0.02, c.size * 0.24 * Math.max(0.4, rise), c.size * 0.045, 0, 0, Math.PI * 2);
            g.fill();
          },
        });
      }

      // Alias, sliding between spots.
      const a = spotAt(at);
      const f0 = spotAt(from);
      const e = 1 - (1 - slide) ** 2;
      const ax = f0.x + (a.x - f0.x) * e;
      const ay = f0.y + (a.y - f0.y) * e;
      draws.push({
        y: ay + 0.25,
        draw: () => {
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.beginPath();
          g.ellipse(ax, ay, c.size * 0.2, c.size * 0.07, 0, 0, Math.PI * 2);
          g.fill();
          const sheet = HUNTER_SHEETS.thief;
          const img = hunterSheetImage('thief');
          if (sheet && img && img.complete && img.naturalWidth) {
            g.imageSmoothingEnabled = false;
            const row = { down: 0, left: 1, right: 2, up: 3 }[facing];
            const F = sheet.frame;
            const col = Math.floor(api.t * 8) % sheet.frames[row];
            const [bx, by, bw, bh] = sheet.box;
            const k = (c.size * 0.7) / Math.max(bw, bh);
            g.drawImage(img, col * F, row * F, F, F, ax - (bx + bw / 2) * k, ay - (by + bh) * k, F * k, F * k);
          }
        },
      });
      draws.sort((x, y) => x.y - y.y);
      for (const d of draws) d.draw();

      for (const d of dirt) {
        g.globalAlpha = Math.max(0, 1 - d.t / 0.7);
        g.fillStyle = d.color;
        g.fillRect(Math.round(d.x), Math.round(d.y), d.size, d.size);
      }
      g.globalAlpha = 1;

      // The D-pad.
      const p = pad();
      roundRect(g, p.x - p.b * 1.7, p.y - p.b * 1.7, p.b * 3.4, p.b * 3.4, p.b * 0.6);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fill();
      for (const d of Object.keys(DIRS) as Dir[]) {
        const b = buttonAt(d);
        const s = p.b * (pressed[d] > 0 ? 0.92 : 1);
        roundRect(g, b.x - s / 2, b.y - s / 2, s, s, s * 0.22);
        g.fillStyle = pressed[d] > 0 ? '#c8bca0' : '#e8dcc0';
        g.fill();
        g.strokeStyle = '#3a2c1e';
        g.lineWidth = 3;
        g.stroke();
        const [dx, dy] = DIRS[d];
        const r = s * 0.24;
        g.fillStyle = '#3a2c1e';
        g.beginPath();
        g.moveTo(b.x + dx * r, b.y + dy * r);
        g.lineTo(b.x - dx * r * 0.6 - dy * r, b.y - dy * r * 0.6 + dx * r);
        g.lineTo(b.x - dx * r * 0.6 + dy * r, b.y - dy * r * 0.6 - dx * r);
        g.closePath();
        g.fill();
      }
    },
  };
}
