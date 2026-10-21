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
  MIASMA_PUDDLE,
  SPELLS,
  RISEN,
  ANCHOR_COLLAPSE,
  PLAGUE_SPREAD,
  BOULDER,
  MELEE_ARTS,
  PASSIVE_ARTS,
  type SpellId,
  type UniqueId,
  TYPE_SPELLS,
  type MeleeArt,
  FLAME_BURST_COOLDOWN,
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
  STUN_IMMUNITY,
  SHIELD_DEFLECT_PAUSE,
  type EnemyId,
  type HunterId,
  type HunterSpecial,
  HUNTERS,
  artScale,
  GOLDEN_GOLD,
  GOLDEN_ODDS,
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
/** Apex Hunter: how soon a melee attack's follow-up strike comes after it (seconds). */
const ENCORE_GAP = 0.12;
/** Apex Hunter: how far apart (radians) a shot's extra projectiles fan out. */
const EXTRA_SHOT_SPREAD = 0.12;
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
  /** How big its art is drawn (artScale: 0.5 to 1.5, mostly near 1); its hit size doesn't change. */
  scale?: number;
  /** A gold monster (1 in GOLDEN_ODDS): GOLDEN_GOLD × the gold and GOLDEN_DROPS × the drop chance. */
  golden?: boolean;
  /**
   * Charmed by Norm (or a copy of his Smooth Talk): for `left` seconds it hunts the nearest other monster instead
   * of the Hunters, biting it every CHARM_BITE seconds for `frac` of its own max health, credited to `by`.
   */
  charm?: { left: number; by: Shooter; frac: number; bite: number };
  /** Seconds left pinned in place by Gideon's bone spikes (it can't move, though hits still knock it). */
  held?: number;
  /** Hunter's Mark: for `left` seconds every Hunter deals +`bonus` damage to it. */
  mark?: { left: number; bonus: number };
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
  /** Plague (a spell): for `left` seconds it poisons every monster it touches for `amount` × PLAGUE_SPREAD. */
  plague?: { left: number; by: Shooter; amount: number };
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
  look: 'wisp' | 'wolf' | 'puppet' | 'rock';
  /** What kind of creature it is (some Hunters' summons of a type hit harder). */
  type: SummonType;
  /** A gear ability's creature (a Puppeteer's Doll's puppets): the piece that made it and its own bite. */
  gear?: { uid: number; base: number; damageType: DamageType; bites: number; speed: number };
  /** Raised by Raise Dead: bites for the spell's cast × RISEN.k; `enemy` is what it was. */
  risen?: { c: SpellCast; enemy: EnemyId };
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
  /** Seconds since the last reload finished (Steady Aim). */
  steady?: number;
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

export type BulletKind = 'slash' | 'bigDagger' | 'rock' | 'spell' | 'blood' | 'bolt' | 'spark' | 'arrow' | 'fireball' | 'potion' | 'pellet' | 'dagger' | 'pistol' | 'ricochet' | 'hammer';

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
  /** A spell's projectile: its cast, and the share of it each hit deals. */
  cast?: SpellCast;
  k?: number;
  /** A big projectile (a sword's wave, a spectral dagger): how far from its centre it hits. */
  size?: number;
  /** Blast Daggers, Exploding Ammo and Arrows: explodes where it hits, for `k` × a hit within `r`. */
  blast?: { r: number; k: number };
  /** Elemental Arrows: bursts with its element's effect where it hits, at this × a hit. */
  elem?: number;
  /** Other ranged arts riding on it (see MeleeArt): what it does when it hits, or misses. */
  arts?: ShotArts;
}

/** Ranged arts a projectile carries. */
/** What shotArts hands each projectile. */
type ShotOptions = { dmg?: number; blast?: { r: number; k: number }; elem?: number; arts?: ShotArts; critBonus?: number };

export interface ShotArts {
  overpen?: boolean;
  ricochet?: boolean;
  /** Suppressing Fire: seconds of half speed. */
  slowHit?: number;
  /** Volley of Rain: × a hit per arrow of the rain. */
  rain?: number;
  /** Hunter's Mark: the bonus the mark gives. */
  mark?: number;
  /** Pinning Bolt: seconds pinned. */
  pin?: number;
  harpoon?: boolean;
}

/** A spell being cast: by whom, of what element, and how hard (a staff's shot multiple, or an enchantment's base damage). */
export interface SpellCast {
  who: Shooter;
  dtype: DamageType;
  mult?: number;
  base?: number;
  mode?: GearMode;
}

/** A spell's hit a moment from now (an ice spike, a sunbeam pulse, a lightning strike from the sky). */
export interface SpellHit {
  c: SpellCast;
  t: number;
  x: number;
  y: number;
  r: number;
  k: number;
  fx?: 'spike' | 'sun' | 'storm' | 'rock' | 'shock' | 'arrows';
}

/** Earthshatter: a crack in the ground from (x1, y1) to (x2, y2), hurting monsters on it each tick for `power` × a hit. */
export interface Fissure {
  who: Shooter;
  mode?: GearMode;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  life: number;
  tick: number;
  power: number;
  color: string;
}

/** A spell that lingers: an acid cloud, a drifting poison mist, cursed ground, a gravity anchor. */
export interface SpellZone {
  kind: SpellId;
  c: SpellCast;
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  tick: number;
  k: number;
  /** Poison Mist: when (by its life) it last poisoned each monster. */
  touched: Map<number, number>;
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

/** A pair of Ted's dice in the air or settling: thrown from (x0, y0) to land at (x1, y1), showing `faces`. */
export interface DiceThrow {
  by: Shooter;
  special: HunterSpecial;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  faces: [number, number];
  /** Which of the four turns of each landed face the sheet shows. */
  turns: [number, number];
  age: number;
  landed: boolean;
  radius: number;
  dmg: number;
  only?: DamageType;
  id: number;
}

/** Seconds Ted's dice fly before landing (they bounce in the last part), and how long they lie there after. */
export const DICE_FLIGHT = 0.7;
export const DICE_REST = 0.8;
/** Seconds snake eyes leave Ted dazed. */
export const SNAKE_EYES_DAZE = 1.5;

/** Norm's Smooth Talk: how many monsters one cast charms, for how long, and how often each bites. */
export const CHARM_MAX = 1;
export const CHARM_TIME = 6;
export const CHARM_BITE = 1;

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
  /** A spell's puddle (Acid Pool): each tick is `k` of its cast. */
  cast?: SpellCast;
  k?: number;
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
  /** `magic`: a spell's blast, which sounds like its element rather than a plain explosion. */
  | { type: 'explode'; x: number; y: number; r: number; color: string; magic?: DamageType }
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
  | { type: 'deflect'; who: Shooter; x: number; y: number; a: number }
  /** Floating words on the field: a dice roll's call, Double or Nothing's ×2 / BUST. */
  | { type: 'say'; x: number; y: number; text: string; color: string; size: number }
  /** A spell's moment: an ice spike, a fan of frost, a sunbeam, an acid drop, an anchor landing, the dead rising. */
  | { type: 'spell'; fx: 'spike' | 'cone' | 'sun' | 'drop' | 'anchor' | 'rise' | 'rock' | 'break' | 'shock' | 'arrows'; x: number; y: number; r: number; color: string; a?: number; arc?: number };

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
  /** Ted's dice, in the air or lying where they landed (see rollDice). */
  dice: DiceThrow[] = [];
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
  /** Apex Hunter's follow-up strikes, due in `t` seconds. */
  private encores: Array<{ who: Shooter; t: number; target: number; mode: GearMode }> = [];
  /** Seconds until each worn piece's ability is ready again, by `${who}:${uid}`. */
  private gearCd = new Map<string, number>();
  /** Creatures your Hunter's tome has summoned. */
  summons: Summon[] = [];
  /** Spells' hits still to land, and the spells lingering on the field. */
  spellHits: SpellHit[] = [];
  zones: SpellZone[] = [];
  /** Earthshatter's fissures: cracks in the ground hurting the monsters on them. */
  fissures: Fissure[] = [];
  /** Bloodthirst: seconds of faster attacks left, and how much faster, per Hunter. */
  private frenzy = new Map<Shooter, number>();
  private frenzyBonus = new Map<Shooter, number>();
  /** Quick Draw: each Hunter's kill streak stacks and seconds left on it. */
  private quickDraw = new Map<Shooter, { stacks: number; left: number; per: number }>();
  /** Momentum: each Hunter's current spear target and stacks on it. */
  private momentum = new Map<Shooter, { target: number; stacks: number }>();
  /** Each Hunter's melee arts this frame (looked up on every hit, so kept for the frame). */
  private artCache = new Map<string, Array<{ art: MeleeArt; chance: number; power: number }>>();
  /** Seconds until your tome's creatures can lunge again (a tome with a lunge ability, e.g. the Wolf Spirit). */
  dashCd = 0;
  /** Seconds until a tap with Melting Miasma equipped can leave another poison puddle. */
  miasmaCd = 0;
  flameCd = 0;
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
    this.spellHits = [];
    this.zones = [];
    this.fissures = [];
    this.tomes = [];
    this.dice = [];
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
      ...(boss ? {} : { scale: artScale(g.rng(), g.rng(), g.rng()), ...(g.rng() >= 1 - 1 / GOLDEN_ODDS ? { golden: true } : {}) }),
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
    this.artCache.clear();
    for (const [who, t] of this.frenzy) if (t - dt > 0) this.frenzy.set(who, t - dt);
    else this.frenzy.delete(who);
    for (const [who, q] of this.quickDraw) if ((q.left -= dt) <= 0) this.quickDraw.delete(who);

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
    this.fireAcc = Math.min(this.fireAcc + dt * g.shooterRate(this.lead) * this.frenzyMult(this.lead), 3);
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
    this.runDice(dt);
    this.runStabs(dt);
    this.runEncores(dt);
    this.runSpells(dt);
    this.runSummons(dt);
    this.runGearEffects(dt);
    for (const h of this.helpers) this.helperAttack(h, dt);

