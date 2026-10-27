import type { MinigameApi, MinigameGame } from './shell';

/**
 * Norm's Meteor Bounce (the Meteor Field): meteorites fall on the field, faster and faster. Tap where Norm should go
 * and he slides there; one that hits him bounces back into space. A small meteorite is 1 point; a big one 2, and it
 * cracks in two on the way up, both halves falling again; a comet (rarer, fast, with a long tail) 3. One that lands
 * costs a heart.
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
  /** Bounced: flying back up (and off the top). */
  up: boolean;
  /** A big one cracks this long after its bounce. */
  crack: number;
  spin: number;
}

const SIZE: Record<Kind, number> = { small: 13, big: 22, comet: 10 };
const POINTS: Record<Kind, number> = { small: 1, big: 2, comet: 3 };
const NORM_SPEED = 900;

export function meteorBounce(api: MinigameApi): MinigameGame {
  const k = () => api.k;
  const ground = () => api.H - 110;
  const normY = () => ground() - 18 * k();
  const normW = () => 84 * k();
  const rocks: Rock[] = [];
  const sparks: Array<{ x: number; y: number; vx: number; vy: number; t: number; c: string }> = [];
  let normX = api.W / 2;
  let target = api.W / 2;
  let squish = 0;
  let spawnIn = 0.8;
  let blink = 2;

  const spawn = () => {
    const r = Math.random();
    const kind: Kind = r < 0.1 + Math.min(0.08, api.t * 0.001) ? 'comet' : r < 0.32 ? 'big' : 'small';
    const fall = (80 + api.t * 3.2) * k() * (kind === 'comet' ? 2.1 : kind === 'big' ? 0.8 : 1 + Math.random() * 0.3);
    const x = 30 * k() + Math.random() * (api.W - 60 * k());
    rocks.push({ x, y: -20, vx: (Math.random() - 0.5) * 60 * k(), vy: Math.min(520 * k(), fall), kind, up: false, crack: 0, spin: Math.random() * 6 });
  };

  const burst = (x: number, y: number, c: string, n = 8) => {
    for (let i = 0; i < n; i++) sparks.push({ x, y, vx: (Math.random() - 0.5) * 320, vy: -Math.random() * 260, t: 0, c });
  };

  return {
    tap(x) {
      target = Math.max(normW() / 2, Math.min(api.W - normW() / 2, x));
    },
    step(dt) {
      blink -= dt;
      if (blink < -0.12) blink = 2 + Math.random() * 2;
      const d = target - normX;
      normX += Math.sign(d) * Math.min(Math.abs(d), NORM_SPEED * k() * dt);
      squish = Math.max(0, squish - dt * 4);
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
              burst(r.x, r.y, '#d89060', 10);
              for (const side of [-1, 1]) rocks.push({ x: r.x, y: r.y, vx: side * (70 + Math.random() * 50) * k(), vy: (110 + api.t * 2) * k(), kind: 'small', up: false, crack: 0, spin: 0 });
              rocks.splice(i, 1);
              continue;
            }
          }
          if (r.y < -40) rocks.splice(i, 1);
          continue;
        }
        // Norm's top: a hit there bounces it straight back up.
        if (r.y + s >= normY() - 14 * k() && r.y - s <= normY() + 6 * k() && Math.abs(r.x - normX) <= normW() / 2 + s * 0.6) {
          r.up = true;
          r.vy = -Math.max(380 * k(), Math.abs(r.vy) * 1.3);
          r.vx = ((r.x - normX) / (normW() / 2)) * 160 * k();
          if (r.kind === 'big') r.crack = 0.45;
          squish = 1;
          api.addScore(POINTS[r.kind], r.x, r.y);
          burst(r.x, r.y + s, r.kind === 'comet' ? '#9ad8ff' : '#ffd08a');
          continue;
        }
        if (r.y >= ground()) {
          burst(r.x, ground(), '#c07048', 12);
          rocks.splice(i, 1);
          api.loseLife(r.x, ground());
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.t += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 700 * dt;
        if (p.t > 0.6) sparks.splice(i, 1);
      }
    },
    draw(g) {
      // The field's rim.
      g.fillStyle = 'rgba(30,24,48,0.85)';
      g.fillRect(0, ground(), api.W, 8);
      for (const r of rocks) {
        const s = SIZE[r.kind] * k();
        // A burning tail behind a falling one (long for a comet).
        if (!r.up) {
          const len = (r.kind === 'comet' ? 6 : 2.4) * s;
          const tail = g.createLinearGradient(r.x, r.y, r.x - r.vx * 0.1, r.y - len);
          tail.addColorStop(0, r.kind === 'comet' ? 'rgba(150,215,255,0.85)' : 'rgba(255,170,80,0.75)');
          tail.addColorStop(1, 'rgba(255,170,80,0)');
          g.fillStyle = tail;
          g.beginPath();
          g.moveTo(r.x - s * 0.8, r.y);
          g.lineTo(r.x + s * 0.8, r.y);
          g.lineTo(r.x - r.vx * 0.1, r.y - len);
          g.closePath();
          g.fill();
        }
        g.save();
        g.translate(r.x, r.y);
        g.rotate(r.spin);
        g.fillStyle = r.kind === 'comet' ? '#cfeeff' : r.kind === 'big' ? '#8a5a3a' : '#a8704a';
        g.strokeStyle = '#3a2418';
        g.lineWidth = 2;
        g.beginPath();
        // A lumpy rock: a circle with a few bumps.
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          const rr = s * (a % 3 === 0 ? 0.86 : 1);
          if (a === 0) g.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
          else g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        }
        g.closePath();
        g.fill();
        g.stroke();
        if (r.kind !== 'comet') {
          g.fillStyle = 'rgba(40,24,16,0.45)';
          g.beginPath();
          g.arc(-s * 0.3, -s * 0.2, s * 0.22, 0, Math.PI * 2);
          g.arc(s * 0.35, s * 0.25, s * 0.16, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
      }
      for (const p of sparks) {
        g.globalAlpha = 1 - p.t / 0.6;
        g.fillStyle = p.c;
        g.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      g.globalAlpha = 1;
      // Norm: a purple jelly, flattening for a moment when something bounces off him.
      const w = normW() * (1 + squish * 0.18);
      const h = 34 * k() * (1 - squish * 0.25);
      const y = normY();
      const body = g.createRadialGradient(normX - w * 0.15, y - h * 0.5, 4, normX, y - h * 0.2, w * 0.6);
      body.addColorStop(0, '#e2b8ff');
      body.addColorStop(1, '#8a4ad8');
      g.fillStyle = body;
      g.strokeStyle = '#3a1868';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(normX - w / 2, y + 6 * k());
      g.quadraticCurveTo(normX - w / 2, y - h, normX, y - h);
      g.quadraticCurveTo(normX + w / 2, y - h, normX + w / 2, y + 6 * k());
      g.closePath();
      g.fill();
      g.stroke();
      // Little stars in the jelly, and his eyes.
      g.fillStyle = 'rgba(255,255,255,0.7)';
      for (const [dx, dy] of [[-0.25, -0.35], [0.2, -0.2], [0.05, -0.55]]) g.fillRect(normX + dx * w - 1.5, y + dy * h - 1.5, 3, 3);
      g.fillStyle = '#1a0830';
      const eh = blink < 0 ? 1.5 : 6 * k();
      g.fillRect(normX - 12 * k(), y - h * 0.55, 5 * k(), eh);
      g.fillRect(normX + 7 * k(), y - h * 0.55, 5 * k(), eh);
      // Where he's heading.
      if (Math.abs(target - normX) > 4) {
        g.strokeStyle = 'rgba(226,184,255,0.6)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(target, ground() + 4);
        g.lineTo(target, ground() + 14);
        g.stroke();
      }
    },
  };
}
