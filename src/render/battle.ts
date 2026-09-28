import { BOSS_TIME, materialDef, TAP_RADIUS, zoneFor, type EnemyShape } from '../core/balance';
import { PLAYER_RADIUS, type Enemy, type Field } from '../core/field';
import { fmt } from '../core/format';
import type { Game } from '../core/game';
import { fitCanvas, Fx } from './fx';

interface Pickup {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  color: string;
  size: number;
  gem: boolean;
}

interface Ring {
  x: number;
  y: number;
  t: number;
}

const OUTLINE = '#120c1c';

/** Draws the survivor-style battlefield: hero in the middle, the horde closing in. */
export class BattleView {
  private g: CanvasRenderingContext2D;
  private fx = new Fx();
  private pickups: Pickup[] = [];
  private rings: Ring[] = [];
  private time = 0;
  private shake = 0;
  private banner: { text: string; color: string; life: number } | null = null;
  private w = 0;
  private h = 0;
  private specks: Array<{ x: number; y: number; r: number }> = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private game: Game,
    private field: Field,
  ) {
    this.g = canvas.getContext('2d')!;
    // Static ground detail in normalized coords, so it scales with the view.
    for (let i = 0; i < 70; i++) this.specks.push({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 3 });

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      this.field.tap(e.clientX - r.left - this.w / 2, e.clientY - r.top - this.h / 2);
    });

    game.on((e) => {
      if (e.type === 'bossFail') this.showBanner('Boss escaped! Retreating…', '#ffb04d');
      if (e.type === 'prestige') this.showBanner(`+${e.shards} Soul Shards`, '#c89bff');
      if (e.type === 'stageClear') this.fx.text(0, -this.h * 0.3, `Stage ${e.stage} cleared`, '#9fe0ff', 18, 1.2);
    });
  }

  showBanner(text: string, color: string): void {
    this.banner = { text, color, life: 0 };
  }

  update(dt: number): void {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt);
    if (this.banner) {
      this.banner.life += dt;
      if (this.banner.life > 2) this.banner = null;
    }

    for (const e of this.field.drainEvents()) {
      switch (e.type) {
        case 'hit':
          if (e.crit) this.fx.text(e.x, e.y, fmt(e.dmg), '#ff5a5a', 16, 0.6);
          else if (Math.random() < 0.25) this.fx.text(e.x, e.y, fmt(e.dmg), '#ffffff', 11, 0.5);
          break;
        case 'kill': {
          const color = e.boss ? '#ffd34d' : zoneFor(this.game.state.stage).enemy;
          this.fx.burst(e.x, e.y, color, e.boss ? 40 : 8, e.boss ? 260 : 140, e.boss ? 5 : 3, 0);
          this.dropPickup(e.x, e.y, '#ffd34d', false, e.boss ? 12 : 1);
          if (e.reward.material) this.dropPickup(e.x, e.y, materialDef(e.reward.material).color, true, Math.min(8, e.reward.amount));
          if (e.boss) {
            this.shake = 0.4;
            this.showBanner('BOSS SLAIN!', '#ffd34d');
          }
          break;
        }
        case 'blast':
          this.rings.push({ x: e.x, y: e.y, t: 0 });
          break;
        case 'boss':
          this.shake = 0.3;
          this.showBanner('A BOSS APPROACHES', '#ff5a6a');
          break;
        case 'death':
          this.shake = 0.5;
          this.fx.burst(0, 0, '#ff5a6a', 40, 300, 4, 0);
          this.showBanner('Overrun! Retreating…', '#ff5a6a');
          this.pickups = [];
          break;
      }
    }

    for (const p of this.pickups) {
      p.t += dt;
      if (p.t < 0.35) {
        const drag = 0.01 ** dt;
        p.vx *= drag;
        p.vy *= drag;
      } else {
        // Vacuum toward the hero, accelerating.
        const d = Math.hypot(p.x, p.y) || 1;
        const speed = 200 + (p.t - 0.35) * 900;
        p.vx = (-p.x / d) * speed;
        p.vy = (-p.y / d) * speed;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.pickups = this.pickups.filter((p) => p.t < 0.35 || Math.hypot(p.x, p.y) > PLAYER_RADIUS);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < 0.25);
    this.fx.update(dt);
  }

  private dropPickup(x: number, y: number, color: string, gem: boolean, count: number): void {
    if (this.pickups.length > 200) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 90;
      this.pickups.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, color, size: gem ? 5 : 3, gem });
    }
  }

  render(): void {
    const { w, h } = fitCanvas(this.canvas, this.g);
    this.w = w;
    this.h = h;
    this.field.setView(w, h);
    const g = this.g;
    const zone = zoneFor(this.game.state.stage);

    g.fillStyle = zone.ground;
    g.fillRect(0, 0, w, h);
    g.fillStyle = zone.speck;
    for (const s of this.specks) {
      g.beginPath();
      g.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      g.fill();
    }

    g.save();
    g.translate(w / 2, h / 2);
    if (this.shake > 0) g.translate((Math.random() - 0.5) * 24 * this.shake, (Math.random() - 0.5) * 24 * this.shake);

    // Pickups under everything else
    for (const p of this.pickups) {
      g.fillStyle = p.color;
      g.beginPath();
      if (p.gem) {
        g.moveTo(p.x, p.y - p.size);
        g.lineTo(p.x + p.size * 0.75, p.y);
        g.lineTo(p.x, p.y + p.size);
        g.lineTo(p.x - p.size * 0.75, p.y);
        g.closePath();
      } else g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      g.fill();
    }

    for (const e of this.field.enemies) this.drawEnemy(g, e, zone.shape, zone.enemy);
    this.drawHero(g);

    g.fillStyle = '#fff6c2';
    for (const b of this.field.bullets) {
      g.fillStyle = b.crit ? '#ff6b6b' : '#fff6c2';
      g.beginPath();
      g.arc(b.x, b.y, b.crit ? 4 : 3, 0, Math.PI * 2);
      g.fill();
    }

    for (const r of this.rings) {
      g.strokeStyle = `rgba(255,255,255,${1 - r.t / 0.25})`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(r.x, r.y, TAP_RADIUS * (0.4 + r.t / 0.25 * 0.6), 0, Math.PI * 2);
      g.stroke();
    }

    this.fx.draw(g);
    g.restore();
    this.drawHud(g);
  }

  private drawEnemy(g: CanvasRenderingContext2D, e: Enemy, shape: EnemyShape, color: string): void {
    const r = e.r;
    const wob = Math.sin(e.phase * 8) * 0.08;
    g.save();
    g.translate(e.x, e.y);
    g.scale(1 + wob, 1 - wob);
    g.fillStyle = e.flash > 0.5 ? '#ffffff' : e.boss ? shade(color, -0.15) : color;
    g.strokeStyle = OUTLINE;
    g.lineWidth = e.boss ? 4 : 2;
    shapePath(g, shape, r);
    g.fill();
    g.stroke();

    // Eyes look at the hero.
    const d = Math.hypot(e.x, e.y) || 1;
    const lx = (-e.x / d) * r * 0.12;
    const ly = (-e.y / d) * r * 0.12;
    const eyeR = Math.max(1.6, r * 0.2);
    for (const side of [-1, 1]) {
      const ex = side * r * 0.35;
      const ey = -r * 0.1;
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(ex, ey, eyeR, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = OUTLINE;
      g.beginPath();
      g.arc(ex + lx, ey + ly, eyeR * 0.55, 0, Math.PI * 2);
      g.fill();
    }

    if (e.boss) {
      g.fillStyle = '#ffd34d';
      g.strokeStyle = OUTLINE;
      g.lineWidth = 2;
      g.beginPath();
      const cy = -r - 2;
      g.moveTo(-r * 0.5, cy);
      g.lineTo(-r * 0.5, cy - r * 0.35);
      g.lineTo(-r * 0.2, cy - r * 0.15);
      g.lineTo(0, cy - r * 0.45);
      g.lineTo(r * 0.2, cy - r * 0.15);
      g.lineTo(r * 0.5, cy - r * 0.35);
      g.lineTo(r * 0.5, cy);
      g.closePath();
      g.fill();
      g.stroke();
    }
    g.restore();
  }

  private drawHero(g: CanvasRenderingContext2D): void {
    const f = this.field;
    const R = PLAYER_RADIUS;
    const hurt = f.hurtAgo < 0.12;

    // Frenzy aura
    if (this.game.frenzy) {
      g.strokeStyle = `rgba(255,150,60,${0.5 + Math.sin(this.time * 10) * 0.2})`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 0, R + 7 + Math.sin(this.time * 6) * 2, 0, Math.PI * 2);
      g.stroke();
    }

    // Shadow, gun, body, eyes
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(0, R * 0.9, R, R * 0.35, 0, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.rotate(f.aim);
    g.fillStyle = '#6b5a7a';
    g.strokeStyle = OUTLINE;
    g.lineWidth = 2;
    g.fillRect(R * 0.4, -3, R * 1.1, 6);
    g.strokeRect(R * 0.4, -3, R * 1.1, 6);
    g.restore();
    g.fillStyle = hurt ? '#ff8080' : '#f4e7cf';
    g.strokeStyle = OUTLINE;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // Hood / hat stripe
    g.fillStyle = '#7c5cff';
    g.beginPath();
    g.arc(0, 0, R - 1.5, Math.PI * 1.05, Math.PI * 1.95);
    g.closePath();
    g.fill();
    const ex = Math.cos(f.aim) * 3;
    const ey = Math.sin(f.aim) * 3;
    g.fillStyle = OUTLINE;
    for (const side of [-1, 1]) {
      g.beginPath();
      g.arc(side * 4 + ex, 1 + ey, 1.8, 0, Math.PI * 2);
      g.fill();
    }

    // HP bar
    const bw = 34;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(-bw / 2, R + 8, bw, 5);
    g.fillStyle = f.hp > 0.35 ? '#5ee07a' : '#ff5a6a';
    g.fillRect(-bw / 2, R + 8, bw * Math.max(0, f.hp), 5);
  }

  private drawHud(g: CanvasRenderingContext2D): void {
    const w = this.w;
    const boss = this.field.enemies.find((e) => e.boss);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (boss) {
      const bw = Math.min(w * 0.7, 300);
      const x = (w - bw) / 2;
      g.font = '800 13px system-ui, sans-serif';
      g.fillStyle = '#ff9aa6';
      g.fillText(`BOSS · ${fmt(Math.max(0, boss.hp))}`, w / 2, 14);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(x, 24, bw, 10);
      g.fillStyle = '#ff4d6d';
      g.fillRect(x, 24, bw * Math.max(0, boss.hp / boss.maxHp), 10);
      const t = Math.max(0, this.game.state.bossTimer / BOSS_TIME);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(x, 37, bw, 5);
      g.fillStyle = t < 0.3 ? '#ff4d4d' : '#ffb04d';
      g.fillRect(x, 37, bw * t, 5);
    }

    if (this.banner) {
      const k = this.banner.life;
      g.globalAlpha = k < 0.2 ? k / 0.2 : k > 1.6 ? Math.max(0, 1 - (k - 1.6) / 0.4) : 1;
      g.font = '900 26px system-ui, sans-serif';
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      const by = this.h * 0.24;
      g.strokeText(this.banner.text, w / 2, by);
      g.fillStyle = this.banner.color;
      g.fillText(this.banner.text, w / 2, by);
      g.globalAlpha = 1;
    }
  }
}

