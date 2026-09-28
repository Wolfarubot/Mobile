import { gemValue, materialDef, type MaterialId } from '../core/balance';
import type { Game } from '../core/game';
import { Fx } from '../render/fx';
import { drawMgHud, timerLabel } from './runner';
import type { MinigameDef, MinigameInstance, MinigameResult } from './types';

const HITBOX = 3.5;
const FIRE_INTERVAL = 0.11;
const BASE_MAGNET = 46;
const BOSS_AT = 0.7; // fraction of the run when the boss arrives

type Kind = 'diver' | 'drone' | 'spinner' | 'boss';

interface Foe {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  r: number;
  t: number;
  fireT: number;
  flash: number;
  /** y where spinners/bosses stop descending. */
  holdY: number;
}

interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Gem {
  x: number;
  y: number;
  vy: number;
  mat: MaterialId;
}

const FOES: Record<Kind, { hp: number; r: number; color: string; drop: number; score: number }> = {
  diver: { hp: 1, r: 10, color: '#7be07b', drop: 0.3, score: 10 },
  drone: { hp: 4, r: 12, color: '#8fdcff', drop: 0.55, score: 25 },
  spinner: { hp: 14, r: 16, color: '#c49bff', drop: 1, score: 60 },
  boss: { hp: 260, r: 34, color: '#ff5fd7', drop: 12, score: 1000 },
};

/**
 * Sky Siege: a vertical bullet hell. Drag to fly, the ship fires on its own.
 * Monsters drop material gems; the Hangar upgrades (bought with Stars) make runs richer.
 */
class SkySiege implements MinigameInstance {
  private fx = new Fx();
  private foes: Foe[] = [];
  private shots: Shot[] = [];
  private enemyShots: Shot[] = [];
  private gems: Gem[] = [];
  private stars: Array<{ x: number; y: number; s: number }> = [];
  private duration: number;
  private time: number;
  private elapsed = 0;
  private spawnT = 0.5;
  /** Foes scheduled to enter shortly (e.g. the rest of a diver column). */
  private queue: Array<{ delay: number; kind: Kind }> = [];
  private fireT = 0;
  private bossSpawned = false;
  private bossDown = false;
  private lives: number;
  private invuln = 0;
  private ship = { x: 0, y: 0 };
  private drag: { px: number; py: number; sx: number; sy: number } | null = null;
  private kills = 0;
  private score = 0;
  private collected: Partial<Record<MaterialId, number>> = {};
  private gemsCollected = 0;
  private streams: number;
  private magnet: number;
  private dropMult: number;
  private treasureMult: number;
  private gemWorth: number;
  private mats: MaterialId[];
  private w: number;
  private h: number;

  constructor(w: number, h: number, game: Game) {
    this.w = w;
    this.h = h;
    const bh = game.state.bh;
    this.duration = 60 + bh.endurance * 10;
    this.time = this.duration;
    this.lives = 1 + bh.shield;
    this.streams = 1 + bh.cannons;
    this.magnet = BASE_MAGNET * (1 + 0.4 * bh.magnet);
    this.dropMult = 1 + 0.1 * bh.richskies;
    this.treasureMult = 1 + 0.25 * bh.treasure;
    this.gemWorth = gemValue(game.unlockedAreas.length);
    this.mats = game.unlockedMaterials;
    this.ship = { x: w / 2, y: h * 0.8 };
    for (let i = 0; i < 60; i++) this.stars.push({ x: Math.random(), y: Math.random(), s: 0.3 + Math.random() });
  }

  get finished(): boolean {
    return this.time <= 0 || this.lives <= 0;
  }

  // ---- Spawning ----

  private spawnFoe(kind: Kind): void {
    const def = FOES[kind];
    const x = kind === 'boss' ? this.w / 2 : def.r + Math.random() * (this.w - def.r * 2);
    const hpScale = 1 + this.elapsed / 40;
    const hp = Math.ceil(def.hp * (kind === 'boss' ? 1 : hpScale));
    this.foes.push({
      kind,
      x,
      y: -def.r - 10,
      vx: kind === 'drone' ? (Math.random() < 0.5 ? -1 : 1) * 40 : 0,
      vy: kind === 'diver' ? 150 + Math.random() * 60 : kind === 'drone' ? 55 : 70,
      hp,
      maxHp: hp,
      r: def.r,
      t: 0,
      fireT: 0.8 + Math.random(),
      flash: 0,
      holdY: kind === 'boss' ? this.h * 0.2 : this.h * (0.15 + Math.random() * 0.25),
    });
  }

