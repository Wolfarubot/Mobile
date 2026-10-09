import type { AreaId } from '../core/balance';

/**
 * Painted battlefield backgrounds, built from tileset decor (public/backgrounds/<area>/, CraftPix tilesets):
 * a grass base with texture, small details scattered everywhere, bushes and stones outside the middle, and
 * trees, boulders and ruins only around the edges, so the fight in the centre stays easy to read. Drawn at
 * one tileset pixel per screen pixel (crisp), composed once per view size and reused every frame.
 */
interface Piece {
  file: string;
  /** How often it's picked within its band. */
  weight: number;
}
interface Band {
  pieces: Piece[];
  /** Pieces per 10,000 screen pixels. */
  density: number;
  /** Where they may go, as a fraction of the way from the centre to the nearest edge (0 centre, 1 edge). */
  from: number;
}
interface Scene {
  base: string;
  /** Texture specks: [colour, how many per 10,000 pixels]. */
  specks: Array<[string, number]>;
  bands: Band[];
}

const p = (files: string, weight = 1): Piece[] => files.split(' ').map((file) => ({ file, weight }));

const SCENES: Partial<Record<AreaId, Scene>> = {
  forest: {
    base: '#a0b35a',
    specks: [
      ['#8fa752', 30],
      ['#b2c25f', 22],
      ['#839f53', 10],
    ],
    bands: [
      // Small details anywhere: flowers, grass tufts, pebbles.
      { pieces: [...p('Flower1 Flower2 Flower3 Flower4 Flower5 Flower6 Flower7 Flower8 Flower9 Flower10 Flower11'), ...p('grass_element1 grass_element2 grass_element3', 3), ...p('Bush9 Bush16 Bush19 Rock_grass_element11 Rock_grass_element12 Rock_grass_element14 Stone5_grass_shadow ground_element22 ground_element23')], density: 4, from: 0 },
      // Bushes, stones and broken trunks outside the middle.
      { pieces: [...p('Bush7 Bush8 Bush10 Bush11 Bush12 Bush13 Bush15 Bush18', 2), ...p('Rock_grass_element13 Rpck_grass5 Stone3_grass_shadow Stone4_grass_shadow Broken_tree1 Broken_tree2 Broken_tree4 Broken_tree5')], density: 0.9, from: 0.45 },
      // Big bushes, boulders, a small tree and ruins nearer the edges.
      { pieces: [...p('Bush1 Bush2 Bush3 Bush4 Bush5 Bush6 Bush14 Bush17', 2), ...p('Rpck_grass1 Rpck_grass2 Rpck_grass3 Rpck_grass4 Stone1_grass_shadow Stone2_grass_shadow Tree5 Ruin3_grass_shadow Ruin4_grass_shadow')], density: 0.35, from: 0.7 },
      // Great trees and the old ruins right on the border, partly off the field.
      { pieces: [...p('Tree1 Tree2 Tree3 Tree4', 4), ...p('Ruin1_grass_shadow Ruin2_grass_shadow')], density: 0.12, from: 0.92 },
    ],
  },
};

const images = new Map<string, HTMLImageElement>();
const cache = new Map<string, HTMLCanvasElement>();
let loading: Promise<void> | null = null;
let ready = false;

/** Loads a scene's pieces once; the background appears when they're in. */
function load(area: AreaId, scene: Scene): void {
  if (loading) return;
  const files = [...new Set(scene.bands.flatMap((b) => b.pieces.map((x) => x.file)))];
  loading = Promise.all(
    files.map((f) => {
      const img = new Image();
      img.src = `${import.meta.env.BASE_URL}backgrounds/${area}/${f}.png`;
      images.set(f, img);
      return img.decode().catch(() => undefined);
    }),
  ).then(() => {
    ready = true;
    cache.clear();
  });
}

/** A seeded random number generator (the same layout every time for a view size). */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** The painted background for an area at a view size, or null if it has none (or it's still loading). */
export function areaBackground(area: AreaId, w: number, h: number): HTMLCanvasElement | null {
  const scene = SCENES[area];
  if (!scene) return null;
  load(area, scene);
  if (!ready) return null;
  const key = `${area}:${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.fillStyle = scene.base;
  g.fillRect(0, 0, w, h);
  const r = rng(w * 7919 + h * 104729);
  const area10k = (w * h) / 10_000;
  for (const [color, per] of scene.specks) {
    g.fillStyle = color;
    for (let i = 0; i < per * area10k; i++) g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 2), 1 + Math.floor(r() * 2));
  }

  // Place every band's pieces, then draw them top to bottom so nearer ones overlap farther ones.
  const placed: Array<{ img: HTMLImageElement; x: number; y: number }> = [];
  for (const band of scene.bands) {
    const total = band.pieces.reduce((s, x) => s + x.weight, 0);
    const want = Math.round(band.density * area10k);
    for (let i = 0, tries = 0; i < want && tries < want * 30; tries++) {
      const x = r() * w;
      const y = r() * h;
      // How far out it is: 0 at the centre, 1 at the nearest edge.
      const out = Math.max(Math.abs(x - w / 2) / (w / 2), Math.abs(y - h / 2) / (h / 2));
      if (out < band.from) continue;
      let pick = r() * total;
      const piece = band.pieces.find((x) => (pick -= x.weight) <= 0) ?? band.pieces[0];
      const img = images.get(piece.file);
      if (!img || !img.naturalWidth) continue;
      placed.push({ img, x: Math.round(x - img.naturalWidth / 2), y: Math.round(y - img.naturalHeight / 2) });
      i++;
    }
  }
  placed.sort((a, b) => a.y + a.img.naturalHeight - (b.y + b.img.naturalHeight));
  for (const it of placed) g.drawImage(it.img, it.x, it.y);
  cache.set(key, c);
  return c;
}