    this.moveBullets(dt);
    this.tickPuddles(dt);
    this.miasmaCd = Math.max(0, this.miasmaCd - dt);
    this.flameCd = Math.max(0, this.flameCd - dt);
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
      if (e.mark && (e.mark.left -= dt) <= 0) e.mark = undefined;
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
      } else if (e.charm) {
        this.charmed(e, speed, dt);
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
    // Riposte: a melee Hunter may strike first, with a critical hit; if that kills it, it never lands its blow.
    const riposte = this.arts(who).find((a) => a.art === 'riposte');
    if (riposte && !(helper ? helper.stun > 0 : this.stunned) && this.game.rng() < riposte.chance) {
      this.events.push({ type: 'attack', who, a: Math.atan2(e.y - hy, e.x - hx) });
      this.events.push({ type: 'say', x: hx, y: hy - 30, text: 'RIPOSTE', color: '#fff4d0', size: 11 });
      this.hitWith(who, e, riposte.power, hx, hy, true);
      if (e.hp <= 0) return;
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
      // Charmed monsters are on the Hunters' side for now: nobody aims at them.
      if (e.hp <= 0 || e.charm || exclude?.includes(e.id)) continue;
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
    h.fireAcc = Math.min(h.fireAcc + dt * rate * this.frenzyMult(h.id), 3);
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
  private weaponAttack(who: Shooter, x: number, y: number, aim: number, target: Enemy, cls: WeaponClassDef | null, gun: GunState, range: number, mode: GearMode = 'long', encore = false): void {
    const g = this.game;
    const m = mode === 'short' ? 'short' : undefined;
    this.events.push({ type: 'attack', who, a: aim });
    // Apex Hunter: extra projectiles on shots, one more dagger in a burst, a follow-up strike for other melee.
    const extra = encore ? 0 : g.tree(who).multishot;
    /** A shot plus its extra projectiles, fanned out around the aim. */
    const fan = (shot: (a: number) => void) => {
      shot(aim);
      for (let i = 1; i <= extra; i++) shot(aim + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * EXTRA_SHOT_SPREAD);
    };
    if (extra > 0 && cls && (cls.attack === 'sweep' || cls.attack === 'stab' || cls.attack === 'slam' || cls.attack === 'nova')) this.encores.push({ who, t: ENCORE_GAP, target: target.id, mode });
    if (cls?.attack === 'dagger') {
      // A burst of stabs (or throws, if it's out of reach) at this monster, a moment apart.
      const n = (cls.thrusts ?? 1) + extra;
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
      // A staff's big spell: the last round of each cast, its element's spell (a Physical staff's a blast).
      const spell = g.spellOf(who, mode);
      if (spell) this.castSpell(who, x, y, spell, target, { mult: cls.spell.damage, mode: m });
      else fan((a) => this.shoot(who, 'fireball', x, y, a, 380, range, { radius: cls.spell!.radius * g.radiusMult(who), dmg: cls.spell!.damage, mode: m }));
    } else if (cls?.attack === 'slam') {
      // A hammer smashes the ground out in front: the Hunter stands at the edge of the blast, so its centre is
      // further out the bigger it is. Everything in it is hit and thrown far back from where it landed.
      const r = cls.reach! * g.radiusMult(who);
      const cx = x + Math.cos(aim) * r * SLAM_OFFSET;
      const cy = y + Math.sin(aim) * r * SLAM_OFFSET;
      this.events.push({ type: 'slam', x: cx, y: cy, r, color: this.typeColor(who, mode) });
      for (const e of [...this.enemies]) if (e.hp > 0 && Math.hypot(e.x - cx, e.y - cy) <= r + e.r) this.meleeHit(who, e, 1, cx, cy, cls.knock ?? 0);
    } else if (cls?.attack === 'sweep') this.strikeArc(who, x, y, aim, cls.reach!, cls.arc!, 1, cls.knock ?? 0, true, this.typeColor(who, mode));
    else if (cls?.attack === 'stab') this.strikeLine(who, x, y, aim, range, cls.width ?? 10, Infinity, this.momentumOn(who, target, mode), this.typeColor(who, mode), (cls.width ?? 10) / 2, cls.knock ?? 0);
    else if (cls?.volley) {
      // A fan: each bolt at a random angle within it. Bolts of one volley stack on the same monster.
      const volley = this.nextVolley++;
      const arts = this.shotArts(who, cls, gun, mode, Math.hypot(target.x - x, target.y - y), range);
      for (let i = 0; i < cls.volley + extra; i++) {
        const a = aim + (g.rng() - 0.5) * (cls.fan ?? 0);
        this.shoot(who, cls.projectile ?? 'bolt', x, y, a, BULLET_SPEED, range, { pierce: g.pierceOf(who, mode), volley, stack: cls.stack, mode: m, ...arts() });
      }
    } else {
      // A longbow's follow-through grows with the Hunter's range.
      const follow = cls?.followThrough ? cls.followThrough * (range / (MAIN_RANGE * cls.range)) : undefined;
      const arts = this.shotArts(who, cls, gun, mode, Math.hypot(target.x - x, target.y - y), range);
      fan((a) => this.shoot(who, cls?.projectile ?? 'bolt', x, y, a, BULLET_SPEED, range, { pierce: g.pierceOf(who, mode), followThrough: follow, bounces: cls?.bounces, mode: m, ...arts() }));
      if (cls && !encore) this.extraShots(who, x, y, aim, target, cls, gun, range, mode, arts);
    }
    if (this.isMelee(who)) {
      this.meleeWave(who, x, y);
      if (!encore) for (const art of this.arts(who, mode)) if (!PASSIVE_ARTS.has(art.art) && g.rng() < art.chance) this.meleeArt(who, x, y, aim, art.art, art.power, cls!, mode);
    }
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
    h.specialCd = sp.cooldown * g.cooldownMult(h.id);
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
    if (sp.kind === 'charm') {
      // Norm's Smooth Talk: the monsters nearest him (within reach) turn on their own for a while.
      const near = this.enemies
        .filter((o) => o.hp > 0 && !o.boss && !o.charm && !o.fleeing && Math.hypot(o.x - x, o.y - y) <= radius + o.r)
        .sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y))
        .slice(0, CHARM_MAX);
      if (!near.length) return false;
      this.events.push({ type: 'nova', x, y, r: radius, color: '#ff8ad0' });
      for (const o of near) {
        o.charm = { left: CHARM_TIME, by, frac: dmg, bite: CHARM_BITE * 0.5 };
        this.events.push({ type: 'nova', x: o.x, y: o.y, r: o.r + 6, color: '#ff8ad0' });
      }
      return true;
    }
    if (sp.kind === 'dice') {
      // Ted's dice: thrown at the monsters, they land a moment later and the roll decides what happens there.
      const rng = g.rng;
      const roll = (): number => 1 + Math.floor(rng() * 6);
      const faces: [number, number] = [roll(), roll()];
      // Loaded dice: his crit chance can re-roll the lower die (keeping the better of the two).
      if (rng() < g.critChanceOf(by)) {
        const lo = faces[0] <= faces[1] ? 0 : 1;
        faces[lo] = Math.max(faces[lo], roll());
      }
      const land = Math.min(Math.hypot(target.x - x, target.y - y), range);
      const ang = a + (rng() - 0.5) * 0.4;
      this.dice.push({
        by,
        special: sp,
        x0: x,
        y0: y,
        x1: x + Math.cos(ang) * land,
        y1: y + Math.sin(ang) * land,
        faces,
        turns: [Math.floor(rng() * 4), Math.floor(rng() * 4)],
        age: 0,
        landed: false,
        radius,
        dmg,
        only,
        id: this.nextId++,
      });
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
    h.specialCd = hunterDef(h.id).special!.cooldown * this.game.cooldownMult(h.id);
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

  /** A charmed monster: it goes for the nearest monster that isn't charmed and bites it, until the charm wears off. */
  private charmed(e: Enemy, speed: number, dt: number): void {
    const c = e.charm!;
    c.left -= dt;
    if (c.left <= 0) {
      e.charm = undefined;
      return;
    }
    let t: Enemy | null = null;
    let best = Infinity;
    for (const o of this.enemies) {
      if (o === e || o.hp <= 0 || o.charm) continue;
      const d = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
      if (d < best) {
        best = d;
        t = o;
      }
    }
    c.bite = Math.max(0, c.bite - dt);
    if (!t) return;
    const dx = t.x - e.x;
    const dy = t.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const reach = e.r + t.r + 2;
    if (d > reach) {
      const step = Math.min(speed * 1.2 * dt, d - reach);
      e.x += (dx / d) * step + e.kx * dt;
      e.y += (dy / d) * step + e.ky * dt;
    } else if (c.bite <= 0) {
      c.bite = CHARM_BITE;
      this.damage(t, e.maxHp * c.frac, false, dx / d, dy / d, c.by, 'physical');
    }
  }

  /**
   * Ted's dice: once they land, the roll plays out where they lie. 2 (snake eyes) fizzles and dazes the thrower;
   * 3-4 hits one monster; 5-9 a blast; 10-11 a bigger blast; 12 (double 6s) the whole field. Other doubles hit
   * twice as hard. Damage grows with the total (7 is par).
   */
  private runDice(dt: number): void {
    if (!this.dice.length) return;
    for (const d of this.dice) {
      d.age += dt;
      if (d.landed || d.age < DICE_FLIGHT) continue;
      d.landed = true;
      const [a, b] = d.faces;
      const total = a + b;
      const doubles = a === b && total !== 2 && total !== 12;
      const mult = d.dmg * (total / 7) * (doubles ? 2 : 1);
      const { x1: x, y1: y } = d;
      const hit = (o: Enemy, m: number) => this.hitWith(d.by, o, m, x, y, undefined, undefined, true, true, d.only);
      if (total === 2) {
        this.say(x, y, 'SNAKE EYES', '#b8b8c8', 12);
        const who = d.by;
        const caster = who === this.lead ? this : this.helpers.find((h) => h.id === who);
        // Dazed, as if knocked out briefly (not through immunity: it's his own bad luck).
        if (caster && caster.stun <= 0) {
          caster.stun = SNAKE_EYES_DAZE;
          caster.stunTotal = SNAKE_EYES_DAZE;
        }
        continue;
      }
      if (total === 12) {
        this.say(x, y, 'JACKPOT!', '#ffd84a', 16);
        this.events.push({ type: 'explode', x, y, r: d.radius * 2.5, color: '#ffd84a' });
        for (const o of [...this.enemies]) if (o.hp > 0) hit(o, d.dmg * 3);
        continue;
      }
      this.say(x, y, doubles ? `${total}! DOUBLES` : `${total}!`, total >= 10 ? '#ffd84a' : '#f4f4f4', total >= 10 || doubles ? 13 : 11);
      if (total <= 4) {
        const t = this.nearest(x, y, d.radius * 1.5);
        if (t) hit(t, mult);
        this.events.push({ type: 'blast', x, y, color: '#f4f4f4' });
        continue;
      }
      const r = total >= 10 ? d.radius * 1.6 : d.radius;
      this.events.push({ type: total >= 10 ? 'explode' : 'nova', x, y, r, color: total >= 10 ? '#ffb040' : '#f0e6c8' });
      for (const o of [...this.enemies]) if (o.hp > 0 && Math.hypot(o.x - x, o.y - y) <= r + o.r) hit(o, mult);
    }
    this.dice = this.dice.filter((d) => d.age < DICE_FLIGHT + DICE_REST);
  }

  private say(x: number, y: number, text: string, color: string, size: number): void {
    this.events.push({ type: 'say', x, y, text, color, size });
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
    // Flame Burst's ignite and Melting Miasma's puddle (your tap ability).
    if (this.game.tapAbility === 'flame') out.push({ key: 'tap:flame', icon: '🔥', name: 'Flame Burst', progress: 1 - this.flameCd / (FLAME_BURST_COOLDOWN * this.game.cooldownMult('main')) });
    if (this.game.tapAbility === 'miasma') out.push({ key: 'tap:miasma', icon: '☠️', name: 'Melting Miasma', progress: 1 - this.miasmaCd / (MIASMA_PUDDLE.cooldown * this.game.cooldownMult('main')) });
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
      if (sp) out.push({ key: h.id, icon: hunterDef(h.id).icon, name: hunterDef(h.id).name, progress: 1 - Math.max(0, h.specialCd) / (sp.cooldown * this.game.cooldownMult(h.id)) });
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
      gun.steady = 0;
    }
    gun.steady = (gun.steady ?? 0) + dt;
    return true;
  }

  /** Uses a round; when the magazine runs dry, starts the reload (the class's `reload` shots' worth of time). Returns true if it just emptied. */
  private spendShot(gun: GunState, cls: WeaponClassDef | null, rate: number): boolean {
    if (!cls?.mag) return false;
    if (--gun.ammo > 0) return false;
    gun.reload = (cls.reload ?? 0) / Math.max(rate, 1e-6);
    gun.total = gun.reload;
    gun.steady = 0;
    return true;
  }

  /** Fires a projectile. Damage is priced on hit, per target. */
  private shoot(
    shooter: Shooter,
    kind: BulletKind,
    ox: number,
    oy: number,
    angle: number,
    speed: number,
    range: number,
    o: { pierce?: number; dmg?: number; radius?: number; bounces?: number; slow?: number; tx?: number; ty?: number; mode?: GearMode; special?: boolean; followThrough?: number; volley?: number; stack?: number; bleed?: boolean; dtype?: DamageType; ticks?: number; cast?: SpellCast; k?: number; size?: number; blast?: { r: number; k: number }; elem?: number; arts?: ShotArts; critBonus?: number },
  ): void {
    const g = this.game;
    // Stone magic (a Physical magic weapon) hurls rocks instead of sparks.
    if (kind === 'spark' && !o.special && !o.cast && g.damageTypeOf(shooter, o.mode) === 'physical' && g.weaponItem(shooter, o.mode)) kind = 'rock';
    // A weapon firing one type per projectile hands them out in turn.
    const types = !o.special && !o.cast && g.perShotOf(shooter, o.mode) ? g.damageTypesOf(shooter, o.mode) : null;
    // An Elemental Arrow carries its bow's element (for its colour, and for its burst).
    let dtype: DamageType | undefined = o.dtype ?? (o.elem ? g.damageTypeOf(shooter, o.mode) : undefined);
    if (types) {
      const turn = this.typeTurn.get(shooter) ?? 0;
      this.typeTurn.set(shooter, turn + 1);
      dtype = types[turn % types.length];
    }
    this.bullets.push({
      shooter,
      kind,
      x: ox + Math.cos(angle) * PLAYER_RADIUS,
      y: oy + Math.sin(angle) * PLAYER_RADIUS,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      crit: g.rng() < g.critChanceOf(shooter) + (o.critBonus ?? 0),
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
      cast: o.cast,
      k: o.k,
      size: o.size,
      blast: o.blast,
      elem: o.elem,
      arts: o.arts,
    });
  }

  /** A melee art going off (see MeleeArt): in the weapon's element, `power` × a hit. */
  private meleeArt(who: Shooter, x: number, y: number, aim: number, art: MeleeArt, power: number, cls: WeaponClassDef, mode: GearMode): void {
    const g = this.game;
    const m = mode === 'short' ? 'short' : undefined;
    const color = this.typeColor(who, mode);
    const reach = cls.reach ?? 80;
    switch (art) {
      case 'wave':
        // A crescent of the sword's element flying out through everything in its path.
        this.shoot(who, 'slash', x, y, aim, MELEE_ARTS.waveSpeed, reach * MELEE_ARTS.waveReach, { pierce: Infinity, dmg: power, size: reach * MELEE_ARTS.waveSize * g.radiusMult(who), mode: m });
        break;
      case 'spear':
        // A giant phantom spear stabbing out twice as far and wide.
        this.strikeLine(who, x, y, aim, reach * MELEE_ARTS.spearReach, (cls.width ?? 24) * MELEE_ARTS.spearWidth, Infinity, power, color, (cls.width ?? 24) * MELEE_ARTS.spearWidth, cls.knock ?? 0);
        break;
      case 'glaive':
        this.strikeArc(who, x, y, aim, reach * MELEE_ARTS.glaiveReach, cls.arc ?? 3, power, cls.knock ?? 0, true, color);
        break;
      case 'aftershock': {
        // A second slam a moment later, where the first landed, in the hammer's element.
        const r = reach * g.radiusMult(who);
        const cx = x + Math.cos(aim) * r * SLAM_OFFSET;
        const cy = y + Math.sin(aim) * r * SLAM_OFFSET;
        this.spellHits.push({ c: { who, dtype: g.damageTypeOf(who, mode), mult: power, mode: m }, t: MELEE_ARTS.aftershockDelay, x: cx, y: cy, r, k: 1, fx: 'shock' });
        break;
      }
      case 'bigDagger':
        this.shoot(who, 'bigDagger', x, y, aim, BULLET_SPEED * 0.8, g.shooterRange(who, mode) * 1.5, { pierce: Infinity, dmg: power, size: MELEE_ARTS.bigDaggerSize, mode: m });
        break;
      case 'whirlwind': {
        // A full spin: everything all the way around is hit, and monsters further out are drawn in.
        const r = reach * MELEE_ARTS.whirlReach * g.radiusMult(who);
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - x, e.y - y);
          if (e.boss || e.hp <= 0 || d <= r || d > reach * MELEE_ARTS.pullReach * g.radiusMult(who)) continue;
          e.x += (x - e.x) * MELEE_ARTS.pull;
          e.y += (y - e.y) * MELEE_ARTS.pull;
        }
        this.strikeArc(who, x, y, aim, r, Math.PI * 2, power, 0, true, color);
        this.events.push({ type: 'wave', x, y, r, time: 0.25, color });
        break;
      }
      case 'earthshatter': {
        // The ground cracks out in a line from where the slam landed.
        const r = reach * g.radiusMult(who);
        const cx = x + Math.cos(aim) * r * SLAM_OFFSET;
        const cy = y + Math.sin(aim) * r * SLAM_OFFSET;
        const len = reach * MELEE_ARTS.fissureLength;
        this.fissures.push({ who, mode: m, x1: cx, y1: cy, x2: cx + Math.cos(aim) * len, y2: cy + Math.sin(aim) * len, width: MELEE_ARTS.fissureWidth * g.radiusMult(who), life: MELEE_ARTS.fissureLife, tick: 0, power, color });
        break;
      }
      default:
        break; // passive arts act elsewhere (PASSIVE_ARTS)
    }
  }

  /** Bloodthirst: a kill may speed up the killer's attacks for a while, or take some time off their stun. */
  private bloodthirst(who: Shooter): void {
    const art = this.arts(who).find((a) => a.art === 'bloodthirst');
    if (!art || this.game.rng() >= art.chance) return;
    const h = who === this.lead ? null : this.helpers.find((x) => x.id === who);
    if (who !== this.lead && !h) return;
    if (h ? h.stun > 0 : this.stun > 0) {
      if (h) h.stun = Math.max(0, h.stun - MELEE_ARTS.stunCut);
      else this.stun = Math.max(0, this.stun - MELEE_ARTS.stunCut);
      return;
    }
    if (!this.frenzy.has(who)) this.say(h?.x ?? 0, (h?.y ?? 0) - 34, 'FRENZY', '#ff6a6a', 10);
    this.frenzy.set(who, MELEE_ARTS.frenzyTime);
    this.frenzyBonus.set(who, art.power);
  }

  /**
   * Ranged arts on a shot: Opening Shot (a full magazine's first round) and Closing Shot (its last) hit harder;
   * Exploding Ammo and Arrows and Elemental Arrows roll for each projectile. Returns each projectile's options.
   */
  private shotArts(who: Shooter, cls: WeaponClassDef | null, gun: GunState, mode: GearMode, dist = Infinity, range = Infinity): () => ShotOptions {
    const arts = this.arts(who, mode);
    if (!arts.length) return () => ({});
    let dmg = 1;
    let critBonus = 0;
    for (const a of arts) {
      if ((a.art === 'openingShot' && cls?.mag && gun.ammo >= cls.mag) || (a.art === 'closingShot' && cls?.mag && gun.ammo === 1)) dmg *= 1 + a.power;
      // Point Blank: the closer the monster, the harder the shot.
      else if (a.art === 'pointBlank' && Number.isFinite(dist)) dmg *= 1 + a.power * Math.max(0, 1 - dist / Math.max(1, range));
      else if (a.art === 'steadyAim') critBonus += Math.min(MELEE_ARTS.steadyCap, a.power * (gun.steady ?? 0));
    }
    const g = this.game;
    return () => {
      const o: ShotOptions = {};
      if (dmg > 1) o.dmg = dmg;
      if (critBonus > 0) o.critBonus = critBonus;
      const x: ShotArts = {};
      for (const a of arts) {
        if ((a.art === 'explodingAmmo' || a.art === 'explodingArrows') && g.rng() < a.chance) o.blast = { r: MELEE_ARTS.shotBlastRadius * g.radiusMult(who), k: a.power };
        else if (a.art === 'elementalArrows' && g.rng() < a.chance) o.elem = a.power;
        else if (a.art === 'overpenetration') x.overpen = true;
        else if (a.art === 'ricochet' && g.rng() < a.chance) x.ricochet = true;
        else if (a.art === 'suppressing' && g.rng() < a.chance) x.slowHit = a.power;
        else if (a.art === 'arrowRain' && g.rng() < a.chance) x.rain = a.power;
        else if (a.art === 'huntersMark' && g.rng() < a.chance) x.mark = a.power;
        else if (a.art === 'pinningBolt' && g.rng() < a.chance) x.pin = a.power;
        else if (a.art === 'harpoon' && g.rng() < a.chance) x.harpoon = true;
      }
      if (Object.keys(x).length) o.arts = x;
      return o;
    };
  }

  /** Arts that loose extra shots: Fan the Hammer (the rest of the magazine at once) and Double Nock (an arrow at another monster). */
  private extraShots(who: Shooter, x: number, y: number, aim: number, target: Enemy, cls: WeaponClassDef, gun: GunState, range: number, mode: GearMode, opts: () => ShotOptions): void {
    const g = this.game;
    const m = mode === 'short' ? 'short' : undefined;
    for (const a of this.arts(who, mode)) {
      if (a.art === 'fanHammer' && cls.mag && gun.ammo > 1 && g.rng() < a.chance) {
        // The rest of the magazine, all at once, sprayed around the aim; the reload follows.
        for (let i = 1; i < gun.ammo; i++) this.shoot(who, cls.projectile ?? 'bolt', x, y, aim + (g.rng() - 0.5) * MELEE_ARTS.fanSpread, BULLET_SPEED, range, { pierce: g.pierceOf(who, mode), mode: m, ...opts() });
        gun.ammo = 1;
        this.say(x, y - 34, 'FAN!', '#ffe9a0', 10);
      } else if (a.art === 'doubleNock' && g.rng() < a.chance) {
        const other = this.nearest(x, y, range, [target.id]);
        if (other) this.shoot(who, cls.projectile ?? 'bolt', x, y, Math.atan2(other.y - y, other.x - x), BULLET_SPEED, range, { pierce: g.pierceOf(who, mode), mode: m, ...opts() });
      }
    }
  }

  /** Ranged arts a projectile carries, when it hits. */
  private shotArtsHit(b: Bullet, e: Enemy): void {
    const a = b.arts!;
    if (a.slowHit && !e.boss) e.slow = Math.max(e.slow ?? 0, a.slowHit);
    if (a.mark) {
      e.mark = { left: MELEE_ARTS.markTime, bonus: Math.max(e.mark?.bonus ?? 0, a.mark) };
      this.events.push({ type: 'nova', x: e.x, y: e.y, r: e.r + 8, color: '#ff5a5a' });
    }
    if (e.hp <= 0 || e.boss) {
      if (a.rain) this.arrowRain(b, e, a.rain);
      return;
    }
    if (a.pin) {
      e.held = Math.max(e.held ?? 0, a.pin);
      this.events.push({ type: 'spell', fx: 'spike', x: e.x, y: e.y, r: e.r, color: '#c8b48a' });
    }
    if (a.harpoon) {
      // Dragged part of the way back toward whoever shot it.
      const h = b.shooter === this.lead ? { x: 0, y: 0 } : (this.helpers.find((x) => x.id === b.shooter) ?? { x: 0, y: 0 });
      const d = Math.hypot(e.x - h.x, e.y - h.y);
      const k = Math.min(MELEE_ARTS.harpoonPull, Math.max(0, (d - e.r - 50) / Math.max(1, d)));
      this.events.push({ type: 'beam', x1: h.x, y1: h.y, x2: e.x, y2: e.y, color: '#c8b48a', width: 1.5 });
      e.x += (h.x - e.x) * k;
      e.y += (h.y - e.y) * k;
    }
    if (a.rain) this.arrowRain(b, e, a.rain);
  }

  /** Volley of Rain: arrows come down around where it hit, a moment later. */
  private arrowRain(b: Bullet, e: Enemy, k: number): void {
    const g = this.game;
    const c: SpellCast = { who: b.shooter, dtype: b.dtype ?? g.damageTypeOf(b.shooter, b.mode), mult: k, mode: b.mode };
    for (let i = 0; i < MELEE_ARTS.rainArrows; i++) {
      const a = g.rng() * Math.PI * 2;
      const d = Math.sqrt(g.rng()) * MELEE_ARTS.rainSpread;
      this.spellHits.push({ c, t: 0.3 + i * 0.07, x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, r: MELEE_ARTS.rainRadius, k: 1, fx: 'arrows' });
    }
  }

  /** Elemental Arrows: an arrow charged with its element bursts with that element's effect where it hits. */
  private elementalArrow(b: Bullet, e: Enemy): void {
    const g = this.game;
    const dtype = b.dtype ?? g.damageTypeOf(b.shooter, b.mode);
    const c: SpellCast = { who: b.shooter, dtype, mult: b.elem!, mode: b.mode };
    const area = g.radiusMult(b.shooter);
    const color = DAMAGE_TYPES[dtype].color;
    const aim = Math.atan2(b.vy, b.vx);
    const around = (r: number, k: number) => {
      for (const o of [...this.enemies]) if (o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= r + o.r) this.spellHit(c, o, k, e.x, e.y);
    };
    switch (dtype) {
      case 'fire':
        this.events.push({ type: 'explode', x: e.x, y: e.y, r: 45 * area, color });
        around(45 * area, 1);
        break;
      case 'frost':
        // Shatters into shards flying on past it.
        for (const da of [-0.4, 0, 0.4]) this.shoot(b.shooter, 'spell', e.x, e.y, aim + da, BULLET_SPEED, 120, { dtype, cast: c, k: 0.5, mode: b.mode });
        break;
      case 'acid':
        this.puddles.push({ shooter: b.shooter, x: e.x, y: e.y, r: 40 * area, life: 4 * PUDDLE_TICK, tick: 0, dmg: 0, dtype, cast: c, k: 0.3 });
        break;
      case 'poison':
        this.infect(e, c, this.spellAmount(c, e));
        break;
      case 'lightning': {
        const struck = [e.id];
        let from: Enemy = e;
        for (let i = 0; i < 3; i++) {
          const next = this.nearest(from.x, from.y, 120 * area, struck);
          if (!next) break;
          this.events.push({ type: 'beam', x1: from.x, y1: from.y, x2: next.x, y2: next.y, color, width: 2.5, zigzag: true });
          struck.push(next.id);
          this.spellHit(c, next, 0.8, from.x, from.y);
          from = next;
        }
        break;
      }
      case 'radiant':
        this.events.push({ type: 'explode', x: e.x, y: e.y, r: 50 * area, color });
        around(50 * area, 0.8);
        break;
      case 'arcane':
        // Splits into two bolts that pierce everything on past it.
        for (const da of [-0.3, 0.3]) this.shoot(b.shooter, 'spell', e.x, e.y, aim + da, BULLET_SPEED, 400, { pierce: Infinity, dtype, cast: c, k: 0.6, mode: b.mode });
        break;
      case 'decay':
        this.zones.push({ kind: 'raiseDead', c, x: e.x, y: e.y, r: 50 * area, vx: 0, vy: 0, life: 3, max: 3, tick: 0, k: 0.1, touched: new Map() });
        break;
      case 'void':
        this.zones.push({ kind: 'gravityAnchor', c, x: e.x, y: e.y, r: 70 * area, vx: 0, vy: 0, life: 1.5, max: 1.5, tick: 0, k: 0.1, touched: new Map() });
        break;
      default:
        // Physical: barbed, it leaves two more bleeds.
        this.bleed(e, b.shooter, b.elem!);
        this.bleed(e, b.shooter, b.elem!);
    }
  }

  /** An Artifact's or Exalted piece's unique effect (UNIQUE_EFFECTS). Returns false when there's nothing to use it on. */
  private unique(who: Shooter, x: number, y: number, id: UniqueId, base: number): boolean {
    const g = this.game;
    const live = this.enemies.filter((e) => e.hp > 0 && !e.fleeing);
    if (!live.length) return false;
    const target = this.nearest(x, y, 2000) ?? live[0];
    const any = () => live[Math.floor(g.rng() * live.length)];
    const ids = Object.keys(SPELLS) as SpellId[];
    switch (id) {
      case 'stormcaller':
        this.castSpell(who, x, y, 'thunderstorm', target, { base });
        break;
      case 'spellweaver':
        this.castSpell(who, x, y, ids[Math.floor(g.rng() * ids.length)], target, { base });
        break;
      case 'gravewarden':
        this.castSpell(who, x, y, 'raiseDead', target, { base });
        break;
      case 'meteorCaller':
        this.castSpell(who, x, y, 'fireball', target, { base });
        this.castSpell(who, x, y, 'rockfall', target, { base });
        break;
      case 'cataclysm':
        // One spell of every element at once, each at a monster of its own.
        this.events.push({ type: 'nova', x, y, r: 120, color: '#ffffff' });
        for (const t of Object.keys(TYPE_SPELLS) as DamageType[]) {
          const spells = TYPE_SPELLS[t];
          if (spells.length) this.castSpell(who, x, y, spells[Math.floor(g.rng() * spells.length)], any(), { base });
        }
        break;
      case 'meteorStorm': {
        // Meteors crash down all over the field, a moment apart.
        const c: SpellCast = { who, dtype: 'fire', base };
        for (let i = 0; i < 14; i++) {
          const e = i % 2 ? any() : null;
          const px = e ? e.x : (g.rng() * 2 - 1) * this.halfW * 0.9;
          const py = e ? e.y : (g.rng() * 2 - 1) * this.halfH * 0.9;
          this.spellHits.push({ c, t: i * 0.12, x: px, y: py, r: 45 * g.radiusMult(who), k: 1, fx: 'rock' });
        }
        break;
      }
      case 'singularity': {
        // A vast well at the heart of the crowd.
        const cx = live.reduce((a, e) => a + e.x, 0) / live.length;
        const cy = live.reduce((a, e) => a + e.y, 0) / live.length;
        const r = 260 * g.radiusMult(who);
        this.zones.push({ kind: 'gravityAnchor', c: { who, dtype: 'void', base }, x: cx, y: cy, r, vx: 0, vy: 0, life: 3, max: 3, tick: 0, k: 0.25, touched: new Map() });
        this.events.push({ type: 'spell', fx: 'anchor', x: cx, y: cy, r, color: DAMAGE_TYPES.void.color });
        break;
      }
      case 'eternalLegion':
        // Cursed ground under the whole field: everything that dies rises (it deals no damage of its own).
        this.zones.push({ kind: 'raiseDead', c: { who, dtype: 'decay', base }, x: 0, y: 0, r: Math.hypot(this.halfW, this.halfH) * 2, vx: 0, vy: 0, life: 8, max: 8, tick: 0, k: 0, touched: new Map() });
        this.events.push({ type: 'nova', x, y, r: 200, color: DAMAGE_TYPES.decay.color });
        break;
    }
    return true;
  }

  /** A Hunter's melee arts (cached for the frame). */
  private arts(who: Shooter, mode: GearMode = 'long'): Array<{ art: MeleeArt; chance: number; power: number }> {
    const key = `${who}:${mode}`;
    let a = this.artCache.get(key);
    if (!a) this.artCache.set(key, (a = this.game.meleeArts(who, mode)));
    return a;
  }

  /** Bloodthirst and Quick Draw: how much faster a Hunter is attacking right now. */
  private frenzyMult(who: Shooter): number {
    const q = this.quickDraw.get(who);
    return (this.frenzy.has(who) ? 1 + (this.frenzyBonus.get(who) ?? 0) : 1) * (q ? 1 + q.stacks * q.per : 1);
  }

  /** Quick Draw: each kill stacks a little attack speed, until a few seconds pass without one. */
  private quickDrawKill(who: Shooter): void {
    const art = this.arts(who).find((a) => a.art === 'quickDraw');
    if (!art) return;
    const q = this.quickDraw.get(who);
    this.quickDraw.set(who, { stacks: Math.min(MELEE_ARTS.quickDrawMax, (q?.stacks ?? 0) + 1), left: MELEE_ARTS.quickDrawTime, per: art.power });
  }

  /** Momentum: a spear's thrust at the same monster as last time stacks; at a new one it starts over. */
  private momentumOn(who: Shooter, target: Enemy, mode: GearMode): number {
    const art = this.arts(who, mode).find((a) => a.art === 'momentum');
    if (!art) return 1;
    const m = this.momentum.get(who);
    const stacks = m && m.target === target.id ? Math.min(MELEE_ARTS.momentumMax, m.stacks + 1) : 0;
    this.momentum.set(who, { target: target.id, stacks });
    return 1 + stacks * art.chance;
  }

  /** Earthshatter's fissures hurt the monsters standing on them every tick. */
  private runFissures(dt: number): void {
    for (const f of this.fissures) {
      f.life -= dt;
      f.tick -= dt;
      if (f.tick > 0) continue;
      f.tick = MELEE_ARTS.fissureTick;
      const dx = f.x2 - f.x1;
      const dy = f.y2 - f.y1;
      const len2 = dx * dx + dy * dy || 1;
      for (const e of [...this.enemies]) {
        if (e.hp <= 0 || FLYING.has(e.type)) continue;
        const t = Math.max(0, Math.min(1, ((e.x - f.x1) * dx + (e.y - f.y1) * dy) / len2));
        if (Math.hypot(f.x1 + dx * t - e.x, f.y1 + dy * t - e.y) <= f.width / 2 + e.r) this.hitWith(f.who, e, f.power, e.x, e.y + 20, undefined, f.mode);
      }
    }
    this.fissures = this.fissures.filter((f) => f.life > 0);
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
  /** Apex Hunter's follow-up strikes: the same attack again, at the same monster if it's still there. */
  private runEncores(dt: number): void {
    if (!this.encores.length) return;
    for (const c of this.encores) c.t -= dt;
    const due = this.encores.filter((c) => c.t <= 0);
    this.encores = this.encores.filter((c) => c.t > 0);
    for (const c of due) {
      const h = c.who === this.lead ? null : this.helpers.find((x) => x.id === c.who);
      if ((c.who !== this.lead && !h) || (h ? h.stun > 0 : this.stunned)) continue;
      const ox = h?.x ?? 0;
      const oy = h?.y ?? 0;
      const range = this.game.shooterRange(c.who);
      const e = this.enemies.find((x) => x.id === c.target && x.hp > 0) ?? this.nearest(ox, oy, range);
      if (!e) continue;
      const a = Math.atan2(e.y - oy, e.x - ox);
      this.weaponAttack(c.who, ox, oy, a, e, this.game.weaponClassOf(c.who, c.mode), h ? h.gun : this.gunState, range, c.mode, true);
    }
  }

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
      } else {
        // Blast Daggers: some thrown daggers explode where they hit.
        const blast = this.arts(s.who).find((x) => x.art === 'blastDaggers');
        const boom = blast && this.game.rng() < blast.chance ? { r: MELEE_ARTS.blastRadius * this.game.radiusMult(s.who), k: blast.power } : undefined;
        this.shoot(s.who, 'dagger', ox, oy, a, BULLET_SPEED, range, { pierce: this.game.pierceOf(s.who), blast: boom });
      }
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
    // Area-size upgrades (gear, skills) and the area's own scale widen it, as they do every area effect.
    r *= this.game.radiusMult(who);
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
          for (const e of this.enemies) if (!e.boss && !this.immuneTo(e, 'frost') && Math.hypot(e.x - w.x, e.y - w.y) <= ef.radius * this.game.radiusMult(w.who) + e.r) e.slow = Math.max(e.slow ?? 0, 0.2);
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
        if (!this.nearest(x, y, ef.radius * this.game.radiusMult(who))) return false;
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
      case 'spell': {
        const target = this.nearest(x, y, Math.max(this.game.shooterRange(who), MAIN_RANGE));
        if (!target) return false;
        this.castSpell(who, x, y, ef.spell, target, { base });
        return true;
      }
      case 'unique':
        return this.unique(who, x, y, ef.id, base);
      default:
        return false;
    }
  }

  // ---- Spells: a staff's cast after its bolts, or a Spell enchantment going off ----

  /**
   * Casts a spell from (x, y) at `target`. A staff's cast (`mult`) hits like its shots, × `mult`; an enchantment's
   * (`base`) deals its own base damage, like gear abilities. Every hit sets off the spell's element's effect.
   */
  private castSpell(who: Shooter, x: number, y: number, spell: SpellId, target: Enemy, power: { mult?: number; base?: number; mode?: GearMode }): void {
    const g = this.game;
    const sp = SPELLS[spell];
    const c: SpellCast = { who, dtype: sp.damageType, mult: power.mult, base: power.base, mode: power.mode };
    const aim = Math.atan2(target.y - y, target.x - x);
    const area = g.radiusMult(who);
    const color = DAMAGE_TYPES[sp.damageType].color;
    const range = Math.max(g.shooterRange(who, power.mode), MAIN_RANGE);
    // Projectiles carry the cast with them: a staff's as a shot multiple, an enchantment's as fixed damage.
    const shot = (kind: BulletKind, a: number, o: { pierce?: number; radius?: number; tx?: number; ty?: number; reach?: number; ticks?: number }) =>
      this.shoot(who, kind, x, y, a, kind === 'potion' ? 380 : BULLET_SPEED, o.reach ?? range, { ...o, dtype: sp.damageType, mode: power.mode, cast: c, k: sp.k });
    switch (spell) {
      case 'fireVolley':
        for (let i = 0; i < sp.count!; i++) shot('spell', aim + (i / (sp.count! - 1) - 0.5) * sp.spread!, {});
        break;
      case 'fireball':
        shot('fireball', aim, { radius: sp.r! * area });
        break;
      case 'acidPool':
        shot('potion', aim, { radius: sp.r! * area, tx: target.x, ty: target.y, ticks: Math.round(sp.life! / PUDDLE_TICK) });
        break;
      case 'arcaneBolts':
        // Out to the edge of the field, through everything.
        for (let i = 0; i < sp.count!; i++) shot('spell', aim + (i - (sp.count! - 1) / 2) * sp.spread!, { pierce: Infinity, reach: Math.hypot(this.halfW, this.halfH) * 2 });
        break;
      case 'iceSpikes': {
        // A line of spikes from the Hunter toward the monster, each erupting a moment after the last.
        const step = sp.r! * 1.5;
        const d0 = Math.max(step, Math.hypot(target.x - x, target.y - y) - (sp.count! / 2) * step);
        for (let i = 0; i < sp.count!; i++) {
          const d = d0 + i * step;
          this.spellHits.push({ c, t: i * 0.06, x: x + Math.cos(aim) * d, y: y + Math.sin(aim) * d, r: sp.r! * area, k: sp.k, fx: 'spike' });
        }
        break;
      }
      case 'frostFan': {
        const reach = sp.r! * area;
        this.events.push({ type: 'spell', fx: 'cone', x, y, r: reach, a: aim, arc: sp.spread! * 2, color });
        for (const e of [...this.enemies]) {
          const d = Math.hypot(e.x - x, e.y - y);
          if (e.hp <= 0 || d > reach + e.r) continue;
          const off = Math.abs(Math.atan2(Math.sin(Math.atan2(e.y - y, e.x - x) - aim), Math.cos(Math.atan2(e.y - y, e.x - x) - aim)));
          if (off <= sp.spread! + Math.atan2(e.r, Math.max(1, d))) this.spellHit(c, e, sp.k, x, y);
        }
        break;
      }
      case 'radiantBeam': {
        const len = range * 1.2;
        const w = sp.r! * area;
        this.events.push({ type: 'beam', x1: x, y1: y, x2: x + Math.cos(aim) * len, y2: y + Math.sin(aim) * len, color, width: w * 0.5 });
        for (const e of [...this.enemies]) {
          const t = (e.x - x) * Math.cos(aim) + (e.y - y) * Math.sin(aim);
          if (e.hp <= 0 || t < 0 || t > len) continue;
          if (Math.abs(-(e.x - x) * Math.sin(aim) + (e.y - y) * Math.cos(aim)) <= w / 2 + e.r) this.spellHit(c, e, sp.k, x, y);
        }
        break;
      }
      case 'sunbeam':
        for (let i = 0; i < sp.count!; i++) this.spellHits.push({ c, t: i * sp.tick!, x: target.x, y: target.y, r: sp.r! * area, k: sp.k, fx: i === 0 ? 'sun' : undefined });
        break;
      case 'thunderstorm':
        for (let i = 0; i < sp.count!; i++) this.spellHits.push({ c, t: i * sp.tick!, x: target.x, y: target.y, r: sp.r! * area, k: sp.k, fx: 'storm' });
        break;
      case 'chainLightning': {
        // From the Hunter to the monster, then on to the nearest one not yet struck, each jump a little weaker.
        const struck: number[] = [];
        let from = { x, y };
        let e: Enemy | null = target;
        for (let i = 0; i < sp.count! && e; i++) {
          this.events.push({ type: 'beam', x1: from.x, y1: from.y, x2: e.x, y2: e.y, color, width: 3, zigzag: true });
          struck.push(e.id);
          this.spellHit(c, e, sp.k * 0.85 ** i, from.x, from.y);
          from = { x: e.x, y: e.y };
          e = this.nearest(from.x, from.y, sp.r! * area, struck);
        }
        break;
      }
      case 'acidRain':
      case 'raiseDead':
      case 'gravityAnchor': {
        // Where the monsters are thickest around the target.
        const near = this.enemies.filter((o) => o.hp > 0 && Math.hypot(o.x - target.x, o.y - target.y) <= sp.r! * area);
        const cx = near.reduce((a, o) => a + o.x, 0) / near.length;
        const cy = near.reduce((a, o) => a + o.y, 0) / near.length;
        this.zones.push({ kind: spell, c, x: cx, y: cy, r: sp.r! * area, vx: 0, vy: 0, life: sp.life!, max: sp.life!, tick: 0, k: sp.k, touched: new Map() });
        if (spell === 'gravityAnchor') this.events.push({ type: 'spell', fx: 'anchor', x: cx, y: cy, r: sp.r! * area, color });
        break;
      }
      case 'boulder': {
        // Rolls out from the Hunter toward the monster and on, until the monsters it crushes stop it.
        this.zones.push({ kind: spell, c, x: x + Math.cos(aim) * 24, y: y + Math.sin(aim) * 24, r: sp.r! * area, vx: Math.cos(aim) * BOULDER.speed, vy: Math.sin(aim) * BOULDER.speed, life: 12, max: 12, tick: 0, k: sp.k, touched: new Map() });
        break;
      }
      case 'rockfall':
        // Rocks land around the target, one after another.
        for (let i = 0; i < sp.count!; i++) {
          const a = this.game.rng() * Math.PI * 2;
          const d = i === 0 ? 0 : Math.sqrt(this.game.rng()) * sp.r! * 2.5 * area;
          this.spellHits.push({ c, t: i * sp.tick!, x: target.x + Math.cos(a) * d, y: target.y + Math.sin(a) * d, r: sp.r! * area, k: sp.k, fx: 'rock' });
        }
        break;
      case 'poisonMist': {
        // A cloud rolling out from the Hunter, through the target and on across the field.
        const speed = 70;
        this.zones.push({ kind: spell, c, x: x + Math.cos(aim) * 30, y: y + Math.sin(aim) * 30, r: sp.r! * area, vx: Math.cos(aim) * speed, vy: Math.sin(aim) * speed, life: sp.life!, max: sp.life!, tick: 0, k: sp.k, touched: new Map() });
        break;
      }
      case 'plague': {
        this.events.push({ type: 'nova', x: target.x, y: target.y, r: sp.r! * area, color });
        for (const e of [...this.enemies]) if (e.hp > 0 && Math.hypot(e.x - target.x, e.y - target.y) <= sp.r! * area + e.r) this.infect(e, c, this.spellAmount(c, e) * sp.k);
        break;
      }
    }
  }

  /** What one hit of a cast deals to `e` before its weaknesses (for the effects a spell sets off). */
  private spellAmount(c: SpellCast, e: Enemy): number {
    const g = this.game;
    return c.base !== undefined ? c.base * g.abilityMult(c.who, enemyDef(e.type).archetype) : g.shotDamage(c.who, enemyDef(e.type).archetype, c.mode) * (c.mult ?? 1);
  }

  /** One hit of a spell, `k` of its cast, always setting off its element's effect. */
  private spellHit(c: SpellCast, e: Enemy, k: number, fx: number, fy: number): void {
    if (e.hp <= 0) return;
    // Stone (Physical) spells crush rather than cut: no bleeding.
    const effect = c.dtype !== 'physical';
    if (c.base !== undefined) this.abilityHit(c.who, e, c.base * k, c.dtype, effect);
    else {
      this.hitWith(c.who, e, (c.mult ?? 1) * k, fx, fy, undefined, c.mode, false, false, c.dtype);
      if (effect && e.hp > 0) this.applyStatus(e, c.dtype, this.spellAmount(c, e) * k * this.typeMultOn(c.dtype, e), c.who, this.game.procRarity(c.who, c.mode));
    }
  }

  /** Plague: poisons the monster and leaves it infectious (it passes the plague on to monsters it touches). */
  private infect(e: Enemy, c: SpellCast, amount: number): void {
    if (e.hp <= 0 || e.plague || this.immuneTo(e, 'poison')) return;
    e.plague = { left: SPELLS.plague.life!, by: c.who, amount };
    this.applyStatus(e, 'poison', amount * this.typeMultOn('poison', e), c.who, this.game.procRarity(c.who, c.mode));
  }

  /** Spells' delayed hits (spikes, sunbeams, lightning from the sky), lingering zones and the plague. */
  private runSpells(dt: number): void {
    for (const h of this.spellHits) {
      h.t -= dt;
      if (h.t > 0) continue;
      const color = DAMAGE_TYPES[h.c.dtype].color;
      if (h.fx === 'storm') {
        // Lightning from the sky on a monster near the spot.
        const near = this.enemies.filter((e) => e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) <= h.r + e.r);
        if (near.length) {
          const e = near[Math.floor(this.game.rng() * near.length)];
          this.events.push({ type: 'beam', x1: e.x + (this.game.rng() - 0.5) * 60, y1: e.y - 220, x2: e.x, y2: e.y, color, width: 3, zigzag: true });
          this.spellHit(h.c, e, h.k, e.x, e.y - 50);
        }
        continue;
      }
      if (h.fx) this.events.push({ type: 'spell', fx: h.fx, x: h.x, y: h.y, r: h.r, color });
      for (const e of [...this.enemies]) if (e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) <= h.r + e.r) this.spellHit(h.c, e, h.k, h.x, h.y);
    }
    this.spellHits = this.spellHits.filter((h) => h.t > 0);
    if (this.fissures.length) this.runFissures(dt);

    for (const z of this.zones) {
      z.life -= dt;
      z.x += z.vx * dt;
      z.y += z.vy * dt;
      z.tick -= dt;
      const sp = SPELLS[z.kind];
      if (z.kind === 'boulder') {
        // Crushes each monster it rolls into once, knocking it aside and losing speed, until it stops and breaks.
        for (const e of [...this.enemies]) {
          if (e.hp <= 0 || z.touched.has(e.id) || Math.hypot(e.x - z.x, e.y - z.y) > z.r + e.r) continue;
          z.touched.set(e.id, z.life);
          this.spellHit(z.c, e, z.k, z.x, z.y);
          if (!e.boss) {
            const sx = Math.sign((e.x - z.x) * -z.vy + (e.y - z.y) * z.vx) || 1;
            const v = Math.hypot(z.vx, z.vy) || 1;
            e.kx += (-z.vy / v) * sx * 160;
            e.ky += (z.vx / v) * sx * 160;
          }
          z.vx *= BOULDER.slow;
          z.vy *= BOULDER.slow;
        }
        const v = Math.hypot(z.vx, z.vy);
        if (v > 0) {
          const k = Math.max(0, v - BOULDER.friction * dt) / v;
          z.vx *= k;
          z.vy *= k;
        }
        if (Math.hypot(z.vx, z.vy) < BOULDER.stop && z.life > 0) {
          z.life = 0;
          const r = z.r * BOULDER.breakR;
          this.events.push({ type: 'spell', fx: 'break', x: z.x, y: z.y, r, color: DAMAGE_TYPES.physical.color });
          for (const e of [...this.enemies]) if (e.hp > 0 && Math.hypot(e.x - z.x, e.y - z.y) <= r + e.r) this.spellHit(z.c, e, BOULDER.breakK, z.x, z.y);
        }
        continue;
      }
      if (z.kind === 'gravityAnchor') {
        // Pulls everything in reach toward the anchor (not Guardians, nor monsters that resist Void).
        for (const o of this.enemies) {
          if (o.hp <= 0 || o.boss || this.immuneTo(o, 'void')) continue;
          const dx = z.x - o.x;
          const dy = z.y - o.y;
          const d = Math.hypot(dx, dy);
          if (d > z.r + o.r || d < 4) continue;
          const step = Math.min(d - 4, STATUS.well.pull * dt);
          o.x += (dx / d) * step;
          o.y += (dy / d) * step;
        }
        if (z.life <= 0) {
          this.events.push({ type: 'explode', x: z.x, y: z.y, r: z.r * ANCHOR_COLLAPSE.r, color: DAMAGE_TYPES.void.color });
          for (const e of [...this.enemies]) if (e.hp > 0 && Math.hypot(e.x - z.x, e.y - z.y) <= z.r * ANCHOR_COLLAPSE.r + e.r) this.spellHit(z.c, e, ANCHOR_COLLAPSE.k, z.x, z.y);
        }
      }
      if (z.tick > 0 || z.life <= 0) continue;
      if (z.kind === 'acidRain') {
        // A drop lands somewhere under the cloud.
        z.tick = sp.tick!;
        const a = this.game.rng() * Math.PI * 2;
        const d = Math.sqrt(this.game.rng()) * z.r;
        const px = z.x + Math.cos(a) * d;
        const py = z.y + Math.sin(a) * d;
        this.events.push({ type: 'spell', fx: 'drop', x: px, y: py, r: 22, color: DAMAGE_TYPES.acid.color });
        for (const e of [...this.enemies]) if (e.hp > 0 && Math.hypot(e.x - px, e.y - py) <= 22 + e.r) this.spellHit(z.c, e, z.k, px, py - 30);
        continue;
      }
      z.tick = sp.tick ?? 0.5;
      for (const e of [...this.enemies]) {
        if (e.hp <= 0 || Math.hypot(e.x - z.x, e.y - z.y) > z.r + e.r) continue;
        if (z.kind === 'poisonMist') {
          // Each monster the cloud touches is poisoned (again, if it's still in it a second later).
          if ((z.touched.get(e.id) ?? -Infinity) > z.life + 1) continue;
          z.touched.set(e.id, z.life);
        }
        this.spellHit(z.c, e, z.k, z.x, z.y);
      }
    }
    this.zones = this.zones.filter((z) => z.life > 0 && Math.hypot(z.x, z.y) < Math.hypot(this.halfW, this.halfH) + z.r * 2);

    // The plague spreads by touch.
    for (const e of this.enemies) {
      const p = e.plague;
      if (!p) continue;
      p.left -= dt;
      if (p.left <= 0 || e.hp <= 0) {
        e.plague = undefined;
        continue;
      }
      for (const o of this.enemies)
        if (o !== e && !o.plague && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= e.r + o.r + 4) {
          this.infect(o, { who: p.by, dtype: 'poison' }, p.amount * PLAGUE_SPREAD);
          if (o.plague) this.events.push({ type: 'nova', x: o.x, y: o.y, r: o.r + 6, color: DAMAGE_TYPES.poison.color });
        }
    }
  }

  /** Raise Dead: a monster dying on cursed ground rises to fight for whoever cursed it. */
  private raiseFallen(e: Enemy): void {
    const z = this.zones.find((z) => z.kind === 'raiseDead' && Math.hypot(e.x - z.x, e.y - z.y) <= z.r + e.r);
    if (!z || e.boss) return;
    const look = enemyDef(e.type);
    this.summons.push({ who: z.c.who, type: 'undead', x: e.x, y: e.y, life: RISEN.life, maxLife: RISEN.life, bite: 0, look: 'wisp', dash: 0, dashHit: false, risen: { c: z.c, enemy: look.id } });
    this.events.push({ type: 'spell', fx: 'rise', x: e.x, y: e.y, r: e.r + 8, color: DAMAGE_TYPES.decay.color });
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
        (s.own || s.risen || (s.gear ? this.game.equipped(s.who).some((it) => it?.uid === s.gear!.uid) : this.game.weaponClassOf(s.who)?.summon)),
    );
    for (const who of new Set(this.summons.filter((s) => !s.gear && !s.own && !s.risen).map((s) => s.who))) {
      const dash = this.weaponDef(who)?.summon?.dash;
      const owner: { dashCd: number } = who === this.lead ? this : this.helpers.find((h) => h.id === who)!;
      if (!dash || owner.dashCd > 0) continue;
      let lunged = false;
      for (const s of this.summons) {
        if (s.who !== who || s.gear || s.own || s.risen) continue;
        const e = this.nearest(s.x, s.y, dash.range);
        if (!e || s.dash > 0) continue;
        s.dash = dash.range / dash.speed + 0.05;
        s.dashHit = false;
        lunged = true;
      }
      if (lunged) owner.dashCd = dash.cooldown * this.game.cooldownMult(who);
    }
    for (const s of this.summons) {
      const sm = s.gear ?? s.own ?? (s.risen ? { bites: RISEN.bites, speed: enemyDef(s.risen.enemy).speed * 1.2 } : this.game.weaponClassOf(s.who)!.summon!);
      const dash = s.gear || s.own || s.risen ? undefined : this.weaponDef(s.who)?.summon?.dash;
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
          if (s.risen) this.spellHit(s.risen.c, e, RISEN.k, s.x, s.y);
          else if (s.gear) this.abilityHit(s.who, e, s.gear.base * m, s.gear.damageType, false);
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
    // Executioner: monsters near death take extra.
    const exec = e.hp < e.maxHp * MELEE_ARTS.executeAt ? this.arts(shooter, mode ?? 'long').find((a) => a.art === 'executioner') : undefined;
    if (exec) mult *= 1 + exec.power;
    const base = (g.shotDamage(shooter, enemyDef(e.type).archetype, mode) * mult * (crit ? g.critMultOf(shooter) : 1)) / types.length;
    const d = Math.hypot(e.x - fromX, e.y - fromY) || 1;
    for (const t of types) {
      const dmg = base * this.typeMultOn(t, e) * g.typeBonus(shooter, t);
      this.damage(e, dmg, crit, (e.x - fromX) / d, (e.y - fromY) / d, shooter, t);
      // Each type rolls its own effect (an infused type at its infusion's chance).
      if (status && g.rng() < g.procFor(shooter, t, mode, special)) this.applyStatus(e, t, dmg, shooter, g.procRarity(shooter, mode, special));
    }
    // Executioner: a monster left near death may be finished off outright (never a Guardian).
    if (e.hp > 0 && !e.boss && e.hp < e.maxHp * MELEE_ARTS.executeAt) {
      const ex = this.arts(shooter, mode ?? 'long').find((a) => a.art === 'executioner');
      if (ex && g.rng() < ex.chance) {
        this.say(e.x, e.y - e.r - 10, 'EXECUTE', '#ff5a5a', 10);
        this.damage(e, e.hp, true, 0, 0, shooter, types[0]);
      }
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
    // Extended Effects: everything lasts longer at the same strength per second (so damage over time deals more).
    const ext = this.game.effectDurationMult(by);
    const dot = (cur: Dot | undefined, share: number, duration: number): Dot => {
      const dps = (dmg * share) / duration;
      const left = duration * ext;
      const ticks = Math.round(left / STATUS.tick);
      return cur && cur.left > 0 && cur.dps > dps ? { ...cur, left, ticks } : { dps, left, by, acc: cur?.acc ?? 0, ticks };
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
          e.poison.maxHpPerTick = Math.max(e.poison.maxHpPerTick ?? 0, pct / Math.round(p.duration / STATUS.tick));
        }
        break;
      case 'frost':
        e.slow = Math.max(e.slow ?? 0, STATUS.chill.duration * k * ext);
        break;
      case 'acid':
        if (e.acidPuddle && e.acidPuddle.life > 0) {
          // Its puddle is still there: refresh it where the monster is now, at the stronger strength.
          Object.assign(e.acidPuddle, { x: e.x, y: e.y, life: STATUS.acid.duration * ext, shooter: by, abs: Math.max(e.acidPuddle.abs ?? 0, dmg * STATUS.acid.share) });
        } else {
          e.acidPuddle = { shooter: by, x: e.x, y: e.y, r: STATUS.acid.radius, life: STATUS.acid.duration * ext, tick: 0, dmg: 0, abs: dmg * STATUS.acid.share, dtype: 'acid' };
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
          const left = STATUS.aura.duration * ext;
          const ticks = Math.round(left / STATUS.tick);
          e.aura = e.aura && e.aura.dps > dps ? { ...e.aura, left, ticks } : { dps, left, by, acc: e.aura?.acc ?? 0, ticks };
        }
        break;
      case 'arcane':
        e.exposed = STATUS.expose.duration * k * ext;
        break;
      case 'lightning':
        this.arc(e, dmg * STATUS.arc.share, by);
        break;
      case 'void':
        if (e.hp > 0) {
          e.well = STATUS.well.duration * k * ext;
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
      if (b.life <= 0 && b.arts?.ricochet && !b.hits.length) {
        // Ricochet Rounds: a bolt that missed bounces once toward the nearest monster.
        b.arts.ricochet = false;
        const next = this.nearest(b.x, b.y, MELEE_ARTS.ricochetRange);
        if (next) {
          const speed = Math.hypot(b.vx, b.vy);
          const a = Math.atan2(next.y - b.y, next.x - b.x);
          b.vx = Math.cos(a) * speed;
          b.vy = Math.sin(a) * speed;
          b.life = (MELEE_ARTS.ricochetRange + 20) / speed;
        }
      }
      if (b.kind === 'potion') {
        // Flies to its target point, then shatters into a puddle.
        if (b.life <= 0 || (b.tx !== undefined && (b.tx - b.x) * b.vx + (b.ty! - b.y) * b.vy <= 0)) {
          b.life = 0;
          const ticks = b.ticks ?? (b.shooter === 'main' ? undefined : hunterDef(b.shooter).special?.ticks) ?? 6;
          this.puddles.push({ shooter: b.shooter, x: b.tx ?? b.x, y: b.ty ?? b.y, r: b.radius ?? 40, life: ticks * PUDDLE_TICK, tick: 0, dmg: b.dmg, dtype: b.dtype, cast: b.cast, k: b.k });
        }
        continue;
      }
      for (const e of this.enemies) {
        if (e.hp <= 0 || b.life <= 0 || b.hits.includes(e.id)) continue;
        const rr = e.r + (b.size ?? BULLET_RADIUS);
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        if (dx * dx + dy * dy > rr * rr) continue;
        b.hits.push(e.id);
        this.bulletHit(b, e);
        // Overpenetration: each kill lets it pierce one more.
        if (b.arts?.overpen && e.hp <= 0) b.pierce++;
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
    if (b.cast) {
      // A spell's projectile: a fireball bursts, the rest strike what they hit.
      if (b.kind === 'fireball') {
        const r = b.radius ?? 50;
        this.events.push({ type: 'explode', x: b.x, y: b.y, r, color: DAMAGE_TYPES[b.cast.dtype].color, magic: b.cast.dtype });
        for (const o of [...this.enemies]) if (o.hp > 0 && Math.hypot(o.x - b.x, o.y - b.y) <= r + o.r) this.spellHit(b.cast, o, b.k ?? 1, b.x, b.y);
        b.life = 0;
      } else this.spellHit(b.cast, e, b.k ?? 1, b.x - b.vx, b.y - b.vy);
      return;
    }
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
    if (b.elem) this.elementalArrow(b, e);
    if (b.arts) this.shotArtsHit(b, e);
    if (b.blast) {
      // A Blast Dagger (or exploding round or arrow) goes off: everything around (the monster it struck included) takes the blast.
      this.events.push({ type: 'explode', x: e.x, y: e.y, r: b.blast.r, color: this.typeColor(b.shooter, b.mode) });
      for (const o of [...this.enemies]) if (o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= b.blast.r + o.r) this.hitWith(b.shooter, o, b.blast.k, e.x, e.y, undefined, b.mode);
      b.blast = undefined;
      b.life = 0;
    }
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
      if (p.cast) {
        for (const e of [...this.enemies]) if (e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) <= p.r + e.r) this.spellHit(p.cast, e, p.k ?? 1, p.x, p.y);
      } else if (p.abs !== undefined) this.hitArea(p.x, p.y, p.r, p.abs, p.dtype ?? 'acid', p.shooter);
      else for (const e of this.enemies) if (e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) <= p.r + e.r) this.hitWith(p.shooter, e, p.dmg, p.x, p.y, undefined, undefined, true, false, p.dtype);
    }
    this.puddles = this.puddles.filter((p) => p.life > 0);
  }

  private damage(e: Enemy, dmg: number, crit: boolean, dirX: number, dirY: number, shooter: Shooter = 'main', dtype: DamageType = 'physical'): void {
    if (e.hp <= 0) return;
    if (e.mark) dmg *= 1 + e.mark.bonus;
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
      const reward = this.game.registerKill(e.type, e.boss, shooter, !!e.golden);
      if (e.golden) this.say(e.x, e.y - 18, `×${GOLDEN_GOLD} GOLD!`, '#ffd84a', 12);
      if (this.zones.length) this.raiseFallen(e);
      this.bloodthirst(shooter);
      this.quickDrawKill(shooter);
      // Fireburst (an enchantment): monsters the weapon kills burst, hurting everything around them.
      const burst = this.game.killBurst(shooter);
      if (burst && this.game.rng() < burst.chance) this.abilityBurst(shooter, e.x, e.y, burst.radius, burst.base, burst.damageType);
      this.events.push({ type: 'kill', x: e.x, y: e.y, enemy: e.type, boss: e.boss, reward });
      // Double or Nothing (Ted in this area).
      if (reward.luck === 'double') this.say(e.x, e.y - 14, '×2!', '#ffd84a', 11);
      else if (reward.luck === 'bust') this.say(e.x, e.y - 14, 'BUST', '#9a9aa8', 9);
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
    // An elemental tap ability sets off its effect on everything the blast hit (Flame Burst's only when it's ready).
    const ignite = ability === 'flame' && this.flameCd <= 0 && hit.length > 0;
    if (ignite) this.flameCd = FLAME_BURST_COOLDOWN * g.cooldownMult('main');
    for (const { e, dmg: amount } of hit) {
      if (ability === 'flame') {
        if (ignite && e.hp > 0) this.applyStatus(e, 'fire', amount, 'main');
      } else if (ability === 'frost' && e.hp > 0 && !this.immuneTo(e, 'frost')) e.slow = Math.max(e.slow ?? 0, FROST_TAP_CHILL * g.effectDurationMult('main'));
      else if (ability === 'thunder' && !this.immuneTo(e, 'lightning')) this.arc(e, amount * STATUS.arc.share, 'main');
      else if (ability === 'miasma' && e.hp > 0) this.applyStatus(e, 'poison', amount, 'main', g.procRarity('main'));
    }
    // Melting Miasma: when it's ready, the tap also leaves a poison puddle the size of the blast.
    if (ability === 'miasma' && this.miasmaCd <= 0) {
      this.miasmaCd = MIASMA_PUDDLE.cooldown * g.cooldownMult('main');
      const life = MIASMA_PUDDLE.ticks * PUDDLE_TICK * g.effectDurationMult('main');
      this.puddles.push({ shooter: 'main', x, y, r: g.tapRadius, life, tick: 0, dmg: 0, abs: g.tapDamage * MIASMA_PUDDLE.share, dtype: 'poison' });
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }
}
