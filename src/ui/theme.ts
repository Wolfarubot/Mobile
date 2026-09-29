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
