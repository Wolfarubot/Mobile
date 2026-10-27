import { canvasFont } from '../../render/fx';
import { drawArt, drawHunter, drawNine } from './art';
import { mgArt } from './dpad';
import type { MinigameApi, MinigameGame } from './shell';

/**
 * Ted's High or Low (the Cloud Fortress): one deck, dealt a card at a time. Guess whether the next card is higher or
 * lower than the one showing (Ace low, King high). Every right guess grows the pot by your streak (1, then 2, then
 * 3...); a tie leaves it as it is. Cash Out banks the pot into your score. A wrong guess loses the pot and a heart.
 * When the deck runs out, whatever's in the pot is banked. All pack art: the cards are the playing card sheet, the
 * buttons the UI's button (tinted per button) with the platformer UI's arrows and a coin from the RPG things pack,
 * and Ted deals from his idle animation.
 */

export const HL_INTRO =
  "<p>Ted deals one card at a time. Guess whether the next is <b>Higher</b> or <b>Lower</b> (Aces low, Kings high).</p><p>Each right guess grows the pot, more the longer your streak runs; a tie changes nothing. <b>Cash Out</b> to bank the pot as points.</p><p>A wrong guess loses the whole pot, and a heart.</p>";

/**
 * The playing card sheet (public/minigames/cards.png): 56 × 80 cards, 15 to a row; rows 0 to 3 are hearts, spades,
 * diamonds and clubs, Ace to King in columns 2 to 14. The backs are in column 1 (the red one in row 2).
 */
const CARD_W = 56;
const CARD_H = 80;
/** The sheet's row for each suit (a card's `suit`: spades, hearts, diamonds, clubs). */
const SUIT_ROW = [1, 0, 2, 3];
const BACK_CELL: [number, number] = [1, 2];
const BUTTON = 'ui/btn';
const BUTTON_EDGE = 4;
/** A coin (RPG things) for the pot and Cash Out. */
const COIN = 'things/003';
/** Each button's tint over the UI's green button. */
const TINT: Record<Button['id'], string> = { high: 'none', low: 'hue-rotate(-140deg) saturate(1.5)', cash: 'hue-rotate(-75deg) saturate(1.6) brightness(1.15)' };

interface Card {
  rank: number;
  suit: number;
}

interface Button {
  id: 'high' | 'low' | 'cash';
  x: number;
  y: number;
  w: number;
  h: number;
}

