import { areaDef, type AreaId } from '../core/balance';

let current: AreaId | null = null;

/** Recolours the UI (CSS variables --c0..--c3) to an area's Game Boy Advance-style palette. */
export function applyAreaTheme(area: AreaId): void {
  if (area === current) return;
  current = area;
  const pal = areaDef(area).palette;
  const root = document.documentElement.style;
  pal.forEach((c, i) => root.setProperty(`--c${i}`, c));
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', pal[0]);
}
