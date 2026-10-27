import { EFFECTS, type EffectKey } from '../../render/effectSheets';
import { HUNTER_SHEETS } from '../../render/hunterSheets';
import { effectImage, hunterSheetImage } from '../../render/sprites';
import type { Wearer } from '../../core/state';

/**
 * Drawing helpers for the minigames, so everything they show comes from the game's asset packs: any picture under
 * public/ (scenery pieces, UI frames), nine-sliced frames, Hunters' idle animations and magic effect frames.
 */

const imgs = new Map<string, HTMLImageElement>();
/** A picture from public/ (its path without `.png`, e.g. `backgrounds/meteors/rock2`), once it has loaded. */
export function pubArt(path: string): HTMLImageElement | null {
  let img = imgs.get(path);
  if (!img) {
    img = new Image();
    img.src = `${import.meta.env.BASE_URL}${path}.png`;
    imgs.set(path, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/**
 * A frame picture (e.g. public/ui/panel.png) stretched to w × h around its middle: its `edge`-pixel corners and
 * borders keep their shape, drawn `s` times their size, and only the middle stretches. False until it has loaded.
 */
export function drawNine(g: CanvasRenderingContext2D, path: string, x: number, y: number, w: number, h: number, edge: number, s: number): boolean {
  const img = pubArt(path);
  if (!img) return false;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const e = edge * s;
  const sx = [0, edge, iw - edge, iw];
  const dx = [x, x + e, x + w - e, x + w];
  const sy = [0, edge, ih - edge, ih];
  const dy = [y, y + e, y + h - e, y + h];
  g.save();
  g.imageSmoothingEnabled = false;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const w0 = dx[i + 1] - dx[i];
      const h0 = dy[j + 1] - dy[j];
      if (w0 > 0 && h0 > 0) g.drawImage(img, sx[i], sy[j], sx[i + 1] - sx[i], sy[j + 1] - sy[j], dx[i], dy[j], w0, h0);
    }
  g.restore();
  return true;
}

/** A picture centred on (x, y), `h` tall (its width to scale), turned `rot` radians; false until it has loaded. */
export function drawArt(g: CanvasRenderingContext2D, path: string, x: number, y: number, h: number, rot = 0, alpha = 1): boolean {
  const img = pubArt(path);
  if (!img) return false;
  const w = (img.naturalWidth / img.naturalHeight) * h;
  g.save();
  g.imageSmoothingEnabled = false;
  g.globalAlpha *= alpha;
  g.translate(x, y);
  if (rot) g.rotate(rot);
  g.drawImage(img, -w / 2, -h / 2, w, h);
  g.restore();
  return true;
}

/**
 * A Hunter's idle animation (public/hunters/), its feet at (x, y) and the character `h` tall: row 0 faces down,
 * 1 left, 2 right, 3 up. `frame` picks the frame (wrapping), or it runs at 6 a second from `t`.
 */
export function drawHunter(g: CanvasRenderingContext2D, who: Wearer, x: number, y: number, h: number, t: number, row = 0, frame?: number): boolean {
  const sheet = HUNTER_SHEETS[who];
  const img = hunterSheetImage(who);
  if (!sheet || !img || !img.complete || !img.naturalWidth) return false;
  const F = sheet.frame;
  const n = sheet.frames[row] ?? sheet.frames[0];
  const col = (frame ?? Math.floor(t * 6)) % n;
  const [bx, by, bw, bh] = sheet.box;
  const k = h / bh;
  g.save();
  g.imageSmoothingEnabled = false;
  g.drawImage(img, col * F, row * F, F, F, x - (bx + bw / 2) * k, y - (by + bh) * k, F * k, F * k);
  g.restore();
  return true;
}

/**
 * One frame of a magic effect (public/effects/), its bounding box centred on (x, y) and `size` across its longer
 * side, turned `rot` radians. False until it has loaded.
 */
export function drawEffect(g: CanvasRenderingContext2D, key: EffectKey, frame: number, x: number, y: number, size: number, rot = 0, alpha = 1): boolean {
  const sheet = EFFECTS[key];
  const img = effectImage(key);
  if (!img) return false;
  const F = sheet.frame;
  const [bx, by, bw, bh] = sheet.box;
  const k = size / Math.max(bw, bh);
  g.save();
  g.imageSmoothingEnabled = false;
  g.globalAlpha *= alpha;
  g.translate(x, y);
  if (rot) g.rotate(rot);
  const f = Math.max(0, Math.min(sheet.frames - 1, Math.floor(frame)));
  g.drawImage(img, f * F, 0, F, F, -(bx + bw / 2) * k, -(by + bh / 2) * k, F * k, F * k);
  g.restore();
  return true;
}

/** A magic effect played once where something happened: its frames over `dur` seconds. */
export interface Burst {
  key: EffectKey;
  x: number;
  y: number;
  size: number;
  t: number;
  dur: number;
  /** The frames to play, from and to (all of them unless set). */
  from?: number;
  to?: number;
  rot?: number;
}

/** Steps and draws a list of bursts, dropping the ones that have finished. */
export function stepBursts(list: Burst[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].t += dt;
    if (list[i].t >= list[i].dur) list.splice(i, 1);
  }
}

export function drawBursts(g: CanvasRenderingContext2D, list: Burst[]): void {
  for (const b of list) {
    const from = b.from ?? 0;
    const to = b.to ?? EFFECTS[b.key].frames - 1;
    drawEffect(g, b.key, from + (to - from + 1) * (b.t / b.dur), b.x, b.y, b.size, b.rot ?? 0);
  }
}