  private spawnWave(): void {
    const p = this.elapsed / this.duration;
    const roll = Math.random();
    if (roll < 0.45) {
      // A column of divers
      const n = 3 + Math.floor(p * 4);
      for (let i = 0; i < n; i++) this.queue.push({ delay: i * 0.12, kind: 'diver' });
    } else if (roll < 0.8 || p < 0.15) this.spawnFoe('drone');
    else this.spawnFoe('spinner');
  }

  // ---- Loop ----

  update(dt: number, w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.time -= dt;
    this.elapsed += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.fx.update(dt);

    const p = this.elapsed / this.duration;
    if (!this.bossSpawned && p >= BOSS_AT) {
      this.bossSpawned = true;
      this.spawnFoe('boss');
      this.fx.text(w / 2, h * 0.35, 'WARNING: BOSS', '#ff5fd7', 30, 1.6);
    }
    for (const q of this.queue) q.delay -= dt;
    for (const q of this.queue.filter((q) => q.delay <= 0)) this.spawnFoe(q.kind);
    this.queue = this.queue.filter((q) => q.delay > 0);
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnWave();
      const bossUp = this.foes.some((f) => f.kind === 'boss');
      this.spawnT = (bossUp ? 2.2 : 1.3) - p * 0.7;
    }

    // Player fire
    this.fireT -= dt;
    if (this.fireT <= 0) {
      this.fireT = FIRE_INTERVAL;
      const n = this.streams;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 9;
        const angle = (i - (n - 1) / 2) * 0.06;
        this.shots.push({ x: this.ship.x + off, y: this.ship.y - 12, vx: Math.sin(angle) * 700, vy: -Math.cos(angle) * 700 });
      }
    }
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }

    // Foes
    for (const f of this.foes) {
      f.t += dt;
      f.flash = Math.max(0, f.flash - dt * 8);
      if (f.kind === 'spinner' || f.kind === 'boss') {
        if (f.y < f.holdY) f.y += f.vy * dt;
        else f.x = w / 2 + Math.sin(f.t * (f.kind === 'boss' ? 0.6 : 0.9)) * (w * 0.32);
        if (f.kind === 'spinner' && f.t > 12) f.y += 90 * dt; // leave eventually
      } else {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (f.x < f.r || f.x > w - f.r) f.vx *= -1;
      }
      f.fireT -= dt;
      if (f.fireT <= 0 && f.y > 0) this.foeFire(f);
    }

    // Player shots vs foes
    for (const s of this.shots) {
      for (const f of this.foes) {
        if (f.hp <= 0) continue;
        if (Math.abs(s.x - f.x) < f.r && Math.abs(s.y - f.y) < f.r) {
          f.hp -= 1;
          f.flash = 1;
          s.y = -9999;
          if (f.hp <= 0) this.killFoe(f);
          break;
        }
      }
    }
    this.shots = this.shots.filter((s) => s.y > -20);
    this.foes = this.foes.filter((f) => f.hp > 0 && f.y < h + 60);

    // Enemy bullets vs ship
    for (const s of this.enemyShots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (this.invuln <= 0 && Math.hypot(s.x - this.ship.x, s.y - this.ship.y) < HITBOX + 4) this.hitShip();
    }
    // Body contact
    for (const f of this.foes) {
      if (this.invuln <= 0 && Math.hypot(f.x - this.ship.x, f.y - this.ship.y) < f.r + HITBOX) this.hitShip();
    }
    this.enemyShots = this.enemyShots.filter((s) => s.x > -20 && s.x < w + 20 && s.y > -20 && s.y < h + 20);

    // Gems drift down, magnet pulls
    for (const g of this.gems) {
      const dx = this.ship.x - g.x;
      const dy = this.ship.y - g.y;
      const d = Math.hypot(dx, dy);
      if (d < this.magnet) {
        g.x += (dx / d) * 420 * dt;
        g.y += (dy / d) * 420 * dt;
      } else g.y += g.vy * dt;
      if (d < 14) {
        g.y = 99999;
        this.collected[g.mat] = (this.collected[g.mat] ?? 0) + 1;
        this.gemsCollected++;
        this.score += 5;
      }
    }
    this.gems = this.gems.filter((g) => g.y < h + 20);
  }

  private foeFire(f: Foe): void {
    const speed = 130 + this.elapsed * 0.8;
    const aimed = (spread: number, count: number) => {
      const base = Math.atan2(this.ship.y - f.y, this.ship.x - f.x);
      for (let i = 0; i < count; i++) {
        const a = base + (i - (count - 1) / 2) * spread;
        this.enemyShots.push({ x: f.x, y: f.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
      }
    };
    const ring = (count: number, offset: number, sp = speed * 0.8) => {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + offset;
        this.enemyShots.push({ x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
      }
    };
    switch (f.kind) {
      case 'diver':
        f.fireT = 99; // divers just ram
        break;
      case 'drone':
        aimed(0.25, this.elapsed > 30 ? 3 : 1);
        f.fireT = 1.8;
        break;
      case 'spinner':
        ring(10, f.t * 0.7);
        f.fireT = 1.6;
        break;
      case 'boss':
        // Alternates a spiral stream with aimed fans.
        if (Math.floor(f.t / 4) % 2 === 0) {
          ring(4, f.t * 2.2, speed * 0.9);
          f.fireT = 0.12;
        } else {
          aimed(0.18, 7);
          f.fireT = 0.7;
        }
        break;
    }
  }

  private killFoe(f: Foe): void {
    const def = FOES[f.kind];
    this.kills++;
    this.score += def.score;
    this.fx.burst(f.x, f.y, def.color, f.kind === 'boss' ? 50 : 12, f.kind === 'boss' ? 320 : 180, 4, 0);
    if (f.kind === 'boss') {
      this.bossDown = true;
      this.enemyShots = [];
      this.fx.text(f.x, f.y, 'BOSS DOWN!', '#ffd34d', 32, 1.5);
    }
    let drops = def.drop * this.dropMult;
    while (drops > 0) {
      if (drops >= 1 || Math.random() < drops) this.dropGem(f.x, f.y);
      drops -= 1;
    }
  }

  private dropGem(x: number, y: number): void {
    // Later zones' materials are weighted higher, so runs stay useful as you progress.
    const mats = this.mats;
    const weights = mats.map((_, i) => 1 + i * 0.5);
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    let mat = mats[0];
    for (let i = 0; i < mats.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        mat = mats[i];
        break;
      }
    }
    this.gems.push({ x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 20, vy: 60 + Math.random() * 30, mat });
  }

  private hitShip(): void {
    this.lives--;
    this.invuln = 2;
    this.fx.burst(this.ship.x, this.ship.y, '#ff5a6a', 30, 260, 4, 0);
    // Mercy clear around the ship
    this.enemyShots = this.enemyShots.filter((s) => Math.hypot(s.x - this.ship.x, s.y - this.ship.y) > 110);
    if (this.lives > 0) this.fx.text(this.ship.x, this.ship.y - 30, 'SHIELD DOWN', '#ff9aa6', 20);
  }

  // ---- Input: relative drag so the finger never covers the ship ----

  down(x: number, y: number): void {
    this.drag = { px: x, py: y, sx: this.ship.x, sy: this.ship.y };
  }

  move(x: number, y: number): void {
    if (!this.drag) return;
    const k = 1.25;
    this.ship.x = clamp(this.drag.sx + (x - this.drag.px) * k, 10, this.w - 10);
    this.ship.y = clamp(this.drag.sy + (y - this.drag.py) * k, 70, this.h - 20);
  }

  up(): void {
    this.drag = null;
  }

  // ---- Drawing: deliberately flat and simple ----

  render(g: CanvasRenderingContext2D, w: number, h: number): void {
    g.fillStyle = '#0c0a1d';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    for (const s of this.stars) {
      const y = (s.y * h + this.elapsed * 40 * s.s) % h;
      g.globalAlpha = 0.25 + s.s * 0.4;
      g.fillRect(s.x * w, y, 2, 2);
    }
    g.globalAlpha = 1;

    for (const gem of this.gems) {
      g.fillStyle = materialDef(gem.mat).color;
      g.beginPath();
      g.moveTo(gem.x, gem.y - 6);
      g.lineTo(gem.x + 4.5, gem.y);
      g.lineTo(gem.x, gem.y + 6);
      g.lineTo(gem.x - 4.5, gem.y);
      g.closePath();
      g.fill();
    }

    for (const f of this.foes) {
      const def = FOES[f.kind];
      g.fillStyle = f.flash > 0.5 ? '#fff' : def.color;
      g.strokeStyle = '#120c1c';
      g.lineWidth = f.kind === 'boss' ? 4 : 2;
      g.beginPath();
      if (f.kind === 'diver') {
        g.moveTo(f.x, f.y + f.r);
        g.lineTo(f.x + f.r, f.y - f.r);
        g.lineTo(f.x - f.r, f.y - f.r);
        g.closePath();
      } else if (f.kind === 'drone') g.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      else {
        const sides = f.kind === 'boss' ? 6 : 4;
        for (let i = 0; i < sides; i++) {
          const a = (i / sides) * Math.PI * 2 + f.t * (f.kind === 'boss' ? 0.3 : 1.5);
          g.lineTo(f.x + Math.cos(a) * f.r, f.y + Math.sin(a) * f.r);
        }
        g.closePath();
      }
      g.fill();
      g.stroke();
      g.fillStyle = '#fff';
      for (const side of [-1, 1]) {
        g.beginPath();
        g.arc(f.x + side * f.r * 0.3, f.y, Math.max(1.8, f.r * 0.16), 0, Math.PI * 2);
        g.fill();
      }
      if (f.kind === 'boss') {
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(w * 0.15, 60, w * 0.7, 8);
        g.fillStyle = '#ff5fd7';
        g.fillRect(w * 0.15, 60, w * 0.7 * (f.hp / f.maxHp), 8);
      }
    }

    g.fillStyle = '#fff6c2';
    for (const s of this.shots) g.fillRect(s.x - 1.5, s.y - 6, 3, 10);

    for (const s of this.enemyShots) {
      g.fillStyle = '#ff4d8d';
      g.beginPath();
      g.arc(s.x, s.y, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffe0ec';
      g.beginPath();
      g.arc(s.x, s.y, 2.2, 0, Math.PI * 2);
      g.fill();
    }

    // Ship (blinks while invulnerable) with the true hitbox shown as its core.
    if (this.invuln <= 0 || Math.floor(this.invuln * 12) % 2 === 0) {
      const { x, y } = this.ship;
      g.fillStyle = '#f4e7cf';
      g.strokeStyle = '#120c1c';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y - 14);
      g.lineTo(x + 11, y + 10);
      g.lineTo(x, y + 5);
      g.lineTo(x - 11, y + 10);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#7c5cff';
      g.beginPath();
      g.arc(x, y, HITBOX + 1, 0, Math.PI * 2);
      g.fill();
    }
    if (this.magnet > BASE_MAGNET) {
      g.strokeStyle = 'rgba(143,220,255,0.12)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(this.ship.x, this.ship.y, this.magnet, 0, Math.PI * 2);
      g.stroke();
    }

    this.fx.draw(g);
    drawMgHud(g, w, timerLabel(this.time), this.time < 5, this.score, `${'♥'.repeat(Math.max(0, this.lives))}  💎${this.gemsCollected}`);
  }

  result(): MinigameResult {
    const survived = this.lives > 0;
    const materials: Partial<Record<MaterialId, number>> = {};
    for (const [m, n] of Object.entries(this.collected) as [MaterialId, number][]) materials[m] = Math.round(n * this.gemWorth * this.treasureMult);
    const stars = Math.floor(this.score / 100) + (survived ? 2 : 0) + (this.bossDown ? 3 : 0);
    return {
      score: this.score,
      units: Math.floor(this.kills / 2),
      materials,
      stars,
      summary: `${this.kills} monsters downed · ${this.gemsCollected} gems${this.bossDown ? ' · boss slain!' : ''}${survived ? '' : ' · shot down'}`,
    };
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const skySiege: MinigameDef = {
  id: 'skysiege',
  name: 'Sky Siege',
  icon: '🚀',
  tagline: 'Bullet hell. Weave through fire, grab material gems.',
  howTo: 'Drag anywhere to fly; your ship fires on its own. Only the purple core can be hit. Collect gems for materials and survive to face the boss!',
  rewards: '💎 Materials + ⭐ Stars',
  create: (w, h, game) => new SkySiege(w, h, game),
};
