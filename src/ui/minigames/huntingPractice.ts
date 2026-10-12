import { areaBackground } from '../../render/backgrounds';
import { SHEETS, sheetRow } from '../../render/monsterSheets';
import { HUNTER_SHEETS } from '../../render/hunterSheets';
import { gearImage, hunterSheetImage, monsterSheetImage } from '../../render/sprites';

/**
 * Galladair's Hunting Practice (the Wandering Woods' minigame): slimes hop across the clearing from either side,
 * faster and faster. Tap to aim Galladair's arrows from the bottom of the screen. A green slime is 1 point, a
 * rare golden one 3. Three slimes that make it across end the round.
 */

/** How many slimes may get across before the round ends. */
export const HP_LIVES = 3;
/** Seconds between arrows. */
const SHOT_COOLDOWN = 0.22;
const ARROW_SPEED = 950;
const GOLDEN_CHANCE = 0.12;

interface Slime {
  x: number;
  /** The ground line it hops along, and how high its hops go. */
  base: number;
  hop: number;
  phase: number;
  vx: number;
  r: number;
  golden: boolean;
  dead: boolean;
}

interface Arrow {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Pop {
  x: number;
  y: number;
  t: number;
  text: string;
  color: string;
}

/** The round's difficulty after `t` seconds: slime speed (px/s at a 400px-wide screen) and seconds between slimes. */
export function hpDifficulty(t: number): { speed: number; gap: number } {
  return { speed: Math.min(430, 70 + 6.5 * t), gap: Math.max(0.42, 1.5 - 0.022 * t) };
}

/**
 * Plays a round full-screen. `onEnd` gets the score when it's over (by the last life, or Quit) and returns the
 * results text to show; Collect closes it.
 */
export function playHuntingPractice(opts: { best: number; onEnd: (score: number) => string; onClose: () => void }): void {
  const root = document.createElement('div');
  root.className = 'minigame';
  root.innerHTML = `
    <canvas></canvas>
    <div class="mg-hud"><span class="mg-score">0</span><span class="mg-lives"></span><button class="mg-quit">Quit</button></div>
    <div class="mg-intro"><div class="mg-card"><h2>🏹 Hunting Practice</h2><p>Slimes hop across the clearing, faster and faster. <b>Tap</b> to send Galladair's arrows at them.</p><p>Green slimes are 1 point, golden ones 3. Let ${HP_LIVES} get across and practice is over.</p><p class="mg-best">${opts.best > 0 ? `Best: ${opts.best}` : ''}</p><button class="buy mg-go">Start</button></div></div>`;
  document.body.appendChild(root);
  const canvas = root.querySelector('canvas')!;
  const g = canvas.getContext('2d')!;
  const scoreEl = root.querySelector<HTMLElement>('.mg-score')!;
  const livesEl = root.querySelector<HTMLElement>('.mg-lives')!;

  let W = 0;
  let H = 0;
  let bg: HTMLCanvasElement | null = null;
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = root.clientWidth;
    H = root.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    bg = null;
  };
  resize();
  window.addEventListener('resize', resize);

  const slimes: Slime[] = [];
  const arrows: Arrow[] = [];
  const pops: Pop[] = [];
  let score = 0;
  let lives = HP_LIVES;
  let t = 0;
  let spawnIn = 0.6;
  let shotCd = 0;
  let aim = -Math.PI / 2;
  let running = false;
  let over = false;
  let last = 0;
  let frame = 0;
  const scale = () => Math.max(0.8, W / 400);
  const archer = () => ({ x: W / 2, y: H - 70 });

  const setHud = () => {
    scoreEl.textContent = String(score);
    livesEl.textContent = '❤️'.repeat(lives) + '🖤'.repeat(HP_LIVES - lives);
  };
  setHud();

