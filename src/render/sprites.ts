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
