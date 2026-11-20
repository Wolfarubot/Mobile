import type { DamageType } from '../core/balance';
import type { CooldownTint } from '../core/cooldownArt';
import { gearIconUrl } from './sprites';
import { HUNTER_SCHEME, PACK_PALETTES } from './iconPalettes';

/**
 * Cooldown icons redrawn in a damage type's colours (or a Hunter's skill tree colours). Every ability-pack half is
 * drawn in five colours, darkest first; each colour of the icon becomes the target palette's colour of the same rank,
 * so the dark panel stays dark and the cream art stays cream.
 */
const DAMAGE_PALETTES: Record<DamageType, string[]> = {
  physical: PACK_PALETTES['ab-cavalier-monk:2'],
  fire: PACK_PALETTES['ab-pyro-hydro:1'],
  frost: PACK_PALETTES['ab-pyro-hydro:2'],
  radiant: PACK_PALETTES['ab-paladin-dk:1'],
  arcane: PACK_PALETTES['ab-rogue-warlock:2'],
  decay: PACK_PALETTES['ab-gunslinger-druid:2'],
  lightning: PACK_PALETTES['ab-geo-aero:2'],
  poison: ['#0f240a', '#1f4a14', '#3a8a2a', '#6fdc5a', '#efd8a1'],
  acid: ['#1f240a', '#3a4a0a', '#8ab820', '#d6f050', '#efd8a1'],
  void: ['#1a0820', '#3d0f4a', '#9a2a8a', '#ff5fd7', '#efd8a1'],
};

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/** The palette a tint names. */
export function tintPalette(tint: CooldownTint): string[] {
  return typeof tint === 'string' ? DAMAGE_PALETTES[tint] : PACK_PALETTES[HUNTER_SCHEME[tint.hunter]] ?? DAMAGE_PALETTES.physical;
}

const cache = new Map<string, Promise<string>>();

/** An ability-pack icon ("<pack>/<NNN>") redrawn in a tint's colours, as an image URL (cached). */
export function tintedIconUrl(art: string, tint: CooldownTint): Promise<string> {
  const key = `${art}|${typeof tint === 'string' ? tint : tint.hunter}`;
  let p = cache.get(key);
  if (!p) {
    p = recolor(art, tintPalette(tint)).catch(() => gearIconUrl(art)!);
    cache.set(key, p);
  }
  return p;
}

async function recolor(art: string, target: string[]): Promise<string> {
  const pack = art.split('/')[0];
  const n = Number(art.split('/')[1]);
  const from = PACK_PALETTES[`${pack}:${n <= 50 ? 1 : 2}`];
  const url = gearIconUrl(art)!;
  if (!from) return url;
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const src = from.map(rgb);
  const dst = target.map(rgb);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < src.length; k++) {
      const dd = (d[i] - src[k][0]) ** 2 + (d[i + 1] - src[k][1]) ** 2 + (d[i + 2] - src[k][2]) ** 2;
      if (dd < bestD) [best, bestD] = [k, dd];
    }
    [d[i], d[i + 1], d[i + 2]] = dst[best];
  }
  g.putImageData(data, 0, 0);
  return c.toDataURL();
}
