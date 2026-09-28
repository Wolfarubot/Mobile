import {
  BULLET_SPEED,
  CRIT_MULT,
  enemyDef,
  FIELD_ZOOM,
  FLEE_SPEED_MULT,
  GUARD_RECHARGE,
  hunterDef,
  MAX_ENEMIES,
  MULTISHOT_SPREAD,
  STUN_IMMUNITY,
  type EnemyId,
  type HunterId,
} from './balance';
import type { Game, GearMode, KillReward, Shooter } from './game';

export const PLAYER_RADIUS = 13;
const BULLET_RADIUS = 4;
const BOSS_BOUNCE = 260;
const GUARD_BOUNCE = 220;
const PUDDLE_LIFE = 3;
const PUDDLE_TICK = 0.5;
/** Each puddle tick deals this fraction of the thrower's shot damage. */
const PUDDLE_TICK_DAMAGE = 0.5;
const RICOCHET_RANGE = 160;
/** Sniper in akimbo mode: fire rate and per-bullet damage multipliers. */
const AKIMBO_RATE = 4;
const AKIMBO_DAMAGE = 0.3;
const AKIMBO_RANGE = 130;

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
  /** Reached a Hunter and is running away with its loot. */
  fleeing: boolean;
  /** 0..1 hit flash. */
  flash: number;
  /** Knockback velocity. */
  kx: number;
  ky: number;
  /** Per-enemy phase for wobble animation. */
  phase: number;
  /** Seconds of half-speed left (frost hammers). */
  slow?: number;
}

/** A stationed Hunter fighting next to you, with their own attack style and stun state. */
export interface Helper {
  id: HunterId;
  x: number;
  y: number;
  aim: number;
  fireAcc: number;
  stun: number;
  stunTotal: number;
  immune: number;
  /** Shield charges left (Paladin) and recharge progress. */
  guard: number;
  guardAcc: number;
  /** Sniper using pistols because something got close. */
  akimbo: boolean;
  /** Alternates the akimbo pistol hand. */
  hand: number;
}

/** Where stationed Hunters stand, relative to your Hunter. */
const HELPER_SPOTS = [
  { x: -55, y: 32 },
  { x: 55, y: 32 },
];

export type BulletKind = 'bolt' | 'arrow' | 'fireball' | 'potion' | 'pellet' | 'dagger' | 'pistol' | 'ricochet' | 'hammer';

export interface Bullet {
  shooter: Shooter;
  kind: BulletKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  crit: boolean;
  pierce: number;
  life: number;
  hits: number[];
  /** Multiplier on the shooter's shot damage (pellets, akimbo...). */
  dmg: number;
  /** Which of Wilhelm's weapons fired it (gear in that slot applies). */
  mode?: GearMode;
  /** Fireball explosion / potion puddle radius. */
  radius?: number;
  bounces?: number;
  slow?: number;
  /** Potions fly to a point and burst there. */
  tx?: number;
  ty?: number;
}

export interface Puddle {
  shooter: Shooter;
  x: number;
  y: number;
  r: number;
  life: number;
  tick: number;
}

export type FieldEvent =
  | { type: 'hit'; x: number; y: number; dmg: number; crit: boolean }
  | { type: 'kill'; x: number; y: number; enemy: EnemyId; boss: boolean; reward: KillReward }
  | { type: 'blast'; x: number; y: number }
  | { type: 'boss' }
  | { type: 'stun'; x: number; y: number; boss: boolean; who: Shooter }
  | { type: 'guard'; x: number; y: number }
  | { type: 'escape'; x: number; y: number }
  | { type: 'explode'; x: number; y: number; r: number; color: string }
  | { type: 'nova'; x: number; y: number; r: number }
  | { type: 'beam'; x1: number; y1: number; x2: number; y2: number; color: string; width: number };

