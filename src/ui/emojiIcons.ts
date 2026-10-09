import { gearIconUrl } from '../render/sprites';

/**
 * Every emoji the game uses, drawn as a pixel-art icon instead (keys into public/icons/<pack>/<NNN>.png).
 * The swap happens on the page itself (see installEmojiIcons), so text anywhere in the UI can keep using
 * emoji: change an icon here and it changes everywhere. Typographic symbols (★ ✓ ✕ arrows) stay as text.
 */
export const EMOJI_ICONS: Record<string, string> = {
  "⏱️": 'status2/005',
  "⏳": 'status2/004',
  "⌛": 'status2/001',
  "☁️": 'ab-geo-aero/065',
  "☄️": 'ab-pyro-hydro/001',
  "☠️": 'ab-alchemist-shaman/024',
  "♻️": 'resources3/004',
  "⚒️": 'resources3/001',
  "⚔️": 'status5/009',
  "⚗️": 'ab-alchemist-shaman/010',
  "⚙️": 'ab-engineer-psionic/004',
  "⚜️": 'ab-paladin-dk/041',
  "⚡": 'status5/091',
  "⚰️": 'ab-paladin-dk/083',
  "⚱️": 'things/057',
  "⛏️": 'resources3/005',
  "⛺": 'resources3/020',
  "✂️": 'nature/001',
  "✋": 'status4/004',
  "🤚": 'status4/001',
  "👋": 'status4/004',
  "✨": 'status5/065',
  "✴️": 'status5/066',
  "❄️": 'status2/095',
  "➡️": 'status3/089',
  "↪️": 'status3/089',
  "➶": 'ab-hunter-warrior/023',
  "🌀": 'status3/029',
  "🌅": 'ab-priest-bard/001',
  "🌈": 'status5/062',
  "🌊": 'ab-pyro-hydro/076',
  "🌋": 'ab-pyro-hydro/041',
  "🌌": 'ab-engineer-psionic/078',
  "🌐": 'ab-engineer-psionic/060',
  "🌑": 'ab-engineer-psionic/052',
  "🌟": 'status5/068',
  "⭐": 'status5/068',
  "🌠": 'ab-pyro-hydro/005',
  "🌤️": 'ab-geo-aero/076',
  "🌧️": 'ab-hunter-warrior/008',
  "🌩️": 'ab-geo-aero/093',
  "🌪️": 'ab-geo-aero/061',
  "🌬️": 'ab-geo-aero/065',
  "🌱": 'nature/033',
  "🌲": 'ab-gunslinger-druid/069',
  "🌳": 'ab-gunslinger-druid/084',
  "🌵": 'ab-gunslinger-druid/062',
  "🌸": 'nature/059',
  "🌿": 'nature/013',
  "🍀": 'nature/020',
  "🍂": 'nature/023',
  "🍃": 'nature/018',
  "🍄": 'nature/081',
  "🍖": 'resources1/055',
  "🎁": 'things/010',
  "🎇": 'status5/062',
  "🎉": 'ab-priest-bard/043',
  "🎎": 'ab-rogue-warlock/085',
  "🎒": 'things/024',
  "🎤": 'ab-priest-bard/060',
  "🎭": 'ab-priest-bard/061',
  "🎯": 'ab-hunter-warrior/015',
  "🎲": 'ab-priest-bard/076',
  "🎵": 'status3/051',
  "🎶": 'ab-priest-bard/081',
  "🎼": 'ab-priest-bard/091',
  "🏅": 'ab-gunslinger-druid/039',
  "🏆": 'ab-paladin-dk/033',
  "🏔️": 'ab-pyro-hydro/088',
  "🏮": 'rpg-items/271',
  "🏰": 'ab-geo-aero/016',
  "🏹": 'weapons/031',
  "🐉": 'ab-cavalier-monk/086',
  "🐦": 'resources1/091',
  "🐺": 'resources1/032',
  "🐾": 'ab-gunslinger-druid/058',
  "👁️": 'status1/064',
  "👃": 'ab-geo-aero/045',
  "👆": 'status4/001',
  "👊": 'status4/008',
  "👑": 'armor7/068',
  "👕": 'clothing/011',
  "👘": 'armor7/082',
  "👚": 'clothing/012',
  "👛": 'things/011',
  "👜": 'things/013',
  "👝": 'things/014',
  "👣": 'status5/074',
  "👤": 'ab-rogue-warlock/017',
  "👥": 'ab-rogue-warlock/036',
  "👻": 'ab-alchemist-shaman/079',
  "👾": 'ab-alchemist-shaman/060',
  "💀": 'status1/091',
  "💍": 'jewelry/001',
  "💎": 'resources3/081',
  "💠": 'resources3/074',
  "💡": 'status5/061',
  "💢": 'status1/081',
  "💤": 'status5/084',
  "💥": 'ab-pyro-hydro/012',
  "💦": 'ab-alchemist-shaman/036',
  "💧": 'status5/041',
  "💨": 'ab-geo-aero/065',
  "💪": 'status1/052',
  "💫": 'status5/063',
  "💬": 'status3/056',
  "💰": 'things/006',
  "📊": 'status3/084',
  "📍": 'status3/099',
  "📏": 'status3/090',
  "📐": 'status3/085',
  "📕": 'wands-books/075',
  "📖": 'wands-books/062',
  "📘": 'wands-books/054',
  "📗": 'wands-books/059',
  "📓": 'wands-books/055',
  "📜": 'wands-books/081',
  "📯": 'instruments/033',
  "🔄": 'status3/030',
  "🔊": 'ab-priest-bard/053',
  "🔋": 'ab-gunslinger-druid/023',
  "🔒": 'status3/037',
  "🔥": 'status5/051',
  "🔧": 'resources3/002',
  "🔨": 'resources3/003',
  "🔩": 'ab-engineer-psionic/021',
  "🔪": 'resources1/001',
  "🔫": 'weapons5/041',
  "🔭": 'jewelry/042',
  "🔮": 'rpg-items/312',
  "🔯": 'ab-rogue-warlock/065',
  "🔱": 'weapons3/035',
  "🔷": 'resources3/098',
  "🕯️": 'ab-alchemist-shaman/046',
  "🕳️": 'ab-engineer-psionic/087',
  "🗝️": 'ab-rogue-warlock/049',
  "🗡️": 'status5/001',
  "🗺️": 'wands-books/100',
  "🗿": 'ab-geo-aero/040',
  "😈": 'status4/040',
  "👿": 'status4/037',
  "🛠️": 'resources3/010',
  "🛡️": 'status1/021',
  "🟢": 'rpg-items/041',
  "🤏": 'ab-rogue-warlock/045',
  "🥊": 'ab-hunter-warrior/063',
  "🥋": 'armor7/011',
  "🥚": 'resources1/079',
  "🥻": 'armor7/081',
  "🦅": 'resources1/076',
  "🦇": 'status4/070',
  "🦴": 'resources1/012',
  "🦷": 'resources1/017',
  "🦹": 'ab-rogue-warlock/009',
  "🦺": 'armor6/011',
  "🧊": 'ab-pyro-hydro/083',
  "🧑": 'ab-hunter-warrior/026',
  "🧘": 'ab-priest-bard/024',
  "🧙": 'ab-pyro-hydro/003',
  "🧚": 'ab-priest-bard/020',
  "🧟": 'ab-paladin-dk/058',
  "🧠": 'ab-engineer-psionic/053',
  "🧤": 'armor-knight/001',
  "🧥": 'armor7/013',
  "🧪": 'ab-alchemist-shaman/010',
  "🧫": 'ab-alchemist-shaman/044',
  "🧬": 'ab-alchemist-shaman/022',
  "🧰": 'things/041',
  "🧱": 'status1/027',
  "🧵": 'ab-engineer-psionic/054',
  "🧻": 'resources1/005',
  "🩸": 'status5/044',
  "🪄": 'wands-books/014',
  "🪆": 'ab-engineer-psionic/064',
  "🪓": 'weapons/081',
  "🪕": 'instruments/014',
  "🪖": 'armor6/041',
  "🪙": 'things/001',
  "🪜": 'ab-paladin-dk/023',
  "🪡": 'ab-rogue-warlock/067',
  "⛓️": 'ab-rogue-warlock/067',
  "🪦": 'ab-rogue-warlock/014',
  "🪨": 'resources3/011',
  "🪬": 'weapons2/066',
  "🪲": 'status4/016',
  "🪵": 'resources3/031',
  "🪶": 'resources1/083',
  "🫧": 'ab-alchemist-shaman/036',
  "🐍": 'ab-rogue-warlock/032',
  "🗼": 'ab-geo-aero/016',
  "🎗️": 'cloaks-belts/023',
  "🦯": 'wands-books/001',
  "🦪": 'fishing/069',
  "🦎": 'resources1/034',
  "🪔": 'rpg-items/271',
  "🏏": 'weapons2/051',
  "🧿": 'jewelry/052',
  "🧛": 'status4/031',
  "👗": 'clothing/081',
  "🦄": 'ab-cavalier-monk/005',
  "❤️‍🔥": 'status1/046',
  "🧭": 'status3/098',
  "💋": 'ab-priest-bard/037',
  "📿": 'jewelry/035',
  "🦉": 'ab-gunslinger-druid/087',
  "🌕": 'ab-engineer-psionic/052',
  "🔦": 'rpg-items/271',
  "🪤": 'things/041',
};

