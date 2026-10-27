import { canvasFont } from '../../render/fx';
import { roundRect, type MinigameApi, type MinigameGame } from './shell';

/**
 * Ted's High or Low (the Cloud Fortress): one deck, dealt a card at a time. Guess whether the next card is higher or
 * lower than the one showing (Ace low, King high). Every right guess grows the pot by your streak (1, then 2, then
 * 3...); a tie leaves it as it is. Cash Out banks the pot into your score. A wrong guess loses the pot and a heart.
 * When the deck runs out, whatever's in the pot is banked.
 */

export const HL_INTRO =
  "<p>Ted deals one card at a time. Guess whether the next is <b>Higher</b> or <b>Lower</b> (Aces low, Kings high).</p><p>Each right guess grows the pot, more the longer your streak runs; a tie changes nothing. <b>Cash Out</b> to bank the pot as points.</p><p>A wrong guess loses the whole pot, and a heart.</p>";

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];

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

  const drawCard = (g: CanvasRenderingContext2D, c: Card | null, x: number, y: number, w: number, h: number) => {
    g.save();
    roundRect(g, x - w / 2, y - h / 2, w, h, 10 * k());
    g.fillStyle = c ? '#fbf7ec' : '#7a2a3a';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = c ? '#3a3228' : '#e0c060';
    g.stroke();
    if (!c) {
      // The back: Ted's gold diamonds.
      g.fillStyle = '#e0c060';
      for (let i = -2; i <= 2; i++)
        for (let j = -3; j <= 3; j++) {
          g.beginPath();
          const px = x + i * 18 * k();
          const py = y + j * 20 * k();
          g.moveTo(px, py - 6 * k());
          g.lineTo(px + 5 * k(), py);
          g.lineTo(px, py + 6 * k());
          g.lineTo(px - 5 * k(), py);
          g.fill();
        }
      g.restore();
      return;
    }
    const red = c.suit === 1 || c.suit === 2;
    g.fillStyle = red ? '#c02a2a' : '#1e1e28';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = canvasFont(Math.round(22 * k()), 700);
    g.fillText(RANKS[c.rank], x - w / 2 + 18 * k(), y - h / 2 + 20 * k());
    g.fillText(SUITS[c.suit], x - w / 2 + 18 * k(), y - h / 2 + 42 * k());
    g.font = canvasFont(Math.round(64 * k()), 700);
    g.fillText(SUITS[c.suit], x, y + 4 * k());
    g.font = canvasFont(Math.round(26 * k()), 700);
    g.fillText(RANKS[c.rank], x, y - h * 0.3);
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
      g.font = canvasFont(Math.round(13 * k()), 400);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillText(`Next right guess: +${streak + 1}`, api.W / 2, cy + ch / 2 + 28 * k());
      for (const b of buttons) {
        const off = b.id === 'cash' ? pot <= 0 : !!incoming || done;
        roundRect(g, b.x, b.y, b.w, b.h, 10 * k());
        g.fillStyle = b.id === 'cash' ? (off ? 'rgba(80,70,40,0.7)' : '#c9a030') : b.id === 'high' ? '#2f7a45' : '#8a2f3a';
        g.globalAlpha = off ? 0.6 : 1;
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = '#1a1408';
        g.stroke();
        g.font = canvasFont(Math.round(19 * k()), 700);
        g.fillStyle = '#fff';
        g.fillText(b.id === 'high' ? '▲ Higher' : b.id === 'low' ? '▼ Lower' : `💰 Cash Out${pot > 0 ? ` ${pot}` : ''}`, b.x + b.w / 2, b.y + b.h / 2 + 1);
        g.globalAlpha = 1;
      }
      g.textBaseline = 'alphabetic';
    },
  };
}