/**
 * The survivor-style battlefield in world coordinates centered on your Hunter.
 * The view is zoomed out (FIELD_ZOOM), so enemies spawn far off and walk in.
 * They head for the nearest Hunter; one that reaches a Hunter stuns them and flees,
 * escaping with its loot if it makes it off-screen. Stationed Hunters fight with their own style.
 * No rendering here: BattleView draws it, and tests run it headless.
 */
export class Field {
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  puddles: Puddle[] = [];
  /** Seconds of stun left on your Hunter (can't shoot while > 0). */
  stun = 0;
  /** Length of the current stun, for drawing its bar. */
  stunTotal = 0;
  /** Seconds of post-stun immunity left. */
  immune = 0;
  /** Your Hunter's shield charges (from gear or a rally) and recharge progress. */
  guard = 0;
  guardAcc = 0;
  /** Direction of your last volley, for drawing the aim. */
  aim = -Math.PI / 2;
  /** Stationed Hunters in the current area, fighting alongside. */
  helpers: Helper[] = [];
  /** Events since the last drain, consumed by the renderer. */
  events: FieldEvent[] = [];
  private spawnAcc = 0;
  /** Enemies arrive in packs; this is the next pack's type and size. */
  private nextPack: { type: EnemyId; size: number } | null = null;
  private fireAcc = 0;
  private nextId = 1;
  private halfW = 320;
  private halfH = 350;

  constructor(private game: Game) {
    game.on((e) => {
      if (e.type === 'travel') this.clear();
      if (e.type === 'guardianFail') this.enemies = this.enemies.filter((en) => !en.boss);
    });
  }

  /** Screen size in CSS pixels; the visible world is larger by 1 / FIELD_ZOOM. */
  setView(w: number, h: number): void {
    this.halfW = w / 2 / FIELD_ZOOM;
    this.halfH = h / 2 / FIELD_ZOOM;
  }

  get stunned(): boolean {
    return this.stun > 0;
  }

