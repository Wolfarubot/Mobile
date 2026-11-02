import { canvasFont } from '../../render/fx';
import { drawHunter } from './art';
import { mgArt } from './dpad';
import { TITLE_Y, type MinigameApi, type MinigameGame } from './shell';

/**
 * Ted's Card Hop (the Cloud Fortress): rows of playing cards slide across the table, each row its own way, and Ted
 * hops up from card to card. Tap a card in the row above (within a hop's reach) to jump onto it; tap one beside him
 * to step across. His card carries him along, and if it takes him off the edge he falls (a heart) and climbs back
 * onto the row. The board scrolls up as he climbs, each row a little quicker.
 *
 * Every hop up scores by the card: Ace to 3 are 1 point, 4 to 7 are 2, 8 to 10 are 3, Jack to King 4 (a Joker 2).
 * Landing on the next rank up from his card (… Queen, King, Ace, 2 …) doubles it, plus a bonus that grows with
 * each one in a row. A Joker always counts as the next card, and so does any card after one, so Jokers skip ranks.
 * Ted starts below the Ace (an Ace is the next card from the start). Sixty seconds.
 *
 * (Ted's minigame was High or Low; it keeps that id, so its buff, best score and saves carry on.)
 */

export const CH_TIME = 60;
export const CH_INTRO =
  "<p>Cards slide across the table. <b>Tap</b> a card in the row above to hop Ted onto it, or one beside him to step across. Don't let his card carry him off the edge: that costs a heart.</p><p>Higher cards score more: Ace to 3 are 1, 4 to 7 are 2, 8 to 10 are 3, and Jack to King 4.</p><p>Hop onto the <b>next card up</b> (… Queen, King, Ace, 2 …) for double, and more for every one in a row. A <b>Joker</b> always counts as the next card, and so does whatever you hop to from it. You have " +
  CH_TIME +
  ' seconds.</p>';

/** The playing card sheet (public/minigames/cards.png): 56 × 80, 15 a row; jokers in column 0, Ace to King in 2 to 14. */
const CARD_W = 56;
const CARD_H = 80;
/** The sheet's row for each suit (spades, hearts, diamonds, clubs); jokers are in rows 0 to 3 of column 0. */
const SUIT_ROW = [1, 0, 2, 3];
const JOKER = 13;
const JOKER_CHANCE = 0.06;
/** A row's cards, end to end: each card's width plus a gap this many card widths, at random. */
const GAP: [number, number] = [0.35, 1.5];
/** How far up a hop reaches sideways, in card widths. */
const REACH = 1.6;
const HOP_TIME = 0.2;

interface Card {
  /** 0 Ace … 12 King, 13 a Joker. */
  rank: number;
  suit: number;
  x: number;
}

interface Row {
  cards: Card[];
  /** Pixels a second (at a 400px-wide screen); negative slides left. */
  v: number;
}

/** Points for landing on a card (by its rank), before any run bonus. */
export function cardPoints(rank: number): number {
  if (rank === JOKER) return 2;
  return rank < 3 ? 1 : rank < 7 ? 2 : rank < 10 ? 3 : 4;
}

/** Whether a hop from `from` (-1: the start, below the Ace) onto `to` follows on: the next rank up, or a Joker either side. */
export function followsOn(from: number, to: number): boolean {
  if (to === JOKER || from === JOKER) return true;
  return to === (from + 1) % 13;
}