  const spawn = () => {
    const { speed } = hpDifficulty(t);
    const fromLeft = Math.random() < 0.5;
    const golden = Math.random() < GOLDEN_CHANCE;
    const r = (golden ? 15 : 18) * scale();
    const top = 90;
    const bottom = H - 190;
    slimes.push({
      x: fromLeft ? -r : W + r,
      base: top + Math.random() * Math.max(40, bottom - top),
      hop: (22 + Math.random() * 30) * scale(),
      phase: Math.random() * Math.PI,
      vx: (fromLeft ? 1 : -1) * speed * scale() * (golden ? 1.35 : 0.85 + Math.random() * 0.3),
      r,
      golden,
      dead: false,
    });
  };

  const fire = (x: number, y: number) => {
    if (!running || shotCd > 0) return;
    const a = archer();
    aim = Math.atan2(y - a.y, x - a.x);
    if (aim > -0.08) aim = -0.08; // never shoot into the ground
    if (aim < -Math.PI + 0.08) aim = -Math.PI + 0.08;
    arrows.push({ x: a.x, y: a.y - 20, vx: Math.cos(aim) * ARROW_SPEED, vy: Math.sin(aim) * ARROW_SPEED });
    shotCd = SHOT_COOLDOWN;
  };
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    fire(e.clientX - r.left, e.clientY - r.top);
  });

  const end = () => {
    if (over) return;
    over = true;
    running = false;
    const text = opts.onEnd(score);
    const box = document.createElement('div');
    box.className = 'mg-intro';
    box.innerHTML = `<div class="mg-card"><h2>Practice over!</h2><p class="mg-final">${score} point${score === 1 ? '' : 's'}</p>${text}<button class="buy mg-collect">Collect</button></div>`;
    root.appendChild(box);
    box.querySelector('.mg-collect')!.addEventListener('click', close);
  };
  const close = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
    root.remove();
    opts.onClose();
  };
  // Quit mid-round ends it (and pays what you've scored); before starting or after, it just closes.
  root.querySelector('.mg-quit')!.addEventListener('click', () => (running ? end() : close()));
  root.querySelector('.mg-go')!.addEventListener('click', () => {
    root.querySelector('.mg-intro')!.remove();
    running = true;
    last = performance.now();
  });

  const slimeSheet = SHEETS['slime-green'];
  const archerSheet = HUNTER_SHEETS.ranger;

  const step = (dt: number) => {
    t += dt;
    shotCd = Math.max(0, shotCd - dt);
    spawnIn -= dt;
    if (spawnIn <= 0) {
      spawn();
      spawnIn = hpDifficulty(t).gap * (0.7 + Math.random() * 0.6);
    }
    for (const s of slimes) {
      s.x += s.vx * dt;
      s.phase += dt * (s.golden ? 6 : 4.5);
      // Across without being shot: a life lost.
      if (!s.dead && (s.vx > 0 ? s.x > W + s.r : s.x < -s.r)) {
        s.dead = true;
        lives--;
        pops.push({ x: s.vx > 0 ? W - 30 : 30, y: s.base, t: 0, text: '−❤️', color: '#ff6a6a' });
        setHud();
        if (lives <= 0) end();
      }
    }
    for (const a of arrows) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      for (const s of slimes) {
        if (s.dead) continue;
        const sy = s.base - Math.abs(Math.sin(s.phase)) * s.hop;
        if (Math.hypot(a.x - s.x, a.y - sy) < s.r + 6) {
          s.dead = true;
          a.y = -9999; // spent
          const pts = s.golden ? 3 : 1;
          score += pts;
          pops.push({ x: s.x, y: sy, t: 0, text: `+${pts}`, color: s.golden ? '#ffd34d' : '#9ff0a8' });
          setHud();
          break;
        }
      }
    }
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i];
      if (a.y < -40 || a.x < -40 || a.x > W + 40) arrows.splice(i, 1);
    }
    for (let i = slimes.length - 1; i >= 0; i--) if (slimes[i].dead) slimes.splice(i, 1);
    for (let i = pops.length - 1; i >= 0; i--) {
      pops[i].t += dt;
      if (pops[i].t > 0.8) pops.splice(i, 1);
    }
  };

  const draw = () => {
    if (!bg) bg = areaBackground('forest', Math.round(W), Math.round(H));
    if (bg) g.drawImage(bg, 0, 0, W, H);
    else {
      g.fillStyle = '#3f7a3a';
      g.fillRect(0, 0, W, H);
    }
    g.imageSmoothingEnabled = false;
    // Slimes: hopping, with a shadow on the ground line.
    const sImg = monsterSheetImage('slime-green');
    for (const s of slimes) {
      const lift = Math.abs(Math.sin(s.phase)) * s.hop;
      const y = s.base - lift;
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.ellipse(s.x, s.base + s.r * 0.55, s.r * (0.9 - lift / (s.hop * 3)), s.r * 0.3, 0, 0, Math.PI * 2);
      g.fill();
      if (sImg.complete && sImg.naturalWidth) {
        const F = slimeSheet.frame;
        const row = sheetRow(slimeSheet, s.vx > 0 ? 'R' : 'L');
        const col = Math.floor(s.phase * 2) % slimeSheet.cols;
        const k = (s.r * 2.2) / slimeSheet.box[2];
        g.save();
        if (s.golden) g.filter = 'hue-rotate(-70deg) saturate(2.2) brightness(1.25)';
        g.drawImage(sImg, col * F, row * F, F, F, s.x - (slimeSheet.box[0] + slimeSheet.box[2] / 2) * k, y + s.r * 0.6 - (slimeSheet.box[1] + slimeSheet.box[3]) * k, F * k, F * k);
        g.restore();
      } else {
        g.fillStyle = s.golden ? '#ffd34d' : '#7be07b';
        g.beginPath();
        g.arc(s.x, y, s.r, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Arrows
    g.strokeStyle = '#f4e2b8';
    g.lineWidth = 3;
    for (const a of arrows) {
      const d = Math.hypot(a.vx, a.vy);
      const ux = a.vx / d;
      const uy = a.vy / d;
      g.beginPath();
      g.moveTo(a.x - ux * 22, a.y - uy * 22);
      g.lineTo(a.x, a.y);
      g.stroke();
      g.fillStyle = '#d8d8e0';
      g.beginPath();
      g.moveTo(a.x + ux * 7, a.y + uy * 7);
      g.lineTo(a.x - uy * 4, a.y + ux * 4);
      g.lineTo(a.x + uy * 4, a.y - ux * 4);
      g.fill();
    }
    // Galladair at the bottom, facing up, his bow toward where he last aimed.
    const ar = archer();
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(ar.x, ar.y + 30, 26, 9, 0, 0, Math.PI * 2);
    g.fill();
    const hImg = hunterSheetImage('ranger');
    if (hImg && archerSheet) {
      const F = archerSheet.frame;
      const row = 3; // facing up
      const col = Math.floor(t * 8) % archerSheet.frames[row];
      const [bx, by, bw, bh] = archerSheet.box;
      const k = 72 / Math.max(bw, bh);
      g.drawImage(hImg, col * F, row * F, F, F, ar.x - (bx + bw / 2) * k, ar.y + 32 - (by + bh) * k, F * k, F * k);
    }
    const bow = gearImage('weapons/031');
    if (bow) {
      g.save();
      g.translate(ar.x, ar.y - 10);
      g.rotate(aim + Math.PI / 4);
      g.drawImage(bow, -18, -18, 36, 36);
      g.restore();
    }
    // Score pops
    g.font = `bold ${Math.round(18 * scale())}px monospace`;
    g.textAlign = 'center';
    for (const p of pops) {
      g.globalAlpha = 1 - p.t / 0.8;
      g.fillStyle = p.color;
      g.fillText(p.text, p.x, p.y - 30 - p.t * 40);
    }
    g.globalAlpha = 1;
  };

  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (running) step(dt);
    draw();
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame((now) => {
    last = now;
    loop(now);
  });
}
