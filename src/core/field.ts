import {
  BOSS_HP_MULT,
  BULLET_SPEED,
  CRIT_MULT,
  enemyDef,
  FLEE_SPEED_MULT,
  MAX_ENEMIES,
  MULTISHOT_SPREAD,
  STUN_IMMUNITY,
  TAP_DAMAGE_MULT,
  TAP_RADIUS,
  type EnemyId,
} from './balance';
import type { Game, KillReward } from './game';

export const PLAYER_RADIUS = 13;
const BULLET_RADIUS = 4;
const BULLET_LIFE = 1.4;
const BOSS_BOUNCE = 260;

export interface Enemy {
  id: number;
  type: EnemyId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  boss: boolean;
  /** Reached the Hunter and is running away with its loot. */
  fleeing: boolean;
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
  | { type: 'kill'; x: number; y: number; enemy: EnemyId; boss: boolean; reward: KillReward }
  | { type: 'blast'; x: number; y: number }
  | { type: 'boss' }
  | { type: 'stun'; x: number; y: number; boss: boolean }
  | { type: 'escape'; x: number; y: number };

/**
 * The survivor-style battlefield in world coordinates centered on the Hunter.
 * Enemies spawn just off-screen and walk inward; the Hunter auto-fires at the nearest.
 * An enemy that reaches the Hunter stuns them and flees; if it gets off-screen it escapes.
 * No rendering here: BattleView draws it, and tests run it headless.
 */
export class Field {
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  /** Seconds of stun left (the Hunter can't shoot while > 0). */
  stun = 0;
  /** Length of the current stun, for drawing its bar. */
  stunTotal = 0;
  /** Seconds of post-stun immunity left. */
  immune = 0;
  /** Direction of the last volley, for drawing the Hunter's aim. */
  aim = -Math.PI / 2;
  /** Events since the last drain, consumed by the renderer. */
  events: FieldEvent[] = [];
  private spawnAcc = 0;
  /** Enemies arrive in packs; this is the next pack's type and size. */
  private nextPack: { type: EnemyId; size: number } | null = null;
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

  get stunned(): boolean {
    return this.stun > 0;
  }

  clear(): void {
    this.enemies = [];
    this.bullets = [];
    this.stun = 0;
    this.immune = 0;
    this.spawnAcc = 0;
    this.nextPack = null;
  }

  drainEvents(): FieldEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Enemies beyond this distance are off-screen. */
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
    return { x: w, y: t - 3 * h };
  }

  private spawn(type: EnemyId, boss: boolean, at = this.edgePoint()): void {
    const g = this.game;
    const stats = g.enemyStats(type);
    const def = enemyDef(type);
    const hp = stats.hp * (boss ? BOSS_HP_MULT : 1);
    this.enemies.push({
      id: this.nextId++,
      type,
      x: at.x + (boss ? 0 : (g.rng() - 0.5) * 50),
      y: at.y + (boss ? 0 : (g.rng() - 0.5) * 50),
      hp,
      maxHp: hp,
      r: boss ? def.radius * 2.6 : def.radius * (0.9 + g.rng() * 0.2),
      speed: stats.speed * (boss ? 0.55 : 0.85 + g.rng() * 0.3),
      boss,
      fleeing: false,
      flash: 0,
      kx: 0,
      ky: 0,
      phase: g.rng() * 10,
    });
  }

  private rollPack(): { type: EnemyId; size: number } {
    const type = this.game.pickEnemy();
    const [lo, hi] = enemyDef(type).pack;
    return { type, size: lo + Math.floor(this.game.rng() * (hi - lo + 1)) };
  }

  update(dt: number): void {
    const g = this.game;

    // Stun & immunity
    if (this.stun > 0) {
      this.stun = Math.max(0, this.stun - dt);
      if (this.stun === 0) this.immune = STUN_IMMUNITY;
    } else this.immune = Math.max(0, this.immune - dt);

    // Spawning
    if (g.isBoss && !g.bossAlive && !this.enemies.some((e) => e.boss)) {
      this.spawn(g.bossType, true);
      g.bossSpawned();
      this.events.push({ type: 'boss' });
    }
    this.spawnAcc += dt * g.spawnRate;
    this.nextPack ??= this.rollPack();
    while (this.spawnAcc >= this.nextPack.size) {
      this.spawnAcc -= this.nextPack.size;
      const at = this.edgePoint();
      for (let i = 0; i < this.nextPack.size && this.enemies.length < MAX_ENEMIES; i++) this.spawn(this.nextPack.type, false, at);
      this.nextPack = this.rollPack();
    }

    // Movement, contact and escapes
    const decay = Math.exp(-8 * dt);
    const escapeR = this.spawnRadius + 30;
    for (const e of this.enemies) {
      e.flash = Math.max(0, e.flash - dt * 6);
      e.phase += dt;
      const d = Math.hypot(e.x, e.y) || 1;
      const ux = e.x / d;
      const uy = e.y / d;
      if (e.fleeing) {
        e.x += ux * e.speed * FLEE_SPEED_MULT * dt + e.kx * dt;
        e.y += uy * e.speed * FLEE_SPEED_MULT * dt + e.ky * dt;
        if (d > escapeR) {
          e.hp = 0;
          g.registerEscape();
          this.events.push({ type: 'escape', x: e.x, y: e.y });
        }
      } else {
        const reach = e.r + PLAYER_RADIUS;
        const step = Math.min(e.speed * dt, Math.max(0, d - reach));
        e.x += -ux * step + e.kx * dt;
        e.y += -uy * step + e.ky * dt;
        if (d <= reach + 1) this.contact(e, ux, uy);
      }
      e.kx *= decay;
      e.ky *= decay;
    }
    this.separate();

    // Shooting (not while stunned)
    this.fireAcc = Math.min(this.fireAcc + dt * g.fireRate, 3);
    if (this.stunned) this.fireAcc = 0;
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

  /** An enemy reached the Hunter: stun them (unless immune), then run (or, for bosses, bounce off). */
  private contact(e: Enemy, ux: number, uy: number): void {
    if (this.immune <= 0 || this.stunned) {
      const t = this.game.stunTime(e.boss);
      if (t > this.stun) {
        this.stun = t;
        this.stunTotal = t;
      }
      this.events.push({ type: 'stun', x: e.x, y: e.y, boss: e.boss });
    }
    if (e.boss) {
      e.kx += ux * BOSS_BOUNCE;
      e.ky += uy * BOSS_BOUNCE;
    } else e.fleeing = true;
  }

  /** Cheap pairwise push-apart so the horde spreads into a crowd instead of a single dot. */
  private separate(): void {
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j];
        if (a.fleeing !== b.fleeing) continue; // runners slip through the crowd
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

  /** Closest enemy still coming in; runners are only targeted when nothing is approaching. */
  private nearest(): Enemy | null {
    let best: Enemy | null = null;
    let bestD = Infinity;
    const range = this.spawnRadius;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      // Approaching enemies always sort before fleeing ones.
      const d = e.x * e.x + e.y * e.y + (e.fleeing ? 1e12 : 0);
      if (d < bestD && e.x * e.x + e.y * e.y < range * range) {
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
      const reward = this.game.registerKill(e.type, e.boss);
      this.events.push({ type: 'kill', x: e.x, y: e.y, enemy: e.type, boss: e.boss, reward });
    }
  }

  /** Tap blast at a world position: damages every enemy in the radius. Works even while stunned. */
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
