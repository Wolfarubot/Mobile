import type { MinigameApi, MinigameGame } from './shell';
import { roundRect } from './shell';

/**
 * Marceline's Rune Match (the Venom Caverns): a board of runes is shown face up for a moment, then turned over.
 * Turn two at a time to find the pairs: 1 point a pair, 3 more for clearing the board. Each board is bigger and
 * shown for less time. A pair that doesn't match costs a heart.
 */

export const RM_INTRO = '<p>Runes are shown face up for a moment, then turned over. <b>Turn two at a time</b> to find matching pairs: 1 point a pair, 3 more for each board cleared.</p><p>Each board is bigger and shown more briefly. A wrong pair costs a heart.</p>';

/** Boards in order: columns, rows and seconds the runes are shown face up. The last repeats. */
const BOARDS = [
  { cols: 3, rows: 4, show: 3 },
  { cols: 4, rows: 4, show: 3 },
  { cols: 4, rows: 5, show: 3 },
  { cols: 4, rows: 6, show: 3 },
  { cols: 5, rows: 6, show: 2.5 },
];

const RUNES = [
  'ab-alchemist-shaman/069',
  'ab-alchemist-shaman/077',
  'ab-alchemist-shaman/089',
  'ab-alchemist-shaman/071',
  'ab-geo-aero/081',
  'ab-geo-aero/091',
  'ab-pyro-hydro/069',
  'ab-pyro-hydro/012',
  'ab-paladin-dk/093',
  'ab-rogue-warlock/065',
  'ab-rogue-warlock/090',
  'ab-engineer-psionic/090',
  'ab-priest-bard/045',
  'ab-gunslinger-druid/051',
  'ab-cavalier-monk/053',
];

interface Card {
  rune: string;
  up: boolean;
  matched: boolean;
}

export function runeMatch(api: MinigameApi): MinigameGame {
  let board = 0;
  let cards: Card[] = [];
  let preview = 0;
  let picked: number[] = [];
  let flipBack = 0;
  let next = 0;
  const spec = () => BOARDS[Math.min(board, BOARDS.length - 1)];
  const deal = () => {
    const s = spec();
    const pairs = (s.cols * s.rows) / 2;
    const runes = [...RUNES].sort(() => Math.random() - 0.5).slice(0, pairs);
    cards = [...runes, ...runes].sort(() => Math.random() - 0.5).map((rune) => ({ rune, up: true, matched: false }));
    preview = s.show;
    picked = [];
  };
  const layout = () => {
    const s = spec();
    const gap = 8;
    const size = Math.min((api.W - 32 - gap * (s.cols - 1)) / s.cols, (api.H - 260 - gap * (s.rows - 1)) / s.rows);
    const x0 = (api.W - (size * s.cols + gap * (s.cols - 1))) / 2;
    const y0 = 120 + (api.H - 260 - (size * s.rows + gap * (s.rows - 1))) / 2;
    return { size, gap, x0, y0, cols: s.cols };
  };
  const rect = (i: number) => {
    const l = layout();
    return { x: l.x0 + (i % l.cols) * (l.size + l.gap), y: l.y0 + Math.floor(i / l.cols) * (l.size + l.gap), size: l.size };
  };
  deal();
  return {
    tap(x, y) {
      if (preview > 0 || flipBack > 0 || next > 0) return;
      for (let i = 0; i < cards.length; i++) {
        const r = rect(i);
        if (x < r.x || x > r.x + r.size || y < r.y || y > r.y + r.size) continue;
        const c = cards[i];
        if (c.up || c.matched) return;
        c.up = true;
        picked.push(i);
        if (picked.length === 2) {
          const [a, b] = picked;
          if (cards[a].rune === cards[b].rune) {
            cards[a].matched = cards[b].matched = true;
            picked = [];
            api.addScore(1, r.x + r.size / 2, r.y + r.size / 2);
            if (cards.every((k) => k.matched)) {
              api.addScore(3, api.W / 2, api.H / 2);
              api.pop(api.W / 2, api.H / 2 - 30, 'Board cleared!', '#c9a8ff');
              next = 1;
            }
          } else {
            flipBack = 0.7;
            api.loseLife(r.x + r.size / 2, r.y + r.size / 2);
          }
        }
        return;
      }
    },
    step(dt) {
      if (preview > 0) {
        preview -= dt;
        if (preview <= 0) for (const c of cards) c.up = false;
      }
      if (flipBack > 0) {
        flipBack -= dt;
        if (flipBack <= 0) {
          for (const i of picked) cards[i].up = false;
          picked = [];
        }
      }
      if (next > 0) {
        next -= dt;
        if (next <= 0) {
          board++;
          deal();
        }
      }
    },
    draw(g) {
      g.font = `bold ${Math.round(18 * api.k)}px monospace`;
      g.textAlign = 'center';
      g.fillStyle = '#fff';
      g.fillText(preview > 0 ? `Remember them… ${Math.ceil(preview)}` : `Board ${board + 1}`, api.W / 2, 104);
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        const r = rect(i);
        roundRect(g, r.x, r.y, r.size, r.size, 8);
        g.fillStyle = c.matched ? 'rgba(122,220,58,0.35)' : c.up ? '#efe4ff' : '#3a2a5a';
        g.fill();
        g.strokeStyle = c.matched ? '#7adc3a' : '#c9a8ff';
        g.lineWidth = 2;
        g.stroke();
        if (c.up || c.matched) api.icon(c.rune, r.x + r.size / 2, r.y + r.size / 2, r.size * 0.72, c.matched ? 0.6 : 1);
        else {
          g.fillStyle = '#c9a8ff';
          g.font = `bold ${Math.round(r.size * 0.4)}px serif`;
          g.textBaseline = 'middle';
          g.fillText('✦', r.x + r.size / 2, r.y + r.size / 2);
          g.textBaseline = 'alphabetic';
        }
      }
      api.icon('ab-alchemist-shaman/069', api.W / 2, api.H - 70, 56);
    },
  };
}
