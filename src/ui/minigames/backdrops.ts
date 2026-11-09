import { areaBackground } from '../../render/backgrounds';
import { playArea } from './dpad';
import { MB_DECOR } from './meteorBounce';
import { puppetStage } from './puppetShow';
import { SG_DECOR } from './shootingGallery';
import { TITLE_Y, type MinigameApi } from './shell';

/**
 * Minigames' own backdrops, drawn in pixel art in place of their area's background: Theon's theatre, Wilhelm's view
 * down into the nest, Marceline's reading table, Lilith's ice-cave camp, Ted's card table and Norm's night sky.
 * Each is laid out to its game (the stage floor, the camp's edge, the ground) and drawn once per screen size.
 */

/** The screen a backdrop covers, and where the game's stage sits on it (`ox` in from the left, `scale` per unit). */
export interface BackdropView {
  api: MinigameApi;
  w: number;
  h: number;
  ox: number;
  scale: number;
}
/** A backdrop: the whole screen's picture, or null while what it's made from loads (asked again next frame). */
export type Backdrop = (v: BackdropView) => HTMLCanvasElement | null;

/** Screen pixels per art pixel, about. */
const PX = 3;

/** A small seeded generator, so a backdrop comes out the same every time. */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const canvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
};

/** An art-pixel canvas for the screen, with the stage's units mapped onto it. */
function pixels(v: BackdropView) {
  const P = Math.max(2, Math.round(PX * Math.max(1, v.scale)));
  const W = Math.ceil(v.w / P);
  const H = Math.ceil(v.h / P);
  const c = canvas(W, H);
  const g = c.getContext('2d')!;
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  return {
    c,
    g,
    W,
    H,
    rect,
    /** Stage units to art pixels. */
    X: (x: number) => (v.ox + x * v.scale) / P,
    Y: (y: number) => (y * v.scale) / P,
    S: (n: number) => (n * v.scale) / P,
  };
}

/** The art drawn up to the screen's size, its pixels kept crisp. */
function upscale(small: HTMLCanvasElement, v: BackdropView): HTMLCanvasElement {
  const c = canvas(v.w, v.h);
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(small, 0, 0, v.w, v.h);
  return c;
}

/** A vertical run of colours from `top` to `bottom`, in bands (no smooth gradient: it stays pixel art). */
function bands(rect: (x: number, y: number, w: number, h: number, c: string) => void, W: number, top: number, bottom: number, colors: string[]): void {
  const n = colors.length;
  for (let i = 0; i < n; i++) {
    const y0 = top + ((bottom - top) * i) / n;
    const y1 = top + ((bottom - top) * (i + 1)) / n;
    rect(0, Math.floor(y0), W, Math.ceil(y1) - Math.floor(y0), colors[i]);
  }
}

/**
 * Theon's theatre: red velvet curtains either side of the stage and a scalloped valance along the top, the stage's
 * floorboards (where Theon and his puppet dance) with footlights along its edge, a dark backcloth behind, and the
 * audience's seats below in the dark.
 */