export function highOrLow(api: MinigameApi): MinigameGame {
  const k = () => api.k;
  const deck: Card[] = [];
  for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) deck.push({ rank: r, suit: s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  let current = deck.pop()!;
  /** The card just turned over, sliding in on top (and how far in it is). */
  let incoming: { card: Card; t: number; result: 'win' | 'lose' | 'tie' } | null = null;
  let pot = 0;
  let streak = 0;
  let shake = 0;
  let done = false;

  const layout = () => {
    const cw = 120 * k();
    const ch = 170 * k();
    const cy = api.H * 0.42;
    const bw = Math.min(150 * k(), api.W * 0.4);
    const bh = 52 * k();
    const by = cy + ch / 2 + 70 * k();
    const buttons: Button[] = [
      { id: 'low', x: api.W / 2 - bw - 8, y: by, w: bw, h: bh },
      { id: 'high', x: api.W / 2 + 8, y: by, w: bw, h: bh },
      { id: 'cash', x: api.W / 2 - bw * 0.75, y: by + bh + 14 * k(), w: bw * 1.5, h: bh * 0.9 },
    ];
    return { cw, ch, cy, buttons };
  };

  const bank = (x: number, y: number) => {
    if (pot <= 0) return;
    api.addScore(pot, x, y);
    pot = 0;
    streak = 0;
  };

  const finish = () => {
    if (done) return;
    done = true;
    bank(api.W / 2, api.H * 0.3);
    api.end();
  };

  const guess = (high: boolean) => {
    if (incoming || done) return;
    if (!deck.length) return finish();
    const next = deck.pop()!;
    const result = next.rank === current.rank ? 'tie' : next.rank > current.rank === high ? 'win' : 'lose';
    incoming = { card: next, t: 0, result };
    const { cy } = layout();
    if (result === 'win') {
      streak++;
      pot += streak;
      api.pop(api.W / 2, cy - 100 * k(), `+${streak} to the pot`, '#9ff0a8');
    } else if (result === 'lose') {
      api.pop(api.W / 2, cy - 100 * k(), pot > 0 ? `Lost ${pot}!` : 'Wrong!', '#ff6a6a');
      pot = 0;
      streak = 0;
      shake = 0.4;
      api.loseLife();
    } else api.pop(api.W / 2, cy - 100 * k(), 'Tie', '#e0e0e0');
  };

  /** A card from the sheet, centred on (x, y), w × h; null draws its back. */
  const drawCard = (g: CanvasRenderingContext2D, c: Card | null, x: number, y: number, w: number, h: number) => {
    const img = mgArt('cards');
    if (!img) return;
    const col = c ? c.rank + 2 : BACK_CELL[0];
    const row = c ? SUIT_ROW[c.suit] : BACK_CELL[1];
    g.save();
    g.imageSmoothingEnabled = false;
    g.drawImage(img, col * CARD_W, row * CARD_H, CARD_W, CARD_H, x - w / 2, y - h / 2, w, h);
    g.restore();
  };

  return {
    titleSuffix: () => `${deck.length} card${deck.length === 1 ? '' : 's'} left`,
    tap(x, y) {
      for (const b of layout().buttons) {
        if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) continue;
        if (b.id === 'cash') bank(b.x + b.w / 2, b.y);
        else guess(b.id === 'high');
        return;
      }
    },
    step(dt) {
      shake = Math.max(0, shake - dt);
      if (incoming) {
        incoming.t += dt * 3.5;
        if (incoming.t >= 1) {
          current = incoming.card;
          incoming = null;
          if (!deck.length) finish();
        }
      }
    },
    draw(g) {
      const { cw, ch, cy, buttons } = layout();
      const sx = shake > 0 ? Math.sin(shake * 60) * 6 * k() : 0;
      // The deck to the left, the card showing in the middle, the next one sliding over it.
      if (deck.length) {
        for (let i = Math.min(4, Math.ceil(deck.length / 10)); i >= 0; i--) drawCard(g, null, api.W / 2 - cw * 1.05 - i * 2, cy - i * 2, cw * 0.62, ch * 0.62);
      }
      drawCard(g, current, api.W / 2 + sx + cw * 0.18, cy, cw, ch);
      if (incoming) {
        const p = 1 - Math.pow(1 - Math.min(1, incoming.t), 3);
        drawCard(g, incoming.card, api.W / 2 - cw * 1.05 + (cw * 1.23) * p, cy, cw * (0.62 + 0.38 * p), ch * (0.62 + 0.38 * p));
      }
      // The pot and streak.
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = canvasFont(Math.round(20 * k()), 700);
      g.lineWidth = 4;
      g.strokeStyle = '#000';
      const potText = `Pot: ${pot}${streak > 1 ? `  ·  streak ${streak}` : ''}`;
      g.strokeText(potText, api.W / 2, cy - ch / 2 - 30 * k());
      g.fillStyle = pot > 0 ? '#ffe08a' : '#f0f0f0';
      g.fillText(potText, api.W / 2, cy - ch / 2 - 30 * k());
      drawArt(g, `icons/${COIN}`, api.W / 2 - g.measureText(potText).width / 2 - 16 * k(), cy - ch / 2 - 30 * k(), 22 * k());
      g.font = canvasFont(Math.round(13 * k()), 400);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillText(`Next right guess: +${streak + 1}`, api.W / 2, cy + ch / 2 + 28 * k());
      for (const b of buttons) {
        const off = b.id === 'cash' ? pot <= 0 : !!incoming || done;
        // The UI's button, tinted for each, with its arrow or coin on the left.
        g.save();
        g.globalAlpha = off ? 0.55 : 1;
        g.filter = TINT[b.id];
        drawNine(g, BUTTON, b.x, b.y, b.w, b.h, BUTTON_EDGE, Math.max(2, Math.round(3 * k())));
        g.filter = 'none';
        const ic = b.h * 0.5;
        if (b.id === 'cash') drawArt(g, `icons/${COIN}`, b.x + ic * 0.9, b.y + b.h / 2, ic);
        else drawArt(g, `minigames/arrow-${b.id === 'high' ? 'up' : 'down'}`, b.x + ic * 0.9, b.y + b.h / 2, ic * 0.8);
        g.font = canvasFont(Math.round(19 * k()), 700);
        g.lineWidth = 4;
        g.strokeStyle = '#1a1408';
        const label = b.id === 'high' ? 'Higher' : b.id === 'low' ? 'Lower' : `Cash Out${pot > 0 ? ` ${pot}` : ''}`;
        g.strokeText(label, b.x + b.w / 2 + ic * 0.35, b.y + b.h / 2 + 1);
        g.fillStyle = '#fff';
        g.fillText(label, b.x + b.w / 2 + ic * 0.35, b.y + b.h / 2 + 1);
        g.restore();
      }
      // Ted, dealing at the side of the table.
      drawHunter(g, 'gambler', api.W - 34 * k(), cy + ch / 2 + 6 * k(), 54 * k(), api.t, 1);
      g.textBaseline = 'alphabetic';
    },
  };
}
