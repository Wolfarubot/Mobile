import { GATED, gateWalls } from './gates';
import {
  MAIN_RANGE,
  type Rarity,
  type WeaponClassDef,
  DAMAGE_TYPES,
  FLYING,
  STATUS,
  affinity,
  typeMult,
  type DamageType,
  BULLET_SPEED,
  enemyDef,
  fieldZoom,
  FROST_TAP_CHILL,
  FLEE_SPEED_MULT,
  GUARD_RECHARGE,
  hunterDef,
  gearDef,
  type GearDef,
  type GearEffect,
  type SummonType,
  tomeSummonType,
  effectBase,
  effectCooldown,
  MAX_ENEMIES,
  areaScale,
  MULTISHOT_SPREAD,
  STUN_IMMUNITY,
  SHIELD_DEFLECT_PAUSE,
  type EnemyId,
  type HunterId,
  type HunterSpecial,
  HUNTERS,
} from './balance';
import type { Game, GearMode, KillReward, Shooter } from './game';

export const PLAYER_RADIUS = 13;
const BULLET_RADIUS = 4;
/** Size of a tome's summoned creature. */
export const SUMMON_RADIUS = 9;
/** How fast a focus's wave expands, in world units per second. */
const WAVE_SPEED = 420;
/** Seconds between a dagger's stabs in one burst. */
const DAGGER_GAP = 0.09;
const BOSS_BOUNCE = 260;
const GUARD_BOUNCE = 220;
/** How far out a hammer's smash lands, as a fraction of its radius (the Hunter stands near its edge). */
export const SLAM_OFFSET = 0.85;
/** Seconds between puddle ticks; a puddle lasts its special's `ticks` of these. */
const PUDDLE_TICK = 0.5;
const RICOCHET_RANGE = 160;

/** How far a blood bolt flies looking for its next monster. */
const BLOOD_BOLT_RANGE = 220;

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
  /** Seconds of half-speed left (frost hammers, Frost chill). */
  slow?: number;
  /** Seconds left pinned in place by Gideon's bone spikes (it can't move, though hits still knock it). */
  held?: number;
  /** Damage over time from Fire and Poison. */
  burn?: Dot;
  poison?: Dot;
  /** Decay's dark aura: hurts the monsters around it. */
  aura?: Dot;
  /** Seconds left with its resistances stripped (Arcane). */
  exposed?: number;
  /** Seconds left of Void's gravity well around it, pulling nearby monsters in (`wellPull` × as hard). */
  well?: number;
  wellPull?: number;
  /** Bleeds (Physical): the only status that stacks, each its own instance. */
  bleeds?: Dot[];
  /** Its acid puddle, if one is still on the ground (one per monster; a new proc refreshes it). */
  acidPuddle?: Puddle;
  /** The last repeater volley that hit it, and how many of its bolts have (each extra hits harder). */
  volley?: number;
  volleyHits?: number;
  /** A ranged monster's seconds until its next shot. */
  shotCd?: number;
}

/** A ranged monster's projectile, flying at a Hunter (over the scenery). */
export interface EnemyShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  from: EnemyId;
}
/** How big a monster's projectile is (for hitting a Hunter). */
export const SHOT_RADIUS = 5;

/** A creature summoned by a Hunter's tome: roams to the nearest monster and bites it until it fades. */
export interface Summon {
  /** The Hunter whose tome summoned it (damage and kills are theirs). */
  who: Shooter;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  bite: number;
  look: 'wisp' | 'wolf' | 'puppet';
  /** What kind of creature it is (some Hunters' summons of a type hit harder). */
  type: SummonType;
  /** A gear ability's creature (a Puppeteer's Doll's puppets): the piece that made it and its own bite. */
  gear?: { uid: number; base: number; damageType: DamageType; bites: number; speed: number };
  /** A Hunter's own creature (Deku's spirit wolves): it bites for their special's damage. */
  own?: { bites: number; speed: number; mult: number };
  /** Seconds left in a lunge (their tome's ability), and whether this lunge has landed yet. */
  dash: number;
  dashHit: boolean;
}

/** A damage-over-time effect: damage per second, seconds left, who applied it (for kill credit). */
export interface Dot {
  dps: number;
  left: number;
  by: Shooter;
  acc: number;
  /** Ticks still to deal (counted rather than timed, so a 2s burn always ticks 4 times). */
  ticks: number;
  /** Poison: extra damage per tick as a fraction of the monster's max HP. */
  maxHpPerTick?: number;
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
  /** Wilhelm using his short-range weapon because something got close. */
  close: boolean;
  /** Seconds until their special attack (potion, fireball) is ready. */
  specialCd: number;
  /** A gun's magazine: shots left and seconds of reload left (see Field.gun). */
  gun: GunState;
  /** Seconds until their tome's lunge is ready (a Wolf Spirit tome). */
  dashCd: number;
  /** Seconds until their Bone Wall can rise again (Gideon). */
  wallCd: number;
}

/** Ammo for a gun-class weapon: shots left in the magazine, and seconds until the reload finishes. */
export interface GunState {
  cls: string | null;
  ammo: number;
  reload: number;
  /** Length of the current reload, for how far along it is. */
  total?: number;
}

/** An ability recharging, for the cooldown icons: who or what it belongs to, and 0..1 recharged. */
export interface CooldownView {
  key: string;
  icon: string;
  name: string;
  progress: number;
}

/** Where stationed Hunters stand, relative to your Hunter (room for them all at their drawn size). */
const HELPER_SPOTS = [
  { x: -72, y: 42 },
  { x: 72, y: 42 },
  { x: 0, y: -80 },
];

export type BulletKind = 'blood' | 'bolt' | 'spark' | 'arrow' | 'fireball' | 'potion' | 'pellet' | 'dagger' | 'pistol' | 'ricochet' | 'hammer';

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
  /** Multiplier on the shooter's shot damage (e.g. a staff's spell). */
  dmg: number;
  /** Which of Wilhelm's weapons fired it (gear in that slot applies). */
  mode?: GearMode;
  /** Fireball explosion / potion puddle radius. */
  radius?: number;
  bounces?: number;
  slow?: number;
  /** Longbow arrows: how far they carry on after their first hit. */
  followThrough?: number;
  /** Repeater bolts: their volley, and how much harder each extra bolt of it hits the same monster. */
  volley?: number;
  stack?: number;
  /** Potions fly to a point and burst there. */
  tx?: number;
  ty?: number;
  /** A special attack (potion, fireball): deals the Hunter's own damage type. */
  special?: boolean;
  /** Themus's blood bolts: always make what they hit bleed. */
  bleed?: boolean;
  /** A multi-type weapon firing one type per projectile: the one this projectile deals (at full damage). */
  dtype?: DamageType;
  /** A copied potion's puddle length, in ticks (Thomas's tome; otherwise the thrower's own special's). */
  ticks?: number;
}

/** Who can cast a special: a Guild Hunter on the field, or the Hunter in the middle when that's one of them. */
type SpecialCaster = { id: HunterId; x: number; y: number; specialCd: number; aim: number };

/** One of Thomas's tomes: where it opened, whose special it copies, and how long it's been open. */
export interface Tome {
  by: HunterId;
  source: HunterId;
  special: HunterSpecial;
  x: number;
  y: number;
  age: number;
  cast: boolean;
}

/** Seconds a tome takes to open before its copy bursts out, and how long it stays before fading. */
export const TOME_OPEN = 0.5;
export const TOME_LIFE = 1.6;
/** Chance Thomas's tome copies a Hunter fighting here (rather than any other Hunter you've recruited). */
export const RECALL_HERE_CHANCE = 0.85;

export interface Puddle {
  shooter: Shooter;
  x: number;
  y: number;
  r: number;
  life: number;
  tick: number;
  /** Multiplier on the thrower's shot damage per tick (Andrejz's potions). */
  dmg: number;
  /** An acid puddle from an Acid proc: fixed damage per tick, of this type. */
  abs?: number;
  dtype?: DamageType;
}

export type FieldEvent =
  | { type: 'hit'; x: number; y: number; dmg: number; crit: boolean; dtype: DamageType; affinity?: 'weak' | 'resist' | null }
  | { type: 'kill'; x: number; y: number; enemy: EnemyId; boss: boolean; reward: KillReward }
  | { type: 'blast'; x: number; y: number; color?: string }
  | { type: 'dodge'; x: number; y: number }
  | { type: 'boss' }
  | { type: 'stun'; x: number; y: number; boss: boolean; who: Shooter }
  | { type: 'guard'; x: number; y: number }
  /** Thorns armor stabbed a monster that reached a Hunter. */
  | { type: 'thorns'; x: number; y: number; r: number }
  | { type: 'boneWall'; r: number }
  | { type: 'escape'; x: number; y: number }
  | { type: 'explode'; x: number; y: number; r: number; color: string }
  | { type: 'nova'; x: number; y: number; r: number; color?: string }
  | { type: 'beam'; x1: number; y1: number; x2: number; y2: number; color: string; width: number; zigzag?: boolean; thrust?: boolean }
  | { type: 'sweep'; x: number; y: number; a: number; arc: number; r: number; color: string; heavy?: boolean; blade?: boolean }
  /** A focus's wave: a ring growing to `r` over `time` seconds. */
  | { type: 'wave'; x: number; y: number; r: number; time: number; color: string }
  /** A hammer's ground slam: a shockwave ring of radius `r`. */
  | { type: 'slam'; x: number; y: number; r: number; color: string }
  /** Sciirj's Mountain Fist thrown from (x, y) at angle `a`; `r` is its reach. */
  | { type: 'punch'; x: number; y: number; a: number; r: number }
  /** A Hunter attacked with their weapon (the renderer swings, thrusts or raises it). */
  | { type: 'attack'; who: Shooter; a: number }
  | { type: 'reload'; who: Shooter; x: number; y: number }
  /** A ranged monster shot at a Hunter. */
  | { type: 'enemyShot'; x: number; y: number; a: number }
  /** A melee Hunter broke a projectile in the air (at x, y). */
  | { type: 'parry'; who: Shooter; x: number; y: number; a: number }
  /** A Hunter's shield deflected a projectile (at x, y), sending it off at angle `a`. */
  | { type: 'deflect'; who: Shooter; x: number; y: number; a: number };

/**
 * The survivor-style battlefield in world coordinates centered on your Hunter.
 * The view is zoomed out (fieldZoom: more in later areas, which are bigger), so enemies spawn far off and walk in.
 * They head for the nearest Hunter; one that reaches a Hunter stuns them and flees,
 * escaping with its loot if it makes it off-screen. Stationed Hunters fight with their own style.
 * No rendering here: BattleView draws it, and tests run it headless.
 */
