/**
 * The battlefield's framed bars, from CraftPix's "HP, Mana, Stamina and Scroll Bar" pack (public/ui/):
 * the gold-winged Guardian bar (its health in the upper wing slots, the time left in the lower ones and the
 * seconds in the medallion) and the slim gold event-timer bar. The frames' empty slots are found by colour when
 * they load, and filled pixel by pixel, keeping each slot pixel's shading.
 */

interface Slot {
  /** Pixel indices (y * width + x) and each one's shade: 0 dark, 1 mid, 2 light. */
  px: number[];
  shade: number[];
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface Frame {
  img: HTMLImageElement;
  w: number;
  h: number;
  base: ImageData;
  /** Slot components found in the frame, by colour family. */
  lavender: Slot[];
  blue: Slot[];
  canvas: HTMLCanvasElement;
  key: string;
}

/** The frame's slot colours: [hex, family, shade]. */
const SLOT_COLOURS: Array<[number, 'lavender' | 'blue', number]> = [
  [0x787b8e, 'lavender', 0],
  [0x787fa6, 'lavender', 1],
  [0x7882ba, 'lavender', 2],
  [0x698bc1, 'blue', 0],
  [0x78a3d9, 'blue', 1],
  [0x87c0ec, 'blue', 2],
];

const frames = new Map<string, Frame | null>();

function load(file: string): Frame | null {
  if (frames.has(file)) return frames.get(file)!;
  frames.set(file, null);
  const img = new Image();
  img.src = `${import.meta.env.BASE_URL}ui/${file}`;
  void img
    .decode()
    .then(() => frames.set(file, analyse(img)))
    .catch(() => undefined);
  return null;
}

/** Finds the slots: connected runs of slot-coloured pixels, one list per colour family. */
function analyse(img: HTMLImageElement): Frame {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const base = g.getImageData(0, 0, w, h);
  const d = base.data;
  const family: Array<'lavender' | 'blue' | null> = new Array(w * h).fill(null);
  const shade = new Array<number>(w * h).fill(0);
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] < 255) continue;
    const rgb = (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2];
    const hit = SLOT_COLOURS.find((c) => c[0] === rgb);
    if (hit) {
      family[i] = hit[1];
      shade[i] = hit[2];
    }
  }
  const seen = new Uint8Array(w * h);
  const out: Record<'lavender' | 'blue', Slot[]> = { lavender: [], blue: [] };
  for (let s = 0; s < w * h; s++) {
    const f = family[s];
    if (!f || seen[s]) continue;
    const slot: Slot = { px: [], shade: [], x0: w, x1: 0, y0: h, y1: 0 };
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const q = stack.pop()!;
      const x = q % w;
      const y = Math.floor(q / w);
      slot.px.push(q);
      slot.shade.push(shade[q]);
      slot.x0 = Math.min(slot.x0, x);
      slot.x1 = Math.max(slot.x1, x);
      slot.y0 = Math.min(slot.y0, y);
      slot.y1 = Math.max(slot.y1, y);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (!seen[k] && family[k] === f) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    out[f].push(slot);
  }
  return { img, w, h, base, lavender: out.lavender, blue: out.blue, canvas, key: '' };
}

type Rgb = [number, number, number];
const hex = (c: number): Rgb => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/** A fill colour in three shades (dark, mid, light). */
export const FILLS = {
  hp: [0x9a2630, 0xd23a46, 0xf0646a].map(hex),
  time: [0xc97a22, 0xf2a03d, 0xffc865].map(hex),
  timeLow: [0xa82a2a, 0xe24444, 0xff7272].map(hex),
  event: [0x2a8a46, 0x3fcf6a, 0x7deb95].map(hex),
};

/**
 * Paints `slots` left to right up to `frac` of their combined width, in `fill`'s shades; the rest stay as the
 * frame's empty slot colours.
 */
function paint(f: Frame, d: Uint8ClampedArray, slots: Slot[], frac: number, fill: Rgb[]): void {
  if (!slots.length) return;
  const x0 = Math.min(...slots.map((s) => s.x0));
  const x1 = Math.max(...slots.map((s) => s.x1));
  const edge = x0 + (x1 - x0 + 1) * Math.max(0, Math.min(1, frac));
  for (const s of slots)
    s.px.forEach((q, i) => {
      if (q % f.w >= edge) return;
      const c = fill[s.shade[i]];
      d[q * 4] = c[0];
      d[q * 4 + 1] = c[1];
      d[q * 4 + 2] = c[2];
    });
}