export const theatre: Backdrop = (v) => {
  const { api } = v;
  const st = puppetStage(api);
  const { x0, x1 } = playArea(api);
  const A = pixels(v);
  const { g, W, H, rect } = A;
  const r = rng(11);
  const floor = Math.round(A.Y(st.floor));
  const L = Math.round(A.X(x0));
  const R = Math.round(A.X(x1));
  const depth = Math.max(8, Math.round(A.S(48 * api.k)));
  const boards = floor - depth;
  // The house, in the dark: deep plum walls with a faint stripe.
  rect(0, 0, W, H, '#1c0c16');
  for (let x = 0; x < W; x += 6) rect(x, 0, 2, H, '#221019');
  // The backcloth behind the stage: a dark red drape in folds.
  for (let x = L; x < R; x++) rect(x, 0, 1, boards, ['#3a0e1a', '#44121e', '#4c1622', '#44121e', '#3a0e1a', '#300a14'][(x - L) % 6]);
  // The floorboards: rows of planks, seams between them, joints here and there.
  for (let y = boards, row = 0; y < floor + 3; y += 3, row++) {
    rect(L, y, R - L, 3, row % 2 ? '#7c4c2a' : '#704426');
    rect(L, y, R - L, 1, '#8c5a32');
    for (let x = L + Math.floor(r() * 14); x < R; x += 10 + Math.floor(r() * 14)) rect(x, y, 1, 3, '#4a2c16');
  }
  // The stage's front edge, with footlights along it.
  const apron = Math.max(4, Math.round(A.S(22 * api.k)));
  rect(L, floor + 3, R - L, apron, '#4a2a16');
  rect(L, floor + 3, R - L, 1, '#a06a3a');
  rect(L, floor + 3 + apron - 1, R - L, 1, '#2a160c');
  g.save();
  for (let x = L + 5; x < R - 3; x += 10) {
    g.globalAlpha = 0.18;
    rect(x - 3, floor - 2, 8, 5, '#ffd27a');
    g.globalAlpha = 1;
    rect(x, floor + 3, 2, 2, '#ffe9a8');
  }
  g.restore();
  // The audience's seats, row after row down into the dark: rounded seat backs with a gap between each, an aisle
  // down the middle.
  const aisle = Math.round((L + R) / 2);
  for (let y = floor + 3 + apron + 5, row = 0; y < H; y += 10, row++) {
    g.globalAlpha = Math.max(0.3, 1 - row * 0.1);
    for (let x = 1 + (row % 2) * 4; x < W - 4; x += 8) {
      if (Math.abs(x + 3 - aisle) < 6) continue;
      rect(x + 1, y, 4, 1, '#7c2436');
      rect(x, y + 1, 6, 4, '#5a1626');
      rect(x, y + 1, 6, 1, '#6c1e30');
      rect(x, y + 5, 6, 2, '#3a0c18');
    }
  }
  g.globalAlpha = 1;
  // The curtains either side, in folds, tied back with a gold rope.
  const cw = Math.max(6, Math.round((R - L) * 0.13));
  const folds = ['#5c0c1a', '#7c1424', '#9c1e30', '#b02838', '#9c1e30', '#7c1424'];
  const tie = Math.round(boards - depth * 0.6);
  for (const side of [0, 1]) {
    for (let i = 0; i < cw; i++) {
      // Below the tie, the curtain is gathered back: narrower toward the floor.
      for (let y = 0; y < floor + 3; y++) {
        const gather = y > tie ? Math.round(((y - tie) / Math.max(1, floor - tie)) * cw * 0.35) : 0;
        if (i >= cw - gather) continue;
        const x = side ? R - 1 - i : L + i;
        rect(x, y, 1, 1, folds[(i + Math.floor(y / 40)) % folds.length]);
      }
    }
    const tx = side ? R - cw : L;
    rect(tx, tie, Math.round(cw * 0.75), 2, '#d8b04a');
    rect(tx + (side ? 0 : Math.round(cw * 0.75) - 3), tie + 2, 3, 3, '#b08a2a');
  }
  // The valance across the top, scalloped, with a gold fringe (the title sits on it).
  const vh = Math.max(8, Math.round(A.Y(TITLE_Y + 14)));
  rect(0, 0, W, vh, '#8a1828');
  for (let y = 2; y < vh; y += 4) rect(0, y, W, 1, '#741222');
  for (let x = 0; x < W; x += 12) {
    for (let dx = 0; dx < 12; dx++) {
      const drop = Math.round(Math.sqrt(Math.max(0, 36 - (dx - 6) ** 2)) * 0.8);
      rect(x + dx, vh, 1, drop, '#8a1828');
      rect(x + dx, vh + drop, 1, 1, '#d8b04a');
    }
  }
  return upscale(A.c, v);
};

/**
 * Wilhelm's view down into the nest: the Depths far below (drawn at half size, as before), seen past a ragged rim
 * of rock along the top and sides with roots hanging over it, the edges falling into shadow.
 */
