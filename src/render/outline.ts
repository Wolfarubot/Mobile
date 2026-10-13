/**
 * Outlines for pixel art: a picture of just the ring of empty pixels around its art (within `r` pixels, all
 * round), in one colour, made once per picture, colour and thickness. Drawn under the art with the same source
 * and destination rectangles, it rings each character or icon (the Clarity Border, the minigames' borders).
 */
const cache = new WeakMap<CanvasImageSource, Map<string, HTMLCanvasElement>>();

export function outlineOf(img: HTMLImageElement | HTMLCanvasElement, color = '#ffffff', r = 1): HTMLCanvasElement {
  let byKey = cache.get(img);
  if (!byKey) cache.set(img, (byKey = new Map()));
  const key = `${color}:${r}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const w = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const h = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.drawImage(img, 0, 0);
  const src = x.getImageData(0, 0, w, h).data;
  const out = x.createImageData(w, h);
  const n = parseInt(color.replace('#', ''), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const solid = (px: number, py: number) => px >= 0 && py >= 0 && px < w && py < h && src[(py * w + px) * 4 + 3] > 40;
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      if (solid(px, py)) continue;
      let near = false;
      for (let dy = -r; dy <= r && !near; dy++) for (let dx = -r; dx <= r && !near; dx++) if ((dx || dy) && solid(px + dx, py + dy)) near = true;
      if (!near) continue;
      const i = (py * w + px) * 4;
      out.data[i] = rgb[0];
      out.data[i + 1] = rgb[1];
      out.data[i + 2] = rgb[2];
      out.data[i + 3] = 255;
    }
  x.putImageData(out, 0, 0);
  byKey.set(key, c);
  return c;
}
