import { areaDef, enemyDef, FIELD_ZOOM, GUARDIAN_TIME, hunterDef, materialDef, type EnemyId, type EnemyShape } from '../core/balance';
import { PLAYER_RADIUS, type Bullet, type Enemy, type Field, type Helper } from '../core/field';
import { fmt } from '../core/format';
import type { Game } from '../core/game';
import { fitCanvas, Fx } from './fx';
import { sprite } from './sprites';

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
  /** Radius the ring grows to, color, and how long it lasts. */
  r: number;
  color: string;
  max: number;
  fill?: boolean;
}

interface Beam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  t: number;
}

const Z = FIELD_ZOOM;

const OUTLINE = '#120c1c';
const SPRITE_SCALE = 2.4;

/** Draws the survivor-style battlefield: the Hunter in the middle, the horde closing in. */
export class BattleView {
  private g: CanvasRenderingContext2D;
  private fx = new Fx();
  private pickups: Pickup[] = [];
  private rings: Ring[] = [];
  private beams: Beam[] = [];
  private time = 0;
  private shake = 0;
  private stunTextCooldown = 0;
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
    this.fx.textScale = 1 / Z;
    // Static ground detail in normalized coords, so it scales with the view.
    for (let i = 0; i < 70; i++) this.specks.push({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 3 });

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      // Screen -> world (the field is drawn zoomed out around the center).
      this.field.tap((e.clientX - r.left - this.w / 2) / Z, (e.clientY - r.top - this.h / 2) / Z);
    });

    game.on((e) => {
      if (e.type === 'guardianFail') this.showBanner('The Guardian retreats…', '#ffb04d');
      if (e.type === 'areaUnlocked') this.showBanner(`${areaDef(e.area).name} unlocked!`, '#9fe0ff');
      if (e.type === 'unlock') this.showBanner(`${enemyDef(e.enemy).name}s now roam!`, enemyDef(e.enemy).color);
      if (e.type === 'travel') {
        this.pickups = [];
        this.showBanner(areaDef(game.area).name, '#ffffff');
      }
    });
  }

  showBanner(text: string, color: string): void {
    this.banner = { text, color, life: 0 };
  }

  update(dt: number): void {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt);
    this.stunTextCooldown = Math.max(0, this.stunTextCooldown - dt);
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
          const color = e.boss ? '#ffd34d' : enemyDef(e.enemy).color;
          this.fx.burst(e.x, e.y, color, e.boss ? 40 : 8, e.boss ? 260 : 140, e.boss ? 5 : 3, 0);
          this.dropPickup(e.x, e.y, '#ffd34d', false, e.boss ? 12 : 1);
          if (e.reward.material) this.dropPickup(e.x, e.y, materialDef(e.reward.material).color, true, Math.min(8, e.reward.amount));
          if (e.boss) this.shake = 0.4;
          break;
        }
        case 'blast':
          this.rings.push({ x: e.x, y: e.y, t: 0, r: this.game.tapRadius, color: '255,255,255', max: 0.25 });
          break;
        case 'explode':
          this.rings.push({ x: e.x, y: e.y, t: 0, r: e.r, color: '255,138,61', max: 0.3, fill: true });
          this.fx.burst(e.x, e.y, '#ffb04d', 8, 160, 3, 0);
          break;
        case 'nova':
          this.rings.push({ x: e.x, y: e.y, t: 0, r: e.r, color: '255,240,190', max: 0.35 });
          break;
        case 'beam':
          this.beams.push({ ...e, t: 0 });
          break;
        case 'guard':
          this.rings.push({ x: e.x, y: e.y, t: 0, r: PLAYER_RADIUS + 10, color: '255,232,163', max: 0.3 });
          this.fx.text(e.x, e.y - 30, 'BLOCK', '#ffe8a3', 12, 0.6);
          break;
        case 'boss':
          this.shake = 0.3;
          this.showBanner('THE GUARDIAN APPEARS', '#ff5a6a');
          break;
        case 'stun':
          this.shake = Math.max(this.shake, e.boss ? 0.35 : 0.15);
          this.fx.burst(e.x, e.y, '#ffe066', 6, 120, 2, 0);
          if (e.who === 'main' && this.stunTextCooldown <= 0) {
            this.fx.text(0, -PLAYER_RADIUS - 26, 'STUNNED!', '#ffe066', 16, 0.8);
            this.stunTextCooldown = 1;
          }
          break;
        case 'escape': {
          // A puff at the screen edge where the loot got away.
          const hw = this.w / 2 / Z;
          const hh = this.h / 2 / Z;
          const x = Math.max(-hw + 10, Math.min(hw - 10, e.x));
          const y = Math.max(-hh + 10, Math.min(hh - 10, e.y));
          this.fx.burst(x, y, 'rgba(200,200,220,0.8)', 5, 60, 3, 0);
          break;
        }
      }
    }

    for (const p of this.pickups) {
      p.t += dt;
      if (p.t < 0.35) {
        const drag = 0.01 ** dt;
        p.vx *= drag;
        p.vy *= drag;
      } else {
        // Vacuum toward the Hunter, accelerating.
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
    this.rings = this.rings.filter((r) => r.t < r.max);
    for (const b of this.beams) b.t += dt;
    this.beams = this.beams.filter((b) => b.t < 0.25);
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
    const zone = areaDef(this.game.area);

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
    g.scale(Z, Z);

    // Poison puddles on the ground
    for (const p of this.field.puddles) {
      g.fillStyle = `rgba(123,224,123,${0.25 * Math.min(1, p.life)})`;
      g.strokeStyle = `rgba(123,224,123,${0.6 * Math.min(1, p.life)})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }

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

    for (const e of this.field.enemies) this.drawEnemy(g, e);
    for (const h of this.field.helpers) this.drawHelper(g, h);
    this.drawHunter(g);

    for (const b of this.field.bullets) drawBullet(g, b, this.time);

    for (const b of this.beams) {
      g.strokeStyle = b.color;
      g.globalAlpha = 1 - b.t / 0.25;
      g.lineWidth = b.width;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(b.x1, b.y1);
      g.lineTo(b.x2, b.y2);
      g.stroke();
      g.globalAlpha = 1;
    }

    for (const r of this.rings) {
      const k = r.t / r.max;
      const rad = r.r * (0.4 + k * 0.6);
      g.beginPath();
      g.arc(r.x, r.y, rad, 0, Math.PI * 2);
      if (r.fill) {
        g.fillStyle = `rgba(${r.color},${0.35 * (1 - k)})`;
        g.fill();
      }
      g.strokeStyle = `rgba(${r.color},${1 - k})`;
      g.lineWidth = 3;
      g.stroke();
    }

    this.fx.draw(g);
    g.restore();
    this.drawHud(g);
  }

  private drawEnemy(g: CanvasRenderingContext2D, e: Enemy): void {
    const def = enemyDef(e.type);
    const r = e.r;
    // Walking away from the Hunter while fleeing, toward them otherwise.
    const dirX = e.fleeing ? e.x : -e.x;
    g.save();
    g.translate(e.x, e.y);
    if (e.fleeing) g.globalAlpha = 0.8;

    const img = (e.boss && sprite(`bosses/${e.type}`)) || sprite(`enemies/${e.type}`);
    if (img) {
      const size = r * SPRITE_SCALE;
      const bob = Math.sin(e.phase * 10) * r * 0.06;
      g.scale(dirX < 0 ? -1 : 1, 1);
      g.drawImage(img, -size / 2, -size / 2 + bob, size, size);
      if (e.flash > 0.5) {
        // Brief white flash on hit without needing a tinted copy of the sprite.
        g.globalAlpha = 0.5;
        g.globalCompositeOperation = 'lighter';
        g.drawImage(img, -size / 2, -size / 2 + bob, size, size);
        g.globalCompositeOperation = 'source-over';
      }
      g.scale(dirX < 0 ? -1 : 1, 1);
    } else {
      const wob = Math.sin(e.phase * 8) * 0.08;
      g.save();
      g.scale(1 + wob, 1 - wob);
      g.fillStyle = e.flash > 0.5 ? '#ffffff' : e.boss ? shade(def.color, -0.15) : def.color;
      g.strokeStyle = OUTLINE;
      g.lineWidth = e.boss ? 4 : 2;
      shapePath(g, def.shape, r);
      g.fill();
      g.stroke();
      // Eyes look at the Hunter (or away, while fleeing).
      const d = Math.hypot(e.x, e.y) || 1;
      const k = e.fleeing ? 1 : -1;
      const lx = ((k * e.x) / d) * r * 0.12;
      const ly = ((k * e.y) / d) * r * 0.12;
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
      g.restore();
    }

    if (e.boss) drawCrown(g, r);
    if (e.fleeing) drawDizzy(g, r, this.time + e.phase, 0.6);
    g.restore();
  }

  private drawHunter(g: CanvasRenderingContext2D): void {
    const f = this.field;
    const R = PLAYER_RADIUS;

    // Frenzy aura / post-stun immunity ring
    if (this.game.frenzy) {
      g.strokeStyle = `rgba(255,150,60,${0.5 + Math.sin(this.time * 10) * 0.2})`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 0, R + 7 + Math.sin(this.time * 6) * 2, 0, Math.PI * 2);
      g.stroke();
    }
    if (f.immune > 0) {
      g.strokeStyle = `rgba(159,224,255,${Math.min(1, f.immune * 2) * 0.6})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, R + 4, 0, Math.PI * 2);
      g.stroke();
    }

    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(0, R * 0.9, R, R * 0.35, 0, 0, Math.PI * 2);
    g.fill();

    // Wobble while dazed
    const sway = f.stunned ? Math.sin(this.time * 14) * 0.18 : 0;
    g.save();
    g.rotate(sway);
    const img = sprite('hunter');
    if (img) {
      const size = R * SPRITE_SCALE * 1.2;
      g.save();
      g.scale(Math.cos(f.aim) < 0 ? -1 : 1, 1);
      g.drawImage(img, -size / 2, -size / 2, size, size);
      g.restore();
    } else {
      g.save();
      g.rotate(f.stunned ? Math.PI / 2 : f.aim); // gun droops while stunned
      g.fillStyle = '#6b5a7a';
      g.strokeStyle = OUTLINE;
      g.lineWidth = 2;
      g.fillRect(R * 0.4, -3, R * 1.1, 6);
      g.strokeRect(R * 0.4, -3, R * 1.1, 6);
      g.restore();
      g.fillStyle = '#f4e7cf';
      g.strokeStyle = OUTLINE;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 0, R, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#7c5cff';
      g.beginPath();
      g.arc(0, 0, R - 1.5, Math.PI * 1.05, Math.PI * 1.95);
      g.closePath();
      g.fill();
      g.fillStyle = OUTLINE;
      if (f.stunned) {
        // X eyes
        g.strokeStyle = OUTLINE;
        g.lineWidth = 1.6;
        for (const side of [-1, 1]) {
          const cx = side * 4;
          g.beginPath();
          g.moveTo(cx - 2, -1);
          g.lineTo(cx + 2, 3);
          g.moveTo(cx + 2, -1);
          g.lineTo(cx - 2, 3);
          g.stroke();
        }
      } else {
        const ex = Math.cos(f.aim) * 3;
        const ey = Math.sin(f.aim) * 3;
        for (const side of [-1, 1]) {
          g.beginPath();
          g.arc(side * 4 + ex, 1 + ey, 1.8, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    g.restore();

    drawShieldPips(g, 0, R + (f.stunned ? 17 : 9), f.guard, this.game.guardOf('main'));
    if (f.stunned) {
      drawDizzy(g, R, this.time, 1);
      const bw = 34;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(-bw / 2, R + 8, bw, 5);
      g.fillStyle = '#ffe066';
      g.fillRect(-bw / 2, R + 8, bw * (f.stun / Math.max(0.01, f.stunTotal)), 5);
    }
  }

  /** A stationed Hunter: sprite if provided, otherwise a colored circle with their icon. */
  private drawHelper(g: CanvasRenderingContext2D, h: Helper): void {
    const def = hunterDef(h.id);
    const R = PLAYER_RADIUS * 0.9;
    g.save();
    g.translate(h.x, h.y);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(0, R * 0.9, R, R * 0.35, 0, 0, Math.PI * 2);
    g.fill();
    const img = sprite(`hunters/${h.id}`);
    if (img) {
      const size = R * SPRITE_SCALE * 1.2;
      g.scale(Math.cos(h.aim) < 0 ? -1 : 1, 1);
      g.drawImage(img, -size / 2, -size / 2, size, size);
    } else {
      g.save();
      g.rotate(h.aim);
      g.fillStyle = '#6b5a7a';
      g.strokeStyle = OUTLINE;
      g.lineWidth = 2;
      g.fillRect(R * 0.4, -2.5, R * 1.0, 5);
      g.strokeRect(R * 0.4, -2.5, R * 1.0, 5);
      g.restore();
      g.fillStyle = def.color;
      g.strokeStyle = OUTLINE;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 0, R, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.font = `${Math.round(R * 1.1)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(def.icon, 0, 1);
      if (h.akimbo) {
        // Second pistol, pointing the same way.
        g.save();
        g.rotate(h.aim);
        g.fillStyle = '#6b5a7a';
        g.fillRect(R * 0.4, 4, R * 0.8, 4);
        g.restore();
      }
    }
    g.restore();
    drawShieldPips(g, h.x, h.y + R + 9, h.guard, this.game.guardOf(h.id));
    if (h.stun > 0) {
      g.save();
      g.translate(h.x, h.y);
      drawDizzy(g, R, this.time, 0.9);
      g.restore();
    }
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
      g.fillText(`${areaDef(this.game.area).name.toUpperCase()} GUARDIAN · ${fmt(Math.max(0, boss.hp))}`, w / 2, 14);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(x, 24, bw, 10);
      g.fillStyle = '#ff4d6d';
      g.fillRect(x, 24, bw * Math.max(0, boss.hp / boss.maxHp), 10);
      const t = Math.max(0, this.game.bossTimer / GUARDIAN_TIME);
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

/** Little stars circling above a dazed head. */
function drawDizzy(g: CanvasRenderingContext2D, r: number, t: number, scale: number): void {
  g.fillStyle = '#ffe066';
  for (let i = 0; i < 3; i++) {
    const a = t * 6 + (i * Math.PI * 2) / 3;
    const x = Math.cos(a) * r * 0.8;
    const y = -r - 5 * scale + Math.sin(a) * r * 0.25;
    star(g, x, y, 3 * scale);
  }
}

function star(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? s * 0.45 : s;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

function drawCrown(g: CanvasRenderingContext2D, r: number): void {
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

/** Draws an enemy's portrait (sprite if available, placeholder shape otherwise) into a small canvas. */
export function drawEnemyPortrait(canvas: HTMLCanvasElement, id: EnemyId): void {
  const g = canvas.getContext('2d')!;
  const { w, h } = fitCanvas(canvas, g);
  g.clearRect(0, 0, w, h);
  const def = enemyDef(id);
  const r = Math.min(w, h) * 0.32;
  g.save();
  g.translate(w / 2, h / 2);
  const img = sprite(`enemies/${id}`);
  if (img) g.drawImage(img, -r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
  else {
    g.fillStyle = def.color;
    g.strokeStyle = OUTLINE;
    g.lineWidth = 2;
    shapePath(g, def.shape, r);
    g.fill();
    g.stroke();
    for (const side of [-1, 1]) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(side * r * 0.35, -r * 0.1, r * 0.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = OUTLINE;
      g.beginPath();
      g.arc(side * r * 0.35, -r * 0.05, r * 0.11, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/** Each attack style gets its own simple look. */
function drawBullet(g: CanvasRenderingContext2D, b: Bullet, t: number): void {
  const a = Math.atan2(b.vy, b.vx);
  g.save();
  g.translate(b.x, b.y);
  switch (b.kind) {
    case 'fireball':
      g.fillStyle = 'rgba(255,120,40,0.35)';
      g.beginPath();
      g.arc(0, 0, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffb04d';
      g.beginPath();
      g.arc(0, 0, 5.5, 0, Math.PI * 2);
      g.fill();
      break;
    case 'potion':
      g.rotate(t * 12);
      g.fillStyle = '#7be07b';
      g.strokeStyle = OUTLINE;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(0, 2, 5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillRect(-1.5, -6, 3, 5);
      break;
    case 'arrow':
      g.rotate(a);
      g.strokeStyle = '#e8d2a8';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-10, 0);
      g.lineTo(6, 0);
      g.stroke();
      g.fillStyle = '#c0c0c0';
      g.beginPath();
      g.moveTo(9, 0);
      g.lineTo(4, -3);
      g.lineTo(4, 3);
      g.closePath();
      g.fill();
      break;
    case 'dagger':
      g.rotate(t * 30);
      g.fillStyle = '#dfe6f0';
      g.beginPath();
      g.moveTo(7, 0);
      g.lineTo(-4, -2.5);
      g.lineTo(-4, 2.5);
      g.closePath();
      g.fill();
      break;
    case 'hammer':
      g.rotate(t * 16);
      g.fillStyle = '#8fdcff';
      g.strokeStyle = OUTLINE;
      g.lineWidth = 1.5;
      g.fillRect(-6, -4, 12, 8);
      g.strokeRect(-6, -4, 12, 8);
      break;
    case 'ricochet':
      g.fillStyle = '#a0a0a0';
      g.beginPath();
      g.arc(0, 0, 3.5, 0, Math.PI * 2);
      g.fill();
      break;
    case 'pellet':
    case 'pistol':
      g.fillStyle = '#ffe9a0';
      g.beginPath();
      g.arc(0, 0, 2.2, 0, Math.PI * 2);
      g.fill();
      break;
    default:
      g.fillStyle = b.crit ? '#ff6b6b' : '#fff6c2';
      g.beginPath();
      g.arc(0, 0, b.crit ? 4 : 3, 0, Math.PI * 2);
      g.fill();
  }
  g.restore();
}

/** Shield charges under a Hunter: lit while charged, faint while recharging. */
function drawShieldPips(g: CanvasRenderingContext2D, x: number, y: number, guard: number, max: number): void {
  for (let i = 0; i < max; i++) {
    g.fillStyle = i < guard ? '#ffe8a3' : 'rgba(255,255,255,0.2)';
    g.beginPath();
    g.arc(x + (i - (max - 1) / 2) * 7, y, 2.6, 0, Math.PI * 2);
    g.fill();
  }
}