export const nestPit: Backdrop = (v) => {
  const s = SG_DECOR.scale;
  const ground = areaBackground('depths', Math.round(v.w / s), Math.round(v.h / s), SG_DECOR);
  if (!ground) return null;
  const c = canvas(v.w, v.h);
  const g = c.getContext('2d')!;
  g.drawImage(ground, 0, 0, v.w, v.h);
  // Deeper toward the edges: the pit's walls in shadow.
  const shade = g.createRadialGradient(v.w * 0.58, v.h * 0.52, Math.min(v.w, v.h) * 0.35, v.w * 0.58, v.h * 0.52, Math.max(v.w, v.h) * 0.75);
  shade.addColorStop(0, 'rgba(6,4,12,0)');
  shade.addColorStop(1, 'rgba(6,4,12,0.55)');
  g.fillStyle = shade;
  g.fillRect(0, 0, v.w, v.h);
  // The rim of the drop, in pixel art over it.
  const A = pixels(v);
  const { W, H, rect } = A;
  const r = rng(23);
  // The rock rim: a ragged band along the top, narrower down the sides.
  const top = Math.round(A.Y(TITLE_Y + 22));
  let edge = top;
  for (let x = 0; x < W; x++) {
    edge = Math.max(top - 6, Math.min(top + 6, edge + Math.round((r() - 0.5) * 3)));
    rect(x, 0, 1, edge, '#0c0812');
    rect(x, edge - 1, 1, 1, '#2c2236');
    // Roots hanging over the edge.
    if (r() < 0.06) {
      const len = 4 + Math.floor(r() * 12);
      for (let k = 0; k < len; k++) rect(x + Math.round(Math.sin(k / 3) * 0.6), edge + k, 1, 1, k % 3 ? '#3a2a1e' : '#4a3626');
    }
  }
  let side = 4;
  for (let y = top; y < H; y++) {
    side = Math.max(1, Math.min(7, side + Math.round((r() - 0.5) * 2)));
    rect(0, y, side, 1, '#0c0812');
    rect(side, y, 1, 1, '#2c2236');
    const rs = Math.max(1, Math.min(7, 8 - side));
    rect(W - rs, y, rs, 1, '#0c0812');
    rect(W - rs - 1, y, 1, 1, '#2c2236');
  }
  g.imageSmoothingEnabled = false;
  g.drawImage(A.c, 0, 0, v.w, v.h);
  return c;
};

/**
 * Marceline's reading table: a deep violet cloth with a gold border and a great rune circle stitched into it, candles
 * at its corners, inside a dark tent of draped fabric.
 */
export const readingTable: Backdrop = (v) => {
  const { api } = v;
  const A = pixels(v);
  const { g, W, H, rect } = A;
  const r = rng(37);
  // The tent: dark drapes in folds, with a few stars of light through the weave.
  for (let x = 0; x < W; x++) rect(x, 0, 1, H, ['#170c22', '#1d1029', '#22132f', '#1d1029'][Math.floor(x / 3) % 4]);
  for (let i = 0; i < W * H * 0.004; i++) rect(Math.floor(r() * W), Math.floor(r() * H), 1, 1, '#5a4478');
  // The cloth: across the table, under the cards (Marceline stands below it).
  const cx0 = Math.round(A.X(api.W * 0.04));
  const cx1 = Math.round(A.X(api.W * 0.96));
  const cy0 = Math.round(A.Y(TITLE_Y + 20));
  const cy1 = Math.round(A.Y(api.H - 118 * api.k));
  rect(cx0 - 1, cy0 - 1, cx1 - cx0 + 2, cy1 - cy0 + 4, '#0c0614');
  rect(cx0, cy0, cx1 - cx0, cy1 - cy0, '#3a1a52');
  for (let i = 0; i < (cx1 - cx0) * (cy1 - cy0) * 0.05; i++) rect(cx0 + Math.floor(r() * (cx1 - cx0)), cy0 + Math.floor(r() * (cy1 - cy0)), 1, 1, '#341648');
  // Its gold border, and a fringe hanging over the front.
  g.strokeStyle = '#c8a040';
  g.lineWidth = 1;
  g.strokeRect(cx0 + 2.5, cy0 + 2.5, cx1 - cx0 - 5, cy1 - cy0 - 5);
  g.strokeStyle = '#8a6a28';
  g.strokeRect(cx0 + 4.5, cy0 + 4.5, cx1 - cx0 - 9, cy1 - cy0 - 9);
  for (let x = cx0; x < cx1; x += 2) rect(x, cy1, 1, 2 + (x % 4 ? 0 : 1), '#c8a040');
  // The rune circle in the middle: two rings, a six-pointed star, and runes round it.
  const mx = (cx0 + cx1) / 2;
  const my = (cy0 + cy1) / 2;
  const rad = Math.min(cx1 - cx0, cy1 - cy0) * 0.4;
  g.strokeStyle = '#5c2e7c';
  for (const k of [1, 0.86]) {
    g.beginPath();
    g.arc(mx, my, rad * k, 0, Math.PI * 2);
    g.stroke();
  }
  for (const turn of [0, Math.PI / 3]) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = turn - Math.PI / 2 + (i * Math.PI * 2) / 3;
      const px = mx + Math.cos(a) * rad * 0.86;
      const py = my + Math.sin(a) * rad * 0.86;
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    }
    g.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI * 2) / 12;
    rect(mx + Math.cos(a) * rad * 0.93 - 1, my + Math.sin(a) * rad * 0.93 - 1, 2, 2, i % 2 ? '#8a5cb0' : '#c8a040');
  }
  // Candles at the cloth's corners.
  for (const [x, y] of [
    [cx0 + 6, cy0 + 6],
    [cx1 - 8, cy0 + 6],
    [cx0 + 6, cy1 - 12],
    [cx1 - 8, cy1 - 12],
  ]) {
    g.globalAlpha = 0.16;
    rect(x - 4, y - 7, 10, 10, '#ffcf6a');
    g.globalAlpha = 1;
    rect(x, y, 2, 5, '#efe6d4');
    rect(x, y + 5, 2, 1, '#b8ac94');
    rect(x, y - 2, 2, 2, '#ffd25a');
    rect(x + 1, y - 3, 1, 1, '#fff2b8');
  }
  return upscale(A.c, v);
};

