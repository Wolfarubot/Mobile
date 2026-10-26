/**
 * The shop's background: a market square from CraftPix's market pack (public/market/). Paved street, stalls with
 * their traders working behind them, a pair of buskers, and townsfolk who walk from stall to stall, stop to browse
 * for a while (facing the stall) and move on. They only ever walk up, down, left or right: each trip is a path
 * over a grid of 8px cells round the stalls, preferring long straight runs with few turns.
 */

const URL = `${import.meta.env.BASE_URL}market/`;
const images = new Map<string, HTMLImageElement>();
function img(name: string): HTMLImageElement {
  let i = images.get(name);
  if (!i) {
    i = new Image();
    i.src = `${URL}${name}.png`;
    images.set(name, i);
  }
  return i;
}
const ready = (i: HTMLImageElement) => i.complete && i.naturalWidth > 0;

/** A stall (or prop) standing with its bottom-left at (x, y - h); people stop at its front. */
interface Stall {
  file: string;
  x: number;
  y: number;
  /** A trader working at it: their sheet, frame size and count, and where they stand (feet), relative to the stall. */
  trader?: { file: string; fw: number; fh: number; frames: number; fps: number; dx: number; dy: number; behind?: boolean };
  /** Whether people come to browse here. */
  shop?: boolean;
}

/** An animated figure standing in place (a busker). */
interface Busker {
  file: string;
  fw: number;
  fh: number;
  frames: number;
  fps: number;
  x: number;
  y: number;
}

/** Walk and idle sheets: rows run down, left, right, up; 32px frames (6 walking, 12 idle). */
type Dir = 0 | 1 | 2 | 3;
const DOWN: Dir = 0;
const LEFT: Dir = 1;
const RIGHT: Dir = 2;
const UP: Dir = 3;
const STEP: Record<Dir, [number, number]> = { 0: [0, 1], 1: [-1, 0], 2: [1, 0], 3: [0, -1] };

interface Walker {
  sheet: number;
  x: number;
  y: number;
  dir: Dir;
  /** The rest of the trip, as cell centres to walk to in turn (each straight up, down, left or right of the last). */
  path: Array<[number, number]>;
  /** Seconds left browsing at a stall (facing it), or 0 while walking. */
  wait: number;
  at: number;
  t: number;
}

const CELL = 8;
const SPEED = 26;
/** How much of a stall's picture, from its bottom, people can't walk through (they pass behind the rest). */
const FOOT = 0.45;

export interface Market {
  stop(): void;
}

