import { areaDef, type AreaId } from '../core/balance';

/** How much of each area colour's saturation the menus keep: they stay muted so the battlefield stands out. */
const MENU_SATURATION = 0.3;

let current: AreaId | null = null;

/** Recolours the UI (CSS variables --c0..--c3) to a muted version of an area's palette. */
export function applyAreaTheme(area: AreaId): void {
  if (area === current) return;
  current = area;
  const pal = areaDef(area).palette.map((c) => desaturate(c, MENU_SATURATION));
  const root = document.documentElement.style;
  pal.forEach((c, i) => root.setProperty(`--c${i}`, c));
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', pal[0]);
  void tintFrames(pal);
}

/**
 * The parchment style's frame art (public/ui/, from CraftPix's RPG UI pack), repainted in the area's colours:
 * each pixel's brightness picks a colour along the palette (darkest to lightest), keeping a little of the
 * original for its warmth, so the wood grain and pixel shading survive. Set as --img-panel, --img-btn, --img-btnhi.
 */
const FRAMES: Array<{ name: string; file: string; stops: number[]; keep: number }> = [
  { name: 'panel', file: 'panel.png', stops: [0, 0, 1, 3, 3], keep: 0.25 },
  { name: 'btn', file: 'btn.png', stops: [0, 1, 1, 2], keep: 0.1 },
  { name: 'btnhi', file: 'btn-hi.png', stops: [0, 1, 2, 3], keep: 0.1 },
];
const frameImages = new Map<string, Promise<HTMLImageElement>>();
let tintRun = 0;

async function tintFrames(pal: string[]): Promise<void> {
  const run = ++tintRun;
  const rgb = pal.map((c) => [1, 3, 5].map((o) => parseInt(c.slice(o, o + 2), 16)));
  for (const f of FRAMES) {
    let load = frameImages.get(f.file);
    if (!load) {
      const img = new Image();
      img.src = `${import.meta.env.BASE_URL}ui/${f.file}`;
      load = img.decode().then(() => img);
      frameImages.set(f.file, load);
    }
    let img: HTMLImageElement;
    try {
      img = await load;
    } catch {
      return; // art missing: the CSS falls back to flat colours
    }
    if (run !== tintRun) return; // travelled again meanwhile
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    const stops = f.stops.map((i) => rgb[i]);
    for (let i = 0; i < d.data.length; i += 4) {
      if (!d.data[i + 3]) continue;
      const L = (0.3 * d.data[i] + 0.59 * d.data[i + 1] + 0.11 * d.data[i + 2]) / 255;
      const t = Math.min(stops.length - 1.001, L * (stops.length - 1));
      const j = Math.floor(t);
      const k = t - j;
      for (let ch = 0; ch < 3; ch++) {
        const col = stops[j][ch] + (stops[j + 1][ch] - stops[j][ch]) * k;
        d.data[i + ch] = col * (1 - f.keep) + d.data[i + ch] * f.keep;
      }
    }
    g.putImageData(d, 0, 0);
    document.documentElement.style.setProperty(`--img-${f.name}`, `url(${c.toDataURL()})`);
  }
}

/** Switches the menu style (body class ui-parchment for the default parchment & wood look). */
export function applyUiStyle(style: 'parchment' | 'classic'): void {
  document.body.classList.toggle('ui-parchment', style === 'parchment');
}

/** Scales a hex colour's HSL saturation by `k`. */
function desaturate(hex: string, k: number): string {
  const [r, g, b] = [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return hex;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const s2 = s * k;
  const c = (1 - Math.abs(2 * l - 1)) * s2;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = l - c / 2;
  const [r2, g2, b2] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return `#${[r2, g2, b2].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}
