import { drawNine } from './art';
import { TITLE_Y, type MinigameApi, type MinigameGame } from './shell';
import { drawFramedBar, TIMER_COLOR } from '../../render/hudBars';
import { HUNTER_SHEETS } from '../../render/hunterSheets';
import { hunterSheetImage } from '../../render/sprites';

/**
 * Marceline's Rune Match (the Venom Caverns): tarot-like cards are dealt face up for a moment, then turned over;
 * turn two at a time to find the pairs. The board grows each time it's cleared: 2×2, 3×3 (its middle left out, so
 * the cards pair up), 4×4, 5×5, 6×6, 7×7 (middle out again) and 8×8, which then repeats. It's timed, with no hearts:
 * a wrong pair shakes and turns back over, and the cards can't be touched while it does (the penalty is the time
 * lost). 1 point a pair, and a cleared board adds a point for each of its pairs. The clock stops while a board is
 * being shown. Marceline stands below the board channelling the magic, her violet aura growing the further you get;
 * a wrong pair snuffs it for a moment while she shakes her head, then it returns as it was.
 */

export const RM_TIME = 90;
export const RM_INTRO = `<p>The cards are shown face up for a moment, then turned over. <b>Turn two at a time</b> to find the pairs: 1 point a pair, and clearing the board doubles it.</p><p>Each board is bigger than the last. A wrong pair shakes and turns back over, costing you time. You have ${RM_TIME} seconds.</p>`;

/** Boards in order: their size, with the middle left out of the odd ones. The last repeats. */
export const RM_BOARDS = [2, 3, 4, 5, 6, 7, 8];
/** The cells of an n×n board that hold cards (all but the middle of an odd one). */
export function boardCells(n: number): number[] {
  const mid = n % 2 ? (n * n - 1) / 2 : -1;
  return Array.from({ length: n * n }, (_, i) => i).filter((i) => i !== mid);
}

/** The card faces: sixteen of the warlock's violet sigils and sixteen of the priest's gold ones (32 pairs for 8×8). */
const FACES = [
  ...[52, 54, 56, 62, 65, 69, 70, 72, 73, 78, 80, 82, 83, 91, 96, 100].map((n) => `ab-rogue-warlock/${String(n).padStart(3, '0')}`),
  ...[1, 2, 5, 12, 20, 26, 29, 35, 37, 41, 44, 47, 49, 57, 67, 76].map((n) => `ab-priest-bard/${String(n).padStart(3, '0')}`),
];
/** Every card's back: a violet star sigil, on deep violet with a gold border. */
const BACK = 'rpg-items/261';

/** Seconds: a card turning over, a wrong pair shaking, and a board shown face up (more for more cards). */
const FLIP = 0.16;
const SHAKE = 0.55;
const showTime = (pairs: number) => 1.2 + pairs * 0.11;
/** Seconds Marceline's aura is out after a wrong pair (she shakes her head meanwhile). */
const NO = 1;
/** Room kept at the bottom for Marceline. */
const MARCELINE_ROOM = 130;

interface Card {
  face: string;
  /** Its cell on the board. */
  cell: number;
  up: boolean;
  matched: boolean;
  /** Seconds left turning (to whichever side `up` says), and shaking. */
  turn: number;
  shake: number;
}