export class Field {
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  /** Ranged monsters' projectiles in flight. */
  shots: EnemyShot[] = [];
  puddles: Puddle[] = [];
  /** Thomas's tomes, open on the field (see recall). */
  tomes: Tome[] = [];
  /** The Hunter in the middle's special cooldown, when that's a Guild Hunter (see update). */
  private leadCaster: SpecialCaster = { id: 'alchemist', x: 0, y: 0, specialCd: 1, aim: 0 };
  /** A focus's waves: rings expanding from where they were sent, hitting each monster once as they pass. */
  waves: Array<{ who: Shooter; x: number; y: number; r: number; max: number; hit: Set<number> }> = [];
  /** Seconds of stun left on your Hunter (can't shoot while > 0). */
  stun = 0;
  /** Seconds left of Gideon's Bone Wall, and how far out it stands around each Hunter. */
  boneWall = 0;
  boneWallR = 0;
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
  /** Your Hunter's attack charge (an attack at 1; below 0 while a shield deflection pauses them). */
  fireAcc = 0;
  /** Your Hunter's gun magazine (when their weapon is a pistol, rifle or repeater). */
  gunState: GunState = { cls: null, ammo: 0, reload: 0 };
  /** Daggers' bursts in progress (anyone's): stabs (or throws) still to come, at a monster. */
  private stabs: Array<{ who: Shooter; t: number; target: number; last: boolean }> = [];
  /** Seconds until each worn piece's ability is ready again, by `${who}:${uid}`. */
  private gearCd = new Map<string, number>();
  /** Creatures your Hunter's tome has summoned. */
  summons: Summon[] = [];
  /** Seconds until your tome's creatures can lunge again (a tome with a lunge ability, e.g. the Wolf Spirit). */
  dashCd = 0;
  private nextVolley = 1;
  /** Each Hunter's turn through their weapon's types, for weapons that fire one type per projectile. */
  private typeTurn = new Map<Shooter, number>();
  private nextId = 1;
  private halfW = 320;
  private halfH = 350;

  /**
   * @param lead Who stands in the middle: your Hunter on the real battlefield, or (sampling a stationed group in
   * the background, see sampler.ts) one of the Guild Hunters stationed there.
   */
  constructor(
    private game: Game,
    readonly lead: Shooter = 'main',
  ) {
    if (lead !== 'main') this.leadCaster.id = lead;
    game.on((e) => {
      if (e.type === 'travel') this.clear();
      if (e.type === 'guardianFail') this.enemies = this.enemies.filter((en) => !en.boss);
    });
  }

  /**
   * The battlefield's big objects (rocks, trees, coffins), as circles at their bases: walking monsters go around
   * them (fliers pass over), projectiles fly over them. Set by the renderer for the current view.
   */
  obstacles: Array<{ x: number; y: number; r: number }> = [];

