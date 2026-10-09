// Optional artwork. Any PNG/WebP dropped into src/assets/sprites/ is picked up at build
// time and used instead of the placeholder shapes. See src/assets/sprites/README.md.

const files = import.meta.glob('../assets/sprites/**/*.{png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const images = new Map<string, HTMLImageElement>();
const urls = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
  // "../assets/sprites/enemies/slime.png" -> "enemies/slime"
  const key = path.replace(/^.*\/sprites\//, '').replace(/\.(png|webp)$/, '');
  const img = new Image();
  img.src = url;
  urls.set(key, url);
  images.set(key, img);
}

/** Returns a loaded sprite by key (e.g. "enemies/slime", "bosses/slime", "hunter"), or null. */
export function sprite(key: string): HTMLImageElement | null {
  const img = images.get(key);
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

/** URL of a sprite for use in the DOM (Hunter cards), or null if none was added. */
export function spriteUrl(key: string): string | null {
  return urls.get(key) ?? null;
}

// Icons (public/icons/<pack>/<NNN>.png, listed in public/icons/packs.json), keyed "<pack>/<NNN>" as in GEAR_SPRITES.
// They're served as plain files rather than bundled, so thousands of them cost nothing until one is shown.
const gearImages = new Map<string, HTMLImageElement>();

/** URL of an icon for the DOM, or null. */
export function gearIconUrl(key: string | undefined): string | null {
  return key ? `${import.meta.env.BASE_URL}icons/${key}.png` : null;
}

/** A loaded gear icon for the battlefield (loaded on first use), or null until it's ready. */
export function gearImage(key: string | undefined): HTMLImageElement | null {
  if (!key) return null;
  let img = gearImages.get(key);
  if (!img) {
    img = new Image();
    img.src = gearIconUrl(key)!;
    gearImages.set(key, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

// Monster walk sheets (public/monsters/<key>.png, see monsterSheets.ts). Loaded on first use.
const sheetImages = new Map<string, HTMLImageElement>();

/** A monster walk sheet's image (started loading on first call); check `complete` before drawing. */
export function monsterSheetImage(key: string): HTMLImageElement {
  let img = sheetImages.get(key);
  if (!img) {
    img = new Image();
    img.src = `${import.meta.env.BASE_URL}monsters/${key}.png`;
    sheetImages.set(key, img);
  }
  return img;
}