/** Redraws the frame's canvas with these fills (only when the filled columns change). */
function render(f: Frame, key: string, fills: Array<[Slot[], number, Rgb[]]>): void {
  if (f.key === key) return;
  f.key = key;
  const img = new ImageData(new Uint8ClampedArray(f.base.data), f.w, f.h);
  for (const [slots, frac, fill] of fills) paint(f, img.data, slots, frac, fill);
  f.canvas.getContext('2d')!.putImageData(img, 0, 0);
}

export const GUARDIAN_BAR = { w: 248, h: 43 };
export const EVENT_BAR = { w: 108, h: 12 };

/**
 * The Guardian bar at (x, y), `s` times its pixel size: health across the upper wing slots (a tick at `winAt`
 * if it's won before 0), time left across the lower ones, and the seconds left in the medallion. False until
 * the frame has loaded.
 */
export function drawGuardianBar(g: CanvasRenderingContext2D, x: number, y: number, s: number, hp: number, time: number, winAt: number, seconds: number, font: string): boolean {
  const f = load('guardian-bar.png');
  if (!f) return false;
  // The medallion is the biggest lavender slot; the wing slots are the wide ones.
  const medal = f.lavender.reduce((a, b) => (b.px.length > a.px.length ? b : a));
  const wings = f.lavender.filter((sl) => sl !== medal && sl.x1 - sl.x0 > 30);
  const lower = f.blue.filter((sl) => sl.x1 - sl.x0 > 30);
  const low = time < 0.3;
  const span = (sl: Slot[]) => [Math.min(...sl.map((a) => a.x0)), Math.max(...sl.map((a) => a.x1)) + 1];
  const [hx0, hx1] = span(wings);
  const [tx0, tx1] = span(lower);
  const col = (frac: number, a: number, b: number) => Math.round(a + (b - a) * Math.max(0, Math.min(1, frac)));
  render(f, `${col(hp, hx0, hx1)}:${col(time, tx0, tx1)}:${low}`, [
    [wings, hp, FILLS.hp],
    [lower, time, low ? FILLS.timeLow : FILLS.time],
  ]);
  g.imageSmoothingEnabled = false;
  g.drawImage(f.canvas, x, y, f.w * s, f.h * s);
  if (winAt > 0) {
    g.fillStyle = '#ffe36e';
    const wx = x + (hx0 + (hx1 - hx0) * winAt) * s;
    g.fillRect(Math.round(wx) - 1, y + (Math.min(...wings.map((a) => a.y0)) - 2) * s, 2, (Math.max(...wings.map((a) => a.y1)) - Math.min(...wings.map((a) => a.y0)) + 5) * s);
  }
  // Seconds left, in the medallion.
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const mx = x + ((medal.x0 + medal.x1 + 1) / 2) * s;
  const my = y + ((medal.y0 + medal.y1 + 1) / 2) * s;
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.strokeText(`${Math.ceil(seconds)}`, mx, my + 1);
  g.fillStyle = low ? '#ff8a8a' : '#fff4c8';
  g.fillText(`${Math.ceil(seconds)}`, mx, my + 1);
  return true;
}

/** The event timer bar at (x, y), `s` times its pixel size, filled to `frac`. False until it has loaded. */
export function drawEventBar(g: CanvasRenderingContext2D, x: number, y: number, s: number, frac: number): boolean {
  const f = load('event-bar.png');
  if (!f) return false;
  const [a, b] = [Math.min(...f.lavender.map((sl) => sl.x0)), Math.max(...f.lavender.map((sl) => sl.x1)) + 1];
  render(f, `${Math.round(a + (b - a) * Math.max(0, Math.min(1, frac)))}`, [[f.lavender, frac, FILLS.event]]);
  g.imageSmoothingEnabled = false;
  g.drawImage(f.canvas, x, y, f.w * s, f.h * s);
  return true;
}
