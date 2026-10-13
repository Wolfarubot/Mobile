import { TITLE_Y, type MinigameApi, type MinigameGame } from './shell';
import { DIRS, dpadAt, dpadHit, dpadTop, drawDpad, type Dir, DIR_LIST } from './dpad';
import { HUNTER_SHEETS } from '../../render/hunterSheets';
import { SHEETS, sheetRow } from '../../render/monsterSheets';
import { hunterSheetImage, monsterSheetImage } from '../../render/sprites';
import { canvasFont } from '../../render/fx';

/**
 * Theon's Puppet Show (the Forbidden Crypt): on a stage at the top, Theon's puppet (a pale little figure in
 * black, on strings) dances a sequence of moves (a hop up, down, left or right), one move longer each round, while the big
 * D-pad presses itself to show each one. Repeat the dance on the D-pad, and Theon dances it with you, the puppet
 * following: 1 point a move. A wrong move costs a heart and the round plays again.
 */

export const PU_INTRO = '<p>Theon\'s puppet dances a sequence of moves, and the <b>arrows press themselves</b> to show each one. Then <b>press the same arrows in order</b> and Theon dances it with you: 1 point a move.</p><p>Each round adds a move. A wrong one costs a heart, and the round plays again.</p>';

/**
 * The puppet: the Crypt's Possessed Puppet (a recoloured zombie on two white strings, baked into its sheet). And
 * the D-pad's size here (bigger than Grave Robbing's).
 */
const PUPPET = 'puppet-marionette';
const PAD_SIZE = 1.5;

/** A hop in progress: which way, and how far through it (seconds). */
interface Hop {
  d: Dir;
  t: number;
  len: number;
}