  /** A gated area's corner walls (see gates.ts), in world units: walking monsters are kept out of them. */
  walls: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];

  /** The last screen size set (the background battlefield samples use the same view). */
  view = { w: 390, h: 420 };

  /** Screen size in CSS pixels; the visible world is larger by 1 / the area's zoom. */
  setView(w: number, h: number): void {
    this.view = { w, h };
    const z = fieldZoom(this.game.area);
    this.halfW = w / 2 / z;
    this.halfH = h / 2 / z;
    this.walls = GATED.has(this.game.area) ? gateWalls(w, h).map(([x, y, rw, rh]) => ({ x0: (x - w / 2) / z, y0: (y - h / 2) / z, x1: (x + rw - w / 2) / z, y1: (y + rh - h / 2) / z })) : [];
  }

  /** Whether monsters only come in through the gates (the middle third of each side). */
  private get gated(): boolean {
    return GATED.has(this.game.area);
  }

  get stunned(): boolean {
    return this.stun > 0;
  }

  /** Whether a Hunter on the field is knocked out right now. */
  isDown(who: Shooter): boolean {
    if (who === this.lead) return this.stunned;
    return (this.helpers.find((h) => h.id === who)?.stun ?? 0) > 0;
  }

  clear(): void {
    this.enemies = [];
    this.bullets = [];
    this.shots = [];
    this.puddles = [];
    this.tomes = [];
    this.stun = 0;
    this.immune = 0;
    this.guard = this.game.guardOf(this.lead);
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

  /** A random point just outside the visible rectangle (in a gated area, outside one of the four gates). */
  private edgePoint(): { x: number; y: number } {
    const rng = this.game.rng;
    const w = this.halfW + 24;
    const h = this.halfH + 24;
    if (this.gated) {
      // Any of the four gates, somewhere across its middle half (a pack spreads out from there).
      const side = Math.floor(rng() * 4);
      const along = (rng() - 0.5) / 3;
      if (side < 2) return { x: along * 2 * this.halfW, y: side ? h : -h };
      return { x: side === 2 ? -w : w, y: along * 2 * this.halfH };
    }
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
      x: this.inGate(at.x + (boss ? 0 : (g.rng() - 0.5) * 50), this.halfW, Math.abs(at.y) > this.halfH),
      y: this.inGate(at.y + (boss ? 0 : (g.rng() - 0.5) * 50), this.halfH, Math.abs(at.x) > this.halfW),
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

  /** In a gated area, a coordinate across a gate kept within its opening (`across`: this is the gate's width). */
  private inGate(v: number, half: number, across: boolean): number {
    if (!this.gated || !across) return v;
    const max = half / 3 - 14;
    return Math.max(-max, Math.min(max, v));
  }

  private rollPack(): { type: EnemyId; size: number } {
    const type = this.game.pickEnemy();
    const [lo, hi] = this.game.packOf(type);
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
    this.boneWall = Math.max(0, this.boneWall - dt);
    for (const h of this.helpers) {
      h.wallCd = Math.max(0, h.wallCd - dt);
      if (h.stun > 0) {
        h.stun = Math.max(0, h.stun - dt);
        if (h.stun === 0) h.immune = STUN_IMMUNITY;
      } else h.immune = Math.max(0, h.immune - dt);
    }
    for (const [who, h] of [[this.lead, this], ...this.helpers.map((x) => [x.id, x])] as Array<[Shooter, { guard: number; guardAcc: number }]>) {
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
      const cap = MAX_ENEMIES * areaScale(g.area);
      for (let i = 0; i < this.nextPack.size && this.enemies.length < cap; i++) this.spawn(this.nextPack.type, false, at);
      this.nextPack = this.rollPack();
    }

    this.moveEnemies(dt);
    this.separate();
    this.moveShots(dt);

    // Your Hunter (not while stunned): attacks the way their weapon's class does.
    this.fireAcc = Math.min(this.fireAcc + dt * g.shooterRate(this.lead), 3);
    if (this.stunned) this.fireAcc = 0;
    const cls = g.weaponClassOf(this.lead);
    const range = g.shooterRange(this.lead);
    if (!this.gunReady(this.gunState, cls, dt)) this.fireAcc = 0;
    while (this.fireAcc >= 1) {
      const target = this.nearest(0, 0, range);
      if (!target) {
        this.fireAcc = Math.min(this.fireAcc, 1);
        break;
      }
      this.fireAcc -= 1;
      this.aim = Math.atan2(target.y, target.x);
      this.weaponAttack(this.lead, 0, 0, this.aim, target, cls, this.gunState, range);
      if (this.spendShot(this.gunState, cls, g.shooterRate(this.lead))) {
        this.events.push({ type: 'reload', who: this.lead, x: 0, y: 0 });
        this.fireAcc = 0;
        break;
      }
    }
    // The Hunter in the middle's special, when that's a Guild Hunter (a stationed group's background sample).
    if (this.lead !== 'main' && hunterDef(this.lead).special && !this.stunned) {
      this.leadCaster.x = 0;
      this.leadCaster.y = 0;
      this.helperSpecial(this.leadCaster, dt);
      this.aim = this.leadCaster.aim;
    }
    this.runTomes(dt);
    this.runStabs(dt);
    this.runSummons(dt);
    this.runGearEffects(dt);
    for (const h of this.helpers) this.helperAttack(h, dt);

    this.moveBullets(dt);
    this.tickPuddles(dt);
    this.runWaves(dt);
    this.bullets = this.bullets.filter((b) => b.life > 0);
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  // ---- Enemies ----

  /** The Hunter (you or a helper) closest to a point. */
  private nearestHunter(x: number, y: number): { who: Shooter; x: number; y: number } {
    let best: { who: Shooter; x: number; y: number } = { who: this.lead, x: 0, y: 0 };
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
      if (e.burn || e.poison || e.aura || e.exposed || e.well) this.tickStatus(e, dt);
      if (e.held) e.held = Math.max(0, e.held - dt);
      // Held by bone spikes: it can't walk, though hits still knock it about.
      const speed = e.held ? 0 : e.speed * (e.slow ? 0.5 : 1);
      if (e.fleeing) {
        const d = Math.hypot(e.x, e.y) || 1;
        // Straight out, or (walking, in a gated area) out through the nearest gate.
        const [ox, oy] = this.walls.length && !FLYING.has(e.type) ? this.gateOut(e, escapeR) : [e.x / d, e.y / d];
        e.x += ox * speed * FLEE_SPEED_MULT * dt + e.kx * dt;
        e.y += oy * speed * FLEE_SPEED_MULT * dt + e.ky * dt;
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
        // A Bone Wall keeps every monster at its edge: nothing reaches a Hunter while it stands.
        const walled = this.boneWall > 0;
        const ranged = e.boss ? undefined : enemyDef(e.type).ranged;
        // A ranged monster stops within its range and shoots instead.
        const reach = ranged ? Math.max(ranged.range * 0.9, walled ? this.boneWallR + e.r : 0) : walled ? this.boneWallR + e.r : e.r + PLAYER_RADIUS;
        if (ranged) this.rangedAttack(e, ranged, t, d, dt);
        const step = Math.min(speed * dt, Math.max(0, d - reach));
        const [ux, uy] = this.steer(e, -dx / d, -dy / d);
        e.x += ux * step + e.kx * dt;
        e.y += uy * step + e.ky * dt;
        if (walled && d < reach) {
          // Pushed back out to the wall (a knockback toward a Hunter can't carry it through).
          e.x = t.x + (dx / d) * reach;
          e.y = t.y + (dy / d) * reach;
        } else if (!walled && !ranged && d <= reach + 1) this.contact(e, t.who, dx / d, dy / d);
      }
      this.keepOut(e);
      e.kx *= decay;
      e.ky *= decay;
    }
  }

  /** How close (beyond touching) a walking monster starts to turn aside from an obstacle. */
  private static readonly STEER_RANGE = 28;

  /**
   * A walking monster's heading (ux, uy) turned to slip around any obstacle it's closing on: it veers along the
   * obstacle's edge, on whichever side it was already going (or by its id if dead-on), more the closer it gets.
   */
  private steer(e: Enemy, ux: number, uy: number): [number, number] {
    if (!this.obstacles.length || FLYING.has(e.type)) return [ux, uy];
    let sx = ux;
    let sy = uy;
    for (const o of this.obstacles) {
      const ox = e.x - o.x;
      const oy = e.y - o.y;
      const dist = Math.hypot(ox, oy) || 1;
      const R = o.r + e.r * 0.6;
      if (dist > R + Field.STEER_RANGE) continue;
      const nx = ox / dist;
      const ny = oy / dist;
      if (ux * nx + uy * ny >= 0) continue; // already heading away from it
      let tx = -ny;
      let ty = nx;
      const side = tx * ux + ty * uy;
      if (side < 0 || (Math.abs(side) < 0.05 && e.id % 2)) {
        tx = -tx;
        ty = -ty;
      }
      const w = 1 - Math.max(0, dist - R) / Field.STEER_RANGE;
      sx += tx * w * 1.6;
      sy += ty * w * 1.6;
    }
    const m = Math.hypot(sx, sy) || 1;
    return [sx / m, sy / m];
  }

  /** Which way a monster fleeing a gated area runs: toward the gate nearest it, and on out past the edge. */
  private gateOut(e: Enemy, far: number): [number, number] {
    const top = Math.abs(e.y) / this.halfH >= Math.abs(e.x) / this.halfW;
    const tx = top ? 0 : Math.sign(e.x || 1) * (far + 20);
    const ty = top ? Math.sign(e.y || 1) * (far + 20) : 0;
    const d = Math.hypot(tx - e.x, ty - e.y) || 1;
    return [(tx - e.x) / d, (ty - e.y) / d];
  }

  /** A walking monster (knocked back or not) never ends up inside an obstacle or a wall: it's put back at the edge. */
  private keepOut(e: Enemy): void {
    if (FLYING.has(e.type)) return;
    for (const w of this.walls) {
      if (e.x <= w.x0 || e.x >= w.x1 || e.y <= w.y0 || e.y >= w.y1) continue;
      // Out the nearest side that isn't the view's own edge.
      const outs: Array<[number, number, number]> = [];
      if (w.x0 > -this.halfW + 1) outs.push([e.x - w.x0, w.x0, e.y]);
      if (w.x1 < this.halfW - 1) outs.push([w.x1 - e.x, w.x1, e.y]);
      if (w.y0 > -this.halfH + 1) outs.push([e.y - w.y0, e.x, w.y0]);
      if (w.y1 < this.halfH - 1) outs.push([w.y1 - e.y, e.x, w.y1]);
      const best = outs.sort((a, b) => a[0] - b[0])[0];
      if (best) [, e.x, e.y] = best;
    }
    if (!this.obstacles.length) return;
    for (const o of this.obstacles) {
      const ox = e.x - o.x;
      const oy = e.y - o.y;
      const R = o.r + e.r * 0.6;
      const dist = Math.hypot(ox, oy);
      if (dist >= R) continue;
      const k = dist > 0.001 ? R / dist : 0;
      e.x = dist > 0.001 ? o.x + ox * k : o.x + R;
      e.y = dist > 0.001 ? o.y + oy * k : o.y;
    }
  }

  /** An enemy reached a Hunter: shields block it, otherwise the Hunter is stunned (unless immune) and the enemy runs. */
  private contact(e: Enemy, who: Shooter, ux: number, uy: number): void {
    const helper = who === this.lead ? null : this.helpers.find((h) => h.id === who)!;
    const state = helper ?? this;
    const hx = helper?.x ?? 0;
    const hy = helper?.y ?? 0;
    const effects = this.game.gearEffects(who);
    // Thorns: whatever reaches you gets hurt, blocked or not.
    for (const { effect: ef, stars } of effects)
      if (ef.kind === 'thorns' && (ef.chance === undefined || this.game.rng() < ef.chance)) {
        this.abilityHit(who, e, effectBase(ef, stars), ef.damageType, false);
        this.events.push({ type: 'thorns', x: e.x, y: e.y, r: e.r });
      }
    // Evasion (light armor): slip it entirely, no stun and no shield used.
    if (!e.boss && effects.some(({ effect: ef }) => ef.kind === 'evade' && this.game.rng() < ef.chance)) {
      e.fleeing = true;
      this.events.push({ type: 'dodge', x: hx, y: hy });
      return;
    }
    if (state.guard > 0 && !e.boss) {
      state.guard--;
      state.guardAcc = 0;
      e.kx += ux * GUARD_BOUNCE;
      e.ky += uy * GUARD_BOUNCE;
      this.events.push({ type: 'guard', x: hx, y: hy });
      // Shield burst: the block blasts everything around the wearer.
      for (const { effect: ef, stars } of effects)
        if (ef.kind === 'block' && (ef.chance === undefined || this.game.rng() < ef.chance)) this.abilityBurst(who, hx, hy, ef.radius, effectBase(ef, stars), ef.damageType);
      return;
    }
    this.knockOut(who, e.boss, e.x, e.y);
    if (e.boss) {
      e.kx += ux * BOSS_BOUNCE;
      e.ky += uy * BOSS_BOUNCE;
    } else e.fleeing = true;
  }

  /** A Hunter is stunned (unless already stunned or immune: a stun runs its course, so no stun loops). */
  private knockOut(who: Shooter, boss: boolean, x: number, y: number): void {
    const helper = who === this.lead ? null : this.helpers.find((h) => h.id === who)!;
    const state = helper ?? this;
    if (state.immune > 0 || state.stun > 0) return;
    const t = this.game.stunTime(boss, who);
    state.stun = t;
    state.stunTotal = t;
    this.game.registerKnockout();
    this.events.push({ type: 'stun', x, y, boss, who });
    // Gideon's Bone Wall: his stun raises a wall of bone around every Hunter.
    const wall = helper && hunterDef(helper.id).wall;
    if (helper && wall && helper.wallCd <= 0) {
      helper.wallCd = wall.cooldown;
      this.boneWall = wall.duration;
      this.boneWallR = wall.radius;
      this.events.push({ type: 'boneWall', r: wall.radius });
    }
  }

  /** A ranged monster within range of its Hunter counts down and shoots a projectile at them. */
  private rangedAttack(e: Enemy, ranged: { range: number; cooldown: number; speed: number }, t: { x: number; y: number }, d: number, dt: number): void {
    e.shotCd ??= ranged.cooldown * (0.3 + this.game.rng() * 0.5);
    if (d > ranged.range + e.r) return;
    e.shotCd -= dt;
    if (e.shotCd > 0) return;
    e.shotCd = ranged.cooldown * (0.85 + this.game.rng() * 0.3);
    const a = Math.atan2(t.y - e.y, t.x - e.x);
    const x = e.x + Math.cos(a) * e.r;
    const y = e.y + Math.sin(a) * e.r;
    this.shots.push({ x, y, vx: Math.cos(a) * ranged.speed, vy: Math.sin(a) * ranged.speed, life: (ranged.range * 1.6) / ranged.speed, from: e.type });
    this.events.push({ type: 'enemyShot', x, y, a });
  }

  /** Every Hunter on the field: where they stand, their state, and whether they can act (not stunned). */
  private hunters(): Array<{ who: Shooter; x: number; y: number; state: { fireAcc: number; stun: number; immune: number; guard: number; guardAcc: number } }> {
    return [{ who: this.lead, x: 0, y: 0, state: this }, ...this.helpers.map((h) => ({ who: h.id as Shooter, x: h.x, y: h.y, state: h }))];
  }

  /** Whether a Hunter is wearing a shield (armor). */
  private hasShield(who: Shooter): boolean {
    return this.game.equipped(who).some((it) => !!it && gearDef(it.base).armorType === 'shield');
  }

  /**
   * Monsters' projectiles fly straight (over the scenery). A melee Hunter breaks one that comes within reach
   * (spending their next attack); one that reaches a Hunter is deflected by a shield (pausing their attacks a
   * moment), dodged by light armor, blocked by a shield charge, or stuns them. A Bone Wall stops them.
   */
  private moveShots(dt: number): void {
    if (!this.shots.length) return;
    const hunters = this.hunters();
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0) continue;
      for (const h of hunters) {
        const d = Math.hypot(s.x - h.x, s.y - h.y);
        if (this.boneWall > 0 && d <= this.boneWallR) {
          s.life = 0;
          this.events.push({ type: 'parry', who: h.who, x: s.x, y: s.y, a: Math.atan2(s.y - h.y, s.x - h.x) });
          break;
        }
        const up = h.state.stun <= 0;
        // A melee weapon swats it out of the air as it comes within reach.
        if (up && this.isMelee(h.who) && d <= Math.min(this.game.shooterRange(h.who), 90) + SHOT_RADIUS) {
          s.life = 0;
          h.state.fireAcc = Math.min(h.state.fireAcc, 0);
          const a = Math.atan2(s.y - h.y, s.x - h.x);
          if (h.who === this.lead) this.aim = a;
          else (h.state as Helper).aim = a;
          this.events.push({ type: 'attack', who: h.who, a });
          this.events.push({ type: 'parry', who: h.who, x: s.x, y: s.y, a });
          break;
        }
        if (d > PLAYER_RADIUS + SHOT_RADIUS) continue;
        s.life = 0;
        this.shotHit(h.who, h.x, h.y, s, up);
        break;
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  /** A projectile reached a Hunter. */
  private shotHit(who: Shooter, hx: number, hy: number, s: EnemyShot, up: boolean): void {
    const state = who === this.lead ? this : this.helpers.find((h) => h.id === who)!;
    // A shield deflects it (if they're up to raise it), but their attacks stop for a moment.
    if (up && this.hasShield(who)) {
      const a = Math.atan2(s.y - hy, s.x - hx) + (this.game.rng() - 0.5) * 1.2;
      state.fireAcc = Math.min(state.fireAcc, 0) - SHIELD_DEFLECT_PAUSE * this.game.shooterRate(who);
      this.events.push({ type: 'deflect', who, x: s.x, y: s.y, a });
      return;
    }
    const effects = this.game.gearEffects(who);
    if (effects.some(({ effect: ef }) => ef.kind === 'evade' && this.game.rng() < ef.chance)) {
      this.events.push({ type: 'dodge', x: hx, y: hy });
      return;
    }
    if (state.guard > 0) {
      state.guard--;
      state.guardAcc = 0;
      this.events.push({ type: 'guard', x: hx, y: hy });
      for (const { effect: ef, stars } of effects)
        if (ef.kind === 'block' && (ef.chance === undefined || this.game.rng() < ef.chance)) this.abilityBurst(who, hx, hy, ef.radius, effectBase(ef, stars), ef.damageType);
      return;
    }
    this.knockOut(who, false, hx, hy);
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
    const ids = this.game.helpersHere.filter((id) => id !== this.lead);
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
      close: false,
      specialCd: 1,
      gun: { cls: null, ammo: 0, reload: 0 },
      dashCd: 0,
      wallCd: 0,
    }));
  }

  /** A Guild Hunter fights exactly as their weapon's class does (a basic bolt unarmed), with their special on top. */
  private helperAttack(h: Helper, dt: number): void {
    const g = this.game;
    const def = hunterDef(h.id);
    if (h.stun > 0) {
      h.fireAcc = 0;
      return;
    }
    // Wilhelm switches to his short-range weapon when anything is close.
    h.close = !!def.swapRange && !!this.nearest(h.x, h.y, def.swapRange);
    const mode: GearMode = h.close ? 'short' : 'long';
    const rate = g.shooterRate(h.id, mode);
    if (def.special) this.helperSpecial(h, dt);
    h.fireAcc = Math.min(h.fireAcc + dt * rate, 3);
    const cls = g.weaponClassOf(h.id, mode);
    if (!this.gunReady(h.gun, cls, dt)) h.fireAcc = 0;
    const range = g.shooterRange(h.id, mode);
    while (h.fireAcc >= 1) {
      const target = this.nearest(h.x, h.y, range);
      if (!target) {
        h.fireAcc = Math.min(h.fireAcc, 1);
        return;
      }
      h.fireAcc -= 1;
      h.aim = Math.atan2(target.y - h.y, target.x - h.x);
      this.weaponAttack(h.id, h.x, h.y, h.aim, target, cls, h.gun, range, mode);
      if (this.spendShot(h.gun, cls, rate)) {
        this.events.push({ type: 'reload', who: h.id, x: h.x, y: h.y });
        h.fireAcc = 0;
        return;
      }
    }
  }

  /**
   * One attack the way a weapon's class makes it, for your Hunter and Guild Hunters alike: a dagger's burst of
   * stabs, a sword's sweep, a spear's thrust, a focus's burst, a tome's summon, a staff's spell, a bow's or
   * gun's shots. Unarmed, a basic bolt.
   */
  private weaponAttack(who: Shooter, x: number, y: number, aim: number, target: Enemy, cls: WeaponClassDef | null, gun: GunState, range: number, mode: GearMode = 'long'): void {
    const g = this.game;
    const m = mode === 'short' ? 'short' : undefined;
    this.events.push({ type: 'attack', who, a: aim });
    if (cls?.attack === 'dagger') {
      // A burst of stabs (or throws, if it's out of reach) at this monster, a moment apart.
      const n = cls.thrusts ?? 1;
      for (let i = 0; i < n; i++) this.stabs.push({ who, t: i * DAGGER_GAP, target: target.id, last: i === n - 1 });
    } else if (cls?.attack === 'nova' && cls.wave) {
      // A focus's wave: a ring expanding out to its reach (× area size), hitting monsters as it passes.
      const max = cls.reach! * g.radiusMult(who);
      this.waves.push({ who, x, y, r: 0, max, hit: new Set() });
      this.events.push({ type: 'wave', x, y, r: max, time: max / WAVE_SPEED, color: DAMAGE_TYPES[g.damageTypeOf(who, mode)].color });
    } else if (cls?.attack === 'nova') {
      // A burst of power around the Hunter: every monster in the radius (× area size).
      const r = cls.reach! * g.radiusMult(who);
      this.events.push({ type: 'nova', x, y, r, color: DAMAGE_TYPES[g.damageTypeOf(who, mode)].color });
      for (const e of this.enemies) if (e.hp > 0 && Math.hypot(e.x - x, e.y - y) <= r + e.r) this.hitWith(who, e, 1, x, y);
    } else if (cls?.summon) {
      this.summon(who, x, y, aim, cls);
    } else if (cls?.spell && gun.ammo === 1) {
      // A staff's big spell: the last round of each cast.
      this.shoot(who, 'fireball', x, y, aim, 380, range, { radius: cls.spell.radius, dmg: cls.spell.damage, mode: m });
    } else if (cls?.attack === 'slam') {
      // A hammer smashes the ground out in front: the Hunter stands at the edge of the blast, so its centre is
      // further out the bigger it is. Everything in it is hit and thrown far back from where it landed.
      const r = cls.reach! * g.radiusMult(who);
      const cx = x + Math.cos(aim) * r * SLAM_OFFSET;
      const cy = y + Math.sin(aim) * r * SLAM_OFFSET;
      this.events.push({ type: 'slam', x: cx, y: cy, r, color: this.typeColor(who, mode) });
      for (const e of [...this.enemies]) if (e.hp > 0 && Math.hypot(e.x - cx, e.y - cy) <= r + e.r) this.meleeHit(who, e, 1, cx, cy, cls.knock ?? 0);
    } else if (cls?.attack === 'sweep') this.strikeArc(who, x, y, aim, cls.reach!, cls.arc!, 1, cls.knock ?? 0, true, this.typeColor(who, mode));
    else if (cls?.attack === 'stab') this.strikeLine(who, x, y, aim, range, cls.width ?? 10, Infinity, 1, this.typeColor(who, mode), (cls.width ?? 10) / 2, cls.knock ?? 0);
    else if (cls?.volley) {
      // A fan: each bolt at a random angle within it. Bolts of one volley stack on the same monster.
      const volley = this.nextVolley++;
      for (let i = 0; i < cls.volley; i++) {
        const a = aim + (g.rng() - 0.5) * (cls.fan ?? 0);
        this.shoot(who, cls.projectile ?? 'bolt', x, y, a, BULLET_SPEED, range, { pierce: g.pierceOf(who, mode), volley, stack: cls.stack, mode: m });
      }
    } else {
      // A longbow's follow-through grows with the Hunter's range.
      const follow = cls?.followThrough ? cls.followThrough * (range / (MAIN_RANGE * cls.range)) : undefined;
      this.shoot(who, cls?.projectile ?? 'bolt', x, y, aim, BULLET_SPEED, range, { pierce: g.pierceOf(who, mode), spread: true, followThrough: follow, bounces: cls?.bounces, mode: m });
    }
    if (this.isMelee(who)) this.meleeWave(who, x, y);
    // Enchantments set off by attacks (Thunder Call, the pulses), each at its rolled chance.
    for (const { effect, chance } of g.attackEnchants(who)) if (g.rng() < chance) this.fireGear(who, x, y, effect, 1, 0);
  }

  /** A Guild Hunter's special (Andrejz's potion, Glimmer's fireball…): cast at the nearest monster in range when it's up. */
  private helperSpecial(h: SpecialCaster, dt: number): void {
    const g = this.game;
    const sp = hunterDef(h.id).special!;
    h.specialCd = Math.max(0, h.specialCd - dt);
    if (h.specialCd > 0) return;
    if (sp.kind === 'recall') {
      this.recall(h);
      return;
    }
    // Specials reach at least as far as a bow would, even for a Hunter holding a melee weapon.
    const range = Math.max(g.shooterRange(h.id), MAIN_RANGE);
    const target = this.nearest(h.x, h.y, range);
    if (!target) return;
    if (!this.castSpecial(h.id, sp, h.x, h.y, target, range, g.specialRadius(h.id), g.specialDamageMult(h.id))) return;
    h.specialCd = sp.cooldown;
    h.aim = Math.atan2(target.y - h.y, target.x - h.x);
  }

  /**
   * Casts a special from (x, y) at `target`, as `by` (their damage and gear power it): its own Hunter's, or a
   * copy from Thomas's tome (`only` then keeps the copied special's damage type). False if it can't go yet.
   */
  private castSpecial(by: Shooter, sp: HunterSpecial, x: number, y: number, target: Enemy, range: number, radius: number, dmg: number, only?: DamageType): boolean {
    const g = this.game;
    const a = Math.atan2(target.y - y, target.x - x);
    if (sp.kind === 'wave') {
      // Themus's Crimson Wave: a surge of blood along a band toward the nearest monster, hurting and bleeding
      // everything in it. With Blood Rain, each monster it kills bursts into blood bolts at others nearby.
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      const width = sp.width ?? 24;
      this.events.push({ type: 'beam', x1: x, y1: y, x2: x + cx * radius, y2: y + cy * radius, color: '#c0242c', width: width * 1.4 });
      const bolts = Math.round(g.tree(by).bolts);
      for (const o of [...this.enemies]) {
        if (o.hp <= 0) continue;
        const t = (o.x - x) * cx + (o.y - y) * cy;
        const perp = Math.abs((o.x - x) * cy - (o.y - y) * cx);
        if (t <= 0 || t > radius + o.r || perp > width + o.r) continue;
        this.hitWith(by, o, dmg, x, y, undefined, undefined, true, true, only);
        this.bleed(o, by, dmg);
        if (o.hp <= 0 && bolts > 0) {
          const taken: number[] = [o.id];
          for (let i = 0; i < bolts; i++) {
            const next = this.nearest(o.x, o.y, BLOOD_BOLT_RANGE, taken);
            if (!next) break;
            taken.push(next.id);
            this.shoot(by, 'blood', o.x, o.y, Math.atan2(next.y - o.y, next.x - o.x), 420, BLOOD_BOLT_RANGE, { dmg: dmg * 0.5, special: true, bleed: true });
          }
        }
      }
      return true;
    }
    if (sp.kind === 'spikes') {
      // Gideon's Bone Spikes burst up under the nearest monster, hurting everything around it and holding it in
      // place. They wait while his Bone Wall stands.
      if (this.boneWall > 0 && !only) return false;
      const tx = target.x;
      const ty = target.y;
      this.events.push({ type: 'nova', x: tx, y: ty, r: radius, color: '#efe4c8' });
      for (const o of this.enemies)
        if (o.hp > 0 && Math.hypot(o.x - tx, o.y - ty) <= radius + o.r) {
          this.hitWith(by, o, dmg, tx, ty, undefined, undefined, true, true, only);
          o.held = Math.max(o.held ?? 0, (sp.hold ?? 1) * (o.boss ? 0.25 : 1));
          this.events.push({ type: 'thorns', x: o.x, y: o.y, r: o.r });
        }
      return true;
    }
    if (sp.kind === 'punch') {
      // Sciirj's Mountain Fist: waits until a monster is within reach, then one huge blow at everything in front
      // of him, knocking the survivors far back.
      if (Math.hypot(target.x - x, target.y - y) > radius + target.r) return false;
      this.strikeArc(by, x, y, a, radius, sp.arc ?? 1.6, dmg, sp.knock ?? 0);
      const px = x + Math.cos(a) * radius * 0.6;
      const py = y + Math.sin(a) * radius * 0.6;
      this.events.push({ type: 'punch', x, y, a, r: radius });
      this.events.push({ type: 'nova', x: px, y: py, r: radius * 0.55, color: '#ffb060' });
      return true;
    }
    if (sp.summon) {
      // Two creatures (Deku's spirit wolves, Theon's puppets): each hunts for 6s, biting 1.5 times a second for
      // the special's damage (their "radius" skills make them fiercer).
      const mult = dmg * (radius / sp.radius);
      const life = 6 * g.summonDurationMult(by);
      for (const side of [-1, 1])
        this.summons.push({ who: by, type: sp.summon.type, x: x + side * 18, y, life, maxLife: life, bite: 0, look: sp.summon.look, dash: 0, dashHit: false, own: { bites: 1.5, speed: sp.summon.look === 'wolf' ? 170 : 140, mult } });
      this.events.push({ type: 'nova', x, y, r: 30, color: sp.summon.look === 'wolf' ? '#8fdc7a' : '#d8a878' });
    } else if (sp.kind === 'potion') {
      const d = Math.hypot(target.x - x, target.y - y);
      this.shoot(by, 'potion', x, y, a, 300, d, { radius, dmg, tx: target.x, ty: target.y, special: true, dtype: only, ticks: sp.ticks });
    } else this.shoot(by, 'fireball', x, y, a, 380, range, { radius, dmg, special: true, dtype: only });
    return true;
  }

  /**
   * Thomas's Recall: a tome opens somewhere on the field, and a moment later another Hunter's special bursts from
   * it. Mostly the special of a Hunter fighting here; now and then that of any other Hunter you've recruited.
   */
  private recall(h: SpecialCaster): void {
    const g = this.game;
    const pick = this.recallPick(h.id);
    if (!pick) return;
    const sp = pick.special;
    // Somewhere on the field with a monster within reach of it (a punch needs one right beside it).
    let spot: { x: number; y: number } | null = null;
    for (let i = 0; i < 6 && !spot; i++) {
      const x = (g.rng() * 2 - 1) * this.halfW * 0.85;
      const y = (g.rng() * 2 - 1) * this.halfH * 0.85;
      const t = this.nearest(x, y, sp.kind === 'punch' ? MAIN_RANGE * 0.6 : MAIN_RANGE);
      if (!t) continue;
      if (sp.kind === 'punch') {
        // Opens right beside it, so the blow lands.
        const a = g.rng() * Math.PI * 2;
        spot = { x: t.x + Math.cos(a) * (t.r + 20), y: t.y + Math.sin(a) * (t.r + 20) };
      } else spot = { x, y };
    }
    if (!spot) return; // nothing on the field yet: try again next moment
    h.specialCd = hunterDef(h.id).special!.cooldown;
    this.tomes.push({ by: h.id, source: pick.id, special: sp, x: spot.x, y: spot.y, age: 0, cast: false });
    this.events.push({ type: 'nova', x: spot.x, y: spot.y, r: 26, color: '#c9b8ff' });
  }

  /** Which Hunter's special Thomas's tome copies (null if no recruited Hunter has an active one). */
  private recallPick(by: HunterId): { id: HunterId; special: HunterSpecial } | null {
    const g = this.game;
    const active = (id: HunterId) => id !== by && !!hunterDef(id).special && hunterDef(id).special!.kind !== 'recall';
    const here = [this.lead, ...this.helpers.map((x) => x.id)].filter((id): id is HunterId => id !== 'main' && active(id as HunterId));
    const others = HUNTERS.filter((d) => active(d.id) && g.state.hunters[d.id].recruited && !here.includes(d.id)).map((d) => d.id);
    const pool = here.length && (!others.length || g.rng() < RECALL_HERE_CHANCE) ? here : others;
    if (!pool.length) return null;
    const id = pool[Math.floor(g.rng() * pool.length)];
    return { id, special: hunterDef(id).special! };
  }

  /** Thomas's open tomes: each casts its copied special once it has opened, then fades. */
  private runTomes(dt: number): void {
    if (!this.tomes.length) return;
    const g = this.game;
    for (const t of this.tomes) {
      t.age += dt;
      if (t.cast || t.age < TOME_OPEN) continue;
      const on = t.by === this.lead || this.helpers.some((x) => x.id === t.by);
      if (!on) {
        t.age = TOME_LIFE;
        continue;
      }
      const range = Math.max(g.shooterRange(t.by), MAIN_RANGE);
      const target = this.nearest(t.x, t.y, range);
      if (!target) {
        if (t.age > TOME_LIFE - 0.2) t.cast = true; // nothing came near: it closes unused
        continue;
      }
      // The copy: the special's own shape and power, driven by Thomas's damage, attack rate (its size) and skills.
      const radius = t.special.radius * (1 + (g.weaponStats(t.by).rate ?? 0)) * g.radiusMult(t.by);
      const dmg = t.special.damage * g.specialDamageMult(t.by);
      t.cast = this.castSpecial(t.by, t.special, t.x, t.y, target, range, radius, dmg, t.special.summon ? undefined : t.special.damageType) || t.age > TOME_LIFE - 0.2;
    }
    this.tomes = this.tomes.filter((t) => t.age < TOME_LIFE);
  }

  // ---- Cooldowns (for the battlefield's cooldown icons) ----

  /**
   * Every ability on the field that recharges, with how far along it is: Guild Hunters' specials (Andrejz's
   * potions, Glimmer's fireballs). Weapons waiting (guns reloading, staffs recharging, tomes summoning) show
   * text over the Hunter instead (see weaponStatus).
   */
  cooldowns(): CooldownView[] {
    const out: CooldownView[] = [];
    // Items' own abilities (not the weapon's basic cooldown): e.g. the Wolf Spirit tome's lunge.
    const w = this.weaponDef(this.lead);
    const dash = w?.summon?.dash;
    if (w && dash && this.game.weaponClassOf(this.lead)?.summon) out.push({ key: `item:${w.id}`, icon: w.icon, name: w.name, progress: 1 - this.dashCd / (dash.cooldown * this.game.cooldownMult(this.lead)) });
    for (const who of [this.lead, ...this.helpers.map((h) => h.id)]) {
      for (const { uid, def, effect } of this.game.gearEffects(who)) {
        const cd = effectCooldown(effect);
        if (cd === null) continue;
        const left = this.gearCd.get(`${who}:${uid}`) ?? 0;
        out.push({ key: `gear:${who}:${uid}`, icon: def.icon, name: who === 'main' ? def.name : `${hunterDef(who as HunterId).name}'s ${def.name}`, progress: 1 - Math.max(0, left) / (cd * this.game.cooldownMult(who)) });
      }
    }
    for (const h of this.helpers) {
      const hw = this.weaponDef(h.id);
      const hd = hw?.summon?.dash;
      if (hw && hd && this.game.weaponClassOf(h.id)?.summon) out.push({ key: `item:${h.id}:${hw.id}`, icon: hw.icon, name: `${hunterDef(h.id).name}'s ${hw.name}`, progress: 1 - h.dashCd / (hd.cooldown * this.game.cooldownMult(h.id)) });
      const sp = hunterDef(h.id).special;
      if (sp) out.push({ key: h.id, icon: hunterDef(h.id).icon, name: hunterDef(h.id).name, progress: 1 - Math.max(0, h.specialCd) / sp.cooldown });
      // Gideon's Bone Wall has its own cooldown (it rises when he's stunned).
      const wall = hunterDef(h.id).wall;
      if (wall) out.push({ key: `wall:${h.id}`, icon: '🦴', name: `${hunterDef(h.id).name}'s ${wall.name}`, progress: 1 - h.wallCd / wall.cooldown });
    }
    return out;
  }

  /** How far along a Hunter's gun reload is (0..1), or null when they aren't reloading a gun. */
  reloadProgress(who: Shooter): number | null {
    const st = this.weaponStatus(who);
    return st?.text === 'RELOADING!' ? st.progress : null;
  }

  /**
   * What a Hunter's weapon is waiting on, for the text over them, and how far along it is (0..1): a gun
   * "RELOADING!", a staff "RECHARGING!" its spell, or your tome "SUMMONING!" its next creature. Null otherwise.
   */
  weaponStatus(who: Shooter): { text: string; progress: number } | null {
    const gun = who === this.lead ? this.gunState : this.helpers.find((h) => h.id === who)?.gun;
    const cls = this.game.weaponClassOf(who);
    if (!gun || !cls) return null;
    if (cls.summon) {
      const h = who === this.lead ? null : this.helpers.find((x) => x.id === who);
      const acc = h ? h.fireAcc : this.fireAcc;
      const stunned = h ? h.stun > 0 : this.stunned;
      return acc < 1 && !stunned ? { text: 'SUMMONING!', progress: Math.max(0, acc) } : null;
    }
    if (!cls.mag || gun.reload <= 0 || !gun.total) return null;
    return { text: cls.spell ? 'RECHARGING!' : 'RELOADING!', progress: 1 - gun.reload / gun.total };
  }

  // ---- Attacks ----

  /**
   * Keeps a gun's magazine up to date (a new weapon starts full) and runs down its reload. Returns whether it
   * can fire now. Weapons without a magazine always can.
   */
  private gunReady(gun: GunState, cls: WeaponClassDef | null, dt: number): boolean {
    const id = cls?.mag ? cls.name : null;
    if (gun.cls !== id) Object.assign(gun, { cls: id, ammo: cls?.mag ?? 0, reload: 0 });
    if (!cls?.mag) return true;
    if (gun.reload > 0) {
      gun.reload -= dt;
      if (gun.reload > 0) return false;
      gun.ammo = cls.mag;
    }
    return true;
  }

  /** Uses a round; when the magazine runs dry, starts the reload (the class's `reload` shots' worth of time). Returns true if it just emptied. */
  private spendShot(gun: GunState, cls: WeaponClassDef | null, rate: number): boolean {
    if (!cls?.mag) return false;
    if (--gun.ammo > 0) return false;
    gun.reload = (cls.reload ?? 0) / Math.max(rate, 1e-6);
    gun.total = gun.reload;
    return true;
  }

  /** Fires a projectile (and extra Split Bow projectiles when `spread`). Damage is priced on hit, per target. */
  private shoot(
    shooter: Shooter,
    kind: BulletKind,
    ox: number,
    oy: number,
    angle: number,
    speed: number,
    range: number,
    o: { pierce?: number; spread?: boolean; dmg?: number; radius?: number; bounces?: number; slow?: number; tx?: number; ty?: number; mode?: GearMode; special?: boolean; followThrough?: number; volley?: number; stack?: number; bleed?: boolean; dtype?: DamageType; ticks?: number },
  ): void {
    const g = this.game;
    const n = o.spread ? g.projectiles : 1;
    // A weapon firing one type per projectile hands them out in turn.
    const types = !o.special && g.perShotOf(shooter, o.mode) ? g.damageTypesOf(shooter, o.mode) : null;
    for (let i = 0; i < n; i++) {
      const a = angle + (i - (n - 1) / 2) * MULTISHOT_SPREAD;
      let dtype: DamageType | undefined = o.dtype;
      if (types) {
        const turn = this.typeTurn.get(shooter) ?? 0;
        this.typeTurn.set(shooter, turn + 1);
        dtype = types[turn % types.length];
      }
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
        special: o.special,
        bleed: o.bleed,
        mode: o.mode,
        followThrough: o.followThrough,
        volley: o.volley,
        stack: o.stack,
        dtype,
        ticks: o.ticks,
      });
    }
  }

  /** Instant strike along a line (lance thrust, sniper shot): hits up to `maxHits` enemies within `width`. */
  private strikeLine(shooter: Shooter, ox: number, oy: number, a: number, len: number, width: number, maxHits: number, dmg: number, color: string, beamWidth: number, knock = 0): void {
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
    // Drawn as a spear's thrust.
    this.events.push({ type: 'beam', x1: ox, y1: oy, x2: ox + cx * end, y2: oy + cy * end, color, width: beamWidth, thrust: true });
    for (const { e } of hits) this.meleeHit(shooter, e, dmg, ox, oy, knock);
  }

  /**
   * Dagger bursts: each stab lands in turn on its monster if it's within reach (else a dagger is thrown at it);
   * the last stab knocks it back. A burst stops if its Hunter is stunned or no longer holds a dagger.
   */
  private runStabs(dt: number): void {
    if (!this.stabs.length) return;
    for (const s of this.stabs) s.t -= dt;
    const due = this.stabs.filter((s) => s.t <= 0);
    this.stabs = this.stabs.filter((s) => s.t > 0);
    for (const s of due) {
      const h = s.who === this.lead ? null : this.helpers.find((x) => x.id === s.who);
      if (s.who !== this.lead && !h) continue;
      const cls = this.game.weaponClassOf(s.who);
      if (cls?.attack !== 'dagger' || (h ? h.stun > 0 : this.stunned)) {
        this.stabs = this.stabs.filter((x) => x.who !== s.who);
        continue;
      }
      const ox = h?.x ?? 0;
      const oy = h?.y ?? 0;
      const range = this.game.shooterRange(s.who);
      const e = this.enemies.find((x) => x.id === s.target && x.hp > 0) ?? this.nearest(ox, oy, range);
      if (!e) continue;
      const a = Math.atan2(e.y - oy, e.x - ox);
      if (h) h.aim = a;
      else this.aim = a;
      const d = Math.hypot(e.x - ox, e.y - oy);
      if (d <= cls.reach! + e.r) {
        this.events.push({ type: 'beam', x1: ox, y1: oy, x2: ox + Math.cos(a) * (d - e.r * 0.3), y2: oy + Math.sin(a) * (d - e.r * 0.3), color: this.typeColor(s.who), width: 3 });
        this.meleeHit(s.who, e, 1, ox, oy, s.last ? (cls.knock ?? 0) : 0);
      } else this.shoot(s.who, 'dagger', ox, oy, a, BULLET_SPEED, range, { pierce: this.game.pierceOf(s.who) });
    }
  }

  /** The colour of the damage a Hunter's weapon deals (its first type), for tinting its attack effects. */
  private typeColor(who: Shooter, mode: GearMode = 'long'): string {
    return DAMAGE_TYPES[this.game.damageTypeOf(who, mode)].color;
  }

  // ---- Gear abilities (accessories and rarer armor): their own base damage, the wearer's bonuses ----

  /** Is a Hunter's weapon a melee one (for melee-only gear abilities)? */
  private isMelee(who: Shooter): boolean {
    return this.weaponDef(who)?.kind === 'melee';
  }

  /** One gear-ability hit: its own base damage × the wearer's bonuses (not their weapon), and its type. */
  private abilityHit(who: Shooter, e: Enemy, base: number, dtype: DamageType, status: boolean): void {
    if (e.hp <= 0 || base <= 0) return;
    const crit = this.game.rng() < this.game.critChanceOf(who);
    const amount = base * this.game.abilityMult(who, enemyDef(e.type).archetype) * this.typeMultOn(dtype, e) * this.game.typeBonus(who, dtype) * (crit ? this.game.critMultOf(who) : 1);
    this.damage(e, amount, crit, 0, 0, who, dtype);
    if (status) this.applyStatus(e, dtype, amount, who);
  }

  /** A gear burst around a point: every monster within `r` is hit (and gets its type's effect). */
  private abilityBurst(who: Shooter, x: number, y: number, r: number, base: number, dtype: DamageType): void {
    this.events.push({ type: 'nova', x, y, r, color: DAMAGE_TYPES[dtype].color });
    for (const e of [...this.enemies]) if (e.hp > 0 && Math.hypot(e.x - x, e.y - y) <= r + e.r) this.abilityHit(who, e, base, dtype, true);
  }

  /** A melee attack with a wave-sending accessory (the Flame Brand): sometimes a wave bursts out. */
  private meleeWave(who: Shooter, x: number, y: number): void {
    for (const { effect: ef, stars } of this.game.gearEffects(who))
      if (ef.kind === 'wave' && this.game.rng() < ef.chance) this.abilityBurst(who, x, y, ef.radius, effectBase(ef, stars), ef.damageType);
  }

  /**
   * Abilities that run on their own: summons, pulses and lightning strikes recharge (a Hunter that's stunned
   * still recharges, but only acts once they're up), and chill auras slow everything near the wearer.
   */
  private runGearEffects(dt: number): void {
    const wearers: Array<{ who: Shooter; x: number; y: number; stunned: boolean }> = [
      { who: this.lead, x: 0, y: 0, stunned: this.stunned },
      ...this.helpers.map((h) => ({ who: h.id as Shooter, x: h.x, y: h.y, stunned: h.stun > 0 })),
    ];
    for (const w of wearers) {
      for (const { uid, effect: ef, stars } of this.game.gearEffects(w.who)) {
        if (ef.kind === 'chill') {
          for (const e of this.enemies) if (!e.boss && !this.immuneTo(e, 'frost') && Math.hypot(e.x - w.x, e.y - w.y) <= ef.radius + e.r) e.slow = Math.max(e.slow ?? 0, 0.2);
          continue;
        }
        const cd = effectCooldown(ef);
        if (cd === null) continue;
        const key = `${w.who}:${uid}`;
        const left = Math.max(0, (this.gearCd.get(key) ?? 0) - dt);
        this.gearCd.set(key, left);
        if (left > 0 || w.stunned) continue;
        if (this.fireGear(w.who, w.x, w.y, ef, stars, uid)) this.gearCd.set(key, cd * this.game.cooldownMult(w.who));
      }
    }
  }

  /** Sets off a recharging gear ability. Returns false (staying ready) when there's nothing to use it on. */
  private fireGear(who: Shooter, x: number, y: number, ef: GearEffect, stars: number, uid: number): boolean {
    const base = effectBase(ef, stars);
    switch (ef.kind) {
      case 'pulse':
        if (!this.nearest(x, y, ef.radius)) return false;
        this.abilityBurst(who, x, y, ef.radius, base, ef.damageType);
        return true;
      case 'summon': {
        if (!this.nearest(x, y, 2000)) return false;
        for (let i = 0; i < ef.count; i++) {
          const a = (i / ef.count) * Math.PI * 2 + this.game.rng();
          this.summons.push({ who, type: ef.type, x: x + Math.cos(a) * 22, y: y + Math.sin(a) * 22, life: ef.duration * this.game.summonDurationMult(who), maxLife: ef.duration * this.game.summonDurationMult(who), bite: 0, look: ef.look, dash: 0, dashHit: false, gear: { uid, base, damageType: ef.damageType, bites: ef.bites, speed: ef.speed } });
        }
        this.events.push({ type: 'nova', x, y, r: 30, color: '#d8a878' });
        return true;
      }
      case 'strike': {
        // Lightning from above: random monsters in range, each bolt arcing on (Lightning's effect).
        const near = this.enemies.filter((e) => e.hp > 0 && !e.fleeing && Math.hypot(e.x - x, e.y - y) <= ef.range + e.r);
        if (!near.length) return false;
        for (let i = 0; i < ef.targets && near.length; i++) {
          const e = near.splice(Math.floor(this.game.rng() * near.length), 1)[0];
          this.events.push({ type: 'beam', x1: e.x + (this.game.rng() - 0.5) * 60, y1: e.y - 220, x2: e.x, y2: e.y, color: DAMAGE_TYPES[ef.damageType].color, width: 3, zigzag: true });
          this.abilityHit(who, e, base, ef.damageType, true);
        }
        return true;
      }
      default:
        return false;
    }
  }

  /** The gear in a Hunter's weapon slot, if any. */
  private weaponDef(who: Shooter): GearDef | null {
    const w = this.game.weaponItem(who);
    return w ? gearDef(w.base) : null;
  }

  /** A tome's creature appears beside the Hunter holding it. */
  private summon(who: Shooter, ox: number, oy: number, aim: number, cls: WeaponClassDef): void {
    const sm = cls.summon!;
    const def = this.weaponDef(who);
    const look = def?.summon?.look ?? 'wisp';
    this.summons.push({ who, type: def ? tomeSummonType(def) : 'spirit', x: ox + Math.cos(aim) * 20, y: oy + Math.sin(aim) * 20, life: sm.duration * this.game.summonDurationMult(who), maxLife: sm.duration * this.game.summonDurationMult(who), bite: 0, look, dash: 0, dashHit: false });
    this.events.push({ type: 'nova', x: ox, y: oy, r: 30, color: '#c9a8ff' });
  }

  /**
   * Tome creatures: each heads for the nearest monster and bites it while in reach, until it fades. A tome with
   * a lunge ability (the Wolf Spirit) sends them all lunging at their monsters when it's off cooldown; a lunge
   * that lands bites extra hard.
   */
  private runSummons(dt: number): void {
    this.dashCd = Math.max(0, this.dashCd - dt);
    for (const h of this.helpers) h.dashCd = Math.max(0, h.dashCd - dt);
    if (!this.summons.length) return;
    // A creature fades at once if its Hunter put the tome (or the piece that made it) away, or left the area.
    this.summons = this.summons.filter(
      (s) =>
        (s.who === this.lead || this.helpers.some((h) => h.id === s.who)) &&
        (s.own || (s.gear ? this.game.equipped(s.who).some((it) => it?.uid === s.gear!.uid) : this.game.weaponClassOf(s.who)?.summon)),
    );
    for (const who of new Set(this.summons.filter((s) => !s.gear && !s.own).map((s) => s.who))) {
      const dash = this.weaponDef(who)?.summon?.dash;
      const owner: { dashCd: number } = who === this.lead ? this : this.helpers.find((h) => h.id === who)!;
      if (!dash || owner.dashCd > 0) continue;
      let lunged = false;
      for (const s of this.summons) {
        if (s.who !== who || s.gear || s.own) continue;
        const e = this.nearest(s.x, s.y, dash.range);
        if (!e || s.dash > 0) continue;
        s.dash = dash.range / dash.speed + 0.05;
        s.dashHit = false;
        lunged = true;
      }
      if (lunged) owner.dashCd = dash.cooldown * this.game.cooldownMult(who);
    }
    for (const s of this.summons) {
      const sm = s.gear ?? s.own ?? this.game.weaponClassOf(s.who)!.summon!;
      const dash = s.gear || s.own ? undefined : this.weaponDef(s.who)?.summon?.dash;
      s.life -= dt;
      s.dash = Math.max(0, s.dash - dt);
      const e = this.nearest(s.x, s.y, 2000);
      if (!e) continue;
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      const d = Math.hypot(dx, dy) || 1;
      const reach = SUMMON_RADIUS + e.r;
      if (d > reach) {
        const step = Math.min((s.dash > 0 && dash ? dash.speed : sm.speed) * dt, d - reach + 1);
        s.x += (dx / d) * step;
        s.y += (dy / d) * step;
      }
      if (s.dash > 0 && dash && !s.dashHit && Math.hypot(e.x - s.x, e.y - s.y) <= reach + 2) {
        // The lunge lands: a big bite, and the lunge is spent.
        s.dashHit = true;
        s.dash = 0;
        this.hitWith(s.who, e, dash.damage * this.game.summonMult(s.who, s.type), s.x, s.y);
      }
      if (d <= reach + 2) {
        s.bite += dt * sm.bites;
        while (s.bite >= 1 && e.hp > 0) {
          s.bite -= 1;
          const m = this.game.summonMult(s.who, s.type);
          if (s.gear) this.abilityHit(s.who, e, s.gear.base * m, s.gear.damageType, false);
          // A Hunter's own creatures bite with their weapon's type, and can inflict its status effect.
          else if (s.own) this.hitWith(s.who, e, s.own.mult * m, s.x, s.y, undefined, undefined, true);
          else this.hitWith(s.who, e, m, s.x, s.y);
        }
      } else s.bite = Math.min(s.bite + dt * sm.bites, 1);
    }
    this.summons = this.summons.filter((s) => s.life > 0);
  }

  /** A melee hit: damage, then a knock back if the monster survives (Guardians hold their ground). */
  private meleeHit(shooter: Shooter, e: Enemy, dmg: number, ox: number, oy: number, knock: number): void {
    this.hitWith(shooter, e, dmg, ox, oy);
    if (knock <= 0 || e.hp <= 0 || e.boss) return;
    const d = Math.hypot(e.x - ox, e.y - oy) || 1;
    e.kx += ((e.x - ox) / d) * knock;
    e.ky += ((e.y - oy) / d) * knock;
  }

  /** Instant strike in an arc in front (sword sweep, glaive cleave): hits every enemy within `reach` and `arc`. */
  /** A strike across an arc (a blade's sweep, Sciirj's punch); `blade` draws it as a blade's swing, in `color`. */
  private strikeArc(shooter: Shooter, ox: number, oy: number, a: number, reach: number, arc: number, dmg: number, knock = 0, blade = false, color = '#f4f4f4'): void {
    this.events.push({ type: 'sweep', x: ox, y: oy, a, arc, r: reach, color, heavy: knock >= 300, blade });
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const dx = e.x - ox;
      const dy = e.y - oy;
      if (Math.hypot(dx, dy) > reach + e.r) continue;
      let da = Math.atan2(dy, dx) - a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) <= arc / 2) this.meleeHit(shooter, e, dmg, ox, oy, knock);
    }
  }

  /**
   * One hit from a shooter, priced by their damage vs the enemy's archetype. Every bonus multiplies: archetype
   * bonuses (banes) × the monster's weakness or resistance to the type × the shooter's bonus to that type.
   * A multi-type weapon splits the hit evenly between its types, each priced and rolling its status effect
   * on its own; `only` is a projectile's single type (weapons that fire one type per projectile).
   */
  private hitWith(
    shooter: Shooter,
    e: Enemy,
    mult: number,
    fromX: number,
    fromY: number,
    crit = this.game.rng() < this.game.critChanceOf(shooter),
    mode?: GearMode,
    special = false,
    status = true,
    only?: DamageType,
  ): void {
    const g = this.game;
    const types = only ? [only] : g.damageTypesOf(shooter, mode, special);
    const base = (g.shotDamage(shooter, enemyDef(e.type).archetype, mode) * mult * (crit ? g.critMultOf(shooter) : 1)) / types.length;
    const d = Math.hypot(e.x - fromX, e.y - fromY) || 1;
    for (const t of types) {
      const dmg = base * this.typeMultOn(t, e) * g.typeBonus(shooter, t);
      this.damage(e, dmg, crit, (e.x - fromX) / d, (e.y - fromY) / d, shooter, t);
      // Each type rolls its own effect (an infused type at its infusion's chance).
      if (status && g.rng() < g.procFor(shooter, t, mode, special)) this.applyStatus(e, t, dmg, shooter, g.procRarity(shooter, mode, special));
    }
  }

  /** Weakness/resistance multiplier, with resistances ignored while the monster is exposed (Arcane). */
  private typeMultOn(dtype: DamageType, e: Enemy): number {
    const m = typeMult(dtype, e.type);
    return e.exposed && m < 1 ? 1 : m;
  }

  /** Fixed damage of a type to every monster within `r` of a point (bursts, auras, acid). */
  private hitArea(x: number, y: number, r: number, amount: number, dtype: DamageType, by: Shooter, except?: Enemy): void {
    for (const o of this.enemies) if (o !== except && o.hp > 0 && Math.hypot(o.x - x, o.y - y) <= r + o.r) this.damage(o, amount * this.typeMultOn(dtype, o), false, 0, 0, by, dtype);
  }

  /**
   * A proc'd status effect. Fire burns, Poison poisons, Frost chills, Acid drops a puddle, Radiant bursts,
   * Decay gives the monster a dark aura, Arcane strips its resistances. Timed effects refresh rather than stack.
   */
  /** A monster that resists a damage type is immune to its status effect (unless Arcane has stripped its resistances). */
  private immuneTo(e: Enemy, dtype: DamageType): boolean {
    return this.typeMultOn(dtype, e) < 1;
  }

  /**
   * A guaranteed bleed (Themus's Crimson Wave and blood bolts), unless the monster is immune to Physical: sized,
   * like any bleed, from the hit that caused it (`mult` × the Hunter's shot damage on this monster).
   */
  private bleed(e: Enemy, by: Shooter, mult: number): void {
    this.applyStatus(e, 'physical', this.game.shotDamage(by, enemyDef(e.type).archetype) * mult, by);
  }

  private applyStatus(e: Enemy, dtype: DamageType, dmg: number, by: Shooter, rarity: Rarity = 'common'): void {
    // Virulence: damaging effects hit harder; the others last longer (or pull harder).
    const k = this.game.statusStrength(by);
    dmg *= k;
    if (this.immuneTo(e, dtype)) return;
    const dot = (cur: Dot | undefined, share: number, duration: number): Dot => {
      const dps = (dmg * share) / duration;
      const ticks = Math.round(duration / STATUS.tick);
      return cur && cur.left > 0 && cur.dps > dps ? { ...cur, left: duration, ticks } : { dps, left: duration, by, acc: cur?.acc ?? 0, ticks };
    };
    // Every effect but bleeding is one instance per monster: a new proc refreshes it (keeping the stronger).
    switch (dtype) {
      case 'physical':
        if (e.hp > 0) {
          const b = STATUS.bleed;
          e.bleeds = [...(e.bleeds ?? []), dot(undefined, b.share, b.duration)].slice(-b.maxStacks);
        }
        break;
      case 'fire':
        if (e.hp > 0) e.burn = dot(e.burn, STATUS.burn.share, STATUS.burn.duration);
        break;
      case 'poison':
        if (e.hp > 0) {
          const p = STATUS.poison;
          e.poison = dot(e.poison, p.share, p.duration);
          const pct = p.maxHp[rarity] * (e.boss ? p.guardian : 1) * k;
          e.poison.maxHpPerTick = Math.max(e.poison.maxHpPerTick ?? 0, pct / e.poison.ticks);
        }
        break;
      case 'frost':
        e.slow = Math.max(e.slow ?? 0, STATUS.chill.duration * k);
        break;
      case 'acid':
        if (e.acidPuddle && e.acidPuddle.life > 0) {
          // Its puddle is still there: refresh it where the monster is now, at the stronger strength.
          Object.assign(e.acidPuddle, { x: e.x, y: e.y, life: STATUS.acid.duration, shooter: by, abs: Math.max(e.acidPuddle.abs ?? 0, dmg * STATUS.acid.share) });
        } else {
          e.acidPuddle = { shooter: by, x: e.x, y: e.y, r: STATUS.acid.radius, life: STATUS.acid.duration, tick: 0, dmg: 0, abs: dmg * STATUS.acid.share, dtype: 'acid' };
          this.puddles.push(e.acidPuddle);
        }
        break;
      case 'radiant':
        this.events.push({ type: 'explode', x: e.x, y: e.y, r: STATUS.burst.radius, color: DAMAGE_TYPES.radiant.color });
        this.hitArea(e.x, e.y, STATUS.burst.radius, dmg * STATUS.burst.share, 'radiant', by, e);
        break;
      case 'decay':
        // Per tick, `share` of the hit to everything around it: stored as damage per second.
        if (e.hp > 0) {
          const dps = (dmg * STATUS.aura.share) / STATUS.tick;
          const ticks = Math.round(STATUS.aura.duration / STATUS.tick);
          e.aura = e.aura && e.aura.dps > dps ? { ...e.aura, left: STATUS.aura.duration, ticks } : { dps, left: STATUS.aura.duration, by, acc: e.aura?.acc ?? 0, ticks };
        }
        break;
      case 'arcane':
        e.exposed = STATUS.expose.duration * k;
        break;
      case 'lightning':
        this.arc(e, dmg * STATUS.arc.share, by);
        break;
      case 'void':
        if (e.hp > 0) {
          e.well = STATUS.well.duration * k;
          e.wellPull = k;
        }
        break;
    }
  }

  /**
   * Lightning: a bolt jumps from a monster to another creature within the arc radius (picked at random), and
   * strikes it and every creature whose body the bolt passes through on the way.
   */
  private arc(from: Enemy, amount: number, by: Shooter): void {
    const r = STATUS.arc.radius;
    const near = this.enemies.filter((o) => o !== from && o.hp > 0 && Math.hypot(o.x - from.x, o.y - from.y) <= r + o.r);
    if (!near.length) return;
    const to = near[Math.floor(this.game.rng() * near.length)];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len2 = dx * dx + dy * dy || 1;
    this.events.push({ type: 'beam', x1: from.x, y1: from.y, x2: to.x, y2: to.y, color: DAMAGE_TYPES.lightning.color, width: 2.5, zigzag: true });
    for (const o of near) {
      // Closest point on the bolt to this creature: struck if the bolt crosses its body.
      const t = Math.max(0, Math.min(1, ((o.x - from.x) * dx + (o.y - from.y) * dy) / len2));
      if (o !== to && Math.hypot(from.x + dx * t - o.x, from.y + dy * t - o.y) > o.r) continue;
      this.damage(o, amount * this.typeMultOn('lightning', o), false, 0, 0, by, 'lightning');
    }
  }

  /**
   * Void's gravity well: monsters around `e` are drawn in toward it until they touch it. Guardians and
   * monsters that resist Void aren't moved.
   */
  private pullIn(e: Enemy, dt: number): void {
    const w = STATUS.well;
    for (const o of this.enemies) {
      if (o === e || o.hp <= 0 || o.boss || this.immuneTo(o, 'void')) continue;
      const dx = e.x - o.x;
      const dy = e.y - o.y;
      const d = Math.hypot(dx, dy);
      const gap = d - e.r - o.r;
      if (d > w.radius + o.r || gap <= 0) continue;
      const step = Math.min(gap, w.pull * (e.wellPull ?? 1) * dt);
      o.x += (dx / d) * step;
      o.y += (dy / d) * step;
    }
  }

  /** Focus waves expand; each monster the ring reaches is hit once. */
  private runWaves(dt: number): void {
    for (const w of this.waves) {
      w.r = Math.min(w.max, w.r + WAVE_SPEED * dt);
      for (const e of this.enemies)
        if (e.hp > 0 && !w.hit.has(e.id) && Math.hypot(e.x - w.x, e.y - w.y) <= w.r + e.r) {
          w.hit.add(e.id);
          this.hitWith(w.who, e, 1, w.x, w.y);
        }
    }
    this.waves = this.waves.filter((w) => w.r < w.max);
  }

  /** A burning monster can set the ones right next to it alight, weaker each time it spreads. */
  private spreadBurn(e: Enemy, d: Dot): void {
    const b = STATUS.burn;
    for (const o of this.enemies) {
      if (o === e || o.hp <= 0 || o.burn || this.immuneTo(o, 'fire')) continue;
      if (Math.hypot(o.x - e.x, o.y - e.y) > e.r + o.r + b.spreadRadius || this.game.rng() >= b.spreadChance) continue;
      o.burn = { dps: d.dps * b.spreadFalloff, left: b.duration, by: d.by, acc: 0, ticks: Math.round(b.duration / STATUS.tick) };
    }
  }

  /** Ticks burns, poisons and dark auras, runs down Arcane exposure, and pulls monsters into Void's gravity wells. */
  private tickStatus(e: Enemy, dt: number): void {
    if (e.exposed) e.exposed = Math.max(0, e.exposed - dt);
    if (e.well) {
      e.well = Math.max(0, e.well - dt);
      this.pullIn(e, dt);
    }
    if (e.bleeds?.length) {
      // Each bleed ticks on its own.
      for (const d of e.bleeds) {
        d.left -= dt;
        d.acc += dt;
        while (d.acc >= STATUS.tick - 1e-9 && d.ticks > 0 && e.hp > 0) {
          d.acc -= STATUS.tick;
          d.ticks--;
          this.damage(e, d.dps * STATUS.tick, false, 0, 0, d.by, 'physical');
        }
      }
      e.bleeds = e.bleeds.filter((d) => d.ticks > 0 && !(d.left <= 0 && d.acc < STATUS.tick));
    }
    for (const [key, dtype] of [['burn', 'fire'], ['poison', 'poison'], ['aura', 'decay']] as const) {
      const d = e[key];
      if (!d) continue;
      d.left -= dt;
      d.acc += dt;
      while (d.acc >= STATUS.tick - 1e-9 && d.ticks > 0 && e.hp > 0) {
        d.acc -= STATUS.tick;
        d.ticks--;
        if (key === 'aura') this.hitArea(e.x, e.y, STATUS.aura.radius, d.dps * STATUS.tick, 'decay', d.by, e);
        else this.damage(e, d.dps * STATUS.tick + (d.maxHpPerTick ?? 0) * e.maxHp, false, 0, 0, d.by, dtype);
        if (key === 'burn') this.spreadBurn(e, d);
      }
      if (d.ticks <= 0 || (d.left <= 0 && d.acc < STATUS.tick)) e[key] = undefined;
    }
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
          const ticks = b.ticks ?? (b.shooter === 'main' ? undefined : hunterDef(b.shooter).special?.ticks) ?? 6;
          this.puddles.push({ shooter: b.shooter, x: b.tx ?? b.x, y: b.ty ?? b.y, r: b.radius ?? 40, life: ticks * PUDDLE_TICK, tick: 0, dmg: b.dmg, dtype: b.dtype });
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
        if (b.followThrough) {
          // A longbow arrow drives on through its target a short way, hitting anything just behind.
          b.life = b.followThrough / Math.hypot(b.vx, b.vy);
          b.pierce = Infinity;
          b.followThrough = undefined;
        } else if (b.life > 0 && b.pierce-- <= 0) b.life = 0;
      }
    }
  }

  private bulletHit(b: Bullet, e: Enemy): void {
    if (b.kind === 'blood') {
      // A blood bolt: Themus's special damage, and a bleed.
      this.hitWith(b.shooter, e, b.dmg, b.x - b.vx, b.y - b.vy, b.crit, b.mode, true, true);
      this.bleed(e, b.shooter, b.dmg);
      b.life = 0;
      return;
    }
    if (b.kind === 'fireball') {
      const r = b.radius ?? 50;
      this.events.push({ type: 'explode', x: b.x, y: b.y, r, color: '#ff8a3d' });
      for (const o of this.enemies) if (o.hp > 0 && Math.hypot(o.x - b.x, o.y - b.y) <= r + o.r) this.hitWith(b.shooter, o, b.dmg, b.x, b.y, b.crit, b.mode, b.special, true, b.dtype);
      b.life = 0;
      return;
    }
    let mult = b.dmg;
    if (b.volley) {
      // Each extra bolt of the same volley on this monster hits harder (×1.5, ×2, ...).
      e.volleyHits = e.volley === b.volley ? (e.volleyHits ?? 0) + 1 : 0;
      e.volley = b.volley;
      mult *= 1 + (b.stack ?? 0) * e.volleyHits;
    }
    this.hitWith(b.shooter, e, mult, b.x - b.vx, b.y - b.vy, b.crit, b.mode, false, true, b.dtype);
    if (b.kind === 'hammer' && b.slow) e.slow = Math.max(e.slow ?? 0, b.slow);
    if ((b.bounces ?? 0) > 0) {
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
      if (p.abs !== undefined) this.hitArea(p.x, p.y, p.r, p.abs, p.dtype ?? 'acid', p.shooter);
      else for (const e of this.enemies) if (e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) <= p.r + e.r) this.hitWith(p.shooter, e, p.dmg, p.x, p.y, undefined, undefined, true, false, p.dtype);
    }
    this.puddles = this.puddles.filter((p) => p.life > 0);
  }

  private damage(e: Enemy, dmg: number, crit: boolean, dirX: number, dirY: number, shooter: Shooter = 'main', dtype: DamageType = 'physical'): void {
    if (e.hp <= 0) return;
    e.hp -= dmg;
    e.flash = 1;
    if (!e.boss) {
      e.kx += dirX * 90;
      e.ky += dirY * 90;
    }
    this.events.push({ type: 'hit', x: e.x, y: e.y - e.r, dmg, crit, dtype, affinity: affinity(dtype, e.type) });
    // Some Guardians are beaten before their HP runs out (the Time Eater: at half).
    if (e.boss && e.hp > 0 && e.hp <= e.maxHp * (enemyDef(e.type).winAt ?? 0)) e.hp = 0;
    if (e.hp <= 0) {
      const reward = this.game.registerKill(e.type, e.boss, shooter);
      // Fireburst (an enchantment): monsters the weapon kills burst, hurting everything around them.
      const burst = this.game.killBurst(shooter);
      if (burst && this.game.rng() < burst.chance) this.abilityBurst(shooter, e.x, e.y, burst.radius, burst.base, burst.damageType);
      this.events.push({ type: 'kill', x: e.x, y: e.y, enemy: e.type, boss: e.boss, reward });
    }
  }

  /** Tap blast at a world position: damages every enemy in the radius. Works even while stunned. */
  tap(x: number, y: number): void {
    const g = this.game;
    g.registerTap();
    const ability = g.tapAbility;
    this.events.push({ type: 'blast', x, y, color: ability ? DAMAGE_TYPES[g.tapDamageType].color : undefined });
    const crit = g.rng() < g.critChanceOf('main');
    const dmg = g.tapDamage * (crit ? g.critMultOf('main') : 1);
    const dtype = g.tapDamageType;
    const hit: Array<{ e: Enemy; dmg: number }> = [];
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = Math.hypot(dx, dy);
      if (d > g.tapRadius + e.r) continue;
      const amount = dmg * this.typeMultOn(dtype, e) * g.typeBonus('main', dtype);
      this.damage(e, amount, crit, dx / (d || 1), dy / (d || 1), 'main', dtype);
      hit.push({ e, dmg: amount });
    }
    // An elemental tap ability sets off its effect on everything the blast hit.
    for (const { e, dmg: amount } of hit) {
      if (ability === 'flame' && e.hp > 0) this.applyStatus(e, 'fire', amount, 'main');
      else if (ability === 'frost' && e.hp > 0 && !this.immuneTo(e, 'frost')) e.slow = Math.max(e.slow ?? 0, FROST_TAP_CHILL);
      else if (ability === 'thunder' && !this.immuneTo(e, 'lightning')) this.arc(e, amount * STATUS.arc.share, 'main');
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }
}