export function cardHop(api: MinigameApi): MinigameGame {
  const k = () => api.k;
  const cw = () => 46 * k();
  const ch = () => (cw() * CARD_H) / CARD_W;
  const rowH = () => ch() + 16 * k();
  const rows: Row[] = [];
  /** Ted: the row he's on (-1: the table's edge he starts from) and the card he's riding. */
  let row = -1;
  let card: Card | null = null;
  let rank = -1;
  let tedX = api.W / 2;
  let hop: { fromX: number; fromRow: number; to: Card; toRow: number; t: number } | null = null;
  let run = 0;
  /** A fall: Ted tumbles for a moment before he's back on the row. */
  let falling = 0;
  /** Where the view is scrolled to (the row shown just above the bottom), easing after Ted. */
  let camera = -1;

  const newCard = (x: number): Card => (Math.random() < JOKER_CHANCE ? { rank: JOKER, suit: Math.floor(Math.random() * 4), x } : { rank: Math.floor(Math.random() * 13), suit: Math.floor(Math.random() * 4), x });
  const gap = () => cw() * (GAP[0] + Math.random() * (GAP[1] - GAP[0]));
  /** A new row, filled across the screen and beyond: faster the higher it is, the other way from the row below. */
  const addRow = (i: number) => {
    const dir = i % 2 ? -1 : 1;
    const v = dir * Math.min(150, 34 + i * 5) * (0.85 + Math.random() * 0.3);
    const cards: Card[] = [];
    let x = -cw() * 2 + Math.random() * cw();
    while (x < api.W + cw() * 2) {
      cards.push(newCard(x));
      x += cw() + gap();
    }
    rows[i] = { cards, v };
  };
  const ensureRows = () => {
    for (let i = 0; i <= row + 10; i++) if (!rows[i]) addRow(i);
  };
  ensureRows();

  /** Screen y of a row's cards' middles (row -1: the table's edge under the first row). */
  const bottom = () => api.H - 70 * k();
  const rowY = (i: number) => bottom() - (i - camera) * rowH() - rowH() * 0.5;
  const tedPos = () => {
    if (hop) {
      const p = Math.min(1, hop.t / HOP_TIME);
      const x = hop.fromX + (hop.to.x - hop.fromX) * p;
      const y = rowY(hop.fromRow) + (rowY(hop.toRow) - rowY(hop.fromRow)) * p - Math.sin(Math.PI * p) * 22 * k();
      return { x, y };
    }
    return { x: tedX, y: row < 0 ? bottom() + 10 * k() : rowY(row) };
  };

  /** Ted's back on his row after a fall: on the card nearest the middle. */
  const climbBack = () => {
    const r = rows[row];
    card = r.cards.reduce((a, c) => (Math.abs(c.x - api.W / 2) < Math.abs(a.x - api.W / 2) ? c : a));
    tedX = card.x;
  };

  const land = () => {
    if (!hop) return;
    const { to, toRow, fromRow } = hop;
    hop = null;
    card = to;
    tedX = to.x;
    const p = tedPos();
    if (toRow > fromRow) {
      const on = followsOn(rank, to.rank);
      run = on ? run + 1 : 0;
      const pts = on ? cardPoints(to.rank) * 2 + (run - 1) : cardPoints(to.rank);
      api.addScore(pts, p.x, p.y - ch() * 0.4);
      if (on && run > 1) api.pop(p.x, p.y - ch() * 0.4 - 22 * k(), `Run ×${run}!`, '#ffe08a');
    } else run = 0; // a step across scores nothing, and breaks a run
    row = toRow;
    rank = to.rank;
    ensureRows();
  };

  return {
    titleSuffix: () => `${Math.ceil(Math.max(0, CH_TIME - api.t))}s`,
    tap(x, y) {
      if (hop || falling > 0) return;
      // A card in the row above (in reach), or one beside Ted in his own row.
      for (const target of [row + 1, row]) {
        if (target < 0) continue;
        const ry = rowY(target);
        if (Math.abs(y - ry) > ch() * 0.6 + 6 * k()) continue;
        const hit = rows[target].cards.find((c) => Math.abs(x - c.x) <= cw() * 0.5 + 4 * k());
        if (!hit || hit === card) return;
        if (Math.abs(hit.x - tedX) > cw() * REACH * (target === row ? 1.25 : 1)) {
          api.pop(hit.x, ry - ch() * 0.5, 'Too far!', '#e0e0e0');
          return;
        }
        hop = { fromX: tedX, fromRow: row, to: hit, toRow: target, t: 0 };
        return;
      }
    },
    step(dt) {
      if (api.t >= CH_TIME) {
        api.end();
        return;
      }
      for (const r of rows) {
        if (!r) continue;
        const d = r.v * k() * dt;
        for (const c of r.cards) c.x += d;
        // Cards off one end come round to the other, after the last one.
        for (const c of r.cards) {
          if (c === card) continue; // Ted's card carries him on, off the edge if he stays
          if (r.v > 0 && c.x > api.W + cw() * 2) c.x = Math.min(...r.cards.map((o) => o.x)) - cw() - gap();
          else if (r.v < 0 && c.x < -cw() * 2) c.x = Math.max(...r.cards.map((o) => o.x)) + cw() + gap();
        }
      }
      if (hop) {
        hop.t += dt;
        if (hop.t >= HOP_TIME) land();
      } else if (card) tedX = card.x;
      if (falling > 0) {
        falling -= dt;
        if (falling <= 0) climbBack();
      } else if (card && !hop && (tedX < cw() * 0.25 || tedX > api.W - cw() * 0.25)) {
        // Carried off the edge: he falls, and climbs back onto the row.
        falling = 0.6;
        run = 0;
        api.loseLife(Math.max(30, Math.min(api.W - 30, tedX)), rowY(row));
      }
      // The view follows him up, keeping his row low on the screen.
      camera += (Math.max(-1, row - 1) - camera) * Math.min(1, dt * 4);
    },
    draw(g) {
      const img = mgArt('cards');
      g.imageSmoothingEnabled = false;
      const W = cw();
      const H = ch();
      // The table under it all: a felt band for each row on screen, slightly darker every other one.
      const first = Math.max(0, Math.floor(camera) - 1);
      for (let i = first; i < first + Math.ceil(api.H / rowH()) + 3; i++) {
        const y = rowY(i);
        if (y < TITLE_Y + 10 || y > api.H + rowH()) continue;
        g.fillStyle = i % 2 ? 'rgba(18,58,38,0.62)' : 'rgba(28,82,52,0.62)';
        g.fillRect(0, y - rowH() / 2, api.W, rowH());
        const r = rows[i];
        if (!r || !img) continue;
        for (const c of r.cards) {
          if (c.x < -W || c.x > api.W + W) continue;
          const col = c.rank === JOKER ? 0 : c.rank + 2;
          const sr = c.rank === JOKER ? c.suit : SUIT_ROW[c.suit];
          // The next card up (or a Joker) in the row Ted can reach glows gold.
          const good = i === row + 1 && !hop && followsOn(rank, c.rank);
          if (good) {
            g.fillStyle = 'rgba(255,214,90,0.85)';
            g.fillRect(Math.round(c.x - W / 2 - 3), Math.round(y - H / 2 - 3), Math.round(W + 6), Math.round(H + 6));
          }
          // Ted's own card: a white frame.
          if (c === card && !hop) {
            g.fillStyle = '#fff';
            g.fillRect(Math.round(c.x - W / 2 - 3), Math.round(y - H / 2 - 3), Math.round(W + 6), Math.round(H + 6));
          }
          g.drawImage(img, col * CARD_W, sr * CARD_H, CARD_W, CARD_H, Math.round(c.x - W / 2), Math.round(y - H / 2), Math.round(W), Math.round(H));
        }
      }
      // The table's edge Ted starts from, until it scrolls away.
      const edge = bottom() - (-1 - camera) * rowH();
      if (edge < api.H + 40) {
        g.fillStyle = '#6a4428';
        g.fillRect(0, edge, api.W, 12 * k());
      }
      // Ted (from the back, climbing), tumbling a moment when he falls.
      const p = tedPos();
      g.save();
      if (falling > 0) {
        g.globalAlpha = 0.4 + 0.6 * (Math.floor(falling * 12) % 2);
        g.translate(p.x, p.y);
        g.rotate(Math.sin(falling * 20) * 0.5);
        g.translate(-p.x, -p.y);
      }
      // A glowing ring under him, so he stands out from the cards.
      g.fillStyle = 'rgba(255,224,138,0.55)';
      g.beginPath();
      g.ellipse(p.x, p.y + H * 0.33, W * 0.55, W * 0.2, 0, 0, Math.PI * 2);
      g.fill();
      drawHunter(g, 'gambler', p.x, p.y + H * 0.35, 62 * k(), api.t, 3);
      g.restore();
      // What he needs next, and his run.
      g.font = canvasFont(Math.round(14 * k()), 700);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 3;
      g.lineJoin = 'round';
      g.strokeStyle = '#000';
      const names = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'Joker'];
      const next = rank === JOKER ? 'any card' : rank < 0 ? 'A' : names[(rank + 1) % 13];
      const text = `Next up: ${next}${run > 1 ? `  ·  run ×${run}` : ''}`;
      // Under the table, clear of the hearts at the top.
      const ty = api.H - 26 * k();
      const tw = g.measureText(text).width + 24 * k();
      g.fillStyle = 'rgba(10,20,14,0.82)';
      g.fillRect(Math.round(api.W / 2 - tw / 2), Math.round(ty - 13 * k()), Math.round(tw), Math.round(26 * k()));
      g.strokeText(text, api.W / 2, ty);
      g.fillStyle = '#ffe08a';
      g.fillText(text, api.W / 2, ty);
      g.textBaseline = 'alphabetic';
    },
  };
}