/**
 * Lilith's camp in an ice cave: a ceiling of dark rock and hanging icicles along the top, cold blue ice walls
 * glinting down the sides, and the camp below on the snow (tents either side), under the game's wall of rocks.
 */
export const iceCamp: Backdrop = (v) => {
  const { api } = v;
  const A = pixels(v);
  const { g, W, H, rect } = A;
  const r = rng(51);
  const ground = Math.round(A.Y(api.H - 120 + 12 * api.k));
  bands(rect, W, 0, ground, ['#0a1424', '#0e1a2e', '#122136', '#16293f', '#1a3149', '#1f3a54', '#24435f', '#294c69']);
  // Ice glinting in the walls: little facets, thicker toward the sides.
  for (let i = 0; i < W * H * 0.02; i++) {
    const x = Math.floor(r() * W);
    const y = Math.floor(r() * ground);
    const edge = Math.min(x, W - 1 - x) / (W / 2);
    if (r() < edge * 1.3) continue;
    g.globalAlpha = 0.25 + r() * 0.35;
    rect(x, y, 1 + Math.floor(r() * 2), 1, r() < 0.5 ? '#6aa6d0' : '#a8daf4');
  }
  g.globalAlpha = 1;
  // The ceiling: ragged dark rock, and icicles hanging from it.
  const top = Math.round(A.Y(TITLE_Y - 30));
  let edge = top;
  for (let x = 0; x < W; x++) {
    edge = Math.max(top - 3, Math.min(top + 5, edge + Math.round((r() - 0.5) * 3)));
    rect(x, 0, 1, edge, '#070d18');
    rect(x, edge, 1, 1, '#3a6a92');
  }
  for (let x = 1; x < W - 2; x += 3 + Math.floor(r() * 5)) {
    const len = 3 + Math.floor(r() * (r() < 0.2 ? 18 : 8));
    for (let k = 0; k < len; k++) {
      const w = Math.max(1, Math.round(3 * (1 - k / len)));
      rect(x, top + k, w, 1, '#8ccbef');
      rect(x, top + k, 1, 1, '#d8f2ff');
    }
  }
  // The snow the camp stands on.
  rect(0, ground, W, H - ground, '#dfeef6');
  for (let i = 0; i < W * (H - ground) * 0.12; i++) rect(Math.floor(r() * W), ground + Math.floor(r() * (H - ground)), 1, 1, r() < 0.6 ? '#c6dce8' : '#f4fbff');
  // Two tents either side of the camp.
  for (const fx of [0.16, 0.84]) {
    const tx = Math.round(W * fx);
    const ty = Math.round(ground + (H - ground) * 0.55);
    const tw = Math.max(10, Math.round(A.S(46 * api.k)));
    const th = Math.round(tw * 0.7);
    for (let k = 0; k < th; k++) {
      const half = Math.round((tw / 2) * (k / th));
      rect(tx - half, ty - th + k, half, 1, '#a8442e');
      rect(tx, ty - th + k, half, 1, '#7c2e20');
    }
    for (let k = Math.round(th * 0.45); k < th; k++) {
      const half = Math.round((tw / 6) * ((k - th * 0.45) / (th * 0.55)));
      rect(tx - half, ty - th + k, half * 2 + 1, 1, '#3a140e');
    }
    g.globalAlpha = 0.25;
    rect(tx - tw / 2 - 1, ty, tw + 2, 2, '#7a98aa');
    g.globalAlpha = 1;
  }
  return upscale(A.c, v);
};

/**
 * Ted's card table: green felt with a little nap to it and a faint diamond pattern, a wooden rail down either side,
 * and the table's wooden edge along the bottom where Ted starts out.
 */
