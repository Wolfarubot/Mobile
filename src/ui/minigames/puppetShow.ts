import type { MinigameApi, MinigameGame } from './shell';
import { roundRect } from './shell';

/**
 * Theon's Puppet Show (the Forbidden Crypt): four puppets dance a sequence, one move longer each round. Repeat it
 * by tapping them in order: 1 point a move. A wrong move costs a heart and the round plays again.
 */

export const PU_INTRO = '<p>Theon\'s four puppets dance a sequence. <b>Watch</b>, then <b>tap them in the same order</b>: 1 point a move.</p><p>Each round adds a move. A wrong one costs a heart, and the round plays again.</p>';

const PADS = [
  { color: '#d85a5a', icon: 'ab-rogue-warlock/085' },
  { color: '#5a8ad8', icon: 'ab-engineer-psionic/054' },
  { color: '#d8b45a', icon: 'ab-rogue-warlock/061' },
  { color: '#6ab86a', icon: 'ab-rogue-warlock/025' },
];

export function puppetShow(api: MinigameApi): MinigameGame {
  const seq: number[] = [Math.floor(Math.random() * 4), Math.floor(Math.random() * 4), Math.floor(Math.random() * 4)];
  let phase: 'show' | 'input' | 'pause' = 'pause';
  let timer = 0.8;
  let shown = 0;
  let input = 0;
  const lit = [0, 0, 0, 0];
  /** Seconds each move is shown: quicker as the dance gets longer. */
  const beat = () => Math.max(0.32, 0.65 - seq.length * 0.025);
  const pad = (i: number) => {
    const size = Math.min(api.W * 0.42, (api.H - 300) * 0.42);
    const gap = 14;
    const x0 = api.W / 2 - size - gap / 2;
    const y0 = 150 + (api.H - 300 - size * 2 - gap) / 2;
    return { x: x0 + (i % 2) * (size + gap), y: y0 + Math.floor(i / 2) * (size + gap), size };
  };
  const startShow = () => {
    phase = 'show';
    shown = 0;
    input = 0;
    timer = 0.35;
  };
  return {
    tap(x, y) {
      if (phase !== 'input') return;
      for (let i = 0; i < 4; i++) {
        const p = pad(i);
        if (x < p.x || x > p.x + p.size || y < p.y || y > p.y + p.size) continue;
        lit[i] = 0.2;
        if (seq[input] === i) {
          input++;
          api.addScore(1, p.x + p.size / 2, p.y + p.size / 2);
          if (input >= seq.length) {
            seq.push(Math.floor(Math.random() * 4));
            phase = 'pause';
            timer = 0.8;
          }
        } else {
          api.loseLife(p.x + p.size / 2, p.y + p.size / 2);
          phase = 'pause';
          timer = 1;
        }
        return;
      }
    },
    step(dt) {
      for (let i = 0; i < 4; i++) lit[i] = Math.max(0, lit[i] - dt);
      timer -= dt;
      if (phase === 'pause' && timer <= 0) startShow();
      else if (phase === 'show' && timer <= 0) {
        if (shown >= seq.length) {
          phase = 'input';
          return;
        }
        lit[seq[shown]] = beat() * 0.8;
        shown++;
        timer = beat();
      }
    },
    draw(g) {
      g.font = `bold ${Math.round(20 * api.k)}px monospace`;
      g.textAlign = 'center';
      g.fillStyle = '#fff';
      g.fillText(phase === 'input' ? `Your turn: ${input} / ${seq.length}` : `Watch… (${seq.length} moves)`, api.W / 2, 110);
      for (let i = 0; i < 4; i++) {
        const p = pad(i);
        roundRect(g, p.x, p.y, p.size, p.size, 16);
        g.fillStyle = lit[i] > 0 ? '#fff6d8' : PADS[i].color;
        g.shadowColor = PADS[i].color;
        g.shadowBlur = lit[i] > 0 ? 30 : 0;
        g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = 'rgba(0,0,0,0.6)';
        g.lineWidth = 4;
        g.stroke();
        api.icon(PADS[i].icon, p.x + p.size / 2, p.y + p.size / 2, p.size * 0.55);
      }
    },
  };
}