const strip = (s: string): string => s.replace(/\uFE0F/g, '');
const ICONS = new Map(Object.entries(EMOJI_ICONS).map(([e, k]) => [strip(e), k]));
// Longest first so a sequence (❤️‍🔥) wins over its parts; variation selectors are optional.
const PATTERN = new RegExp(
  [...ICONS.keys()]
    .sort((a, b) => b.length - a.length)
    .map((e) => [...e].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\uFE0F?').join(''))
    .join('|'),
  'gu',
);

/** The icon key for an emoji (with or without its variation selector), or undefined. */
export function emojiIconKey(emoji: string): string | undefined {
  return ICONS.get(strip(emoji));
}

/** An <img> for an emoji's icon (as HTML), or the emoji itself if it has none. */
export function emojiImg(emoji: string, cls = 'ei'): string {
  const url = gearIconUrl(emojiIconKey(emoji));
  return url ? `<img class="${cls}" src="${url}" alt="${emoji}">` : emoji;
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'SELECT', 'CANVAS']);

function swapText(node: Text): void {
  const text = node.data;
  PATTERN.lastIndex = 0;
  if (!PATTERN.test(text)) return;
  const parent = node.parentNode;
  if (!parent || SKIP.has((parent as Element).nodeName)) return;
  const frag = document.createDocumentFragment();
  let last = 0;
  PATTERN.lastIndex = 0;
  for (let m = PATTERN.exec(text); m; m = PATTERN.exec(text)) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    const img = document.createElement('img');
    img.className = 'ei';
    img.src = gearIconUrl(emojiIconKey(m[0]))!;
    img.alt = m[0];
    img.draggable = false;
    frag.append(img);
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  parent.replaceChild(frag, node);
}

/** Swaps every mapped emoji under `root` for its icon. */
export function swapEmojis(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) return swapText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (SKIP.has((root as Element).nodeName)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
  for (const t of texts) swapText(t);
}

/** Keeps the whole page emoji-free: swaps what's there now and anything added or changed later. */
export function installEmojiIcons(): void {
  swapEmojis(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') swapText(r.target as Text);
      else for (const n of r.addedNodes) swapEmojis(n);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
