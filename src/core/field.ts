import {
  BOSS_CONTACT_DAMAGE,
  BOSS_HP_MULT,
  BULLET_SPEED,
  CONTACT_DAMAGE,
  CRIT_MULT,
  enemySpeed,
  MAX_ENEMIES,
  MULTISHOT_SPREAD,
  TAP_DAMAGE_MULT,
  TAP_RADIUS,
} from './balance';
import type { Game, KillReward } from './game';

export const PLAYER_RADIUS = 13;
const BULLET_RADIUS = 4;
const BULLET_LIFE = 1.4;

export interface Enemy {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  boss: boolean;
  /** 0..1 hit flash. */
  flash: number;
  /** Knockback velocity. */
  kx: number;
  ky: number;
  /** Per-enemy phase for wobble animation. */
  phase: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  crit: boolean;
  pierce: number;
  life: number;
  hits: number[];
}

export type FieldEvent =
  | { type: 'hit'; x: number; y: number; dmg: number; crit: boolean }
  | { type: 'kill'; x: number; y: number; boss: boolean; reward: KillReward }
  | { type: 'blast'; x: number; y: number }
  | { type: 'boss' }
  | { type: 'death' };

/**
 * The survivor-style battlefield in world coordinates centered on the hero.
 * Enemies spawn off-screen and walk inward; the hero auto-fires at the nearest.
 * No rendering here: BattleView draws it, and tests run it headless.
 */
export class Field {
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  /** Hero HP as a fraction of max. */
  hp = 1;
  /** Direction of the last volley, for drawing the hero's aim. */
  aim = -Math.PI / 2;
  /** Seconds since the hero last took contact damage (for the hurt flash). */
  hurtAgo = 99;
  /** Events since the last drain, consumed by the renderer. */
  events: FieldEvent[] = [];
  private spawnAcc = 0;
  /** Enemies arrive in packs; this is the size of the next one. */
  private nextPack = 3;
  private fireAcc = 0;
  private nextId = 1;
  private halfW = 200;
  private halfH = 300;

  constructor(private game: Game) {
    game.on((e) => {
      if (e.type === 'stageChange' && e.reason !== 'advance') this.clear();
    });
  }

  /** Visible area in world units (CSS pixels); enemies spawn just beyond it. */
  setView(w: number, h: number): void {
    this.halfW = w / 2;
    this.halfH = h / 2;
  }

  clear(): void {
    this.enemies = [];
    this.bullets = [];
    this.hp = 1;
    this.spawnAcc = 0;
  }

  drainEvents(): FieldEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private get spawnRadius(): number {
    return Math.hypot(this.halfW, this.halfH) + 24;
  }

  /** A random point just outside the visible rectangle. */
  private edgePoint(): { x: number; y: number } {
    const rng = this.game.rng;
    const w = this.halfW + 24;
    const h = this.halfH + 24;
    let t = rng() * (4 * w + 4 * h);
    if (t < 2 * w) return { x: t - w, y: -h };
    t -= 2 * w;
    if (t < 2 * w) return { x: t - w, y: h };
    t -= 2 * w;
    if (t < 2 * h) return { x: -w, y: t - h };
    return { x: w, y: t - 2 * h - h };
  }

  private spawn(boss: boolean, at = this.edgePoint()): void {
    const g = this.game;
    const hp = g.enemyHp * (boss ? BOSS_HP_MULT : 1);
    this.enemies.push({
      id: this.nextId++,
      x: at.x + (boss ? 0 : (g.rng() - 0.5) * 50),
      y: at.y + (boss ? 0 : (g.rng() - 0.5) * 50),
      hp,
      maxHp: hp,
      r: boss ? 28 : 9 + g.rng() * 3,
      speed: enemySpeed(g.state.stage) * (boss ? 0.55 : 0.8 + g.rng() * 0.4),
      boss,
      flash: 0,
      kx: 0,
      ky: 0,
      phase: g.rng() * 10,
    });
  }

