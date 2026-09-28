import { drawMonster, monsterLook, type MonsterLook } from '../render/monsterArt';
import { Fx } from '../render/fx';
import { drawMgHud, timerLabel } from './runner';
import type { MinigameDef, MinigameInstance, MinigameResult } from './types';

const DURATION = 30;
const BOMB_PENALTY = 5;

interface Thing {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  bomb: boolean;
  look: MonsterLook;
  spin: number;
  dead: boolean;
}

/** Blade Storm: monsters are hurled into the air; swipe through as many as possible, dodge bombs. */
class Blades implements MinigameInstance {
  private things: Thing[] = [];
  private fx = new Fx();
  private time = DURATION;
  private elapsed = 0;
  private waveTimer = 0.4;
  private score = 0;
  private slices = 0;
  private bombsHit = 0;
  private bestSwipe = 0;
  private swipeCount = 0;
  private trail: Array<{ x: number; y: number; t: number }> = [];
  private down_ = false;
  private flash = 0;
  private looks: MonsterLook[];
  private w: number;
  private h: number;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    const seed = Math.floor(Math.random() * 1000);
    this.looks = Array.from({ length: 6 }, (_, i) => monsterLook(seed, i, false, Math.random() * 360));
  }

  get finished() {
    return this.time <= 0;
  }

  private get gravity() {
    return 900 * (this.h / 800);
  }

  private launchWave(): void {
    const n = 1 + Math.floor(Math.random() * Math.min(5, 2 + this.elapsed / 8));
    const bombChance = Math.min(0.28, 0.1 + this.elapsed / 150);
    for (let i = 0; i < n; i++) {
      const x = this.w * (0.15 + Math.random() * 0.7);
      const peak = this.h * (0.25 + Math.random() * 0.4);
      const vy = -Math.sqrt(2 * this.gravity * (this.h - peak));
      this.things.push({
        x,
        y: this.h + 30,
        vx: (this.w / 2 - x) * (0.3 + Math.random() * 0.5) + (Math.random() - 0.5) * 80,
        vy: vy * (0.95 + Math.random() * 0.1),
        r: Math.max(22, Math.min(this.w, this.h) * 0.06),
        bomb: Math.random() < bombChance,
        look: this.looks[Math.floor(Math.random() * this.looks.length)],
        spin: (Math.random() - 0.5) * 4,
        dead: false,
      });
    }
  }

  update(dt: number, w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.time -= dt;
    this.elapsed += dt;
    this.flash = Math.max(0, this.flash - dt * 2);

    this.waveTimer -= dt;
    if (this.waveTimer <= 0) {
      this.launchWave();
      this.waveTimer = Math.max(0.55, 1.2 - this.elapsed * 0.02);
    }
    for (const t of this.things) {
      t.vy += this.gravity * dt;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
    }
    this.things = this.things.filter((t) => !t.dead && t.y < h + 80);
    const now = this.elapsed;
    this.trail = this.trail.filter((p) => now - p.t < 0.15);
    this.fx.update(dt);
  }

  down(x: number, y: number): void {
    this.down_ = true;
    this.swipeCount = 0;
    this.trail = [{ x, y, t: this.elapsed }];
  }

  move(x: number, y: number): void {
    if (!this.down_) return;
    const last = this.trail[this.trail.length - 1] ?? { x, y };
    for (const t of this.things) {
      if (!t.dead && segCircle(last.x, last.y, x, y, t.x, t.y, t.r)) this.slice(t);
    }
    this.trail.push({ x, y, t: this.elapsed });
  }

  up(): void {
    this.down_ = false;
    if (this.swipeCount >= 3) {
      const bonus = this.swipeCount * 10;
      this.score += bonus;
      const last = this.trail[this.trail.length - 1] ?? { x: this.w / 2, y: this.h / 2 };
      this.fx.text(last.x, last.y - 30, `${this.swipeCount}x SWIPE +${bonus}`, '#ffd34d', 28);
    }
    this.bestSwipe = Math.max(this.bestSwipe, this.swipeCount);
    this.swipeCount = 0;
  }

  private slice(t: Thing): void {
    t.dead = true;
    if (t.bomb) {
      this.bombsHit++;
      this.time -= BOMB_PENALTY;
      this.flash = 1;
      this.swipeCount = 0;
      this.fx.burst(t.x, t.y, '#ff6b3d', 30, 380, 6);
      this.fx.text(t.x, t.y - 30, `BOOM -${BOMB_PENALTY}s`, '#ff4d4d', 30);
      return;
    }
    this.slices++;
    this.swipeCount++;
    this.score += 10;
    this.fx.burst(t.x, t.y, `hsl(${t.look.hue} 60% 55%)`, 14, 260, 5);
    this.fx.text(t.x, t.y - 20, '+10', '#fff', 20, 0.6);
  }

  render(g: CanvasRenderingContext2D, w: number, h: number): void {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#16213e');
    bg.addColorStop(1, '#3a1f4d');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);

    for (const t of this.things) {
      if (t.bomb) {
        g.save();
        g.translate(t.x, t.y);
        g.rotate(this.elapsed * t.spin);
        g.fillStyle = '#222';
        g.strokeStyle = '#ff4d4d';
        g.lineWidth = 3;
        g.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const rr = i % 2 ? t.r * 0.8 : t.r * 1.05;
          g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        g.closePath();
        g.fill();
        g.stroke();
        g.fillStyle = '#ff4d4d';
        g.font = `900 ${Math.round(t.r * 0.9)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('!', 0, 1);
        g.restore();
      } else {
        drawMonster(g, t.look, t.x, t.y, t.r, { t: this.elapsed, hurt: 0, squash: 0 });
      }
    }

    if (this.trail.length > 1) {
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1];
        const b = this.trail[i];
        const k = i / this.trail.length;
        g.strokeStyle = `rgba(200,240,255,${k})`;
        g.lineWidth = 2 + k * 10;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
    }

    this.fx.draw(g);
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,60,40,${this.flash * 0.35})`;
      g.fillRect(0, 0, w, h);
    }
    drawMgHud(g, w, timerLabel(this.time), this.time < 5, this.score, this.swipeCount >= 2 ? `${this.swipeCount}x` : '');
  }

  result(): MinigameResult {
    return {
      score: this.score,
      units: this.slices,
      summary: `${this.slices} monsters sliced · best swipe ${this.bestSwipe}x · ${this.bombsHit} bombs hit`,
    };
  }
}

/** Does segment (x1,y1)-(x2,y2) pass within r of (cx,cy)? */
export function segCircle(x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, r: number): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / len2));
  return Math.hypot(x1 + t * dx - cx, y1 + t * dy - cy) <= r;
}

export const bladeStorm: MinigameDef = {
  id: 'blades',
  name: 'Blade Storm',
  icon: '⚔️',
  tagline: 'Slice flying monsters mid-air.',
  howTo: 'Swipe through monsters as they fly. Slice 3+ in one swipe for a bonus. Avoid the spiked bombs, they cost you time!',
  create: (w, h) => new Blades(w, h),
};