  clear(): void {
    this.enemies = [];
    this.bullets = [];
    this.puddles = [];
    this.stun = 0;
    this.immune = 0;
    this.guard = this.game.guardOf('main');
    this.spawnAcc = 0;
    this.nextPack = null;
    for (const h of this.helpers) Object.assign(h, { stun: 0, immune: 0, guard: this.game.guardOf(h.id) });
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
    const hp = boss ? g.guardianHp : stats.hp;
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

    // Stuns, immunity and shields
    if (this.stun > 0) {
      this.stun = Math.max(0, this.stun - dt);
      if (this.stun === 0) this.immune = STUN_IMMUNITY;
    } else this.immune = Math.max(0, this.immune - dt);
    this.syncHelpers();
    for (const h of this.helpers) {
      if (h.stun > 0) {
        h.stun = Math.max(0, h.stun - dt);
        if (h.stun === 0) h.immune = STUN_IMMUNITY;
      } else h.immune = Math.max(0, h.immune - dt);
    }
    for (const [who, h] of [['main', this], ...this.helpers.map((x) => [x.id, x])] as Array<[Shooter, { guard: number; guardAcc: number }]>) {
      const max = g.guardOf(who);
      if (h.guard > max) h.guard = max;
      else if (h.guard < max) {
        h.guardAcc += dt;
        if (h.guardAcc >= GUARD_RECHARGE) {
          h.guardAcc = 0;
          h.guard++;
        }
      }
    }

    // Spawning
    if (g.guardianActive && !g.bossAlive && !this.enemies.some((e) => e.boss)) {
      this.spawn(g.guardianType, true);
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

    this.moveEnemies(dt);
    this.separate();

    // Your Hunter (not while stunned)
    this.fireAcc = Math.min(this.fireAcc + dt * g.fireRate, 3);
    if (this.stunned) this.fireAcc = 0;
    while (this.fireAcc >= 1) {
      const target = this.nearest(0, 0, g.shooterRange('main'));
      if (!target) {
        this.fireAcc = Math.min(this.fireAcc, 1);
        break;
      }
      this.fireAcc -= 1;
      this.aim = Math.atan2(target.y, target.x);
      this.shoot('main', 'bolt', 0, 0, this.aim, BULLET_SPEED, g.shooterRange('main'), { pierce: g.pierceOf('main'), spread: true });
    }
    for (const h of this.helpers) this.helperAttack(h, dt);

    this.moveBullets(dt);
    this.tickPuddles(dt);
    this.bullets = this.bullets.filter((b) => b.life > 0);
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  // ---- Enemies ----

  /** The Hunter (you or a helper) closest to a point. */
  private nearestHunter(x: number, y: number): { who: Shooter; x: number; y: number } {
    let best: { who: Shooter; x: number; y: number } = { who: 'main', x: 0, y: 0 };
    let bestD = x * x + y * y;
    for (const h of this.helpers) {
      const d = (x - h.x) ** 2 + (y - h.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { who: h.id, x: h.x, y: h.y };
      }
    }
    return best;
  }

  private moveEnemies(dt: number): void {
    const g = this.game;
    const decay = Math.exp(-8 * dt);
    const escapeR = this.spawnRadius + 30;
    for (const e of this.enemies) {
      e.flash = Math.max(0, e.flash - dt * 6);
      e.phase += dt;
      if (e.slow) e.slow = Math.max(0, e.slow - dt);
      const speed = e.speed * (e.slow ? 0.5 : 1);
      if (e.fleeing) {
        const d = Math.hypot(e.x, e.y) || 1;
        e.x += (e.x / d) * speed * FLEE_SPEED_MULT * dt + e.kx * dt;
        e.y += (e.y / d) * speed * FLEE_SPEED_MULT * dt + e.ky * dt;
        if (d > escapeR) {
          e.hp = 0;
          g.registerEscape();
          this.events.push({ type: 'escape', x: e.x, y: e.y });
        }
      } else {
        const t = this.nearestHunter(e.x, e.y);
        const dx = e.x - t.x;
        const dy = e.y - t.y;
        const d = Math.hypot(dx, dy) || 1;
        const reach = e.r + PLAYER_RADIUS;
        const step = Math.min(speed * dt, Math.max(0, d - reach));
        e.x += (-dx / d) * step + e.kx * dt;
        e.y += (-dy / d) * step + e.ky * dt;
        if (d <= reach + 1) this.contact(e, t.who, dx / d, dy / d);
      }
      e.kx *= decay;
      e.ky *= decay;
    }
  }

  /** An enemy reached a Hunter: shields block it, otherwise the Hunter is stunned (unless immune) and the enemy runs. */
  private contact(e: Enemy, who: Shooter, ux: number, uy: number): void {
    const helper = who === 'main' ? null : this.helpers.find((h) => h.id === who)!;
    const state = helper ?? this;
    if (state.guard > 0 && !e.boss) {
      state.guard--;
      state.guardAcc = 0;
      e.kx += ux * GUARD_BOUNCE;
      e.ky += uy * GUARD_BOUNCE;
      this.events.push({ type: 'guard', x: helper?.x ?? 0, y: helper?.y ?? 0 });
      return;
    }
    // A stun runs its course: hits while stunned or immune don't extend it (no stun loops).
    if (state.immune <= 0 && state.stun <= 0) {
      const t = this.game.stunTime(e.boss, who);
      state.stun = t;
      state.stunTotal = t;
      this.game.registerKnockout();
      this.events.push({ type: 'stun', x: e.x, y: e.y, boss: e.boss, who });
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

  /** Closest enemy within `range` of (ox, oy); runners are only targeted when nothing is approaching. */
  private nearest(ox: number, oy: number, range: number, exclude?: number[]): Enemy | null {
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      if (e.hp <= 0 || exclude?.includes(e.id)) continue;
      const d2 = (e.x - ox) ** 2 + (e.y - oy) ** 2;
      if (d2 > (range + e.r) ** 2) continue;
      const d = d2 + (e.fleeing ? 1e12 : 0);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  // ---- Stationed Hunters ----

  /** Keep the on-field Hunters in sync with who's stationed here. */
  private syncHelpers(): void {
    const ids = this.game.helpersHere;
    if (ids.length === this.helpers.length && ids.every((id, i) => this.helpers[i].id === id)) return;
    this.helpers = ids.map((id, i) => ({
      id,
      ...HELPER_SPOTS[i % HELPER_SPOTS.length],
      aim: -Math.PI / 2,
      fireAcc: 0,
      stun: 0,
      stunTotal: 0,
      immune: 0,
      guard: this.game.guardOf(id),
      guardAcc: 0,
      akimbo: false,
      hand: 0,
    }));
  }

  private helperAttack(h: Helper, dt: number): void {
    const g = this.game;
    const style = hunterDef(h.id).style;
    if (h.stun > 0) {
      h.fireAcc = 0;
      return;
    }
    // The sniper swaps to pistols when anything is close.
    if (style.kind === 'sniper') h.akimbo = !!this.nearest(h.x, h.y, style.closeRange ?? 0);
    const mode: GearMode = h.akimbo ? 'short' : 'long';
    const rate = g.shooterRate(h.id, mode) * (h.akimbo ? AKIMBO_RATE : 1);
    const areaMult = g.radiusMult(h.id);
    h.fireAcc = Math.min(h.fireAcc + dt * rate, 3);
    while (h.fireAcc >= 1) {
      const range = h.akimbo ? AKIMBO_RANGE + g.gear(h.id, 'short').range : g.shooterRange(h.id);
      const target = this.nearest(h.x, h.y, style.kind === 'nova' ? (style.radius ?? range) * areaMult : range);
      if (!target) {
        h.fireAcc = Math.min(h.fireAcc, 1);
        return;
      }
      h.fireAcc -= 1;
      const a = Math.atan2(target.y - h.y, target.x - h.x);
      h.aim = a;
      switch (style.kind) {
        case 'potion': {
          const d = Math.hypot(target.x - h.x, target.y - h.y);
          this.shoot(h.id, 'potion', h.x, h.y, a, 300, d, { radius: (style.radius ?? 40) * areaMult, tx: target.x, ty: target.y });
          break;
        }
        case 'fireball':
          this.shoot(h.id, 'fireball', h.x, h.y, a, 380, range, { radius: (style.radius ?? 50) * areaMult, spread: true });
          break;
        case 'arrow':
          this.shoot(h.id, 'arrow', h.x, h.y, a, 620, range, { pierce: (style.pierce ?? 0) + g.pierceOf(h.id), spread: true });
          break;
        case 'nova': {
          const r = (style.radius ?? 100) * areaMult;
          this.events.push({ type: 'nova', x: h.x, y: h.y, r });
          for (const e of this.enemies) if (e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) <= r + e.r) this.hitWith(h.id, e, 1, h.x, h.y);
          break;
        }
        case 'thrust':
          this.strikeLine(h.id, h.x, h.y, a, range, 14, Infinity, 1, '#ffe8a3', 6);
          break;
        case 'shotgun': {
          const n = (style.pellets ?? 5) + g.projectiles - 1;
          for (let i = 0; i < n; i++) this.shoot(h.id, 'pellet', h.x, h.y, a + (i - (n - 1) / 2) * 0.12, 560, range, {});
          break;
        }
        case 'daggers':
          this.shoot(h.id, 'dagger', h.x, h.y, a, 640, range, { spread: true });
          break;
        case 'sniper':
          if (h.akimbo) {
            // Alternate pistols from either side.
            const side = (h.hand++ % 2 ? 1 : -1) * 6;
            const ox = h.x + Math.cos(a + Math.PI / 2) * side;
            const oy = h.y + Math.sin(a + Math.PI / 2) * side;
            this.shoot(h.id, 'pistol', ox, oy, a, 600, range, { dmg: AKIMBO_DAMAGE, mode: 'short' });
          } else this.strikeLine(h.id, h.x, h.y, a, range, 6, 1 + (style.pierce ?? 0) + g.pierceOf(h.id, 'long'), 1, '#fffbe0', 3);
          break;
        case 'ricochet':
          this.shoot(h.id, 'ricochet', h.x, h.y, a, 520, range, { bounces: style.bounces });
          break;
        case 'hammer':
          this.shoot(h.id, 'hammer', h.x, h.y, a, 420, range, { slow: style.slow, spread: true });
          break;
        default:
          this.shoot(h.id, 'bolt', h.x, h.y, a, BULLET_SPEED, range, { spread: true });
      }
    }
  }

  // ---- Attacks ----

  /** Fires a projectile (and extra Split Bow projectiles when `spread`). Damage is priced on hit, per target. */
  private shoot(
    shooter: Shooter,
    kind: BulletKind,
    ox: number,
    oy: number,
    angle: number,
    speed: number,
    range: number,
    o: { pierce?: number; spread?: boolean; dmg?: number; radius?: number; bounces?: number; slow?: number; tx?: number; ty?: number; mode?: GearMode },
  ): void {
    const g = this.game;
    const n = o.spread ? g.projectiles : 1;
    for (let i = 0; i < n; i++) {
      const a = angle + (i - (n - 1) / 2) * MULTISHOT_SPREAD;
      this.bullets.push({
        shooter,
        kind,
        x: ox + Math.cos(a) * PLAYER_RADIUS,
        y: oy + Math.sin(a) * PLAYER_RADIUS,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        crit: g.rng() < g.critChanceOf(shooter),
        pierce: o.pierce ?? 0,
        life: Math.max(0.05, (range + 20) / speed),
        hits: [],
        dmg: o.dmg ?? 1,
        radius: o.radius,
        bounces: o.bounces,
        slow: o.slow,
        tx: o.tx,
        ty: o.ty,
        mode: o.mode,
      });
    }
  }

  /** Instant strike along a line (lance thrust, sniper shot): hits up to `maxHits` enemies within `width`. */
  private strikeLine(shooter: Shooter, ox: number, oy: number, a: number, len: number, width: number, maxHits: number, dmg: number, color: string, beamWidth: number): void {
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    const hits = this.enemies
      .filter((e) => e.hp > 0)
      .map((e) => {
        const t = (e.x - ox) * cx + (e.y - oy) * cy;
        const perp = Math.abs((e.x - ox) * cy - (e.y - oy) * cx);
        return { e, t, perp };
      })
      .filter((x) => x.t > 0 && x.t <= len + x.e.r && x.perp <= width + x.e.r)
      .sort((p, q) => p.t - q.t)
      .slice(0, maxHits);
    const end = Number.isFinite(maxHits) && hits.length ? hits[hits.length - 1].t : len;
    this.events.push({ type: 'beam', x1: ox, y1: oy, x2: ox + cx * end, y2: oy + cy * end, color, width: beamWidth });
    for (const { e } of hits) this.hitWith(shooter, e, dmg, ox, oy);
  }

  /** One hit from a shooter, priced by their damage vs the enemy's archetype. */
  private hitWith(
    shooter: Shooter,
    e: Enemy,
    mult: number,
    fromX: number,
    fromY: number,
    crit = this.game.rng() < this.game.critChanceOf(shooter),
    mode?: GearMode,
  ): void {
    const dmg = this.game.shotDamage(shooter, enemyDef(e.type).archetype, mode) * mult * (crit ? CRIT_MULT : 1);
    const d = Math.hypot(e.x - fromX, e.y - fromY) || 1;
    this.damage(e, dmg, crit, (e.x - fromX) / d, (e.y - fromY) / d, shooter);
  }

  private moveBullets(dt: number): void {
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.kind === 'potion') {
        // Flies to its target point, then shatters into a puddle.
        if (b.life <= 0 || (b.tx !== undefined && (b.tx - b.x) * b.vx + (b.ty! - b.y) * b.vy <= 0)) {
          b.life = 0;
          this.puddles.push({ shooter: b.shooter, x: b.tx ?? b.x, y: b.ty ?? b.y, r: b.radius ?? 40, life: PUDDLE_LIFE, tick: 0 });
        }
        continue;
      }
      for (const e of this.enemies) {
        if (e.hp <= 0 || b.life <= 0 || b.hits.includes(e.id)) continue;
        const rr = e.r + BULLET_RADIUS;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        if (dx * dx + dy * dy > rr * rr) continue;
        b.hits.push(e.id);
        this.bulletHit(b, e);
        if (b.life > 0 && b.pierce-- <= 0) b.life = 0;
      }
    }
  }

  private bulletHit(b: Bullet, e: Enemy): void {
    if (b.kind === 'fireball') {
      const r = b.radius ?? 50;
      this.events.push({ type: 'explode', x: b.x, y: b.y, r, color: '#ff8a3d' });
      for (const o of this.enemies) if (o.hp > 0 && Math.hypot(o.x - b.x, o.y - b.y) <= r + o.r) this.hitWith(b.shooter, o, b.dmg, b.x, b.y, b.crit);
      b.life = 0;
      return;
    }
    this.hitWith(b.shooter, e, b.dmg, b.x - b.vx, b.y - b.vy, b.crit, b.mode);
    if (b.kind === 'hammer' && b.slow) e.slow = Math.max(e.slow ?? 0, b.slow);
    if (b.kind === 'ricochet' && (b.bounces ?? 0) > 0) {
      const next = this.nearest(e.x, e.y, RICOCHET_RANGE, b.hits);
      if (next) {
        const speed = Math.hypot(b.vx, b.vy);
        const a = Math.atan2(next.y - e.y, next.x - e.x);
        b.vx = Math.cos(a) * speed;
        b.vy = Math.sin(a) * speed;
        b.life = (RICOCHET_RANGE + 20) / speed;
        b.bounces!--;
        b.pierce = 1; // keep flying after this hit
      }
    }
  }

  private tickPuddles(dt: number): void {
    for (const p of this.puddles) {
      p.life -= dt;
      p.tick -= dt;
      if (p.tick > 0) continue;
      p.tick = PUDDLE_TICK;
      for (const e of this.enemies) if (e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) <= p.r + e.r) this.hitWith(p.shooter, e, PUDDLE_TICK_DAMAGE, p.x, p.y);
    }
    this.puddles = this.puddles.filter((p) => p.life > 0);
  }

  private damage(e: Enemy, dmg: number, crit: boolean, dirX: number, dirY: number, shooter: Shooter = 'main'): void {
    if (e.hp <= 0) return;
    e.hp -= dmg;
    e.flash = 1;
    if (!e.boss) {
      e.kx += dirX * 90;
      e.ky += dirY * 90;
    }
    this.events.push({ type: 'hit', x: e.x, y: e.y - e.r, dmg, crit });
    if (e.hp <= 0) {
      const reward = this.game.registerKill(e.type, e.boss, shooter);
      this.events.push({ type: 'kill', x: e.x, y: e.y, enemy: e.type, boss: e.boss, reward });
    }
  }

  /** Tap blast at a world position: damages every enemy in the radius. Works even while stunned. */
  tap(x: number, y: number): void {
    const g = this.game;
    g.registerTap();
    this.events.push({ type: 'blast', x, y });
    const crit = g.rng() < g.critChanceOf('main');
    const dmg = g.tapDamage * (crit ? CRIT_MULT : 1);
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = Math.hypot(dx, dy);
      if (d > g.tapRadius + e.r) continue;
      this.damage(e, dmg, crit, dx / (d || 1), dy / (d || 1));
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }
}