export function puppetShow(api: MinigameApi): MinigameGame {
  const rand = () => DIR_LIST[Math.floor(Math.random() * 4)];
  const seq: Dir[] = [rand(), rand(), rand()];
  let phase: 'show' | 'input' | 'pause' = 'pause';
  let timer = 0.8;
  let shown = 0;
  let input = 0;
  const pressed: Record<Dir, number> = { up: 0, down: 0, left: 0, right: 0 };
  let puppetHop: Hop | null = null;
  let theonHop: Hop | null = null;
  /** Which way each faces: Theon the way he last moved (toward the puppet at rest), the puppet likewise. */
  let theonFacing: Dir = 'right';
  let puppetFacing: Dir = 'left';
  /** A wrong move: Theon slumps and the strings tangle for a moment. */
  let oops = 0;
  /** Seconds each move is shown: quicker as the dance gets longer. */
  const beat = () => Math.max(0.34, 0.68 - seq.length * 0.025);

  const pad = () => dpadAt(api, PAD_SIZE);
  /** The stage: from under the title down to above the status line. */
  const stage = () => {
    const top = TITLE_Y + 30;
    const bottom = dpadTop(api, PAD_SIZE);
    return { top, bottom, floor: Math.min(top + 170 * api.k, bottom - 50 * api.k) };
  };
  const theonAt = () => ({ x: api.W * 0.3, y: stage().floor });
  const puppetAt = () => ({ x: api.W * 0.68, y: stage().floor });
  /** Where a hop has carried someone: out and back along its direction (an arc for up). */
  const hopOffset = (h: Hop | null): [number, number] => {
    if (!h) return [0, 0];
    const p = Math.min(1, h.t / h.len);
    const s = Math.sin(Math.PI * p);
    const [dx, dy] = DIRS[h.d];
    const far = 32 * api.k;
    return [dx * s * far, dy < 0 ? -s * far * 1.3 : dy > 0 ? s * far * 0.35 : -s * far * 0.35];
  };

  const startShow = () => {
    phase = 'show';
    shown = 0;
    input = 0;
    timer = 0.4;
  };

  return {
    titleSuffix: () => (phase === 'input' ? `${input} / ${seq.length}` : `${seq.length} moves`),
    tap(x, y) {
      if (phase !== 'input') return;
      const d = dpadHit(pad(), x, y);
      if (!d) return;
      pressed[d] = 0.15;
      theonFacing = d;
      theonHop = { d, t: 0, len: 0.3 };
      const t = theonAt();
      if (seq[input] === d) {
        input++;
        // Theon's tug moves the puppet too, a beat behind.
        puppetFacing = d;
        puppetHop = { d, t: -0.06, len: 0.3 };
        api.addScore(1, t.x, t.y - 70 * api.k);
        if (input >= seq.length) {
          seq.push(rand());
          phase = 'pause';
          timer = 0.9;
        }
      } else {
        api.loseLife(t.x, t.y - 70 * api.k);
        oops = 0.6;
        phase = 'pause';
        timer = 1.1;
      }
    },
    step(dt) {
      for (const d of DIR_LIST) pressed[d] = Math.max(0, pressed[d] - dt);
      oops = Math.max(0, oops - dt);
      for (const h of [puppetHop, theonHop]) if (h) h.t += dt;
      if (puppetHop && puppetHop.t >= puppetHop.len) puppetHop = null;
      if (theonHop && theonHop.t >= theonHop.len) theonHop = null;
      timer -= dt;
      if (phase === 'pause' && timer <= 0) {
        theonFacing = 'right';
        puppetFacing = 'left';
        startShow();
      } else if (phase === 'show' && timer <= 0) {
        if (shown >= seq.length) {
          phase = 'input';
          theonFacing = 'right';
          puppetFacing = 'left';
          return;
        }
        // The puppet dances the next move, and its button presses itself.
        const d = seq[shown];
        puppetFacing = d;
        puppetHop = { d, t: 0, len: beat() * 0.8 };
        pressed[d] = beat() * 0.7;
        shown++;
        timer = beat();
      }
    },
    draw(g) {
      const st = stage();
      g.imageSmoothingEnabled = false;
      // The stage boards.
      g.fillStyle = 'rgba(40,24,14,0.55)';
      g.fillRect(api.W * 0.06, st.floor - 6 * api.k, api.W * 0.88, 18 * api.k);
      g.fillStyle = 'rgba(120,80,44,0.65)';
      g.fillRect(api.W * 0.06, st.floor - 6 * api.k, api.W * 0.88, 4 * api.k);

      // Theon.
      const t = theonAt();
      const [tx, ty] = hopOffset(theonHop);
      const tSheet = HUNTER_SHEETS.puppeteer;
      const tImg = hunterSheetImage('puppeteer');
      const tH = 120 * api.k;
      shadow(g, t.x, t.y, 26 * api.k);
      if (tSheet && tImg && tImg.complete && tImg.naturalWidth) {
        const row = { down: 0, left: 1, right: 2, up: 3 }[theonFacing];
        const F = tSheet.frame;
        const col = Math.floor(api.t * 8) % tSheet.frames[row];
        const [bx, by, bw, bh] = tSheet.box;
        const k = tH / bh;
        const slump = oops > 0 ? Math.sin(oops * 30) * 3 * api.k : 0;
        const x = t.x + tx + slump;
        const y = t.y + ty;
        g.drawImage(tImg, col * F, row * F, F, F, x - (bx + bw / 2) * k, y - (by + bh) * k, F * k, F * k);
      }

      // The puppet, facing the way it moves (its strings are part of its sheet).
      const p = puppetAt();
      const [px, py] = hopOffset(puppetHop);
      const pSheet = SHEETS[PUPPET];
      const pImg = monsterSheetImage(PUPPET);
      const pH = 96 * api.k;
      shadow(g, p.x, p.y, 22 * api.k);
      if (pSheet && pImg.complete && pImg.naturalWidth) {
        const F = pSheet.frame;
        const dir = ({ up: 'U', down: 'D', left: 'L', right: 'R' } as const)[puppetFacing];
        const col = puppetHop || theonHop ? Math.floor(api.t * 12) % pSheet.cols : 0;
        const [bx, by, bw, bh] = pSheet.box;
        const k = pH / bh;
        const x = p.x + px;
        const y = p.y + py;
        g.drawImage(pImg, col * F, sheetRow(pSheet, dir) * F, F, F, x - (bx + bw / 2) * k, y - (by + bh) * k, F * k, F * k);
      }

      // What's going on, under the stage.
      g.font = canvasFont(Math.round(15 * api.k), 700);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 3;
      g.lineJoin = 'round';
      g.strokeStyle = '#000';
      const text = phase === 'input' ? 'Your turn!' : phase === 'show' ? 'Watch the puppet…' : oops > 0 ? 'Tangled! Again…' : 'Get ready…';
      g.strokeText(text, api.W / 2, st.floor + 44 * api.k);
      g.fillStyle = phase === 'input' ? '#ffe8a3' : '#e8dcc0';
      g.fillText(text, api.W / 2, st.floor + 44 * api.k);
      g.textBaseline = 'alphabetic';

      drawDpad(g, pad(), pressed);
    },
  };
}

function shadow(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(x, y, r, r * 0.3, 0, 0, Math.PI * 2);
  g.fill();
}