export function runeMatch(api: MinigameApi): MinigameGame {
  let board = 0;
  let cards: Card[] = [];
  /** Seconds left: the board shown face up, a wrong pair shaking, and the pause before the next board. */
  let preview = 0;
  let wrong = 0;
  let next = 0;
  let picked: number[] = [];
  /** Seconds of play used (the clock stops while a board is shown or being dealt). */
  let used = 0;
  let over = false;
  /** Pairs found in all, and seconds left of Marceline shaking her head (her aura out). */
  let found = 0;
  let no = 0;
  const size = () => RM_BOARDS[Math.min(board, RM_BOARDS.length - 1)];

  const deal = () => {
    const n = size();
    const cells = boardCells(n);
    const faces = [...FACES].sort(() => Math.random() - 0.5).slice(0, cells.length / 2);
    const deck = [...faces, ...faces].sort(() => Math.random() - 0.5);
    cards = cells.map((cell, i) => ({ face: deck[i], cell, up: true, matched: false, turn: FLIP, shake: 0 }));
    preview = showTime(cells.length / 2);
    picked = [];
  };

  /** Card size (tall, like a tarot card, 2:3) and where the grid starts, to fit between the timer and the bottom. */
  const layout = () => {
    const n = size();
    const gap = Math.max(4, Math.round(10 * api.k - n));
    const top = TITLE_Y + 46;
    const availH = api.H - top - MARCELINE_ROOM * api.k;
    const availW = api.W - 24;
    const cw = Math.floor(Math.min((availW - gap * (n - 1)) / n, ((availH - gap * (n - 1)) / n) * (2 / 3), 110 * api.k));
    const ch = Math.floor(cw * 1.5);
    const x0 = Math.round((api.W - (cw * n + gap * (n - 1))) / 2);
    const y0 = Math.round(top + (availH - (ch * n + gap * (n - 1))) / 2);
    return { n, gap, cw, ch, x0, y0 };
  };
  const rect = (c: Card) => {
    const l = layout();
    return { x: l.x0 + (c.cell % l.n) * (l.cw + l.gap), y: l.y0 + Math.floor(c.cell / l.n) * (l.ch + l.gap), w: l.cw, h: l.ch };
  };

  const turn = (c: Card, up: boolean) => {
    c.up = up;
    c.turn = FLIP;
  };

  /**
   * Marceline at the bottom, facing you, channelling: a violet aura round her that grows with the boards cleared and
   * the pairs found (it's out while she shakes her head at a wrong pair: looking left, right, left, right).
   */
  const drawMarceline = (g: CanvasRenderingContext2D) => {
    const x = api.W / 2;
    const feet = api.H - 18 * api.k;
    const H = 84 * api.k;
    const cy = feet - H * 0.45;
    if (no <= 0) {
      // Grows with every pair found, quickest early on (all seven boards' 100 pairs fill it).
      const progress = Math.min(1, Math.sqrt(found / 100));
      const R = (44 + 66 * progress) * api.k * (1 + Math.sin(api.t * 3) * 0.04);
      const glow = g.createRadialGradient(x, cy, R * 0.15, x, cy, R);
      glow.addColorStop(0, 'rgba(214,170,255,0.7)');
      glow.addColorStop(0.55, 'rgba(160,90,240,0.38)');
      glow.addColorStop(1, 'rgba(120,50,200,0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(x, cy, R, 0, Math.PI * 2);
      g.fill();
      // Motes circling her, more of them as the aura grows.
      const motes = 4 + Math.round(progress * 10);
      g.fillStyle = '#ead6ff';
      for (let i = 0; i < motes; i++) {
        const a = api.t * (1.2 + (i % 3) * 0.3) + (i * Math.PI * 2) / motes;
        const r = R * (0.55 + 0.3 * Math.sin(api.t * 2 + i));
        const ps = Math.max(2, Math.round(2 * api.k));
        g.globalAlpha = 0.6 + 0.4 * Math.sin(api.t * 4 + i);
        g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.75), ps, ps);
      }
      g.globalAlpha = 1;
    }
    const sheet = HUNTER_SHEETS.enchantress;
    const img = hunterSheetImage('enchantress');
    if (!sheet || !img || !img.complete || !img.naturalWidth) return;
    // Facing you (down); shaking her head: left, right, left, right.
    const row = no > 0 ? (Math.floor((NO - no) / (NO / 4)) % 2 ? 2 : 1) : 0;
    const F = sheet.frame;
    const col = no > 0 ? 0 : Math.floor(api.t * 6) % sheet.frames[row];
    const [bx, by, bw, bh] = sheet.box;
    const k = H / bh;
    g.drawImage(img, col * F, row * F, F, F, x - (bx + bw / 2) * k, feet - (by + bh) * k, F * k, F * k);
  };

  deal();
  return {
    titleSuffix: () => `${Math.ceil(Math.max(0, RM_TIME - used))}s`,
    tap(x, y) {
      if (over || preview > 0 || wrong > 0 || next > 0) return;
      for (const c of cards) {
        const r = rect(c);
        if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
        if (c.up || c.matched) return;
        turn(c, true);
        picked.push(cards.indexOf(c));
        if (picked.length === 2) {
          const [a, b] = picked.map((i) => cards[i]);
          if (a.face === b.face) {
            a.matched = b.matched = true;
            picked = [];
            found++;
            api.addScore(1, r.x + r.w / 2, r.y);
            if (cards.every((k) => k.matched)) {
              const pairs = cards.length / 2;
              api.addScore(pairs);
              api.pop(api.W / 2, layout().y0 - 10, `Board cleared! +${pairs}`, '#c9a8ff');
              next = 0.9;
            }
          } else {
            // They shake, then turn back over; nothing can be touched until they have.
            a.shake = b.shake = SHAKE;
            wrong = SHAKE + FLIP;
            no = NO;
          }
        }
        return;
      }
    },
    step(dt) {
      no = Math.max(0, no - dt);
      for (const c of cards) {
        c.turn = Math.max(0, c.turn - dt);
        c.shake = Math.max(0, c.shake - dt);
      }
      if (preview > 0) {
        preview -= dt;
        if (preview <= 0) for (const c of cards) turn(c, false);
        return;
      }
      if (next > 0) {
        next -= dt;
        if (next <= 0) {
          board++;
          deal();
        }
        return;
      }
      if (wrong > 0) {
        wrong -= dt;
        // The shake done: the pair turns back over.
        if (wrong <= FLIP && picked.length === 2) {
          for (const i of picked) turn(cards[i], false);
          picked = [];
        }
      }
      used += dt;
      if (!over && used >= RM_TIME) {
        over = true;
        api.end();
      }
    },
    draw(g) {
      g.imageSmoothingEnabled = false;
      // A dim, violet hush over the caverns.
      g.fillStyle = 'rgba(14,6,24,0.45)';
      g.fillRect(0, 0, api.W, api.H);

      // The clock under the title: the battlefield's framed event timer.
      const left = Math.max(0, RM_TIME - used) / RM_TIME;
      const BS = 2;
      const nw = Math.floor(Math.min(api.W * 0.8, 360) / BS);
      const bx = Math.round((api.W - nw * BS) / 2);
      if (!drawFramedBar(g, bx, TITLE_Y + 16, BS, nw, 9, left, left < 0.12 ? '#ff6a6a' : TIMER_COLOR)) {
        g.fillStyle = TIMER_COLOR;
        g.fillRect(bx, TITLE_Y + 16, nw * BS * left, 10);
      }

      for (const c of cards) {
        const r = rect(c);
        // Turning: squeezed to nothing at the halfway point, showing the side it's turning from until then.
        const p = c.turn / FLIP; // 1 → 0
        const squeeze = Math.abs(1 - 2 * (1 - p));
        const showUp = p > 0.5 ? !c.up : c.up;
        const shake = c.shake > 0 ? Math.sin(c.shake * 60) * 4 * api.k * (c.shake / SHAKE) : 0;
        const cx = r.x + r.w / 2 + shake;
        g.save();
        g.translate(cx, r.y + r.h / 2);
        g.scale(Math.max(0.02, p > 0 ? squeeze : 1), 1);
        drawCard(g, api, r.w, r.h, showUp || c.matched ? c.face : null, c.matched, c.shake > 0);
        g.restore();
      }

      drawMarceline(g);

      if (preview > 0) {
        g.font = `bold ${Math.round(15 * api.k)}px monospace`;
        g.textAlign = 'center';
        g.lineWidth = 3;
        g.strokeStyle = '#000';
        const y = layout().y0 - 12;
        g.strokeText('Remember them…', api.W / 2, y);
        g.fillStyle = '#e6d4ff';
        g.fillText('Remember them…', api.W / 2, y);
      }
    },
  };
}

/**
 * A card, centred on the origin, w × h: the RPG UI pack's panel (public/ui/panel.png: a wooden frame around parchment),
 * with its icon on the face or, if `face` is null, tinted violet with the sigil on its back. A matched pair turns
 * green, a wrong one red.
 */
function drawCard(g: CanvasRenderingContext2D, api: MinigameApi, w: number, h: number, face: string | null, matched: boolean, wrong: boolean): void {
  g.save();
  g.filter = wrong ? 'hue-rotate(-30deg) saturate(2.4)' : matched ? 'hue-rotate(60deg) saturate(1.6)' : face ? 'none' : 'hue-rotate(230deg) saturate(1.5) brightness(0.55)';
  drawNine(g, 'ui/panel', -w / 2, -h / 2, w, h, 6, Math.max(1, Math.round(w / 40)));
  g.restore();
  if (face) api.icon(face, 0, 0, Math.round(w * 0.66), matched ? 0.55 : 1);
  else api.icon(BACK, 0, 0, Math.round(w * 0.62));
}