  update(dt: number): void {
    const g = this.game;
    this.hurtAgo += dt;

    // Spawning
    if (g.isBoss && !g.bossAlive && !this.enemies.some((e) => e.boss)) {
      this.spawn(true);
      g.bossSpawned();
      this.events.push({ type: 'boss' });
    }
    this.spawnAcc += dt * g.spawnRate;
    while (this.spawnAcc >= this.nextPack) {
      this.spawnAcc -= this.nextPack;
      const at = this.edgePoint();
      for (let i = 0; i < this.nextPack && this.enemies.length < MAX_ENEMIES; i++) this.spawn(false, at);
      this.nextPack = 2 + Math.floor(g.rng() * 4);
    }

    // Movement & contact
    let contact = 0;
    const decay = Math.exp(-8 * dt);
    for (const e of this.enemies) {
      e.flash = Math.max(0, e.flash - dt * 6);
      e.phase += dt;
      const d = Math.hypot(e.x, e.y) || 1;
      const reach = e.r + PLAYER_RADIUS;
      const step = Math.min(e.speed * dt, Math.max(0, d - reach));
      e.x += (-e.x / d) * step + e.kx * dt;
      e.y += (-e.y / d) * step + e.ky * dt;
      e.kx *= decay;
      e.ky *= decay;
      if (d <= reach + 1) contact += e.boss ? BOSS_CONTACT_DAMAGE : CONTACT_DAMAGE;
    }
    this.separate();

    if (contact > 0) this.hurtAgo = 0;
    this.hp = Math.min(1, this.hp + (g.regen - contact * g.damageTaken) * dt);
    if (this.hp <= 0) {
      this.events.push({ type: 'death' });
      g.playerDied(); // triggers clear() via the stageChange listener
      this.clear();
      return;
    }

    // Shooting
    this.fireAcc = Math.min(this.fireAcc + dt * g.fireRate, 3);
    while (this.fireAcc >= 1) {
      const target = this.nearest();
      if (!target) {
        this.fireAcc = Math.min(this.fireAcc, 1);
        break;
      }
      this.fireAcc -= 1;
      this.volley(target);
    }

    // Bullets
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      for (const e of this.enemies) {
        if (e.hp <= 0 || b.life <= 0 || b.hits.includes(e.id)) continue;
        const rr = e.r + BULLET_RADIUS;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        if (dx * dx + dy * dy > rr * rr) continue;
        b.hits.push(e.id);
        this.damage(e, b.dmg, b.crit, b.vx / BULLET_SPEED, b.vy / BULLET_SPEED);
        if (b.pierce-- <= 0) b.life = 0;
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  /** Cheap pairwise push-apart so the horde spreads into a crowd instead of a single dot. */
  private separate(): void {
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const wa = a.boss ? 0.1 : 1;
        const wb = b.boss ? 0.1 : 1;
        a.x -= (dx / d) * push * wa;
        a.y -= (dy / d) * push * wa;
        b.x += (dx / d) * push * wb;
        b.y += (dy / d) * push * wb;
      }
    }
  }

  private nearest(): Enemy | null {
    let best: Enemy | null = null;
    let bestD = Infinity;
    const range = this.spawnRadius;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const d = e.x * e.x + e.y * e.y;
      if (d < bestD && d < range * range) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private volley(target: Enemy): void {
    const g = this.game;
    const n = g.projectiles;
    const base = Math.atan2(target.y, target.x);
    this.aim = base;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * MULTISHOT_SPREAD;
      const crit = g.rng() < g.critChance;
      this.bullets.push({
        x: Math.cos(a) * PLAYER_RADIUS,
        y: Math.sin(a) * PLAYER_RADIUS,
        vx: Math.cos(a) * BULLET_SPEED,
        vy: Math.sin(a) * BULLET_SPEED,
        dmg: g.damage * (crit ? CRIT_MULT : 1),
        crit,
        pierce: g.pierce,
        life: BULLET_LIFE,
        hits: [],
      });
    }
  }

  private damage(e: Enemy, dmg: number, crit: boolean, dirX: number, dirY: number): void {
    e.hp -= dmg;
    e.flash = 1;
    if (!e.boss) {
      e.kx += dirX * 90;
      e.ky += dirY * 90;
    }
    this.events.push({ type: 'hit', x: e.x, y: e.y - e.r, dmg, crit });
    if (e.hp <= 0) {
      const reward = this.game.registerKill(e.boss);
      this.events.push({ type: 'kill', x: e.x, y: e.y, boss: e.boss, reward });
    }
  }

  /** Tap blast at a world position: damages every enemy in the radius. */
  tap(x: number, y: number): void {
    const g = this.game;
    g.registerTap();
    this.events.push({ type: 'blast', x, y });
    const crit = g.rng() < g.critChance;
    const dmg = g.damage * TAP_DAMAGE_MULT * (crit ? CRIT_MULT : 1);
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = Math.hypot(dx, dy);
      if (d > TAP_RADIUS + e.r) continue;
      this.damage(e, dmg, crit, dx / (d || 1), dy / (d || 1));
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }
}