export const cardTable: Backdrop = (v) => {
  const { api } = v;
  const A = pixels(v);
  const { W, H, rect } = A;
  const r = rng(67);
  rect(0, 0, W, H, '#1d5a3b');
  for (let i = 0; i < W * H * 0.18; i++) rect(Math.floor(r() * W), Math.floor(r() * H), 1, 1, r() < 0.6 ? '#1a5336' : '#216142');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x + y) % 24 === 0 || (x - y + 2400) % 24 === 0) rect(x, y, 1, 1, '#1b5638');
  // The rails.
  const rail = Math.max(3, Math.round(A.S(12)));
  for (const x of [0, W - rail]) {
    rect(x, 0, rail, H, '#5a3820');
    rect(x + (x ? 0 : rail - 1), 0, 1, H, '#2e1c10');
    rect(x + (x ? 1 : rail - 2), 0, 1, H, '#8a5a32');
  }
  // The table's edge along the bottom.
  const edge = Math.round(A.Y(api.H - 34 * api.k));
  rect(0, edge, W, H - edge, '#5a3820');
  rect(0, edge, W, 1, '#8a5a32');
  rect(0, edge + 1, W, 1, '#6e4628');
  for (let x = 4; x < W; x += 16) rect(x, edge + 3, 1, H - edge - 3, '#4a2e18');
  return upscale(A.c, v);
};

/**
 * Norm's night sky over the Meteor Field: deep space with a nebula's glow, stars and a ringed planet, a line of
 * distant hills, and the field's own cratered ground along the bottom where Norm slides.
 */
export const meteorSky: Backdrop = (v) => {
  const field = areaBackground('meteors', v.w, v.h, MB_DECOR);
  if (!field) return null;
  const c = canvas(v.w, v.h);
  const g = c.getContext('2d')!;
  g.drawImage(field, 0, 0);
  const { api } = v;
  const A = pixels(v);
  const { W, rect } = A;
  const r = rng(79);
  const horizon = Math.round(A.Y(api.H - 150 * api.k));
  bands(rect, W, 0, horizon, ['#05031a', '#08051f', '#0c0826', '#110b2e', '#170f36', '#1e143e', '#271a46', '#30204e']);
  // A nebula's glow across the sky.
  for (let i = 0; i < 9; i++) {
    const nx = r() * W;
    const ny = r() * horizon * 0.8;
    const nr = 6 + r() * 16;
    for (let k = 0; k < nr * nr * 1.2; k++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * nr;
      A.g.globalAlpha = 0.12;
      rect(nx + Math.cos(a) * d * 1.6, ny + Math.sin(a) * d, 1, 1, i % 2 ? '#5a3a9a' : '#2a6a8a');
    }
  }
  A.g.globalAlpha = 1;
  // Stars: mostly faint points, a few bright crosses.
  for (let i = 0; i < W * horizon * 0.012; i++) rect(Math.floor(r() * W), Math.floor(r() * horizon), 1, 1, r() < 0.75 ? '#6e6ca4' : '#ffffff');
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(r() * W);
    const y = Math.floor(r() * horizon * 0.8);
    rect(x - 1, y, 3, 1, '#dfe4ff');
    rect(x, y - 1, 1, 3, '#dfe4ff');
  }
  // A ringed planet high up.
  const px = Math.round(W * 0.78);
  const py = Math.round(horizon * 0.22);
  const pr = Math.max(5, Math.round(W * 0.07));
  for (let y = -pr; y <= pr; y++)
    for (let x = -pr; x <= pr; x++) {
      if (x * x + y * y > pr * pr) continue;
      rect(px + x, py + y, 1, 1, x + y > pr * 0.4 ? '#3a2e66' : (y + pr) % 4 < 2 ? '#7a64b0' : '#6a56a0');
    }
  for (let x = -pr * 2; x <= pr * 2; x++) {
    const y = Math.round(x * 0.22);
    if (Math.abs(x) < pr && y < 1) continue;
    rect(px + x, py + y, 1, 1, '#d8c4f0');
  }
  // Distant hills along the horizon, fading into the ground below.
  let hill = 0;
  for (let x = 0; x < W; x++) {
    hill = Math.max(0, Math.min(8, hill + Math.round((r() - 0.5) * 2.2)));
    rect(x, horizon - hill, 1, hill + 2, '#1a1030');
    rect(x, horizon - hill, 1, 1, '#3a2a58');
  }
  // Clear below the horizon: the field's ground shows through.
  A.g.clearRect(0, horizon + 2, W, A.H - horizon - 2);
  g.imageSmoothingEnabled = false;
  g.drawImage(A.c, 0, 0, v.w, v.h);
  return c;
};
