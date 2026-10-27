import { drawArt, drawBursts, drawEffect, drawHunter, stepBursts, type Burst } from './art';
import type { MinigameApi, MinigameGame } from './shell';

/**
 * Norm's Meteor Bounce (the Meteor Field): meteorites fall on the field, faster and faster. Tap where Norm should go
 * and he slides there; one that hits him bounces back into space. A small meteorite is 1 point; a big one 2, and it
 * cracks in two on the way up, both halves falling again; a comet (rarer, fast, with a long tail) 3. One that lands
 * costs a heart. All of it is pack art: the Meteor Field's own rocks and shooting stars, burning with the fireball
 * effect, Norm's idle animation (squashing for a moment on a bounce), and shard and explosion effects.
 */

export const MB_INTRO =
  "<p>Meteorites are falling! <b>Tap</b> where Norm should go: he slides there, and any meteorite that hits him bounces back into space.</p><p>Small ones are 1 point. <b>Big ones</b> are 2, and crack in two on the way up: catch both halves too. <b>Comets</b> are fast, and worth 3.</p><p>One that lands costs a heart.</p>";

type Kind = 'small' | 'big' | 'comet';

interface Rock {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: Kind;
  /** Which of the Meteor Field's rocks it is. */
  art: string;
  /** Bounced: flying back up (and off the top). */
  up: boolean;
  /** A big one cracks this long after its bounce. */
  crack: number;
  spin: number;
}

const SIZE: Record<Kind, number> = { small: 13, big: 22, comet: 10 };
const POINTS: Record<Kind, number> = { small: 1, big: 2, comet: 3 };
const NORM_SPEED = 900;
/** The Meteor Field's rocks (public/backgrounds/meteors): small ones and the big one. */
const SMALL_ROCKS = ['backgrounds/meteors/rock1', 'backgrounds/meteors/rock5'];
const BIG_ROCK = 'backgrounds/meteors/rock2';
/** A shooting star from the Meteor Field's sky: its head is at the lower left, flying down-left. */
const COMET = 'backgrounds/meteors/shoot2';
const COMET_HEADING = Math.atan2(41, -44);

export function meteorBounce(api: MinigameApi): MinigameGame {
  const k = () => api.k;
  const ground = () => api.H - 110;
  const normY = () => ground() - 18 * k();
  const normW = () => 84 * k();
  const rocks: Rock[] = [];
  const bursts: Burst[] = [];
  let normX = api.W / 2;
  let target = api.W / 2;
  let squish = 0;
  let spawnIn = 0.8;

  const spawn = () => {
    const r = Math.random();
    const kind: Kind = r < 0.1 + Math.min(0.08, api.t * 0.001) ? 'comet' : r < 0.32 ? 'big' : 'small';
    const fall = (80 + api.t * 3.2) * k() * (kind === 'comet' ? 2.1 : kind === 'big' ? 0.8 : 1 + Math.random() * 0.3);
    const x = 30 * k() + Math.random() * (api.W - 60 * k());
    const art = kind === 'big' ? BIG_ROCK : SMALL_ROCKS[Math.floor(Math.random() * SMALL_ROCKS.length)];
    rocks.push({ x, y: -20, vx: (Math.random() - 0.5) * 60 * k(), vy: Math.min(520 * k(), fall), kind, art, up: false, crack: 0, spin: Math.random() * 6 });
  };

  return {
    tap(x) {
      target = Math.max(normW() / 2, Math.min(api.W - normW() / 2, x));
    },
    step(dt) {
      const d = target - normX;
      normX += Math.sign(d) * Math.min(Math.abs(d), NORM_SPEED * k() * dt);
      squish = Math.max(0, squish - dt * 3);
      stepBursts(bursts, dt);
      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawn();
        spawnIn = Math.max(0.38, 1.25 - api.t * 0.012);
      }
      for (let i = rocks.length - 1; i >= 0; i--) {
        const r = rocks[i];
        r.spin += dt * (r.up ? -4 : 2);
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        if (r.x < 10 || r.x > api.W - 10) r.vx = -r.vx;
        const s = SIZE[r.kind] * k();
        if (r.up) {
          // A big one cracks on the way up: two small halves fall back, out to either side.
          if (r.kind === 'big' && r.crack > 0) {
            r.crack -= dt;
            if (r.crack <= 0) {
              bursts.push({ key: 'explosion', x: r.x, y: r.y, size: 60 * k(), t: 0, dur: 0.5 });
              for (const side of [-1, 1])
                rocks.push({ x: r.x, y: r.y, vx: side * (70 + Math.random() * 50) * k(), vy: (110 + api.t * 2) * k(), kind: 'small', art: SMALL_ROCKS[side < 0 ? 0 : 1], up: false, crack: 0, spin: 0 });
              rocks.splice(i, 1);
              continue;
            }
          }
          if (r.y < -40) rocks.splice(i, 1);
          continue;
        }
        // Norm's top: a hit there bounces it straight back up.
        if (r.y + s >= normY() - 30 * k() && r.y - s <= normY() && Math.abs(r.x - normX) <= normW() / 2 + s * 0.6) {
          r.up = true;
          r.vy = -Math.max(380 * k(), Math.abs(r.vy) * 1.3);
          r.vx = ((r.x - normX) / (normW() / 2)) * 160 * k();
          if (r.kind === 'big') r.crack = 0.45;
          squish = 1;
          api.addScore(POINTS[r.kind], r.x, r.y);
          bursts.push({ key: 'shards', x: r.x, y: r.y + s, size: 40 * k(), t: 0, dur: 0.3 });
          continue;
        }
        if (r.y >= ground()) {
          bursts.push({ key: 'explosion', x: r.x, y: ground() - 10 * k(), size: 70 * k(), t: 0, dur: 0.55 });
          rocks.splice(i, 1);
          api.loseLife(r.x, ground());
        }
      }
    },
    draw(g) {
      for (const r of rocks) {
        const s = SIZE[r.kind] * k();
        const heading = Math.atan2(r.vy, r.vx);
        if (r.kind === 'comet') {
          // The shooting star, turned to fly the way it's going.
          drawArt(g, COMET, r.x - Math.cos(heading) * s * 2, r.y - Math.sin(heading) * s * 2, s * 7, heading - COMET_HEADING);
          continue;
        }
        // Falling, it burns: the fireball effect behind it, pointing the way it falls.
        if (!r.up) drawEffect(g, 'fireball', Math.floor(api.t * 12) % 8, r.x - Math.cos(heading) * s * 0.9, r.y - Math.sin(heading) * s * 0.9, s * 3.4, heading, 0.9);
        drawArt(g, r.art, r.x, r.y, s * 2.2, r.spin);
      }
      drawBursts(g, bursts);
      // Norm: his idle bob, squashing flat for a moment when something bounces off him.
      const frame = squish > 0.5 ? 6 : squish > 0 ? 5 : Math.floor(api.t * 6) % 5;
      drawHunter(g, 'spaceslime', normX, normY() + 8 * k(), 54 * k(), api.t, 0, frame);
      // Where he's heading: the platformer UI's up arrow under the spot.
      if (Math.abs(target - normX) > 4) drawArt(g, 'minigames/arrow-up', target, ground() + 16 * k(), 14 * k(), 0, 0.75);
    },
  };
}
