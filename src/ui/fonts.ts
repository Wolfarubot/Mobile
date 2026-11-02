// Fonts the player can choose in Settings. All are bundled (see main.ts), so they work offline.
import '@fontsource/vt323/400.css';
import '@fontsource/jersey-10/400.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/800.css';
import '@fontsource/press-start-2p/400.css';
import { setCanvasFont } from '../render/fx';

export interface FontDef {
  id: string;
  name: string;
  /** CSS font-family list. */
  family: string;
  /** Its x-height as a share of the font size (measured). Everything is drawn at Pixel's (what the UI was sized for), so none reads too small or big. */
  aspect: number;
}

export const FONTS: FontDef[] = [
  { id: 'terminal', name: 'Terminal', family: "'VT323', monospace", aspect: 0.4 },
  { id: 'pixel', name: 'Pixel', family: "'Pixelify Sans', system-ui, sans-serif", aspect: 0.45 },
  { id: 'jersey', name: 'Jersey', family: "'Jersey 10', system-ui, sans-serif", aspect: 0.43 },
  { id: 'arcade', name: 'Arcade', family: "'Press Start 2P', monospace", aspect: 0.75 },
  { id: 'rounded', name: 'Rounded', family: "'Nunito', system-ui, sans-serif", aspect: 0.5 },
  { id: 'system', name: 'System', family: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", aspect: 0.52 },
];

/** The x-height every font is drawn at: Pixel's, which the UI was sized for. (Terminal, first, is the default.) */
const BASE_ASPECT = 0.45;
/**
 * Settings → Text size: how much bigger or smaller than Pixel's x-height all text is drawn. Medium (a touch bigger
 * than the UI was first sized for, for legibility) is the default.
 */
export const TEXT_SCALES = { small: 0.94, medium: 1.06, large: 1.18 } as const;

export const fontDef = (id: string): FontDef => FONTS.find((f) => f.id === id) ?? FONTS[0];

/** Puts a font into effect for the menus and the battlefield text. */
export function applyFont(id: string, size: keyof typeof TEXT_SCALES = 'medium'): void {
  const scale = TEXT_SCALES[size] ?? TEXT_SCALES.medium;
  const f = fontDef(id);
  const root = document.documentElement;
  for (const x of FONTS) root.classList.toggle(`font-${x.id}`, x.id === f.id);
  root.style.setProperty('--ui-font', f.family);
  root.dataset.textSize = size;
  root.style.setProperty('--font-adjust', String(BASE_ASPECT * scale));
  // Tight, fixed-size controls (the tabs, sub-tabs, star rows) stay at Medium whatever the Text size.
  root.style.setProperty('--font-adjust-fixed', String(BASE_ASPECT * TEXT_SCALES.medium));
  setCanvasFont(f.family, (BASE_ASPECT * scale) / f.aspect);
}
