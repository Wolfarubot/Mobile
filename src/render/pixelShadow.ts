/**
 * A blocky pixel-art ellipse in solid black, drawn once at a small size and stamped (unsmoothed, so its pixels
 * stay square) under everything that stands on the ground: on the battlefield and in the minigames. Made the first
 * time it's needed (not at load, so modules importing this still load without a page).
 */
let shadow: HTMLCanvasElement | null = null;
const makeShadow = (): HTMLCanvasElement => {
  const W = 16;
  const H = 6;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - W / 2) / (W / 2);
      const dy = (y + 0.5 - H / 2) / (H / 2);
      if (dx * dx + dy * dy <= 1.08) g.fillRect(x, y, 1, 1);
    }
  return c;
};

/** Stamps the pixel shadow: centred on (x, y), `rx` and `ry` its half-width and half-height, at `alpha`. */
export function pixelShadow(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha: number): void {
  const a = g.globalAlpha;
  const smooth = g.imageSmoothingEnabled;
  g.globalAlpha = a * alpha;
  g.imageSmoothingEnabled = false;
  g.drawImage((shadow ??= makeShadow()), x - rx, y - ry, rx * 2, ry * 2);
  g.globalAlpha = a;
  g.imageSmoothingEnabled = smooth;
}
