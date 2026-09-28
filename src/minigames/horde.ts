import { drawMonster, monsterLook, type MonsterLook } from '../render/monsterArt';
import { Fx } from '../render/fx';
import { drawMgHud, timerLabel } from './runner';
import type { MinigameDef, MinigameInstance, MinigameResult } from './types';

const DURATION = 45;
const LIVES = 5;
const TAP_RADIUS = 70;
const NOVA_CHARGE = 30;

interface Mob {
  x: number;
  y: number;
  r: number;
  hp: number;
  speed: number;
  golden: boolean;
  look: MonsterLook;
  t: number;
  hurt: number;
}

/** Horde Rush: monsters swarm the tower from every side. Tap to smash groups; fill the meter for a Nova. */
class Horde implements MinigameInstance {
  private mobs: Mob[] = [];
  private fx = new Fx();
  private time = DURATION;
  private elapsed = 0;
  private spawnAcc = 0;
  private lives = LIVES;
  private kills = 0;
  private goldenKills = 0;
  private score = 0;
  private bestCombo = 0;
  private charge = 0;
  private nova = -1; // expanding ring radius, -1 when inactive
  private shake = 0;
  private looks: MonsterLook[];
  private w: number;
  private h: number;
  private rings: Array<{ x: number; y: number; t: number }> = [];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    const stageSeed = Math.floor(Math.random() * 1000);
    this.looks = Array.from({ length: 6 }, (_, i) => monsterLook(stageSeed, i, false, Math.random() * 360));
  }

  get finished() {
    return this.time <= 0 || this.lives <= 0;
  }

  private get center() {
    return { x: this.w / 2, y: this.h / 2 + 20 };
  }

  private get scale() {
    return Math.min(this.w, this.h) / 420;
  }

  private spawn(): void {
    const c = this.center;
    const a = Math.random() * Math.PI * 2;
    const dist = Math.hypot(this.w, this.h) / 2 + 30;
    const brute = this.elapsed > 12 && Math.random() < 0.18;
    const golden = !brute && Math.random() < 0.05;
    this.mobs.push({
      x: c.x + Math.cos(a) * dist,
      y: c.y + Math.sin(a) * dist,
      r: (brute ? 30 : 21) * Math.max(0.8, this.scale),
      hp: brute ? 2 : 1,
      speed: (38 + this.elapsed * 1.6) * Math.max(0.8, this.scale) * (brute ? 0.7 : golden ? 1.5 : 0.85 + Math.random() * 0.3),
      golden,
      look: this.looks[Math.floor(Math.random() * this.looks.length)],
      t: Math.random() * 10,
      hurt: 0,
    });
  }

  update(dt: number, w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.time -= dt;
    this.elapsed += dt;
    this.shake = Math.max(0, this.shake - dt);

    const rate = 1.6 + this.elapsed * 0.14;
    this.spawnAcc += dt * rate;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      this.spawn();
    }

    const c = this.center;
    const towerR = 34 * Math.max(0.8, this.scale);
    for (const m of this.mobs) {
      m.t += dt;
      m.hurt = Math.max(0, m.hurt - dt * 5);
      const dx = c.x - m.x;
      const dy = c.y - m.y;
      const d = Math.hypot(dx, dy) || 1;
      m.x += (dx / d) * m.speed * dt;
      m.y += (dy / d) * m.speed * dt;
      if (d < towerR + m.r * 0.6) {
        m.hp = -99;
        this.lives--;
        this.shake = 0.3;
        this.fx.burst(c.x, c.y, '#ff4d4d', 18, 260, 5);
        this.fx.text(c.x, c.y - 50, '-1 ❤', '#ff6b6b', 26);
      }
    }

    if (this.nova >= 0) {
      this.nova += dt * 900 * Math.max(0.8, this.scale);
      for (const m of this.mobs) {
        if (m.hp > 0 && Math.hypot(m.x - c.x, m.y - c.y) < this.nova) this.kill(m, 1);
      }
      if (this.nova > Math.hypot(w, h)) this.nova = -1;
    }

    this.mobs = this.mobs.filter((m) => m.hp > 0);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < 0.3);
    this.fx.update(dt);
  }

  private kill(m: Mob, combo: number): void {
    m.hp = 0;
    this.kills++;
    if (m.golden) this.goldenKills++;
    this.score += (m.golden ? 50 : 10) * combo;
    this.charge = Math.min(NOVA_CHARGE, this.charge + 1);
    this.fx.burst(m.x, m.y, m.golden ? '#ffd34d' : `hsl(${m.look.hue} 60% 55%)`, 10, 200, 4);
  }

  down(x: number, y: number): void {
    const c = this.center;
    const towerR = 40 * Math.max(0.8, this.scale);
    if (this.charge >= NOVA_CHARGE && Math.hypot(x - c.x, y - c.y) < towerR) {
      this.charge = 0;
      this.nova = 0;
      this.shake = 0.4;
      this.fx.text(c.x, c.y - 70, 'NOVA!', '#9fe0ff', 40, 1.2);
      return;
    }

    const radius = TAP_RADIUS * Math.max(0.8, this.scale);
    this.rings.push({ x, y, t: 0 });
    const hit = this.mobs.filter((m) => m.hp > 0 && Math.hypot(m.x - x, m.y - y) < radius + m.r);
    let killed = 0;
    for (const m of hit) {
      m.hp--;
      m.hurt = 1;
      if (m.hp <= 0) killed++;
    }
    const combo = killed >= 3 ? killed : 1;
    for (const m of hit) if (m.hp <= 0) this.kill(m, combo);
    if (killed >= 3) {
      this.bestCombo = Math.max(this.bestCombo, killed);
      this.fx.text(x, y - 40, `${killed}x COMBO!`, '#ffd34d', 28 + Math.min(killed, 10) * 2);
    }
  }

  move(): void {}
  up(): void {}

  render(g: CanvasRenderingContext2D, w: number, h: number): void {
    g.save();
    if (this.shake > 0) g.translate((Math.random() - 0.5) * 16 * this.shake * 3, (Math.random() - 0.5) * 16 * this.shake * 3);

    const bg = g.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, Math.max(w, h) * 0.7);
    bg.addColorStop(0, '#4a3b2a');
    bg.addColorStop(1, '#1c140e');
    g.fillStyle = bg;
    g.fillRect(-20, -20, w + 40, h + 40);

    const c = this.center;
    const towerR = 34 * Math.max(0.8, this.scale);
    // Tower
    g.fillStyle = '#8a8fa3';
    g.strokeStyle = '#3c3f4d';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(c.x, c.y, towerR, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.font = `${Math.round(towerR * 1.1)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🏰', c.x, c.y + 2);
    // Nova charge ring
    const k = this.charge / NOVA_CHARGE;
    g.strokeStyle = k >= 1 ? `hsl(190 100% ${60 + Math.sin(this.elapsed * 10) * 15}%)` : '#6fb8ff';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(c.x, c.y, towerR + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
    g.stroke();
    if (k >= 1) {
      g.font = '800 14px system-ui, sans-serif';
      g.fillStyle = '#9fe0ff';
      g.fillText('TAP TOWER: NOVA', c.x, c.y + towerR + 26);
    }

    for (const m of this.mobs) {
      drawMonster(g, m.look, m.x, m.y, m.r, { t: m.t, hurt: m.hurt, squash: m.hurt });
      if (m.golden) {
        g.strokeStyle = '#ffd34d';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(m.x, m.y, m.r * 1.3, 0, Math.PI * 2);
        g.stroke();
      }
    }

    if (this.nova >= 0) {
      g.strokeStyle = 'rgba(160,230,255,0.8)';
      g.lineWidth = 14;
      g.beginPath();
      g.arc(c.x, c.y, this.nova, 0, Math.PI * 2);
      g.stroke();
    }
    const radius = TAP_RADIUS * Math.max(0.8, this.scale);
    for (const r of this.rings) {
      g.strokeStyle = `rgba(255,255,255,${1 - r.t / 0.3})`;
      g.lineWidth = 4;
      g.beginPath();
      g.arc(r.x, r.y, radius * (0.5 + r.t / 0.6), 0, Math.PI * 2);
      g.stroke();
    }
    this.fx.draw(g);
    g.restore();

    drawMgHud(g, w, timerLabel(this.time), this.time < 5, this.score, '❤'.repeat(Math.max(0, this.lives)));
  }

  result(): MinigameResult {
    const units = this.kills + this.goldenKills * 4;
    return {
      score: this.score,
      units,
      summary: `${this.kills} monsters smashed · best combo ${this.bestCombo}x${this.lives <= 0 ? ' · tower fell!' : ''}`,
    };
  }
}

export const hordeRush: MinigameDef = {
  id: 'horde',
  name: 'Horde Rush',
  icon: '🏰',
  tagline: 'Defend the tower from an endless swarm.',
  howTo: 'Tap to smash monsters before they reach your tower. Hit 3+ at once for combos. Fill the ring, then tap the tower for a Nova!',
  create: (w, h) => new Horde(w, h),
};
