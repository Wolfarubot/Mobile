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

// Gear icons (src/assets/gear-icons/<pack>/<name>.png), keyed "<pack>/<name>" as in GEAR_SPRITES.
const gearFiles = import.meta.glob('../assets/gear-icons/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const gearUrls = new Map<string, string>();
const gearImages = new Map<string, HTMLImageElement>();
for (const [path, url] of Object.entries(gearFiles)) {
  const key = path.replace(/^.*\/gear-icons\//, '').replace(/\.png$/, '');
  gearUrls.set(key, url);
}

/** URL of a gear icon for the DOM, or null. */
export function gearIconUrl(key: string | undefined): string | null {
  return key ? (gearUrls.get(key) ?? null) : null;
}

/** A loaded gear icon for the battlefield (loaded on first use), or null until it's ready. */
export function gearImage(key: string | undefined): HTMLImageElement | null {
  if (!key) return null;
  let img = gearImages.get(key);
  if (!img) {
    const url = gearUrls.get(key);
    if (!url) return null;
    img = new Image();
    img.src = url;
    gearImages.set(key, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}