function shapePath(g: CanvasRenderingContext2D, shape: EnemyShape, r: number): void {
  g.beginPath();
  switch (shape) {
    case 'circle':
      g.arc(0, 0, r, 0, Math.PI * 2);
      break;
    case 'square':
      g.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
      break;
    case 'triangle':
      g.moveTo(0, -r * 1.1);
      g.lineTo(r, r * 0.8);
      g.lineTo(-r, r * 0.8);
      g.closePath();
      break;
    case 'diamond':
      g.moveTo(0, -r * 1.15);
      g.lineTo(r, 0);
      g.lineTo(0, r * 1.15);
      g.lineTo(-r, 0);
      g.closePath();
      break;
    case 'ghost':
      g.arc(0, -r * 0.1, r, Math.PI, 0);
      g.lineTo(r, r * 0.9);
      g.lineTo(r * 0.5, r * 0.55);
      g.lineTo(0, r * 0.9);
      g.lineTo(-r * 0.5, r * 0.55);
      g.lineTo(-r, r * 0.9);
      g.closePath();
      break;
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      break;
  }
}

/** Lighten (amount > 0) or darken (amount < 0) a #rrggbb color. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(Math.min(255, Math.max(0, amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  const r = f((n >> 16) & 255);
  const gg = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (gg << 8) | b).toString(16).padStart(6, '0')}`;
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string): void {
  g.fillStyle = fill;
  g.beginPath();
  g.roundRect(x, y, Math.max(0, w), h, Math.min(r, w / 2, h / 2));
  g.fill();
}
