import { EYE_COLORS, PACK_EYES, PACK_SKIN, SKIN_TONES, partClass, type LookPart, type MainLook } from '../core/mainLook';
import { setHunterSheet } from './sprites';

/**
 * Your Hunter's idle sheet, put together from the look you chose (core/mainLook.ts): the body's sheet, the head's
 * over it, the packs' skin colours swapped for your skin tone and their eye colours for yours. It's the same layout
 * as every Hunter sheet (64px frames, 12 per row, rows down, left, right, up), so it's drawn like any other.
 */

const FRAME = 64;
const partImages = new Map<string, Promise<HTMLImageElement>>();

function loadPart(part: LookPart, kind: 'head' | 'body'): Promise<HTMLImageElement> {
  const key = `${part}-${kind}`;
  let p = partImages.get(key);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        partImages.delete(key);
        reject(new Error(`missing ${key}`));
      };
      img.src = `${import.meta.env.BASE_URL}hunters/parts/${key}.png`;
    });
    partImages.set(key, p);
  }
  return p;
}

const rgbKey = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

/** Recolours a layer in place: its pack's skin to the chosen tone, its irises to the chosen eye colour. */
function recolour(data: ImageData, part: LookPart, look: MainLook): void {
  const cls = partClass(part);
  const tone = (SKIN_TONES.find((t) => t.id === look.skin) ?? SKIN_TONES[3]).ramp;
  const eye = (EYE_COLORS.find((t) => t.id === look.eyes) ?? EYE_COLORS[0]).ramp;
  const skin = new Map<number, number[]>();
  PACK_SKIN[cls].forEach((c, i) => skin.set(rgbKey(...c), tone[i]));
  const iris = rgbKey(...PACK_EYES[cls][0]);
  const lower = rgbKey(...PACK_EYES[cls][1]);
  const d = data.data;
  const w = data.width;
  const at = (i: number) => (d[i + 3] ? rgbKey(d[i], d[i + 1], d[i + 2]) : -1);
  const src = new Int32Array(d.length / 4);
  for (let p = 0; p < src.length; p++) src[p] = at(p * 4);
  for (let p = 0; p < src.length; p++) {
    const k = src[p];
    if (k < 0) continue;
    let to: number[] | undefined = skin.get(k);
    if (k === iris) to = eye[0];
    // The iris's darker pixel only where it touches the iris (the same colour can be armour elsewhere).
    else if (k === lower && (src[p - 1] === iris || src[p + 1] === iris || src[p - w] === iris || src[p + w] === iris)) to = eye[1];
    if (to) {
      d[p * 4] = to[0];
      d[p * 4 + 1] = to[1];
      d[p * 4 + 2] = to[2];
    }
  }
}

function layer(img: HTMLImageElement, part: LookPart, look: MainLook, crop?: [number, number, number, number]): HTMLCanvasElement {
  const [sx, sy, sw, sh] = crop ?? [0, 0, img.naturalWidth, img.naturalHeight];
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const data = g.getImageData(0, 0, sw, sh);
  recolour(data, part, look);
  g.putImageData(data, 0, 0);
  return c;
}

/** The whole idle sheet for a look. */
export async function buildMainSheet(look: MainLook): Promise<HTMLCanvasElement> {
  const [body, head] = await Promise.all([loadPart(look.body, 'body'), loadPart(look.head, 'head')]);
  const c = document.createElement('canvas');
  c.width = body.naturalWidth;
  c.height = body.naturalHeight;
  const g = c.getContext('2d')!;
  g.drawImage(layer(body, look.body, look), 0, 0);
  g.drawImage(layer(head, look.head, look), 0, 0);
  return c;
}

/** One part's first facing-down frame, recoloured for the look (the editor's thumbnails). */
export async function partThumb(part: LookPart, kind: 'head' | 'body', look: MainLook): Promise<HTMLCanvasElement> {
  const img = await loadPart(part, kind);
  return layer(img, part, look, [0, 0, FRAME, FRAME]);
}

let applied = '';

/** Makes a look your Hunter's sheet everywhere they're drawn (the battlefield, minigames, the editor). */
export async function applyMainLook(look: MainLook): Promise<void> {
  const key = JSON.stringify(look);
  if (key === applied) return;
  applied = key;
  try {
    const sheet = await buildMainSheet(look);
    if (applied !== key) return; // a newer look came in meanwhile
    const img = new Image();
    img.src = sheet.toDataURL();
    await img.decode().catch(() => undefined);
    if (applied === key) setHunterSheet('main', img);
  } catch {
    if (applied === key) applied = ''; // keeps the old sheet; try again next time
  }
}
