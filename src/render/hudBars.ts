/**
 * The battlefield's framed bars (event timers, a Guardian's health and time), built from the simple
 * silver-edged bar in CraftPix's "HP, Mana, Stamina and Scroll Bar" pack (public/ui/timer-bar.png). The frame is
 * nine-sliced to any width and thickness (its ends and edges kept, its middle stretched), and its empty slot is found by
 * colour and filled pixel by pixel in any colour, keeping the slot's shading.
 */

const SOURCE = 'timer-bar.png';
/** Pixels kept at each end, and along the top and bottom, when the frame is stretched. */
const END = 6;
const EDGE = 3;
/** The slot's empty colours, dark to light: a filled pixel takes the matching shade of the fill. */
const SLOT_SHADES = [0x6b6955, 0x717158, 0x7a7c5e];

let source: ImageData | null = null;
let loading = false;

function load(): ImageData | null {
  if (source || loading) return source;
  loading = true;
  const img = new Image();
  img.src = `${import.meta.env.BASE_URL}ui/${SOURCE}`;
  void img
    .decode()
    .then(() => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      source = g.getImageData(0, 0, c.width, c.height);
    })
    .catch(() => undefined);
  return null;
}

interface Built {
  w: number;
  h: number;
  base: ImageData;
  /** Slot pixels (y * w + x) and each one's shade (an index into SLOT_SHADES). */
  slot: number[];
  shade: number[];
  x0: number;
  x1: number;
  canvas: HTMLCanvasElement;
  key: string;
}

const built = new Map<string, Built>();

/** The frame at w × h pixels: ends and top/bottom edges as drawn, the middle stretched from the source's. */
function build(src: ImageData, w: number, h: number): Built {
  const key = `${w}x${h}`;
  const hit = built.get(key);
  if (hit) return hit;
  const sw = src.width;
  const sh = src.height;
  // Nearest source pixel, sampling from each stretched pixel's centre (so a one-row slot takes the middle shade).
  const map = (v: number, n: number, sn: number, e: number) => (v < e ? v : v >= n - e ? v - (n - sn) : e + Math.floor(((v - e + 0.5) * (sn - 2 * e)) / (n - 2 * e)));
  const base = new ImageData(w, h);
  const slot: number[] = [];
  const shade: number[] = [];
  let x0 = w;
  let x1 = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const si = (map(y, h, sh, EDGE) * sw + map(x, w, sw, END)) * 4;
      const di = (y * w + x) * 4;
      for (let k = 0; k < 4; k++) base.data[di + k] = src.data[si + k];
      const rgb = (src.data[si] << 16) | (src.data[si + 1] << 8) | src.data[si + 2];
      const s = src.data[si + 3] === 255 ? SLOT_SHADES.indexOf(rgb) : -1;
      if (s >= 0) {
        slot.push(y * w + x);
        shade.push(s);
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
      }
    }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const b: Built = { w, h, base, slot, shade, x0, x1: x1 + 1, canvas, key: '' };
  built.set(key, b);
  return b;
}

type Rgb = [number, number, number];

/** A colour's three shades for filling the slot: darker, itself, lighter. */
function shades(color: string): Rgb[] {
  const n = parseInt(color.replace('#', ''), 16);
  const c: Rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return [c.map((v) => Math.round(v * 0.68)) as Rgb, c, c.map((v) => Math.round(v + (255 - v) * 0.35)) as Rgb];
}

/** The light orange every timer fills with. */
export const TIMER_COLOR = '#ffb866';

/**
 * A framed bar at (x, y): `w` × `h` frame pixels, drawn `s` times their size, its slot filled from the left to
 * `frac` in `color`. False until the frame has loaded.
 */
export function drawFramedBar(g: CanvasRenderingContext2D, x: number, y: number, s: number, w: number, h: number, frac: number, color: string): boolean {
  const src = load();
  if (!src) return false;
  const b = build(src, Math.max(2 * END + 1, Math.round(w)), Math.max(2 * EDGE + 1, Math.round(h)));
  const edge = Math.round(b.x0 + (b.x1 - b.x0) * Math.max(0, Math.min(1, frac)));
  const key = `${edge}:${color}`;
  if (b.key !== key) {
    b.key = key;
    const img = new ImageData(new Uint8ClampedArray(b.base.data), b.w, b.h);
    const fill = shades(color);
    b.slot.forEach((q, i) => {
      if (q % b.w >= edge) return;
      const c = fill[b.shade[i]];
      img.data[q * 4] = c[0];
      img.data[q * 4 + 1] = c[1];
      img.data[q * 4 + 2] = c[2];
    });
    b.canvas.getContext('2d')!.putImageData(img, 0, 0);
  }
  g.imageSmoothingEnabled = false;
  g.drawImage(b.canvas, x, y, b.w * s, b.h * s);
  return true;
}