/** Runs the market on `canvas` (sized to its box) until stopped or the canvas leaves the page. */
export function startMarket(canvas: HTMLCanvasElement): Market {
  const g = canvas.getContext('2d')!;
  let W = 0;
  let H = 0;
  let stalls: Stall[] = [];
  let buskers: Busker[] = [];
  let walkers: Walker[] = [];
  let blocked: Uint8Array = new Uint8Array(0);
  let cols = 0;
  let rows = 0;
  let frame = 0;
  let stopped = false;

  const size = (s: Stall) => {
    const i = img(s.file);
    return { w: i.naturalWidth, h: i.naturalHeight };
  };
  /** Where people stand to browse a stall: just in front of it, in the middle. */
  const front = (s: Stall): [number, number] => {
    const { w } = size(s);
    return [cellOf(s.x + w / 2), cellOf(s.y + 10)];
  };
  const cellOf = (v: number) => Math.max(0, Math.floor(v / CELL));
  const free = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows && !blocked[r * cols + c];

  /** Lays the square out for a view size: three rows of stalls with walkways between. */
  const layout = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    // A border of stalls down both sides and along the bottom; the top and the middle stay open (the wares float
    // over them).
    const at = (f: number) => Math.round(H * f);
    const right = (w: number) => W - w - 4;
    stalls = [
      { file: 'banner', x: 8, y: at(0.16) },
      { file: 'banner', x: W - 31, y: at(0.16) },
      // Down the left.
      { file: 'stall-bread', x: 4, y: at(0.3), shop: true, trader: { file: 'trader-bread', fw: 32, fh: 32, frames: 12, fps: 6, dx: 90, dy: 2 } },
      { file: 'cart-potions', x: 4, y: at(0.46), shop: true, trader: { file: 'trader-drinks', fw: 32, fh: 32, frames: 12, fps: 6, dx: 86, dy: 0 } },
      { file: 'table-bread', x: 4, y: at(0.59), shop: true },
      { file: 'crates2', x: 6, y: at(0.7) },
      // Down the right.
      { file: 'tent-magic', x: right(98), y: at(0.33), shop: true, trader: { file: 'trader-magic', fw: 48, fh: 48, frames: 8, fps: 6, dx: 50, dy: -14 } },
      { file: 'stand-fruit', x: right(86), y: at(0.49), shop: true },
      { file: 'table-magic', x: right(70), y: at(0.62), shop: true },
      { file: 'barrels1', x: right(38), y: at(0.72) },
      // Along the bottom.
      { file: 'stall-fruit', x: 2, y: H - 30, shop: true, trader: { file: 'trader-fruit', fw: 32, fh: 32, frames: 9, fps: 6, dx: 56, dy: -46, behind: true } },
      { file: 'stall-weapons', x: Math.round(W / 2 - 57), y: H - 26, shop: true, trader: { file: 'trader-weapons', fw: 32, fh: 32, frames: 8, fps: 6, dx: 74, dy: -40, behind: true } },
      { file: 'cart-goods', x: right(71), y: H - 34, shop: true },
    ];
    buskers = [
      { file: 'lute', fw: 32, fh: 32, frames: 6, fps: 6, x: 104, y: at(0.66) },
      { file: 'flute', fw: 32, fh: 48, frames: 6, fps: 6, x: W - 112, y: at(0.72) },
    ];
    cols = Math.ceil(W / CELL);
    rows = Math.ceil(H / CELL);
    blocked = new Uint8Array(cols * rows);
    const block = (x0: number, y0: number, x1: number, y1: number) => {
      for (let r = cellOf(y0); r <= Math.min(rows - 1, cellOf(y1)); r++) for (let c = cellOf(x0); c <= Math.min(cols - 1, cellOf(x1)); c++) blocked[r * cols + c] = 1;
    };
    for (const s of stalls) {
      const { w, h } = size(s);
      block(s.x, s.y - h * FOOT, s.x + w, s.y - 1);
    }
    for (const b of buskers) block(b.x - 10, b.y - 8, b.x + 10, b.y);
    // Townsfolk, each starting at a different stall.
    const shops = stalls.filter((s) => s.shop);
    walkers = [1, 2, 3, 4, 5, 1, 3].map((sheet, i) => {
      const [c, r] = front(shops[i % shops.length]);
      return { sheet, x: c * CELL + CELL / 2, y: r * CELL + CELL / 2, dir: UP, path: [], wait: 1 + Math.random() * 4, at: i % shops.length, t: Math.random() * 10 };
    });
  };

  /**
   * The way from one cell to another, walking only up, down, left and right round the stalls: the shortest, with a
   * turn costing as much as a few steps, so trips are long straight runs. Returns the corners to walk to.
   */
  const route = (from: [number, number], to: [number, number]): Array<[number, number]> | null => {
    const TURN = 6;
    const n = cols * rows;
    const cost = new Float64Array(n * 4).fill(Infinity);
    const prev = new Int32Array(n * 4).fill(-1);
    const open: Array<[number, number]> = [];
    const push = (state: number, c: number) => {
      open.push([c, state]);
      // A small binary heap on cost.
      let i = open.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (open[p][0] <= open[i][0]) break;
        [open[p], open[i]] = [open[i], open[p]];
        i = p;
      }
    };
    const pop = (): [number, number] => {
      const top = open[0];
      const last = open.pop()!;
      if (open.length) {
        open[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < open.length && open[l][0] < open[m][0]) m = l;
          if (r < open.length && open[r][0] < open[m][0]) m = r;
          if (m === i) break;
          [open[m], open[i]] = [open[i], open[m]];
          i = m;
        }
      }
      return top;
    };
    const start = from[1] * cols + from[0];
    for (let d = 0; d < 4; d++) {
      cost[start * 4 + d] = 0;
      push(start * 4 + d, 0);
    }
    const goal = to[1] * cols + to[0];
    let end = -1;
    while (open.length) {
      const [c, state] = pop();
      if (c > cost[state]) continue;
      const cell = state >> 2;
      const d = state & 3;
      if (cell === goal) {
        end = state;
        break;
      }
      const cx = cell % cols;
      const cy = (cell / cols) | 0;
      for (let nd = 0 as Dir; nd < 4; nd = (nd + 1) as Dir) {
        const [sx, sy] = STEP[nd];
        const nx = cx + sx;
        const ny = cy + sy;
        if (!free(nx, ny) && ny * cols + nx !== goal) continue;
        const ns = (ny * cols + nx) * 4 + nd;
        const nc = c + 1 + (nd !== d ? TURN : 0);
        if (nc < cost[ns]) {
          cost[ns] = nc;
          prev[ns] = state;
          push(ns, nc);
        }
      }
    }
    if (end < 0) return null;
    // Back from the goal, keeping only the corners.
    const cells: Array<[number, number]> = [];
    for (let s = end; s >= 0; s = prev[s]) cells.push([(s >> 2) % cols, ((s >> 2) / cols) | 0]);
    cells.reverse();
    const corners: Array<[number, number]> = [];
    for (let i = 1; i < cells.length; i++) {
      const next = cells[i + 1];
      const [px, py] = cells[i - 1];
      const [x, y] = cells[i];
      if (!next || next[0] - x !== x - px || next[1] - y !== y - py) corners.push([x, y]);
    }
    return corners;
  };

  /** Off to another stall. */
  const wander = (w: Walker) => {
    const shops = stalls.map((s, i) => [s, i] as const).filter(([s, i]) => s.shop && i !== w.at);
    const [s, i] = shops[Math.floor(Math.random() * shops.length)];
    const here: [number, number] = [cellOf(w.x), cellOf(w.y)];
    const path = route(here, front(s));
    if (!path) {
      w.wait = 2;
      return;
    }
    w.path = path.map(([c, r]) => [c * CELL + CELL / 2, r * CELL + CELL / 2]);
    w.at = i;
  };

  const step = (dt: number) => {
    for (const w of walkers) {
      w.t += dt;
      if (w.wait > 0) {
        w.wait -= dt;
        if (w.wait <= 0) wander(w);
        continue;
      }
      const target = w.path[0];
      if (!target) {
        // Arrived: face the stall and browse a while.
        w.dir = UP;
        w.wait = 2.5 + Math.random() * 4;
        continue;
      }
      const dx = target[0] - w.x;
      const dy = target[1] - w.y;
      // Straight along one axis at a time (the path's corners keep it to four directions).
      if (dx !== 0) w.dir = dx > 0 ? RIGHT : LEFT;
      else if (dy !== 0) w.dir = dy > 0 ? DOWN : UP;
      const move = SPEED * dt;
      if (Math.abs(dx) + Math.abs(dy) <= move) {
        w.x = target[0];
        w.y = target[1];
        w.path.shift();
      } else if (dx !== 0) w.x += Math.sign(dx) * Math.min(move, Math.abs(dx));
      else w.y += Math.sign(dy) * Math.min(move, Math.abs(dy));
    }
  };

  const draw = (now: number) => {
    const t = now / 1000;
    const pave = img('paving');
    if (ready(pave)) for (let y = 0; y < H; y += pave.naturalHeight) for (let x = 0; x < W; x += pave.naturalWidth) g.drawImage(pave, x, y);
    else {
      g.fillStyle = '#a88a70';
      g.fillRect(0, 0, W, H);
    }
    // Everything standing, back to front by where its feet are.
    const items: Array<{ y: number; draw: () => void }> = [];
    const sheetFrame = (file: string, fw: number, fh: number, frames: number, fps: number, x: number, y: number, phase = 0) => {
      const i = img(file);
      if (!ready(i)) return;
      const f = Math.floor((t + phase) * fps) % frames;
      g.drawImage(i, f * fw, 0, fw, fh, Math.round(x - fw / 2), Math.round(y - fh), fw, fh);
    };
    const shadow = img('shadow');
    for (const s of stalls) {
      const i = img(s.file);
      if (!ready(i)) continue;
      const tr = s.trader;
      if (tr) {
        const tx = s.x + tr.dx;
        const ty = s.y + tr.dy;
        // A trader behind the counter is drawn before the stall; one beside it stands on their own.
        items.push({ y: tr.behind ? s.y - 0.5 : ty, draw: () => sheetFrame(tr.file, tr.fw, tr.fh, tr.frames, tr.fps, tx, ty, s.x * 0.01) });
      }
      items.push({ y: s.y, draw: () => g.drawImage(i, s.x, s.y - i.naturalHeight) });
    }
    for (const b of buskers) items.push({ y: b.y, draw: () => sheetFrame(b.file, b.fw, b.fh, b.frames, b.fps, b.x, b.y) });
    for (const w of walkers) {
      items.push({
        y: w.y,
        draw: () => {
          const walking = w.wait <= 0 && w.path.length > 0;
          const sheet = img(`citizen${w.sheet}-${walking ? 'walk' : 'idle'}`);
          if (!ready(sheet)) return;
          const frames = walking ? 6 : 12;
          const f = Math.floor(w.t * (walking ? 9 : 6)) % frames;
          if (ready(shadow)) g.drawImage(shadow, Math.round(w.x - 16), Math.round(w.y - 22));
          g.drawImage(sheet, f * 32, w.dir * 32, 32, 32, Math.round(w.x - 16), Math.round(w.y - 28), 32, 32);
        },
      });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
  };

  let last = performance.now();
  const loop = (now: number) => {
    if (stopped || !canvas.isConnected) return;
    if (canvas.clientWidth !== W || canvas.clientHeight !== H) layout();
    step(Math.min(0.05, (now - last) / 1000));
    last = now;
    draw(now);
    frame = requestAnimationFrame(loop);
  };
  // Lay out once the pictures are in (sizes come from them).
  const files = ['paving', 'shadow', 'stall-weapons', 'stall-fruit', 'tent-magic', 'banner', 'stall-bread', 'table-bread', 'table-magic', 'cart-potions', 'cart-goods', 'stand-fruit', 'barrels1', 'crates2'];
  void Promise.all(files.map((f) => img(f).decode().catch(() => undefined))).then(() => {
    if (stopped) return;
    layout();
    frame = requestAnimationFrame(loop);
  });
  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
    },
  };
}
