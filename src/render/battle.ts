import { buzz } from '../ui/haptics';
import { battleSfx as sfx } from '../ui/sound';
import { MAGIC_SFX, SFX } from '../ui/sfxConfig';
import { areaDef, DAMAGE_TYPES, FIELD_ZOOM, FLYING, gearDef, WEAPON_CLASSES, STATUS, enemyDef, eventDef, fieldZoom, GUARDIAN_TIME, hunterDef, materialDef, SIZE_SCALE, type AreaId, type DamageType, type EnemyId, type EnemyShape, type SummonType } from '../core/balance';
import { DICE_FLIGHT, DICE_REST, PLAYER_RADIUS, SHOT_RADIUS, SUMMON_RADIUS, TOME_LIFE, TOME_OPEN, type EnemyShot, type Summon, type SpellZone, type FieldEvent, type Bullet, type BulletKind, type Enemy, type Field, type Helper, type Puddle } from '../core/field';
import { MATERIAL_SPRITES } from '../core/materialSprites';
import { fmt } from '../core/format';
import type { Game, Shooter } from '../core/game';
import type { ClarityLevel, FxKey } from '../core/state';
import { canvasFont, fitCanvas, Fx } from './fx';
import { effectImage, gearImage, hunterSheetImage, monsterSheetImage, sprite } from './sprites';
import { HUNTER_SHEETS } from './hunterSheets';
import { EFFECTS, type EffectKey } from './effectSheets';
import { areaBackground, areaScene, drawVignette, type SceneProp } from './backgrounds';
import { MONSTER_SHEETS, SHEETS, sheetRow, sideFlip, type MonsterSheet } from './monsterSheets';
import { GEAR_SPRITES } from '../core/gearSprites';
import { emojiIconKey } from '../ui/emojiIcons';
import { HUNTER_ICONS, hunterIconHtml } from '../ui/hunterIcons';
import { drawFramedBar, TIMER_COLOR } from './hudBars';
import { outlineOf } from './outline';

/** Frame heights (in its pixels) of an event's timer, a Guardian's health bar and the Guardian's timer. */
const EVENT_BAR_H = 9;
const HP_BAR_H = 15;
const TIME_BAR_H = 9;
/** About how wide the pick-up pop-ups get, for keeping them clear of the rest of the HUD. */
const GAIN_POPS_W = 90;

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
  /** Grows from the centre (a focus's wave) instead of from 40% of its size. */
  grow?: boolean;
  /** Drawn as a circle of square pixels, with a fainter ring inside and a scatter of pixels across it. */
  pixel?: boolean;
  scatter?: Cell[];
}

interface Beam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  t: number;
  /** Lightning: a jagged bolt (its kinks, as offsets across the line, fixed when it appears). */
  kinks?: number[];
}

/** The battlefield's zoom: set each frame from the area you're in (later areas are bigger, so zoomed out more). */
let Z = 0.6;

const OUTLINE = '#120c1c';
const SPRITE_SCALE = 2.4;
/** Pixels from head to toe of a top-down Hunter sprite (your Hunter's), drawn at the Hunter's size. */
const TOPDOWN_HEIGHT = 25;
/**
 * Hunters, monsters and their summons are drawn this much bigger than their world size: the Woods' Hunters at
 * a zoom of 1 (later areas still zoom out from there) while the view, ranges and hit areas stay as they are.
 */
const CHAR_SCALE = 1 / FIELD_ZOOM;
/** Animated walk sheets: the character's longer side, × the monster's radius (detailed art needs room). */
const SHEET_SCALE = 3.3;

/** Draws the survivor-style battlefield: the Hunter in the middle, the horde closing in. */
export class BattleView {
  private g: CanvasRenderingContext2D;
  private fx = new Fx();
  private pickups: Pickup[] = [];
  private rings: Ring[] = [];
  /** When each puddle first appeared (for its bubbles' animation). */
  private puddleBorn = new WeakMap<object, number>();
  /** Explosions (fireballs, staff spells): a burst of fiery squares that spreads and fades. */
  private blasts: Array<{ x: number; y: number; r: number; t: number; cells: Cell[]; colors: string[] }> = [];
  private beams: Beam[] = [];
  /** Animated magic effects playing once (explosions, strikes, puffs): see effectSheets.ts. */
  private anims: Anim[] = [];
  /** Spear thrusts: a streak turned along the stab. */
  private strikes: Strike[] = [];
  /** Ability cooldown icons, overlaid on the battlefield. */
  private cooldownBar: CooldownBar;
  /** Melee sweeps and swipes: a fading arc in front of the attacker. */
  /** Each Hunter's last weapon attack (seconds since, and the angle), for the held-weapon animation. */
  private swings = new Map<Shooter, { t: number; a: number }>();
  /** The current scene's big objects (null until its pictures load), and the obstacles made from them. */
  private sceneProps: SceneProp[] | null = null;
  private sweeps: Array<{ x: number; y: number; a: number; arc: number; r: number; color: string; t: number; blade?: boolean }> = [];
  private time = 0;
  private shake = 0;
  private stunTextCooldown = 0;
  private banner: { text: string; color: string; life: number } | null = null;
  private w = 0;
  private h = 0;
  private specks: Array<{ x: number; y: number; r: number }> = [];

  private cssSize: [number, number] | null = null;
  private resize: ResizeObserver;
  /** Drawn and tapped: false for your own view while another area is observed, and for a closed observer. */
  active = true;

  constructor(
    private canvas: HTMLCanvasElement,
    private game: Game,
    private field: Field,
  ) {
    this.g = canvas.getContext('2d')!;
    // The canvas's CSS size, kept up to date here: measuring it every frame forced the page to lay out again
    // whenever the menus had changed.
    this.resize = new ResizeObserver(() => (this.cssSize = [canvas.clientWidth, canvas.clientHeight]));
    this.resize.observe(canvas);
    this.cooldownBar = new CooldownBar(canvas.parentElement!, game, field);
    this.fx.textScale = CHAR_SCALE;
    // Static ground detail in normalized coords, so it scales with the view.
    for (let i = 0; i < 70; i++) this.specks.push({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 3 });

    canvas.addEventListener('pointerdown', (e) => {
      // Only the view being drawn takes taps (not yours while another area's field is observed).
      if (!this.active) return;
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      // Screen -> world (the field is drawn zoomed out around the center).
      this.field.tap((e.clientX - r.left - this.w / 2) / Z, (e.clientY - r.top - this.h / 2) / Z);
      buzz();
    });

    game.on((e) => {
      if (e.type === 'guardianFail') this.showBanner('The Guardian retreats…', '#ffb04d');
      if (e.type === 'areaUnlocked') this.showBanner(`${areaDef(e.area).name} unlocked!`, '#9fe0ff');
      else if (e.type === 'finalGuardian') this.showBanner('The Time Eater is defeated!', '#ffe36e');
      if (e.type === 'unlock') this.showBanner(`${enemyDef(e.enemy).name}s now roam!`, enemyDef(e.enemy).color);
      if (e.type === 'travel') {
        this.pickups = [];
        this.showBanner(areaDef(game.area).name, '#ffffff');
      }
      if (e.type === 'eventStart' && eventDef(e.event).kind !== 'guardian') this.showBanner(`${eventDef(e.event).name}!`, '#7be07b');
      if (e.type === 'eventEnd') this.showBanner(`${eventDef(e.event).name} is over`, '#c9c2dc');
    });
  }

  /** Shows or hides this view (its cooldown icons with it) while another one is drawn on the same canvas. */
  setActive(on: boolean): void {
    this.active = on;
    this.cooldownBar.el.style.visibility = on ? '' : 'hidden';
  }

  /** An observer's view is closed: its overlay and listeners go. */
  dispose(): void {
    this.active = false;
    this.resize.disconnect();
    this.cooldownBar.el.remove();
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
          // Weak spots get bigger numbers (and show more often); resisted hits smaller ones. Each kind can be
          // switched off in Settings.
          if (!this.fxOn(e.crit ? 'dmgCrit' : e.affinity === 'weak' ? 'dmgWeak' : e.affinity === 'resist' ? 'dmgResist' : 'dmgNormal')) break;
          if (e.crit) this.fx.text(e.x, e.y, fmt(e.dmg), '#ff5a5a', e.affinity === 'weak' ? 14 : 12, 0.6);
          else if (e.affinity === 'weak') {
            if (Math.random() < 0.5) this.fx.text(e.x, e.y, `${fmt(e.dmg)}!`, DAMAGE_TYPES[e.dtype].color, 10.5, 0.55);
          } else if (Math.random() < 0.25) this.fx.text(e.x, e.y, fmt(e.dmg), DAMAGE_TYPES[e.dtype].color, e.affinity === 'resist' ? 7 : 8.5, 0.5);
          break;
        case 'say':
          this.fx.text(e.x, e.y, e.text, e.color, e.size, 0.8);
          break;
        case 'kill': {
          const color = e.boss ? '#ffd34d' : enemyDef(e.enemy).color;
          sfx(e.boss ? 'guardianKill' : 'kill');
          if (this.fancy) this.playEffect('puff', e.x, e.y, e.boss ? 90 : 26, 'center', 22);
          this.fx.burst(e.x, e.y, color, e.boss ? 40 : 8, e.boss ? 260 : 140, e.boss ? 5 : 3, 0);
          this.dropPickup(e.x, e.y, '#ffd34d', false, e.boss ? 12 : 1);
          if (e.reward.material) this.dropPickup(e.x, e.y, materialDef(e.reward.material).color, true, Math.min(8, e.reward.amount));
          if (e.boss) this.shake = 0.4;
          break;
        }
        case 'blast':
          sfx('tap');
          // An elemental tap ability also sounds like its element.
          if (e.color && e.color !== '#f4f4f4') sfx(MAGIC_SFX[elementOf(e.color)]);
          // An elemental tap ability gets its spell: a fire explosion, a lightning strike or a falling ice shard.
          if (this.fancy && e.color === DAMAGE_TYPES.fire.color) this.playEffect('explosion', e.x, e.y, this.game.tapRadius * 2);
          else if (this.fancy && e.color === DAMAGE_TYPES.lightning.color) this.playEffect('lightning', e.x, e.y + 6, this.game.tapRadius * 2.4, 'bottom', 22);
          else if (this.fancy && e.color === DAMAGE_TYPES.frost.color) this.playEffect('ice', e.x, e.y + 6, this.game.tapRadius * 1.8, 'bottom', 20);
          this.rings.push({ x: e.x, y: e.y, t: 0, r: this.game.tapRadius, color: e.color ? hexRgb(e.color) : '255,255,255', max: 0.25 });
          if (e.color) this.fx.burst(e.x, e.y, e.color, 10, 160, 3, 0);
          break;
        case 'explode': {
          const radiant = e.color === DAMAGE_TYPES.radiant.color;
          // A spell's blast sounds like its element (if that has a sound); other blasts, a plain explosion.
          if (e.magic && SFX[MAGIC_SFX[e.magic]].clip) sfx(MAGIC_SFX[e.magic]);
          else sfx('explosion');
          if (radiant && !this.fxOn('radiant')) break;
          if (this.game.state.settings.aoeStyle === 'basic') {
            this.rings.push({ x: e.x, y: e.y, t: 0, r: e.r, color: radiant ? '255,227,110' : '255,138,61', max: 0.3, fill: true });
            this.fx.burst(e.x, e.y, '#ffb04d', 8, 160, 3, 0);
          } else if (radiant) this.playEffect('sunstrike', e.x, e.y + e.r * 0.3, e.r * 2.2, 'bottom', 22);
          else this.playEffect('explosion', e.x, e.y, e.r * 2.3);
          break;
        }
        case 'nova':
          if (this.game.state.settings.aoeStyle === 'basic') this.rings.push({ x: e.x, y: e.y, t: 0, r: e.r, color: hexRgb(e.color ?? '#fff0be'), max: 0.35 });
          else this.rings.push({ x: e.x, y: e.y, t: 0, r: e.r, color: hexRgb(e.color ?? '#fff0be'), max: 0.4, pixel: true, scatter: sparseCells(e.r, Math.random() * 1e6) });
          break;
        case 'beam':
          // A spear's thrust: a white streak shooting out along the stab.
          if (this.fancy && e.thrust) {
            const len = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
            this.strikes.push({ key: 'thrust', x: e.x1, y: e.y1, a: Math.atan2(e.y2 - e.y1, e.x2 - e.x1), len, thick: Math.max(10, e.width * 1.5), t: 0, color: e.color });
            break;
          }
          // Lightning called down from the sky (Thunder Totem, Thunder Call) strikes as a bolt.
          if (e.zigzag && e.y2 - e.y1 > 150) sfx('magicLightning');
          if (this.fancy && e.zigzag && e.y2 - e.y1 > 150) {
            this.playEffect('lightning', e.x2, e.y2 + 4, 70, 'bottom', 22);
            break;
          }
          this.beams.push({ ...e, t: 0, kinks: e.zigzag ? Array.from({ length: 6 }, () => (Math.random() - 0.5) * 16) : undefined });
          break;
        case 'wave':
          this.rings.push({ x: e.x, y: e.y, t: 0, r: e.r, color: hexRgb(e.color), max: e.time + 0.1, grow: true });
          break;
        case 'slam':
          // A hammer's ground slam: an impact that bursts into a shockwave ring (a plain ring in Basic), dust
          // kicked up all around, and a jolt.
          // The sheet's first frames gather energy before it bursts: a hammer just bursts, so start there.
          if (this.fancy) this.playEffect('smash', e.x, e.y, e.r * 2.1, 'center', 26, SMASH_START, 0.55, e.color);
          else this.rings.push({ x: e.x, y: e.y, t: 0, r: e.r, color: e.color === PHYSICAL_COLOR ? '232,216,176' : hexRgb(e.color), max: 0.35 });
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            this.fx.burst(e.x + Math.cos(a) * e.r * 0.6, e.y + Math.sin(a) * e.r * 0.6, i % 2 ? '#c8b48a' : '#8a7a5a', 2, 90, 4, 300, true);
          }
          this.shake = Math.max(this.shake, 0.16);
          break;
        case 'punch':
          // A golden fist shoots out of a portal on Sciirj toward the monster.
          if (this.fancy) this.strikes.push({ key: 'fist', x: e.x, y: e.y, a: e.a, len: e.r * 0.75, thick: 0, t: 0 });
          this.shake = Math.max(this.shake, 0.14);
          break;
        case 'sweep':
          this.sweeps.push({ ...e, t: 0 });
          if (e.heavy) this.shake = Math.max(this.shake, 0.12); // a hammer's smash
          break;
        case 'attack': {
          this.swings.set(e.who, { t: 0, a: e.a });
          // A bow, a gun or a bare-handed bolt is a shot; a blade, spear or hammer a swing (a nova or a summon, neither).
          const how = this.game.weaponClassOf(e.who)?.attack ?? 'shot';
          if (how === 'shot') sfx('rangedShot');
          else if (how !== 'nova' && how !== 'summon') sfx('meleeSwing');
          break;
        }
        case 'reload':
          break; // drawn each frame as "RELOADING!" (drawReloads)
        case 'dodge':
          this.fx.text(e.x, e.y - 30, 'DODGE', '#c8f0ff', 12, 0.6);
          break;
        case 'enemyShot':
          this.fx.burst(e.x, e.y, '#b07ce0', 4, 50, 2, 0);
          break;
        case 'parry':
          // Smashed out of the air: a spray of sparks and shards.
          this.fx.burst(e.x, e.y, '#fff4d0', 8, 150, 2, 0, true);
          this.fx.burst(e.x, e.y, '#b07ce0', 6, 90, 3, 0, true);
          this.fx.text(e.x, e.y - 14, 'BREAK', '#fff4d0', 10, 0.5);
          break;
        case 'deflect': {
          // Glances off the shield: a flash of the shield and the bolt's sparks thrown off to the side.
          const h = e.who === 'main' ? { x: 0, y: 0 } : (this.field.helpers.find((x) => x.id === e.who) ?? { x: 0, y: 0 });
          if (this.fancy) this.playEffect('shield', h.x, h.y, (PLAYER_RADIUS * CHAR_SCALE + 12) * 2, 'center', 24);
          else this.rings.push({ x: h.x, y: h.y, t: 0, r: PLAYER_RADIUS * CHAR_SCALE + 10, color: '200,220,255', max: 0.3 });
          for (let i = 0; i < 6; i++) this.fx.burst(e.x + Math.cos(e.a) * i * 5, e.y + Math.sin(e.a) * i * 5, i % 2 ? '#d8e8ff' : '#b07ce0', 1, 60, 2.5, 0, true);
          this.fx.text(h.x, h.y - PLAYER_RADIUS * CHAR_SCALE - 22, 'DEFLECT', '#d8e8ff', 12, 0.6);
          break;
        }
        case 'thorns':
          if (this.fancy) this.playEffect('spikes', e.x, e.y + e.r, Math.max(30, e.r * 2.6), 'bottom', 24);
          break;
        case 'guard':
          sfx('block');
          if (this.fancy) this.playEffect('shield', e.x, e.y, (PLAYER_RADIUS * CHAR_SCALE + 12) * 2, 'center', 24);
          else this.rings.push({ x: e.x, y: e.y, t: 0, r: PLAYER_RADIUS * CHAR_SCALE + 10, color: '255,232,163', max: 0.3 });
          this.fx.text(e.x, e.y - 30, 'BLOCK', '#ffe8a3', 12, 0.6);
          break;
        case 'boss':
          sfx('guardianAppears');
          this.shake = 0.3;
          this.showBanner('THE GUARDIAN APPEARS', '#ff5a6a');
          break;
        case 'stun':
          sfx(e.who === 'main' ? 'stunned' : 'allyStunned');
          this.shake = Math.max(this.shake, e.boss ? 0.35 : 0.15);
          this.fx.burst(e.x, e.y, '#ffe066', 6, 120, 2, 0);
          if (e.who === 'main' && this.stunTextCooldown <= 0) {
            this.fx.text(0, -PLAYER_RADIUS * CHAR_SCALE - 26, 'STUNNED!', '#ffe066', 16, 0.8);
            this.stunTextCooldown = 1;
          } else if (e.who !== 'main') {
            const h = this.field.helpers.find((x) => x.id === e.who);
            if (h) this.fx.text(h.x, h.y - PLAYER_RADIUS * CHAR_SCALE - 22, 'STUNNED!', '#ffe066', 14, 0.8);
          }
          break;
        case 'spell':
          sfx(MAGIC_SFX[elementOf(e.color)]);
          this.spellEvent(e);
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
    for (const b of this.blasts) b.t += dt;
    this.blasts = this.blasts.filter((b) => b.t < BLAST_TIME);
    for (const a of this.anims) a.t += dt;
    this.anims = this.anims.filter((a) => a.start + a.t * a.fps < EFFECTS[a.key].frames);
    this.emitTrails(dt);
    for (const st of this.strikes) st.t += dt;
    this.strikes = this.strikes.filter((st) => st.t * STRIKE_FPS[st.key] < EFFECTS[st.key].frames);
    this.rings = this.rings.filter((r) => r.t < r.max);
    for (const b of this.beams) b.t += dt;
    this.beams = this.beams.filter((b) => b.t < 0.25);
    for (const sw of this.swings.values()) sw.t += dt;
    for (const w of this.sweeps) w.t += dt;
    this.sweeps = this.sweeps.filter((w) => w.t < 0.2);
    this.fx.update(dt);
  }

  /** Fire Starter's burning sticks: the Twigs icon smouldering, embers rising off it, fading as it burns out. */
  private drawSticks(g: CanvasRenderingContext2D, p: Puddle): void {
    const fade = Math.min(1, p.life / 0.8);
    const img = gearImage(MATERIAL_SPRITES.twig);
    const s = p.r * 1.1;
    g.save();
    g.globalAlpha = fade;
    // A warm glow on the ground: as far as the sticks burn.
    g.fillStyle = 'rgba(255,120,30,0.18)';
    g.beginPath();
    g.ellipse(p.x, p.y, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
    g.fill();
    if (img) {
      g.imageSmoothingEnabled = false;
      g.drawImage(img, p.x - s / 2, p.y - s / 2, s, s);
    }
    if (this.fxOn('burn')) {
      const colors = ['#ffd23a', '#ff8a2a', '#e8321e'];
      for (let i = 0; i < 5; i++) {
        const t = (this.time * 1.6 + i / 5) % 1;
        const sx = p.x + Math.sin(i * 2.1 + this.time * 3) * p.r * 0.45;
        g.fillStyle = colors[i % 3];
        g.globalAlpha = fade * (1 - t);
        g.fillRect(sx - 1, p.y - t * p.r * 0.9 - 1, 2, 2);
      }
    }
    g.restore();
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
    // One canvas pixel per CSS pixel (not per device pixel): drawn chunky, then scaled up crisply.
    this.cssSize ??= [this.canvas.clientWidth, this.canvas.clientHeight];
    const { w, h } = fitCanvas(this.canvas, this.g, 1, this.cssSize);
    this.w = w;
    this.h = h;
    Z = fieldZoom(this.game.area);
    // Floating text scales with the characters (CHAR_SCALE in world units, so smaller as areas zoom out).
    this.fx.textScale = CHAR_SCALE;
    this.fx.zoom = Z;
    this.field.setView(w, h);
    const g = this.g;
    const scene = areaScene(this.game.area, w, h);
    // The scene's big objects stand on the field: monsters walk around their bases (in world units).
    if ((scene?.props ?? null) !== this.sceneProps) {
      this.sceneProps = scene?.props ?? null;
      this.field.obstacles = (this.sceneProps ?? []).flatMap((p) => (p.base ? [{ x: (p.base.x - w / 2) / Z, y: (p.base.y - h / 2) / Z, r: p.base.r / Z }] : []));
    }
    if (scene) g.drawImage(scene.ground, 0, 0);
    else {
      const [ground, speck] = areaDef(this.game.area).ground;
      g.fillStyle = ground;
      g.fillRect(0, 0, w, h);
      g.fillStyle = speck;
      for (const s of this.specks) g.fillRect(Math.round(s.x * w), Math.round(s.y * h), Math.ceil(s.r), Math.ceil(s.r));
    }

    g.save();
    g.translate(w / 2, h / 2);
    if (this.shake > 0) g.translate((Math.random() - 0.5) * 24 * this.shake, (Math.random() - 0.5) * 24 * this.shake);
    g.scale(Z, Z);

    // Potion and acid puddles: bubbling pools (acid's are simply smaller and yellower).
    const basic = this.game.state.settings.aoeStyle === 'basic';
    for (const p of this.field.puddles) {
      if (p.sticks) {
        this.drawSticks(g, p);
        continue;
      }
      if (p.dtype === 'acid' && !this.fxOn('acid')) continue;
      if (basic) {
        const rgb = p.dtype === 'acid' ? '198,240,58' : '123,224,123';
        g.fillStyle = `rgba(${rgb},${0.25 * Math.min(1, p.life)})`;
        g.strokeStyle = `rgba(${rgb},${0.6 * Math.min(1, p.life)})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        continue;
      }
      // A bubbling pool: it spills out where the flask breaks, its edge rippling, with bubbles rising and popping
      // across it, then shrinks and fades as it dries up.
      let born = this.puddleBorn.get(p);
      if (born === undefined) this.puddleBorn.set(p, (born = this.time));
      drawPotionPool(g, p, this.time - born, p.dtype === 'acid');
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

    // Walking monsters and the scene's big objects, farthest first, so a monster behind a tree or a coffin is
    // hidden by it; fliers pass over everything.
    const props = this.sceneProps ?? [];
    const layered: Array<{ y: number; e?: Enemy; p?: SceneProp }> = [];
    for (const e of this.field.enemies) if (!FLYING.has(e.type)) layered.push({ y: e.y + e.r * CHAR_SCALE, e });
    for (const p of props) layered.push({ y: (p.foot - h / 2) / Z, p });
    layered.sort((a, b) => a.y - b.y);
    g.imageSmoothingEnabled = false;
    for (const it of layered) {
      if (it.e) this.scaledAt(g, it.e.x, it.e.y, () => this.drawEnemy(g, it.e!));
      else {
        const p = it.p!;
        g.drawImage(p.img, (p.x - w / 2) / Z, (p.y - h / 2) / Z, p.img.naturalWidth / Z, p.img.naturalHeight / Z);
      }
    }
    for (const e of this.field.enemies) if (FLYING.has(e.type)) this.scaledAt(g, e.x, e.y, () => this.drawEnemy(g, e));
    this.drawHeld(g);
    for (const h of this.field.helpers) this.scaledAt(g, h.x, h.y, () => this.drawHelper(g, h));
    this.scaledAt(g, 0, 0, () => this.drawHunter(g));
    this.drawBoneWall(g);

    for (const z of this.field.zones) this.drawZone(g, z);
    for (const f of this.field.fissures) {
      // Earthshatter: a jagged crack glowing with the hammer's element, fading as it closes.
      const fade = Math.min(1, f.life / 0.5);
      const n = 8;
      const dx = (f.x2 - f.x1) / n;
      const dy = (f.y2 - f.y1) / n;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len;
      const py = dx / len;
      const path = () => {
        g.beginPath();
        for (let i = 0; i <= n; i++) {
          const j = i === 0 || i === n ? 0 : ((i * 7) % 5) - 2;
          const x = f.x1 + dx * i + px * j * 3;
          const y = f.y1 + dy * i + py * j * 3;
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
      };
      g.save();
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.globalAlpha = 0.35 * fade;
      g.strokeStyle = f.color === DAMAGE_TYPES.physical.color ? '#c8a878' : f.color;
      g.lineWidth = f.width;
      path();
      g.stroke();
      g.globalAlpha = 0.9 * fade;
      g.strokeStyle = '#2a2018';
      g.lineWidth = 4;
      path();
      g.stroke();
      g.restore();
    }
    for (const b of this.field.bullets) drawBullet(g, b, this.time, this.game.state.settings.aoeStyle === 'basic');
    this.drawTomes(g);
    this.drawDice(g);
    for (const s of this.field.shots) drawEnemyShot(g, s, this.time, CHAR_SCALE, this.clarity);

    // Tome spirits: a glowing wisp with a trailing tail, fading as their time runs out.
    for (const sm of this.field.summons) {
      if (sm.risen) {
        this.drawRisen(g, sm);
        continue;
      }
      // A creature with a monster's art: that monster, tinted toward the summon's element (Physical ones keep
      // their colours and get a purple outline instead), so it reads as yours.
      if (this.drawSummonSprite(g, sm)) continue;
      if (sm.look === 'wolf') {
        this.scaledAt(g, sm.x, sm.y, () => this.drawWolf(g, sm));
        continue;
      }
      if (sm.look === 'rock') {
        // A stone golem: a stack of boulders with glowing eyes, stomping along.
        const fade = Math.min(1, sm.life / 1.2);
        const step = Math.abs(Math.sin(this.time * 8 + sm.maxLife)) * 2;
        g.save();
        g.globalAlpha = fade;
        g.translate(sm.x, sm.y - step);
        g.scale(CHAR_SCALE * 1.3, CHAR_SCALE * 1.3);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath();
        g.ellipse(0, SUMMON_RADIUS + step, SUMMON_RADIUS, SUMMON_RADIUS * 0.35, 0, 0, Math.PI * 2);
        g.fill();
        drawRock(g, SUMMON_RADIUS, '#8a8478');
        g.translate(0, -SUMMON_RADIUS * 0.9);
        drawRock(g, SUMMON_RADIUS * 0.6, '#9a9488');
        g.fillStyle = '#ffd34d';
        g.fillRect(-4, -2, 3, 3);
        g.fillRect(1, -2, 3, 3);
        g.restore();
        continue;
      }
      if (sm.look === 'puppet') {
        this.scaledAt(g, sm.x, sm.y, () => this.drawPuppet(g, sm));
        continue;
      }
      const fade = Math.min(1, sm.life / 1.2);
      const bob = Math.sin(this.time * 8 + sm.maxLife) * 2;
      g.globalAlpha = 0.35 * fade;
      g.fillStyle = '#b48cff';
      g.beginPath();
      g.arc(sm.x, sm.y + bob, SUMMON_RADIUS + 5, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = fade;
      g.fillStyle = '#e8dcff';
      g.strokeStyle = '#5a3a9a';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(sm.x, sm.y + bob, SUMMON_RADIUS, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#3a2060';
      g.fillRect(sm.x - 4, sm.y + bob - 2, 2, 3);
      g.fillRect(sm.x + 2, sm.y + bob - 2, 2, 3);
      g.globalAlpha = 1;
    }

    for (const b of this.beams) {
      const fade = 1 - b.t / 0.25;
      const dx = b.x2 - b.x1;
      const dy = b.y2 - b.y1;
      const len = Math.hypot(dx, dy) || 1;
      // Lightning arcs (Fancy): the pack's arc, stretched from end to end in its element's colour, fading out at
      // the far end (baked into the sheet).
      const arc = b.kinks && this.fancy ? effectImage('arc') : null;
      if (arc) {
        const sh = EFFECTS.arc;
        const [bx, by, bw, bh] = sh.box;
        const frame = ARC_FIRST + Math.min(sh.frames - 1 - ARC_FIRST, Math.floor((b.t / 0.25) * (sh.frames - ARC_FIRST)));
        const thick = Math.max(16, b.width * 7);
        g.save();
        g.globalAlpha = Math.min(1, fade * 1.6);
        g.translate(b.x1, b.y1);
        g.rotate(Math.atan2(dy, dx));
        g.imageSmoothingEnabled = false;
        g.drawImage(tinted(arc, b.color), frame * sh.frame + bx, by, bw, bh, 0, -thick / 2, len, thick);
        g.restore();
        continue;
      }
      // Otherwise a line that thins and fades toward its far end, so it never stops on a hard edge.
      const pts: Array<[number, number]> = [[b.x1, b.y1]];
      if (b.kinks) {
        // A jagged bolt: points along the line, each pushed sideways by its kink.
        const n = b.kinks.length;
        for (let i = 0; i < n; i++) {
          const k = (i + 1) / (n + 1);
          pts.push([b.x1 + dx * k - (dy / len) * b.kinks[i], b.y1 + dy * k + (dx / len) * b.kinks[i]]);
        }
      }
      if (!b.kinks) for (let i = 1; i < 6; i++) pts.push([b.x1 + (dx * i) / 6, b.y1 + (dy * i) / 6]);
      pts.push([b.x2, b.y2]);
      g.strokeStyle = b.color;
      g.lineCap = 'round';
      const segs = pts.length - 1;
      for (let i = 0; i < segs; i++) {
        const t = (i + 0.5) / segs;
        const taper = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5;
        g.globalAlpha = fade * Math.max(0.05, taper);
        g.lineWidth = Math.max(0.5, b.width * (0.35 + 0.65 * taper));
        g.beginPath();
        g.moveTo(pts[i][0], pts[i][1]);
        g.lineTo(pts[i + 1][0], pts[i + 1][1]);
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    const hole = this.fancy ? effectImage('blackhole') : null;
    for (const w of this.sweeps) {
      // The blade's arc sweeps across (a trailing crescent), fading out.
      const k = w.t / 0.2;
      const from = w.a - w.arc / 2;
      const to = from + w.arc * Math.min(1, k * 2.5);
      if (w.blade && hole) {
        // A sword or glaive: wedges of the black hole's swirling rim, silver-white, revealed across the swing
        // (an outer ring at the blade's reach and a fainter inner one), fading in and out at both ends.
        const size = w.r * 2.6;
        const k2 = sweepCanvas(g, size);
        const x = k2.getContext('2d')!;
        const px = k2.width / size; // canvas pixels per world unit
        x.setTransform(px, 0, 0, px, k2.width / 2, k2.height / 2);
        x.clearRect(-size / 2, -size / 2, size, size);
        x.imageSmoothingEnabled = false;
        const ring = tinted(bladeRingOf(hole), w.color);
        const sh = EFFECTS.blackhole;
        const [bx, by, bw] = sh.box;
        const f = Math.floor(w.t * 40) % sh.frames;
        for (const [rad, alpha, spin] of [[w.r, 1, 0], [w.r * 0.6, 0.7, 3]] as const) {
          const sc = (rad * 2) / bw;
          x.save();
          x.globalAlpha = alpha;
          x.rotate(to + spin);
          x.drawImage(ring, ((f + spin) % sh.frames) * sh.frame, 0, sh.frame, sh.frame, -(bx + bw / 2) * sc, -(by + bw / 2) * sc, sh.frame * sc, sh.frame * sc);
          x.restore();
        }
        // Keep only the swept wedge, fading to nothing at its trailing and leading edges.
        const span = Math.max(0.001, to - from);
        const fade = Math.min(0.45, span / 2.5) / (Math.PI * 2);
        const cone = x.createConicGradient(from, 0, 0);
        const end = span / (Math.PI * 2);
        cone.addColorStop(0, 'rgba(0,0,0,0)');
        cone.addColorStop(Math.min(fade, end / 2), 'rgba(0,0,0,1)');
        cone.addColorStop(Math.max(end - fade, end / 2), 'rgba(0,0,0,1)');
        cone.addColorStop(end, 'rgba(0,0,0,0)');
        cone.addColorStop(1, 'rgba(0,0,0,0)');
        x.globalCompositeOperation = 'destination-in';
        x.fillStyle = cone;
        x.fillRect(-size / 2, -size / 2, size, size);
        x.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1 - k * k;
        g.drawImage(k2, w.x - size / 2, w.y - size / 2, size, size);
        g.globalAlpha = 1;
        continue;
      }
      g.globalAlpha = 0.85 * (1 - k);
      g.strokeStyle = w.color;
      g.lineCap = 'round';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(w.x, w.y, w.r * 0.85, from, to);
      g.stroke();
      g.lineWidth = 2;
      g.beginPath();
      g.arc(w.x, w.y, w.r * 0.55, from, to);
      g.stroke();
      g.globalAlpha = 1;
    }

    for (const b of this.blasts) {
      // Squares fly outward from the centre as the blast spreads, flickering through fire colours.
      const k = b.t / BLAST_TIME;
      const spread = 0.35 + 0.65 * Math.min(1, k * 1.6);
      g.globalAlpha = 1 - k * k;
      for (const c of b.cells) {
        g.fillStyle = b.colors[(c.color + Math.floor(b.t * 20)) % b.colors.length];
        g.fillRect(b.x + c.x * spread - c.s / 2, b.y + c.y * spread - c.s / 2, c.s, c.s);
      }
      g.globalAlpha = 1;
    }

    for (const a of this.anims) {
      const img = effectImage(a.key);
      if (!img) continue;
      g.globalAlpha = a.alpha;
      drawEffectFrame(g, tinted(img, a.color), a.key, a.start + Math.floor(a.t * a.fps), a.x, a.y, a.size, a.anchor);
      g.globalAlpha = 1;
    }
    for (const st of this.strikes) {
      const img = effectImage(st.key);
      if (img) drawStrike(g, img, st);
    }

    for (const r of this.rings) {
      const k = r.t / r.max;
      const rad = r.r * (r.grow ? k : 0.4 + k * 0.6);
      if (r.pixel) {
        // A burst: a solid ring of square pixels in its colour, a fainter ring trailing inside it, and a
        // scatter of pixels across the area it hit.
        const a = k < 0.5 ? 1 : 1 - (k - 0.5) * 2; // full strength for the first half, then fades
        g.fillStyle = `rgba(${r.color},${0.3 * a})`;
        for (const c of r.scatter ?? []) if (Math.hypot(c.x, c.y) <= rad) g.fillRect(r.x + c.x - c.s / 2, r.y + c.y - c.s / 2, c.s, c.s);
        g.fillStyle = `rgba(${r.color},${0.45 * a})`;
        pixelCircle(g, r.x, r.y, Math.max(0, rad - PIXEL * 2), PIXEL);
        g.fillStyle = `rgba(0,0,0,${0.35 * a})`;
        pixelCircle(g, r.x + 1, r.y + 1, rad, PIXEL, 2);
        g.fillStyle = `rgba(${r.color},${a})`;
        pixelCircle(g, r.x, r.y, rad, PIXEL, 2);
        continue;
      }
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

    this.drawReloads(g);
    this.fx.draw(g);
    g.restore();
    if (scene?.vignette) drawVignette(g, w, h, scene.vignette);
    this.drawHud(g);
    this.cooldownBar.update();
  }

  /** Is this effect switched on in Settings (its group and itself)? */
  private fxOn(k: FxKey): boolean {
    const fx = this.game.state.settings.fx;
    if (k.startsWith('dmg')) return fx.damage && fx[k];
    return fx.status && fx[k];
  }

  /** A wolf spirit: a pale blue-grey wolf head with ears, streaking when it lunges. */
  /** A Puppeteer's Doll puppet: a little wooden marionette, jerking along on strings that fade upward. */
  /** A bone spike: a pale fang pointing along `a`, `h` tall, from (x, y). */
  private boneSpike(g: CanvasRenderingContext2D, x: number, y: number, a: number, h: number, w: number): void {
    const px = -Math.sin(a) * w;
    const py = Math.cos(a) * w;
    g.beginPath();
    g.moveTo(x + px, y + py);
    g.lineTo(x + Math.cos(a) * h, y + Math.sin(a) * h);
    g.lineTo(x - px, y - py);
    g.closePath();
    g.fill();
    g.stroke();
  }

  /** Monsters pinned by Gideon's bone spikes: a few spikes jutting up around their feet. */
  private drawHeld(g: CanvasRenderingContext2D): void {
    g.save();
    g.fillStyle = '#efe4c8';
    g.strokeStyle = '#4a3a2a';
    g.lineWidth = 1.5;
    for (const e of this.field.enemies) {
      if (!e.held) continue;
      const k = Math.min(1, e.held * 4); // sink back into the ground as it ends
      for (let i = 0; i < 4; i++) {
        const side = (i - 1.5) / 1.5;
        this.boneSpike(g, e.x + side * e.r * 0.9, e.y + e.r * 0.6, -Math.PI / 2 + side * 0.35, e.r * 1.1 * k, 3);
      }
    }
    g.restore();
  }

  /** Gideon's Bone Wall: a ring of bone spikes around every Hunter while it stands. */
  private drawBoneWall(g: CanvasRenderingContext2D): void {
    const f = this.field;
    if (f.boneWall <= 0) return;
    const R = f.boneWallR;
    const k = Math.min(1, f.boneWall * 3); // sinks back into the ground in its last moments
    g.save();
    g.fillStyle = '#efe4c8';
    g.strokeStyle = '#4a3a2a';
    g.lineWidth = 2;
    const spots = [{ x: 0, y: 0 }, ...f.helpers.map((h) => ({ x: h.x, y: h.y }))];
    const n = 18;
    for (const p of spots)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const h = (i % 2 ? 18 : 26) * k;
        this.boneSpike(g, p.x + Math.cos(a) * (R - 6), p.y + Math.sin(a) * (R - 6), a, h, 6);
      }
    g.restore();
  }

  private drawPuppet(g: CanvasRenderingContext2D, sm: Summon): void {
    const fade = Math.min(1, sm.life / 1.2);
    const r = SUMMON_RADIUS;
    const jerk = Math.sin(this.time * 12 + sm.maxLife * 3) * 2;
    g.globalAlpha = 0.5 * fade;
    g.strokeStyle = '#f0e0c0';
    g.lineWidth = 1;
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(sm.x + side * r * 0.6, sm.y - r * 0.4 + jerk);
      g.lineTo(sm.x + side * r * 0.3, sm.y - r * 3);
      g.stroke();
    }
    g.globalAlpha = fade;
    g.fillStyle = '#c8956a';
    g.strokeStyle = OUTLINE;
    g.lineWidth = 2;
    // Body, then head
    g.fillRect(sm.x - r * 0.45, sm.y - r * 0.1 + jerk, r * 0.9, r * 1.1);
    g.strokeRect(sm.x - r * 0.45, sm.y - r * 0.1 + jerk, r * 0.9, r * 1.1);
    g.beginPath();
    g.arc(sm.x, sm.y - r * 0.5 + jerk, r * 0.55, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#ff4060';
    g.fillRect(sm.x - 3, sm.y - r * 0.6 + jerk, 2, 2);
    g.fillRect(sm.x + 1, sm.y - r * 0.6 + jerk, 2, 2);
    g.globalAlpha = 1;
  }

  private drawWolf(g: CanvasRenderingContext2D, sm: Summon): void {
    const fade = Math.min(1, sm.life / 1.2);
    const r = SUMMON_RADIUS + 1;
    if (sm.dash > 0) {
      g.globalAlpha = 0.35 * fade;
      g.fillStyle = '#9fd8ff';
      g.beginPath();
      g.arc(sm.x, sm.y, r + 7, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 0.85 * fade;
    g.fillStyle = '#cfe0ee';
    g.strokeStyle = '#3a4a5a';
    g.lineWidth = 2;
    // Ears
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(sm.x + side * r * 0.9, sm.y - r * 0.2);
      g.lineTo(sm.x + side * r * 0.55, sm.y - r * 1.35);
      g.lineTo(sm.x + side * r * 0.1, sm.y - r * 0.7);
      g.closePath();
      g.fill();
      g.stroke();
    }
    g.beginPath();
    g.arc(sm.x, sm.y, r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#1e2a36';
    g.fillRect(sm.x - 4, sm.y - 2, 2, 3);
    g.fillRect(sm.x + 2, sm.y - 2, 2, 3);
    g.fillRect(sm.x - 1, sm.y + 3, 2, 2);
    g.globalAlpha = 1;
  }

  /**
   * "RELOADING!" (guns), "RECHARGING!" (staffs) or "SUMMONING!" (tomes) over or under each Hunter waiting on
   * their weapon, fading away from right to left as the wait runs out.
   */
  private drawReloads(g: CanvasRenderingContext2D): void {
    const st = this.game.state.settings;
    if (!st.reloads) return;
    const spots: Array<{ who: Shooter; x: number; y: number }> = [{ who: 'main', x: 0, y: 0 }, ...this.field.helpers.map((h) => ({ who: h.id as Shooter, x: h.x, y: h.y }))];
    g.font = canvasFont(11 / Z, 700);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    for (const s of spots) {
      const status = this.field.weaponStatus(s.who);
      if (!status) continue;
      const { text, progress: p } = status;
      // A tome's "SUMMONING!" has its own switch (off by default).
      if (text === 'SUMMONING!' && !st.summonText) continue;
      const w = g.measureText(text).width;
      const x = s.x - w / 2;
      const y = s.y + (st.reloadPos === 'below' ? 1 : -1) * (PLAYER_RADIUS * CHAR_SCALE + 14 / Z);
      // What's left of the wait: the text from the left edge, shrinking toward it as the wait runs.
      const edge = x - 4 + (w + 8) * (1 - p);
      g.save();
      g.beginPath();
      g.rect(x - 4, y - 20, edge - (x - 4), 40);
      g.clip();
      g.lineWidth = 3 / Z;
      g.strokeStyle = '#000';
      g.strokeText(text, x, y);
      g.fillStyle = '#ffe066';
      g.fillText(text, x, y);
      g.restore();
      // The fading edge breaks up into pixels: sparks and metal for guns, magic for staffs, a haze for tomes.
      const palette = EDGE_PIXELS[text] ?? EDGE_PIXELS['RELOADING!'];
      const px = 2 / Z;
      const half = 7 / Z;
      if (st.reloadStyle === 'fancy' && p > 0 && p < 1) {
        for (let i = 0; i < 9; i++) {
          g.fillStyle = palette[(Math.random() * palette.length) | 0];
          g.globalAlpha = 0.6 + Math.random() * 0.4;
          g.fillRect(edge - Math.random() * 6 / Z, y - half + Math.random() * half * 2, px, px);
        }
        g.globalAlpha = 1;
        if (Math.random() < 0.35) this.fx.burst(edge, y - half + Math.random() * half * 2, palette[(Math.random() * palette.length) | 0], 1, 40 / Z, 2.5 / Z, text === 'RELOADING!' ? 300 : -60, true);
      }
    }
  }

  /** Ranged weapons' projectiles shed particles of the damage they deal (see TRAILS). */
  private emitTrails(dt: number): void {
    const types = new Map<string, DamageType>();
    for (const b of this.field.bullets) {
      if (!TRAIL_KINDS.has(b.kind)) continue;
      const key = `${b.shooter}:${b.mode ?? 'long'}`;
      let type = b.dtype ?? types.get(key);
      if (!type) types.set(key, (type = this.game.damageTypeOf(b.shooter, b.mode ?? 'long')));
      const st = TRAILS[type];
      if (!st) continue;
      for (let n = st.rate * dt * TRAIL_DENSITY; n > 0; n--) {
        if (n < 1 && Math.random() >= n) break;
        const j = () => (Math.random() - 0.5) * st.drift;
        // Anywhere along the stretch it just flew, so fast shots leave an unbroken streak.
        const back = Math.random() * dt;
        this.fx.trail(b.x - b.vx * back + (Math.random() - 0.5) * 4, b.y - b.vy * back + (Math.random() - 0.5) * 4, j(), j() - st.rise, st.colors[Math.floor(Math.random() * st.colors.length)], st.size * TRAIL_SIZE * (0.7 + Math.random() * 0.6), st.life * (0.7 + Math.random() * 0.6), st.gravity, st.square);
      }
    }
  }

  /** Draws a character (`draw` works in world units) CHAR_SCALE times bigger around its spot (x, y). */
  private scaledAt(g: CanvasRenderingContext2D, x: number, y: number, draw: () => void): void {
    g.save();
    g.translate(x, y);
    g.scale(CHAR_SCALE, CHAR_SCALE);
    g.translate(-x, -y);
    draw();
    g.restore();
  }

  /** Effect art is the Fancy area effect style (Settings); Basic keeps plain shapes. */
  /** The Clarity Border's opacity (0 when it's off). */
  private get clarity(): number {
    return CLARITY_ALPHA[this.game.state.settings.clarity] ?? 0;
  }

  private get fancy(): boolean {
    return this.game.state.settings.aoeStyle !== 'basic';
  }

  /** Plays a magic effect once: `size` is its longer side; 'bottom' anchors strikes that come down from above. */
  /** A spell's moment on the field (see FieldEvent 'spell'). */
  private spellEvent(e: Extract<FieldEvent, { type: 'spell' }>): void {
    const rgb = hexRgb(e.color);
    switch (e.fx) {
      case 'spike':
        // An ice spike bursting up out of the ground.
        if (this.fancy) this.playEffect('spikes', e.x, e.y + e.r * 0.6, e.r * 2.6, 'bottom', 26, 0, 1, e.color);
        else this.rings.push({ x: e.x, y: e.y, t: 0, r: e.r, color: rgb, max: 0.25, fill: true });
        this.fx.burst(e.x, e.y, '#e8f8ff', 4, 90, 2.5, 0, true);
        break;
      case 'cone':
        // A fan of frost: frost sprays bursting across the cone (Fancy) or a pale sweep, and shards flying out.
        if (this.fancy)
          for (let i = 0; i < 5; i++) {
            const a = e.a! + ((i - 2) / 4) * e.arc!;
            const d = e.r * (0.45 + 0.4 * (i % 2));
            this.playEffect('frost', e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, e.r * 0.55, 'bottom', 20, 0, 1, e.color);
          }
        else this.sweeps.push({ x: e.x, y: e.y, a: e.a!, arc: e.arc!, r: e.r, color: e.color, t: 0 });
        for (let i = 0; i < 14; i++) {
          const a = e.a! + (Math.random() - 0.5) * e.arc!;
          const d = e.r * (0.3 + Math.random() * 0.7);
          this.fx.burst(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, i % 2 ? '#e8f8ff' : e.color, 1, 70, 3, 0, true);
        }
        break;
      case 'sun':
        if (this.fancy) this.playEffect('sunstrike', e.x, e.y + e.r * 0.3, e.r * 2.4, 'bottom', 16);
        this.rings.push({ x: e.x, y: e.y, t: 0, r: e.r, color: rgb, max: 0.8, fill: true });
        break;
      case 'drop':
        // An acid drop splashing down: the pack's bubbling splash (Fancy), or a streak and a ring.
        if (this.fancy) this.playEffect('acid', e.x, e.y + e.r * 0.4, e.r * 2, 'bottom', 22, 2, 0.9, e.color);
        else {
          this.beams.push({ x1: e.x + 6, y1: e.y - 70, x2: e.x, y2: e.y, color: e.color, width: 2, t: 0 });
          this.rings.push({ x: e.x, y: e.y, t: 0, r: e.r, color: rgb, max: 0.3 });
        }
        this.fx.burst(e.x, e.y, e.color, 3, 70, 2, 0, true);
        break;
      case 'anchor':
        if (this.fancy) this.playEffect('blackhole', e.x, e.y, e.r * 1.6, 'center', 16, 0, 0.85, e.color);
        else this.rings.push({ x: e.x, y: e.y, t: 0, r: e.r, color: rgb, max: 0.4 });
        this.fx.burst(e.x, e.y, e.color, 10, 120, 3, 0, true);
        break;
      case 'rock':
        // A rock crashing down out of the sky: an impact in stone (Fancy) or a streak and a ring, then dust and chips.
        if (this.fancy) {
          this.playEffect('smash', e.x, e.y, e.r * 2, 'center', 26, SMASH_START, 0.8, STONE_COLOR);
          this.playEffect('shards', e.x, e.y, e.r * 1.2, 'center', 14, 0, 1, STONE_COLOR);
        } else {
          this.beams.push({ x1: e.x + 14, y1: e.y - 110, x2: e.x, y2: e.y, color: '#8a8478', width: 6, t: 0 });
          this.rings.push({ x: e.x, y: e.y, t: 0, r: e.r, color: '200,190,170', max: 0.3, fill: true });
        }
        this.fx.burst(e.x, e.y, '#9a9488', 6, 110, 3, 300, true);
        this.shake = Math.max(this.shake, 0.06);
        break;
      case 'arrows':
        // Volley of Rain: arrows dropping out of the sky (the pack's volley in Fancy, a streak in Basic).
        if (this.fancy) this.playEffect('arrows', e.x, e.y + 6, 46, 'bottom', 20);
        else this.beams.push({ x1: e.x - 8, y1: e.y - 120, x2: e.x, y2: e.y, color: '#e8d2a8', width: 2, t: 0 });
        this.fx.burst(e.x, e.y, '#c8b48a', 3, 60, 2, 300, true);
        break;
      case 'shock':
        // A hammer's Aftershock: a second impact in its element.
        if (this.fancy) this.playEffect('smash', e.x, e.y, e.r * 2.1, 'center', 26, SMASH_START, 0.55, e.color);
        else this.rings.push({ x: e.x, y: e.y, t: 0, r: e.r, color: hexRgb(e.color), max: 0.35 });
        this.shake = Math.max(this.shake, 0.12);
        break;
      case 'break':
        // The boulder breaks apart: shards and dust (Fancy) or a ring, and chunks of rock flying everywhere.
        if (this.fancy) {
          this.playEffect('shards', e.x, e.y, e.r * 1.6, 'center', 12, 0, 1, STONE_COLOR);
          this.playEffect('puff', e.x, e.y, e.r * 2, 'center', 20, 0, 0.7, STONE_COLOR);
        } else this.rings.push({ x: e.x, y: e.y, t: 0, r: e.r, color: '200,190,170', max: 0.35 });
        this.fx.burst(e.x, e.y, '#9a9488', 10, 160, 4, 300, true);
        this.fx.burst(e.x, e.y, '#6a6458', 8, 120, 3, 300, true);
        this.shake = Math.max(this.shake, 0.1);
        break;
      case 'rise':
        // The dead getting back up: a puff of grave dust and violet motes.
        if (this.fancy) this.playEffect('puff', e.x, e.y, e.r * 2.4, 'center', 20, 0, 0.8, e.color);
        this.fx.burst(e.x, e.y, '#c8a0ff', 8, 80, 2.5, 0, true);
        break;
    }
  }

  /** A spell lingering on the field: an acid cloud, a poison mist, cursed ground, a gravity anchor. */
  private drawZone(g: CanvasRenderingContext2D, z: SpellZone): void {
    const fade = Math.min(1, z.life / 0.5, (z.max - z.life) / 0.25 + 0.2);
    const t = this.time;
    g.save();
    switch (z.kind) {
      case 'acidRain': {
        // Fancy: the pack's acid bubbling up in splashes across the spot.
        const acid = this.fancy ? effectImage('acid') : null;
        if (acid) {
          g.globalAlpha = 0.85 * fade;
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 + 0.6;
            drawEffectFrame(g, acid, 'acid', Math.floor(t * 14 + i * 3), z.x + Math.cos(a) * z.r * 0.45, z.y + Math.sin(a) * z.r * 0.3 + z.r * 0.3, z.r * 1.1, 'bottom', true);
          }
          break;
        }
        // A dark cloud hanging over the spot, rain streaking down out of it.
        g.globalAlpha = 0.18 * fade;
        g.fillStyle = '#c6f03a';
        g.beginPath();
        g.ellipse(z.x, z.y, z.r, z.r * 0.6, 0, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 0.75 * fade;
        g.fillStyle = '#3a4a20';
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + t * 0.4;
          g.beginPath();
          g.arc(z.x + Math.cos(a) * z.r * 0.55, z.y - 70 + Math.sin(a) * 10, z.r * 0.32, 0, Math.PI * 2);
          g.fill();
        }
        g.strokeStyle = '#c6f03a';
        g.lineWidth = 1.5;
        g.globalAlpha = 0.6 * fade;
        for (let i = 0; i < 12; i++) {
          const px = z.x + (((i * 37) % 100) / 100 - 0.5) * z.r * 1.6;
          const py = z.y - 60 + ((t * 260 + i * 23) % 70);
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(px - 2, py + 8);
          g.stroke();
        }
        break;
      }
      case 'poisonMist': {
        // Fancy: the pack's poison clouds rolling round the spot.
        const mist = this.fancy ? effectImage('poison') : null;
        if (mist) {
          g.globalAlpha = 0.7 * fade;
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + t * 0.5;
            drawEffectFrame(g, mist, 'poison', Math.floor(t * 10 + i * 2), z.x + Math.cos(a) * z.r * 0.4, z.y + Math.sin(a) * z.r * 0.3, z.r * 1.1, 'center', true);
          }
          break;
        }
        // Rolling green fog: soft blobs drifting around its centre.
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + t * 0.7 + i;
          const d = z.r * (0.25 + 0.35 * Math.abs(Math.sin(t + i)));
          g.globalAlpha = 0.22 * fade;
          g.fillStyle = i % 2 ? '#6fdc5a' : '#3a8a3a';
          g.beginPath();
          g.arc(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d * 0.7, z.r * 0.55, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'raiseDead': {
        if (z.r > 600) {
          // Eternal Legion: the whole field is cursed: a faint violet haze, motes rising everywhere.
          g.globalAlpha = 0.12 * fade;
          g.fillStyle = '#3a1a4a';
          g.fillRect(-this.w, -this.h, this.w * 2, this.h * 2);
          g.fillStyle = '#c8a0ff';
          for (let i = 0; i < 30; i++) {
            const p = (t * 0.5 + i / 30) % 1;
            g.globalAlpha = (1 - p) * fade * 0.8;
            g.fillRect(((i * 73) % 100) * 6 - 300, ((i * 37) % 100) * 6 - 300 - p * 50, 3, 3);
          }
          break;
        }
        // Cursed ground: a dark violet circle, its rim pulsing, motes rising off it.
        g.globalAlpha = 0.3 * fade;
        g.fillStyle = '#3a1a4a';
        g.beginPath();
        g.ellipse(z.x, z.y, z.r, z.r * 0.75, 0, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = (0.5 + 0.3 * Math.sin(t * 5)) * fade;
        g.strokeStyle = '#b09a60';
        g.setLineDash([6, 5]);
        g.lineWidth = 2;
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = '#c8a0ff';
        for (let i = 0; i < 8; i++) {
          const p = (t * 0.6 + i / 8) % 1;
          const a = i * 2.4;
          g.globalAlpha = (1 - p) * fade;
          g.fillRect(z.x + Math.cos(a) * z.r * 0.7 * ((i % 3) / 3 + 0.3) - 1.5, z.y + Math.sin(a) * z.r * 0.5 - p * 40, 3, 3);
        }
        break;
      }
      case 'boulder': {
        // A big rolling boulder: its shadow, then the rock turning the way it rolls.
        const v = Math.hypot(z.vx, z.vy);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath();
        g.ellipse(z.x, z.y + z.r * 0.8, z.r * 0.95, z.r * 0.3, 0, 0, Math.PI * 2);
        g.fill();
        g.translate(z.x, z.y);
        g.rotate(((z.max - z.life) * v) / z.r * (z.vx < 0 ? -1 : 1) * 0.6);
        // The pack's grey rock (shapes until it loads).
        const rock = gearImage(ROCK_ICON);
        if (rock) {
          g.imageSmoothingEnabled = false;
          g.drawImage(rock, -z.r * 1.15, -z.r * 1.15, z.r * 2.3, z.r * 2.3);
        } else drawRock(g, z.r, '#8a8478');
        break;
      }
      case 'gravityAnchor': {
        // A black hole at the anchor, pulling a ring of pixels in from its reach.
        const img = effectImage('blackhole');
        g.globalAlpha = 0.9 * fade;
        if (img) drawEffectFrame(g, img, 'blackhole', Math.floor(t * 12), z.x, z.y, z.r * 0.7, 'center', true);
        g.strokeStyle = '#ff5fd7';
        g.lineWidth = 2;
        g.globalAlpha = 0.5 * fade;
        g.beginPath();
        g.arc(z.x, z.y, z.r * (1 - ((t * 1.5) % 1)), 0, Math.PI * 2);
        g.stroke();
        break;
      }
    }
    g.restore();
  }

  /** A monster raised by Raise Dead: its own art, ghostly violet, fading as its time runs out. */
  /** The monster whose art a summon wears, by its look (and, for wisps, its kind). */
  private summonArt(sm: Summon): EnemyId {
    if (sm.look === 'wolf') return 'wolf';
    if (sm.look === 'puppet') return 'puppet';
    if (sm.look === 'rock') return 'stoneGolem';
    return SUMMON_ART[sm.type] ?? 'wraith';
  }

  /** A summon's damage type: its gear ability's, else its Hunter's weapon's. */
  private summonType(sm: Summon): DamageType {
    return sm.gear?.damageType ?? this.game.damageTypesOf(sm.who)[0] ?? 'physical';
  }

  /** Draws a summon as its monster's art. False if the art isn't loaded yet (the old shapes stand in). */
  private drawSummonSprite(g: CanvasRenderingContext2D, sm: Summon): boolean {
    const id = this.summonArt(sm);
    const def = enemyDef(id);
    const img = sprite(`enemies/${id}`);
    const sheetKey = MONSTER_SHEETS[id];
    const sheet = sheetKey ? monsterSheetImage(sheetKey) : null;
    const hasSheet = !!(sheetKey && sheet && sheet.complete && sheet.naturalWidth > 0);
    if (!hasSheet && !img) return false;
    const type = this.summonType(sm);
    const color = DAMAGE_TYPES[type].color;
    const physical = type === 'physical';
    const ring = physical ? SUMMON_PHYSICAL_RING : color;
    // Summons are a little smaller than the monster they look like, whatever its size.
    const ra = SUMMON_RADIUS * 1.25 * (sm.look === 'rock' ? 1.3 : 1) * Math.min(1.25, SIZE_SCALE[def.size ?? 'medium']);
    const fade = Math.min(1, sm.life / 1.2);
    const bob = sm.look === 'wisp' ? Math.sin(this.time * 8 + sm.maxLife) * 2 : 0;
    // Facing the way it's heading (toward the monsters): mirrored when that's left.
    const left = sm.x > 0;
    g.save();
    g.translate(sm.x, sm.y + bob);
    g.scale(CHAR_SCALE, CHAR_SCALE);
    g.globalAlpha = 0.95 * fade;
    if (sm.look === 'wolf' && sm.dash > 0) {
      g.globalAlpha = 0.35 * fade;
      g.fillStyle = color;
      g.beginPath();
      g.arc(0, 0, ra + 6, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 0.95 * fade;
    }
    g.imageSmoothingEnabled = false;
    if (hasSheet) {
      const sh = SHEETS[sheetKey!];
      const art = tinted(sheet!, physical ? undefined : color);
      const frame = Math.floor(this.time * 8 + sm.maxLife) % sh.cols;
      const row = sheetRow(sh, left ? 'L' : 'R');
      if (sideFlip(sh, left ? -1 : 1)) g.scale(-1, 1);
      drawSheetFrame(g, outlineOf(art, ring, 1), sh, row, frame, ra * SHEET_SCALE);
      drawSheetFrame(g, art, sh, row, frame, ra * SHEET_SCALE);
    } else if (img) {
      const art = tinted(img, physical ? undefined : color);
      const size = ra * SPRITE_SCALE;
      if (left) g.scale(-1, 1);
      g.drawImage(outlineOf(art, ring, 1), -size / 2, -size / 2, size, size);
      g.drawImage(art, -size / 2, -size / 2, size, size);
    }
    g.restore();
    return true;
  }

  private drawRisen(g: CanvasRenderingContext2D, sm: Summon): void {
    const id = sm.risen!.enemy;
    const def = enemyDef(id);
    const ra = def.radius * SIZE_SCALE[def.size ?? 'medium'];
    const img = sprite(`enemies/${id}`);
    const sheetKey = MONSTER_SHEETS[id];
    const sheet = sheetKey ? monsterSheetImage(sheetKey) : null;
    g.save();
    g.translate(sm.x, sm.y + Math.sin(this.time * 6 + sm.maxLife) * 2);
    g.globalAlpha = 0.75 * Math.min(1, sm.life / 1);
    if (sheetKey && sheet && sheet.complete && sheet.naturalWidth > 0) {
      const sh = SHEETS[sheetKey];
      drawSheetFrame(g, tinted(sheet, '#b48cff'), sh, sheetRow(sh, 'D'), Math.floor(this.time * 8) % sh.cols, ra * SHEET_SCALE);
    } else if (img) {
      const size = ra * SPRITE_SCALE;
      g.drawImage(tinted(img, '#b48cff'), -size / 2, -size / 2, size, size);
    } else {
      g.fillStyle = '#b48cff';
      g.beginPath();
      g.arc(0, 0, SUMMON_RADIUS, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  private playEffect(key: EffectKey, x: number, y: number, size: number, anchor: 'center' | 'bottom' = 'center', fps = 18, start = 0, alpha = 1, color?: string): void {
    if (this.anims.length > 120) return; // keep the busiest moments cheap
    this.anims.push({ key, x, y, size, anchor, fps, t: 0, start, alpha, color });
  }

  private drawEnemy(g: CanvasRenderingContext2D, e: Enemy): void {
    const def = enemyDef(e.type);
    const r = e.r;
    // Its art's size: the hit radius scaled by the monster's size class (dragons are drawn huge), and by its own
    // size roll (some of the same monster are smaller or bigger).
    const ra = r * SIZE_SCALE[def.size ?? 'medium'] * (e.scale ?? 1);
    // Walking away from the Hunter while fleeing, toward them otherwise.
    const dirX = e.fleeing ? e.x : -e.x;
    g.save();
    g.translate(e.x, e.y);
    if (e.fleeing) g.globalAlpha = 0.8;

    const sheetKey = MONSTER_SHEETS[e.type];
    const sheet = sheetKey ? monsterSheetImage(sheetKey) : null;
    const img = (e.boss && sprite(`bosses/${e.type}`)) || sprite(`enemies/${e.type}`);
    if (sheetKey && sheet && sheet.complete && sheet.naturalWidth > 0) {
      // Animated walk: the row that faces where it's heading, stepping through frames as it goes.
      const sh = SHEETS[sheetKey];
      const hy = e.fleeing ? e.y : -e.y;
      const dir = Math.abs(dirX) > Math.abs(hy) ? (dirX < 0 ? 'L' : 'R') : hy > 0 ? 'D' : 'U';
      const col = Math.floor(e.phase * (e.fleeing ? 12 : 8)) % sh.cols;
      // Charmed by Norm: pink; chilled by Frost: blue; a gold monster: gold.
      const src = e.charm ? charmTint(sheet) : e.slow && this.fxOn('chill') ? frostTint(sheet) : e.golden ? goldTint(sheet) : sheet;
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.ellipse(0, ra * 1.1, ra * 0.9, ra * 0.32, 0, 0, Math.PI * 2);
      g.fill();
      // Side-view art faces one way: mirror it when heading the other.
      const flip = sideFlip(sh, dirX);
      if (flip) g.scale(-1, 1);
      drawSheetFrame(g, src, sh, sheetRow(sh, dir), col, ra * SHEET_SCALE, { of: sheet, alpha: this.clarity });
      if (e.flash > 0.5) {
        g.globalAlpha = 0.5;
        g.globalCompositeOperation = 'lighter';
        drawSheetFrame(g, sheet, sh, sheetRow(sh, dir), col, ra * SHEET_SCALE);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = e.fleeing ? 0.8 : 1;
      }
      if (flip) g.scale(-1, 1);
    } else if (img) {
      const size = ra * SPRITE_SCALE;
      const bob = Math.sin(e.phase * 10) * r * 0.06;
      g.scale(dirX < 0 ? -1 : 1, 1);
      // Chilled by Frost: drawn with a blue tint.
      g.drawImage(e.charm ? charmTint(img) : e.slow && this.fxOn('chill') ? frostTint(img) : e.golden ? goldTint(img) : img, -size / 2, -size / 2 + bob, size, size);
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
      const body = e.boss ? shade(def.color, -0.15) : def.color;
      g.fillStyle = e.flash > 0.5 ? '#ffffff' : e.charm ? mixHex(body, '#ff8ad0', 0.55) : e.slow && this.fxOn('chill') ? mixHex(body, '#8fdcff', 0.55) : body;
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

    if (e.boss) drawCrown(g, ra);
    if (e.golden) drawGoldSparkle(g, ra, this.time + e.phase);
    if (e.fleeing) drawDizzy(g, ra, this.time + e.phase, 0.6);
    drawStatus(g, e, this.time, (k) => this.fxOn(k), this.game.state.settings.aoeStyle === 'basic');
    g.restore();
  }

  private drawHunter(g: CanvasRenderingContext2D): void {
    const f = this.field;
    const R = PLAYER_RADIUS;

    // Post-stun immunity ring
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
    // Facing away, the weapon is behind them; otherwise it's drawn over them.
    const behind = this.facesAway('main', f.aim);
    if (behind) this.drawHeldWeapon(g, 'main', 0, 0, f.aim, R, f.stunned);
    g.save();
    g.rotate(sway);
    const img = sprite('hunter');
    if (this.drawHunterSheet(g, 'main', f.aim, R)) {
      // Animated idle from the hunter sheet.
    } else if (img) {
      const size = R * SPRITE_SCALE * 1.2;
      g.save();
      g.scale(Math.cos(f.aim) < 0 ? -1 : 1, 1);
      g.drawImage(img, -size / 2, -size / 2, size, size);
      g.restore();
    } else {
      g.save();
      g.rotate(f.stunned ? Math.PI / 2 : f.aim); // gun droops while stunned
      if (this.weaponImage('main')) g.globalAlpha = 0; // the weapon's own icon is drawn instead
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
    if (!behind) this.drawHeldWeapon(g, 'main', 0, 0, f.aim, R, f.stunned);

    drawShieldPips(g, 0, R + (f.stunned ? 19 : 10), f.guard);
    if (f.stunned) drawStunBar(g, 0, R + 8, 34, f.stun / Math.max(0.01, f.stunTotal));
  }

  /**
   * A Hunter's animated idle from their sheet, facing where they aim (rows: down, left, right, up; side-view
   * sheets are mirrored), standing on their shadow. False if they have no sheet or it hasn't loaded.
   */
  private drawHunterSheet(g: CanvasRenderingContext2D, who: Shooter, aim: number, R: number, phase = 0): boolean {
    const sh = HUNTER_SHEETS[who];
    const img = sh && hunterSheetImage(who);
    if (!sh || !img) return false;
    const c = Math.cos(aim);
    const s = Math.sin(aim);
    const row = sh.side ? 0 : Math.abs(c) >= Math.abs(s) ? (c < 0 ? 1 : 2) : s > 0 ? 0 : 3;
    const col = Math.floor((this.time + phase) * 8) % sh.frames[row];
    const [bx, by, bw, bh] = sh.box;
    // Top-down characters share one pixel scale (your Hunter's height sets it), so they keep the packs' relative
    // sizes: a plume or a cape adds to a Hunter rather than shrinking them. Side-view art is fitted to its box.
    const k = (R * 2.7) / (sh.side ? Math.max(bw, bh) : TOPDOWN_HEIGHT);
    const F = sh.frame;
    g.imageSmoothingEnabled = false;
    // Feet (the box's bottom) on the shadow.
    g.save();
    if (sh.side && c < 0) g.scale(-1, 1);
    if (this.clarity > 0) {
      const a = g.globalAlpha;
      g.globalAlpha = a * this.clarity;
      g.drawImage(outlineOf(img), col * F, row * F, F, F, -(bx + bw / 2) * k, R * 1.05 - (by + bh) * k, F * k, F * k);
      g.globalAlpha = a;
    }
    g.drawImage(img, col * F, row * F, F, F, -(bx + bw / 2) * k, R * 1.05 - (by + bh) * k, F * k, F * k);
    g.restore();
    return true;
  }

  /** Whether a Hunter is facing away (their sheet's up row), so the weapon in their hands is hidden behind them. */
  private facesAway(who: Shooter, aim: number): boolean {
    const sh = HUNTER_SHEETS[who];
    if (!sh || sh.side || !hunterSheetImage(who)) return false;
    return Math.abs(Math.sin(aim)) > Math.abs(Math.cos(aim)) && Math.sin(aim) < 0;
  }

  /** The weapon a Hunter is holding (Wilhelm's short-range one when something's close) and its icon, if it has one. */
  private heldWeapon(who: Shooter, close = false): { cls: string; img: HTMLImageElement } | null {
    const weapons = this.game.equipped(who).filter((it) => it && gearDef(it.base).weaponClass);
    const it = (close && weapons[1]) || weapons[0];
    if (!it) return null;
    const img = gearImage(GEAR_SPRITES[it.base]);
    return img ? { cls: gearDef(it.base).weaponClass!, img } : null;
  }

  private weaponImage(who: Shooter, close = false): HTMLImageElement | null {
    return this.heldWeapon(who, close)?.img ?? null;
  }

  /**
   * A Hunter's weapon in hand, drawn from its icon (which points up-right, grip at the bottom-left): swords and
   * glaives swing across their arc, hammers come down overhead, spears and daggers thrust, bows and guns aim
   * with a little recoil, and staffs, wands, focuses and tomes are held up and raised as they cast.
   */
  private drawHeldWeapon(g: CanvasRenderingContext2D, who: Shooter, x: number, y: number, aim: number, R: number, stunned: boolean, close = false): void {
    const held = this.heldWeapon(who, close);
    if (!held) return;
    const cls = WEAPON_CLASSES[held.cls as keyof typeof WEAPON_CLASSES];
    const sw = this.swings.get(who);
    const SWING = 0.22;
    const p = sw && sw.t < SWING ? sw.t / SWING : -1; // 0..1 during an attack
    const a = sw && p >= 0 ? sw.a : aim;
    const size = R * 2.6;
    let angle = a;
    let reach = R * 0.55;
    let lift = 0;
    let grip = 0.2; // where along the icon the hand holds it (0 = the very end)
    switch (cls.attack) {
      case 'sweep': {
        const arc = cls.arc ?? 2;
        angle = p >= 0 ? a - arc / 2 + arc * p : a - 0.9;
        break;
      }
      case 'slam':
        angle = p >= 0 ? a - 2.2 + 2.4 * Math.min(1, p * 1.4) : a - 1.2;
        break;
      case 'stab':
      case 'dagger':
        reach += p >= 0 ? Math.sin(Math.PI * p) * R * 0.9 : 0;
        angle = p >= 0 ? a : a - 0.5;
        break;
      case 'shot':
        grip = 0.5;
        reach = R * 1.1 - (p >= 0 ? Math.sin(Math.PI * p) * 3 : 0);
        if (cls.spell !== undefined || ['wand', 'scepter', 'staff'].includes(held.cls)) {
          // Magic: held upright on the aiming side, raised as the spell goes off.
          grip = 0.2;
          angle = -Math.PI / 2 + Math.cos(a) * 0.35;
          lift = p >= 0 ? Math.sin(Math.PI * p) * 5 : 0;
          reach = 0;
        }
        break;
      default:
        // Focuses, tomes and anything else: held up beside the Hunter, raised when it goes off.
        grip = 0.2;
        angle = -Math.PI / 2 + Math.cos(a) * 0.35;
        lift = p >= 0 ? Math.sin(Math.PI * p) * 5 : 0;
        reach = 0;
    }
    if (stunned) angle = Math.PI / 2 + 0.4; // droops while dazed
    const side = Math.cos(a) < 0 ? -1 : 1;
    g.save();
    // Dazed: it wobbles with the Hunter, about the same point.
    if (stunned) {
      g.translate(x, y);
      g.rotate(Math.sin(this.time * 14) * 0.18);
      g.translate(-x, -y);
    }
    // Held out to the side the Hunter faces (aimed weapons out in front), clear of their face.
    const upright = reach === 0;
    const aimed = cls.attack === 'shot' && !upright;
    g.translate(x + (aimed ? Math.cos(a) * reach : side * R * (upright ? 0.95 : 0.7) + Math.cos(a) * reach * 0.6), y + (aimed ? Math.sin(a) * reach : Math.sin(a) * reach * 0.6) - lift + (upright ? R * 0.2 : 0));
    g.rotate(angle + Math.PI / 4);
    g.imageSmoothingEnabled = false;
    g.drawImage(held.img, -size * grip, -size * (1 - grip), size, size);
    g.restore();
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
    const behind = this.facesAway(h.id, h.aim);
    if (behind) {
      g.save();
      g.translate(-h.x, -h.y);
      this.drawHeldWeapon(g, h.id, h.x, h.y, h.aim, R, h.stun > 0, h.close);
      g.restore();
    }
    g.save();
    // Wobble while dazed, like your Hunter.
    if (h.stun > 0) g.rotate(Math.sin(this.time * 14) * 0.18);
    if (this.drawHunterSheet(g, h.id, h.aim, R, h.id.length * 0.37)) {
      // Animated idle from the hunter sheet.
    } else if (img) {
      const size = R * SPRITE_SCALE * 1.2;
      g.scale(Math.cos(h.aim) < 0 ? -1 : 1, 1);
      g.drawImage(img, -size / 2, -size / 2, size, size);
    } else {
      g.save();
      g.rotate(h.aim);
      if (this.weaponImage(h.id, h.close)) g.globalAlpha = 0; // the weapon's own icon is drawn instead
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
      g.font = canvasFont(R * 1.1);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const ic = gearImage(HUNTER_ICONS[h.id]);
      if (ic) {
        g.imageSmoothingEnabled = false;
        g.drawImage(ic, -R * 0.7, -R * 0.7, R * 1.4, R * 1.4);
      } else g.fillText(def.icon, 0, 1);
    }
    g.restore();
    g.restore();
    if (!behind) this.drawHeldWeapon(g, h.id, h.x, h.y, h.aim, R, h.stun > 0, h.close);
    drawShieldPips(g, h.x, h.y + R + (h.stun > 0 ? 19 : 10), h.guard);
    g.save();
    g.translate(h.x, h.y);
    // Post-stun immunity ring
    if (h.immune > 0) {
      g.strokeStyle = `rgba(159,224,255,${Math.min(1, h.immune * 2) * 0.6})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, R + 4, 0, Math.PI * 2);
      g.stroke();
    }
    if (h.stun > 0) drawStunBar(g, 0, R + 8, 30, h.stun / Math.max(0.01, h.stunTotal));
    g.restore();
  }

  /**
   * Top of the event timer / Guardian bar (`height` tall, spanning x1..x2): at the battlefield's top or bottom
   * edge (Settings), moved clear of the cooldown icons and the DPS meter when they're on that edge.
   */
  private hudTop(x1: number, x2: number, height: number): number {
    const st = this.game.state.settings;
    const boxes: Array<{ top: number; bottom: number; left: number; right: number }> = [];
    const cd = this.cooldownBar.rect();
    if (cd) boxes.push(cd);
    const meter = this.cooldownBar.el.parentElement?.querySelector<HTMLElement>('#dpsMeter');
    if (meter && !meter.classList.contains('hidden'))
      boxes.push({ top: meter.offsetTop, bottom: meter.offsetTop + meter.offsetHeight, left: meter.offsetLeft, right: meter.offsetLeft + meter.offsetWidth });
    const inWay = boxes.filter((b) => b.right > x1 && b.left < x2);
    if (st.hudPos === 'top') return inWay.filter((b) => b.top < this.h / 2).reduce((y, b) => Math.max(y, b.bottom + 4), 4);
    return inWay.filter((b) => b.bottom > this.h / 2).reduce((y, b) => Math.min(y, b.top - 4), this.h - 4) - height;
  }

  /**
   * Keeps the pick-up pop-ups (in their corner, Settings) clear of the rest of the HUD: in from cooldown icons down
   * their side, and past the DPS meter and cooldown icons along their edge. During an event (a rush) with its bar on
   * their edge, they always sit past the bar, however wide the battlefield. (A Guardian fight hides them.)
   */
  private placeGainPops(bar: { top: number; bottom: number; left: number; right: number } | null): void {
    const wrap = this.cooldownBar.el.parentElement;
    const pops = wrap?.querySelector<HTMLElement>('#gainPops');
    if (!pops || pops.classList.contains('hidden')) return;
    const st = this.game.state.settings;
    const top = st.pickupCorner[0] === 't';
    const onLeft = st.pickupCorner[1] === 'l';
    const boxes: Array<{ top: number; bottom: number; left: number; right: number }> = [];
    const cd = this.cooldownBar.rect();
    if (cd) boxes.push(cd);
    const meter = wrap?.querySelector<HTMLElement>('#dpsMeter');
    if (meter && !meter.classList.contains('hidden'))
      boxes.push({ top: meter.offsetTop, bottom: meter.offsetTop + meter.offsetHeight, left: meter.offsetLeft, right: meter.offsetLeft + meter.offsetWidth });
    // Cooldown icons down their side: start in from them.
    const side = cd && st.cooldownPos === (onLeft ? 'left' : 'right') ? (onLeft ? cd.right : this.w - cd.left) + 6 : 8;
    const x1 = onLeft ? side : this.w - side - GAIN_POPS_W;
    const x2 = x1 + GAIN_POPS_W;
    const near = (b: { top: number; bottom: number }) => (top ? b.top < this.h / 2 : b.bottom > this.h / 2);
    const inWay = boxes.filter((b) => b.right > x1 && b.left < x2 && near(b));
    if (bar && near(bar)) inWay.push(bar);
    // How far in from their edge (top or bottom) they start.
    const edge = top ? inWay.reduce((y, b) => Math.max(y, b.bottom + 4), 6) : this.h - inWay.reduce((y, b) => Math.min(y, b.top - 4), this.h - 6);
    const px = (n: number) => `${Math.round(n)}px`;
    const set = (k: 'left' | 'right' | 'top' | 'bottom', v: string) => {
      if (pops.style[k] !== v) pops.style[k] = v;
    };
    set(onLeft ? 'left' : 'right', px(side));
    set(onLeft ? 'right' : 'left', '');
    set(top ? 'top' : 'bottom', px(edge));
    set(top ? 'bottom' : 'top', '');
  }

  /**
   * Thomas's tomes: an open book glowing over the field, the icon of the Hunter whose special it recalls above it,
   * fading in as it opens and out once its copy is cast.
   */
  private drawTomes(g: CanvasRenderingContext2D): void {
    if (!this.field.tomes.length) return;
    const book = gearImage('wands-books/062');
    for (const t of this.field.tomes) {
      const a = Math.min(1, t.age / TOME_OPEN, (TOME_LIFE - t.age) / 0.35);
      if (a <= 0) continue;
      const bob = Math.sin(t.age * 6) * 2;
      this.scaledAt(g, t.x, t.y, () => {
        g.save();
        g.globalAlpha = a * 0.55;
        g.fillStyle = '#c9b8ff';
        g.beginPath();
        g.ellipse(t.x, t.y + 14, 34 + Math.sin(t.age * 8) * 3, 13, 0, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = a;
        g.imageSmoothingEnabled = false;
        if (book?.complete && book.naturalWidth) g.drawImage(book, t.x - 26, t.y - 32 + bob, 52, 52);
        else {
          g.fillStyle = '#f2e6c8';
          g.fillRect(t.x - 21, t.y - 22 + bob, 42, 28);
        }
        const ic = gearImage(HUNTER_ICONS[t.source]);
        if (ic?.complete && ic.naturalWidth) {
          g.strokeStyle = '#000';
          g.lineWidth = 2;
          g.strokeRect(t.x - 12, t.y - 60 + bob, 24, 24);
          g.drawImage(ic, t.x - 12, t.y - 60 + bob, 24, 24);
        }
        g.restore();
      });
    }
  }

  /**
   * Ted's dice (public/effects/dice.png: 4 turns × 6 top faces of 32px frames): they arc out tumbling (a new frame
   * every few hundredths of a second), bounce once, and settle on the faces rolled, then fade.
   */
  private drawDice(g: CanvasRenderingContext2D): void {
    if (!this.field.dice.length) return;
    const sheet = effectImage('dice');
    if (!sheet) return;
    const F = 32;
    const S = 28;
    for (const d of this.field.dice) {
      const p = Math.min(1, d.age / DICE_FLIGHT);
      const h = p < 0.75 ? Math.sin((Math.PI * p) / 0.75) * 46 : Math.sin((Math.PI * (p - 0.75)) / 0.25) * 10;
      const fade = Math.min(1, (DICE_FLIGHT + DICE_REST - d.age) / 0.3);
      const dx = d.x1 - d.x0;
      const dy = d.y1 - d.y0;
      const len = Math.hypot(dx, dy) || 1;
      for (let i = 0; i < 2; i++) {
        // The two dice fly side by side, a little apart.
        const off = (i ? 1 : -1) * 14;
        const x = d.x0 + dx * p + (-dy / len) * off;
        const y = d.y0 + dy * p + (dx / len) * off;
        const settled = d.age >= DICE_FLIGHT;
        const frame = settled ? (d.faces[i] - 1) * 4 + d.turns[i] : (Math.floor(d.age * 18) * 7 + d.id * 5 + i * 11) % 24;
        this.scaledAt(g, x, y, () => {
          g.save();
          g.globalAlpha = Math.max(0, fade) * 0.35;
          g.fillStyle = '#000';
          g.beginPath();
          g.ellipse(x, y + S / 2 - 1, S * 0.42 * (1 - h / 80), S * 0.18, 0, 0, Math.PI * 2);
          g.fill();
          g.globalAlpha = Math.max(0, fade);
          g.imageSmoothingEnabled = false;
          g.drawImage(sheet, (frame % 4) * F, Math.floor(frame / 4) * F, F, F, x - S / 2, y - S / 2 - h, S, S);
          g.restore();
        });
      }
    }
  }

  private drawHud(g: CanvasRenderingContext2D): void {
    const w = this.w;
    const boss = this.field.enemies.find((e) => e.boss);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const ev = this.game.activeEvent;
    // Framed bars at 2× their pixels: an event's timer, or a Guardian's thick health bar over a thin timer.
    const S = 2;
    const nw = Math.floor(Math.min(w * 0.8, 360) / S);
    const bw = nw * S;
    const x = Math.round((w - bw) / 2);
    const hh = boss ? 20 + (HP_BAR_H + TIME_BAR_H) * S + 2 : 20 + EVENT_BAR_H * S;
    const y0 = ev || boss ? this.hudTop(x, x + bw, hh) : 0;
    this.placeGainPops(ev && !boss ? { top: y0, bottom: y0 + hh, left: x, right: x + bw } : null);
    /** A label with a black outline, so it reads over the battlefield. */
    const label = (text: string, cx: number, color: string) => {
      g.lineWidth = 3;
      g.lineJoin = 'round';
      g.strokeStyle = '#000';
      g.strokeText(text, cx, y0 + 10);
      g.fillStyle = color;
      g.fillText(text, cx, y0 + 10);
    };
    if (ev && !boss) {
      const def = eventDef(ev.id);
      g.font = canvasFont(13, 700);
      const text = `${def.name.toUpperCase()} · ${Math.ceil(ev.left)}s`;
      const ic = gearImage(emojiIconKey(def.icon));
      if (ic) {
        // The event's icon, then its name and time, centred together.
        const tw = g.measureText(text).width;
        const left = w / 2 - (tw + 18) / 2;
        g.imageSmoothingEnabled = false;
        g.drawImage(ic, left, y0 + 3, 14, 14);
        label(text, left + 18 + tw / 2, '#9ff0a8');
      } else label(`${def.icon} ${text}`, w / 2, '#9ff0a8');
      // The timer takes the colour of the monster the event is about (green for the Slime Swarm).
      const star = Object.keys(def.minSpawn ?? {})[0] as EnemyId | undefined;
      const frac = ev.left / def.duration;
      if (!drawFramedBar(g, x, y0 + 20, S, nw, EVENT_BAR_H, frac, star ? enemyDef(star).color : TIMER_COLOR)) {
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(x, y0 + 20, bw, 6);
        g.fillStyle = '#3fcf6a';
        g.fillRect(x, y0 + 20, bw * Math.max(0, frac), 6);
      }
    }
    if (boss) {
      g.font = canvasFont(13, 700);
      const bossDef = enemyDef(boss.type);
      label(`${bossDef.guardianOnly ? bossDef.name.toUpperCase() : `${areaDef(this.game.area).name.toUpperCase()} GUARDIAN`} · ${fmt(Math.max(0, boss.hp))}`, w / 2, '#ff9aa6');
      const winAt = bossDef.winAt ?? 0;
      const t = Math.max(0, this.game.bossTimer / GUARDIAN_TIME);
      const hp = Math.max(0, boss.hp / boss.maxHp);
      // Health in the Guardian's own colour, the time left in light orange under it.
      const hy = y0 + 20;
      const ty = hy + HP_BAR_H * S + 2;
      const framed = drawFramedBar(g, x, hy, S, nw, HP_BAR_H, hp, bossDef.color) && drawFramedBar(g, x, ty, S, nw, TIME_BAR_H, t, TIMER_COLOR);
      if (!framed) {
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(x, hy, bw, HP_BAR_H * S);
        g.fillRect(x, ty, bw, TIME_BAR_H * S);
        g.fillStyle = bossDef.color;
        g.fillRect(x, hy, bw * hp, HP_BAR_H * S);
        g.fillStyle = TIMER_COLOR;
        g.fillRect(x, ty, bw * t, TIME_BAR_H * S);
      }
      // A Guardian beaten before 0 HP (the Time Eater) shows where the win is.
      if (winAt > 0) {
        g.fillStyle = '#ffe36e';
        g.fillRect(Math.round(x + bw * winAt) - 1, hy - 2, 2, HP_BAR_H * S + 4);
      }
    }
    this.drawBanner(g);
  }

  private drawBanner(g: CanvasRenderingContext2D): void {
    const w = this.w;
    if (this.banner) {
      const k = this.banner.life;
      g.globalAlpha = k < 0.2 ? k / 0.2 : k > 1.6 ? Math.max(0, 1 - (k - 1.6) / 0.4) : 1;
      g.font = canvasFont(26, 700);
      g.lineWidth = 5;
      g.strokeStyle = '#000';
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

/** The Guardian's crown: the same pixel crown as the Events tab's icon (a drawn one until it has loaded). */
const CROWN_ICON = 'armor7/068';

function drawCrown(g: CanvasRenderingContext2D, r: number): void {
  const img = gearImage(CROWN_ICON);
  if (img) {
    const size = Math.max(14, r * 0.95);
    g.imageSmoothingEnabled = false;
    g.drawImage(img, -size / 2, -r - size * 0.85, size, size);
    return;
  }
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
const portraitQueue: Array<[HTMLCanvasElement, EnemyId, AreaId | undefined]> = [];

/**
 * Draws a monster's portrait on the next frame. Portraits queued together (a whole Bestiary of them) are all
 * measured first and then all drawn, so the page is laid out once rather than once per portrait.
 */
export function queuePortrait(canvas: HTMLCanvasElement, id: EnemyId, ground?: AreaId): void {
  portraitQueue.push([canvas, id, ground]);
  if (portraitQueue.length === 1)
    requestAnimationFrame(() => {
      const batch = portraitQueue.splice(0);
      const sizes = batch.map(([c]) => [c.clientWidth, c.clientHeight] as [number, number]);
      batch.forEach(([c, e, a], i) => drawEnemyPortrait(c, e, sizes[i], a));
    });
}

/**
 * A monster's portrait, centred on its visible pixels (sprites sit off-centre in their frames), optionally on a
 * patch of `ground`: the area's battlefield floor, from the middle of its painted background.
 */
export function drawEnemyPortrait(canvas: HTMLCanvasElement, id: EnemyId, size?: [number, number], ground?: AreaId): void {
  drawPortraitSprite(canvas, id, size, ground);
  const g = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  if (!W || !H) return;
  const px = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (px[(y * W + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const dx = x1 < 0 ? 0 : Math.round(W / 2 - (x0 + x1 + 1) / 2);
  const dy = x1 < 0 ? 0 : Math.round(H / 2 - (y0 + y1 + 1) / 2);
  let floor: HTMLCanvasElement | null = null;
  if (ground) {
    // A patch from the middle of a larger background, so it's the clearing's floor, not the trees round its edge.
    const w = canvas.clientWidth || W;
    const h = canvas.clientHeight || H;
    floor = areaBackground(ground, Math.round(w * 3), Math.round(h * 3));
    if (!floor) setTimeout(() => canvas.isConnected && drawEnemyPortrait(canvas, id, size, ground), 250);
  }
  if (!dx && !dy && !floor) return;
  const copy = document.createElement('canvas');
  copy.width = W;
  copy.height = H;
  copy.getContext('2d')!.drawImage(canvas, 0, 0);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  if (floor) {
    g.imageSmoothingEnabled = false;
    const cw = floor.width / 3;
    const ch = floor.height / 3;
    g.drawImage(floor, cw, ch, cw, ch, 0, 0, W, H);
  }
  g.drawImage(copy, dx, dy);
  g.restore();
}

/**
 * A sheet's portrait frame (column 0 of `row`) copied into a sheet-sized canvas, with every pixel that touches no
 * other dropped: art sheets leave the odd stray speck that shows up on a big still portrait. Cached per sheet.
 */
const portraitFrames = new Map<string, HTMLCanvasElement>();
function portraitFrame(key: string, img: HTMLImageElement, sh: MonsterSheet, row: number): HTMLCanvasElement {
  let c = portraitFrames.get(key);
  if (c) return c;
  const F = sh.frame;
  c = document.createElement('canvas');
  c.width = F;
  c.height = (row + 1) * F;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img, 0, row * F, F, F, 0, row * F, F, F);
  const data = x.getImageData(0, row * F, F, F);
  const a = (px: number, py: number) => (px < 0 || py < 0 || px >= F || py >= F ? 0 : data.data[(py * F + px) * 4 + 3]);
  for (let py = 0; py < F; py++)
    for (let px = 0; px < F; px++) {
      if (a(px, py) <= 16) continue;
      let alone = true;
      for (let dy = -1; dy <= 1 && alone; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && a(px + dx, py + dy) > 16) alone = false;
      if (alone) data.data[(py * F + px) * 4 + 3] = 0;
    }
  x.putImageData(data, 0, row * F);
  portraitFrames.set(key, c);
  return c;
}

function drawPortraitSprite(canvas: HTMLCanvasElement, id: EnemyId, size?: [number, number], ground?: AreaId): void {
  const g = canvas.getContext('2d')!;
  const { w, h } = fitCanvas(canvas, g, undefined, size);
  g.clearRect(0, 0, w, h);
  const def = enemyDef(id);
  const r = Math.min(w, h) * 0.32;
  g.save();
  g.translate(w / 2, h / 2);
  const img = sprite(`enemies/${id}`);
  const sheetKey = MONSTER_SHEETS[id];
  const sheet = sheetKey ? monsterSheetImage(sheetKey) : null;
  if (sheetKey && sheet && !(sheet.complete && sheet.naturalWidth > 0)) sheet.addEventListener('load', () => drawEnemyPortrait(canvas, id, size, ground), { once: true });
  if (sheetKey && sheet && sheet.complete && sheet.naturalWidth > 0) {
    const sh = SHEETS[sheetKey];
    // The frame with stray single pixels cleared (the Green Slime's has one floating above it).
    const row = sheetRow(sh, 'D');
    drawSheetFrame(g, portraitFrame(sheetKey, sheet, sh, row), sh, row, 0, r * 2.8);
  } else if (img) g.drawImage(img, -r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
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

/** Status effects on a monster: embers (burn), bubbles (poison), dripping blood (bleed), a dark aura (decay), violet sparks (arcane), a gravity well (void). Frost tints the body. */
function drawStatus(g: CanvasRenderingContext2D, e: Enemy, t: number, on: (k: FxKey) => boolean, basic: boolean): void {
  const r = e.r;
  // (Frost's chill tints the monster itself blue; see drawEnemy.)
  const specks = (color: string | string[], n: number, rise: number, speed: number) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = typeof color === 'string' ? color : color[i % color.length];
      const p = (t * speed + i / n + e.phase) % 1;
      const x = Math.sin((i + 1) * 2.4 + e.phase * 3) * r * 0.7;
      const y = -r * 0.2 - p * rise;
      const s = 3 * (1 - p) + 1;
      g.globalAlpha = 1 - p;
      g.fillRect(x - s / 2, y - s / 2, s, s);
    }
    g.globalAlpha = 1;
  };
  if (e.burn && on('burn')) specks(['#ffd23a', '#ff8a2a', '#e8321e'], 6, r * 1.7, 1.8); // embers: yellow, orange and red
  const bubbles = !basic && e.poison && on('poison') ? effectImage('poison') : null;
  if (bubbles) {
    // Poisoned: a bubbling green blob over the monster.
    g.globalAlpha = 0.7;
    drawEffectFrame(g, bubbles, 'poison', Math.floor(t * 12 + e.phase * 10), 0, r * 0.4, r * 1.9, 'bottom', true);
    g.globalAlpha = 1;
  } else if (e.poison && on('poison')) specks('#6fdc5a', 3, r * 1.3, 0.9);
  if (e.bleeds?.length && on('bleed')) {
    // Bleeding: crimson and dark red pixels drip down off it, more with each stacked bleed.
    const n = Math.min(8, 1 + e.bleeds.length);
    for (let i = 0; i < n; i++) {
      const p = (t * 1.4 + i / n + e.phase * 1.7) % 1;
      const x = Math.sin((i + 1) * 3.1 + e.phase * 5) * r * 0.6;
      const y = r * 0.2 + p * p * r * 2; // falls, speeding up
      g.globalAlpha = 1 - p * 0.6;
      g.fillStyle = i % 2 ? '#6a0a14' : '#c0142e';
      g.fillRect(x - 2.5, y - 2.5, 5, i % 3 === 0 ? 7 : 5); // some drops stretch as they fall
    }
    g.globalAlpha = 1;
  }
  if (e.aura && on('decay')) {
    // Decay's aura: corrupted ground, a dim scatter of dark pixels across its reach inside a pulsing
    // purple-brown pixel ring (basic: a plain ring).
    const pulse = 0.5 + 0.5 * Math.sin(t * 6 + e.phase);
    if (basic) {
      g.strokeStyle = `rgba(90,60,40,${0.35 + 0.3 * pulse})`;
      g.fillStyle = 'rgba(60,40,30,0.12)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, STATUS.aura.radius, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    } else {
    g.fillStyle = `rgba(60,24,52,${0.22 + 0.12 * pulse})`;
    for (const c of auraCells(e.phase)) g.fillRect(c.x - c.s / 2, c.y - c.s / 2, c.s, c.s);
    g.fillStyle = `rgba(88,34,70,${0.6 + 0.3 * pulse})`;
    pixelCircle(g, 0, 0, STATUS.aura.radius, PIXEL);
    }
  }
  if (e.well && on('void')) {
    // Void's gravity well: magenta and deep-violet pixels spiral in from its reach (basic: a shrinking ring).
    const R = STATUS.well.radius;
    const fade = Math.min(1, e.well * 3);
    if (basic) {
      g.strokeStyle = `rgba(255,95,215,${0.5 * fade})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, r + (R - r) * (1 - ((t * 1.5 + e.phase) % 1)), 0, Math.PI * 2);
      g.stroke();
    } else if (effectImage('blackhole')) {
      // A swirling black hole under the monster, as wide as the well's pull.
      g.globalAlpha = fade * 0.85;
      drawEffectFrame(g, effectImage('blackhole')!, 'blackhole', Math.floor(t * 12 + e.phase * 8), 0, 0, Math.max(r * 2.6, R * 0.9), 'center', true);
      g.globalAlpha = 1;
    } else {
      const n = 14;
      for (let i = 0; i < n; i++) {
        const p = (t * 1.2 + i / n + e.phase) % 1; // 0 at the rim, 1 at the centre
        const dist = r + (R - r) * (1 - p);
        const a = (i * Math.PI * 2) / n + p * 3 + t * 2;
        const s = 2 + 2 * (1 - p);
        g.globalAlpha = fade * (0.35 + 0.65 * p);
        g.fillStyle = i % 2 ? '#ff5fd7' : '#5a2a8a';
        g.fillRect(Math.cos(a) * dist - s / 2, Math.sin(a) * dist - s / 2, s, s);
      }
      g.globalAlpha = 1;
    }
  }
  if (e.mark) {
    // Hunter's Mark: a red reticle over it.
    g.strokeStyle = '#ff5a5a';
    g.lineWidth = 2;
    g.globalAlpha = 0.8;
    const m = r + 6;
    g.beginPath();
    g.arc(0, 0, m, 0, Math.PI * 2);
    g.moveTo(-m - 4, 0);
    g.lineTo(-m + 4, 0);
    g.moveTo(m - 4, 0);
    g.lineTo(m + 4, 0);
    g.moveTo(0, -m - 4);
    g.lineTo(0, -m + 4);
    g.moveTo(0, m - 4);
    g.lineTo(0, m + 4);
    g.stroke();
    g.globalAlpha = 1;
  }
  if (e.plague && on('poison')) {
    // Plague: sickly green bubbles rising off it.
    g.fillStyle = '#6fdc5a';
    for (let i = 0; i < 4; i++) {
      const p = (t * 0.8 + i / 4 + e.phase) % 1;
      g.globalAlpha = 1 - p;
      g.fillRect(Math.sin(i * 2.1 + t * 3) * r * 0.6 - 1.5, -r - p * 16, 3, 3);
    }
    g.globalAlpha = 1;
  }
  if (e.exposed && on('arcane')) {
    // Arcane: resistances stripped. Orbiting violet sparks.
    g.fillStyle = '#c08cff';
    for (let i = 0; i < 3; i++) {
      const a = t * 4 + (i * Math.PI * 2) / 3;
      g.fillRect(Math.cos(a) * (r + 5) - 1.5, Math.sin(a) * (r + 5) - 1.5, 3, 3);
    }
  }
}

/** Each attack style gets its own simple look. */
/** A ranged monster's bolt: a glowing orb of its colour with a fading tail, `k` times its size (like the characters). */
function drawEnemyShot(g: CanvasRenderingContext2D, s: EnemyShot, t: number, k: number, clarity = 0): void {
  const color = enemyDef(s.from).color;
  const sp = Math.hypot(s.vx, s.vy) || 1;
  const ux = s.vx / sp;
  const uy = s.vy / sp;
  const r = SHOT_RADIUS * k;
  g.save();
  for (let i = 4; i >= 1; i--) {
    g.globalAlpha = 0.14 * (5 - i);
    g.fillStyle = color;
    g.beginPath();
    g.arc(s.x - ux * i * r, s.y - uy * i * r, r * (1 - i * 0.14), 0, Math.PI * 2);
    g.fill();
  }
  const pulse = 1 + Math.sin(t * 18) * 0.12;
  g.globalAlpha = 0.35;
  g.fillStyle = '#c99cff';
  g.beginPath();
  g.arc(s.x, s.y, r * 1.9 * pulse, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = color;
  g.strokeStyle = '#1a0f24';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(s.x, s.y, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  if (clarity > 0) {
    // The Clarity Border: a white ring just outside the dark rim.
    g.globalAlpha = clarity;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(s.x, s.y, r + 1.4, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
  }
  g.fillStyle = '#f0e0ff';
  g.beginPath();
  g.arc(s.x - r * 0.25, s.y - r * 0.25, r * 0.4, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function drawBullet(g: CanvasRenderingContext2D, b: Bullet, t: number, basic = false): void {
  const a = Math.atan2(b.vy, b.vx);
  g.save();
  g.translate(b.x, b.y);
  switch (b.kind) {
    case 'blood': {
      // A blood bolt: a dark-red drop with a short trail behind it.
      g.rotate(a);
      g.fillStyle = 'rgba(160,20,30,0.45)';
      g.fillRect(-12, -2, 10, 4);
      g.fillStyle = '#c0242c';
      g.beginPath();
      g.arc(0, 0, 4.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff6a6a';
      g.fillRect(0, -2, 2, 2);
      break;
    }
    case 'fireball': {
      if (basic) {
        g.fillStyle = 'rgba(255,120,40,0.35)';
        g.beginPath();
        g.arc(0, 0, 9, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffb04d';
        g.beginPath();
        g.arc(0, 0, 5.5, 0, Math.PI * 2);
        g.fill();
        break;
      }
      const fb = effectImage('fireball');
      if (fb) {
        // The fireball sprite, flying the way it's going (it's drawn heading right).
        g.rotate(a);
        drawEffectFrame(g, fb, 'fireball', Math.floor(t * 16), 0, 0, 26, 'center', true);
        break;
      }
      // A flickering ball of fire squares: a big one at the core, small ones around it.
      const f = Math.floor(t * 20);
      g.fillStyle = FIRE_COLORS[f % 3];
      g.fillRect(-4, -4, 8, 8);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + t * 6;
        g.fillStyle = FIRE_COLORS[(f + i) % 3];
        g.fillRect(Math.cos(a) * 6 - 2, Math.sin(a) * 6 - 2, 4, 4);
      }
      break;
    }
    case 'potion':
      // A tumbling round flask: green glass with a shine, a neck and a cork.
      g.rotate(t * 12);
      g.strokeStyle = OUTLINE;
      g.lineWidth = 1.5;
      g.fillStyle = '#d8e8e0';
      g.fillRect(-2, -8, 4, 5);
      g.strokeRect(-2, -8, 4, 5);
      g.fillStyle = '#9a6a3a';
      g.fillRect(-2.5, -10, 5, 3);
      g.fillStyle = '#5ccf5c';
      g.beginPath();
      g.arc(0, 2, 5.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#b8f5a8';
      g.fillRect(-3, -1, 2, 2);
      break;
    case 'arrow':
      g.rotate(a);
      // An Elemental Arrow glows with its element; an exploding one trails sparks.
      if (b.elem || b.blast) {
        g.fillStyle = b.elem ? DAMAGE_TYPES[b.dtype ?? 'physical'].color : '#ff8a3d';
        g.globalAlpha = 0.45;
        g.beginPath();
        g.arc(4, 0, 6, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
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
    case 'spark': {
      // A spellcaster's magic bolt, in their colour.
      const c = b.shooter === 'main' ? '#fff6c2' : hunterDef(b.shooter).color;
      g.rotate(t * 10);
      g.fillStyle = c;
      g.globalAlpha = 0.35;
      g.beginPath();
      g.arc(0, 0, 6, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.fillRect(-2.5, -2.5, 5, 5);
      g.fillStyle = '#ffffff';
      g.fillRect(-1, -1, 2, 2);
      break;
    }
    case 'slash': {
      // A sword's Elemental Wave: a crescent of its element, as wide as it hits, flying edge-first.
      const c = DAMAGE_TYPES[b.dtype ?? 'physical'].color;
      const r = b.size ?? 30;
      g.rotate(a);
      g.globalAlpha = 0.35;
      g.fillStyle = c;
      g.beginPath();
      g.arc(-r * 0.55, 0, r, -1.1, 1.1);
      g.arc(-r * 0.85, 0, r * 0.95, 1.1, -1.1, true);
      g.closePath();
      g.fill();
      g.globalAlpha = 0.9;
      g.strokeStyle = c;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(-r * 0.55, 0, r, -1, 1);
      g.stroke();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(-r * 0.55, 0, r, -0.6, 0.6);
      g.stroke();
      g.globalAlpha = 1;
      break;
    }
    case 'bigDagger': {
      // A Spectral Dagger: a big glowing blade of its element.
      const c = DAMAGE_TYPES[b.dtype ?? 'physical'].color;
      g.rotate(a);
      g.fillStyle = c;
      g.globalAlpha = 0.35;
      g.fillRect(-26, -5, 18, 10);
      g.globalAlpha = 1;
      g.beginPath();
      g.moveTo(16, 0);
      g.lineTo(-6, -6);
      g.lineTo(-6, 6);
      g.closePath();
      g.fill();
      g.strokeStyle = OUTLINE;
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = '#ffffff';
      g.fillRect(-4, -1, 14, 2);
      g.fillStyle = '#6a5040';
      g.fillRect(-12, -2.5, 7, 5);
      break;
    }
    case 'rock': {
      // Stone magic: a tumbling chunk of rock with a little dust behind it.
      g.fillStyle = 'rgba(160,150,130,0.35)';
      g.fillRect(-Math.cos(a) * 10 - 2, -Math.sin(a) * 10 - 2, 4, 4);
      g.rotate(t * 14);
      // The pack's grey rock, tumbling (shapes in Basic, or until it loads).
      const rock = basic ? null : gearImage(ROCK_ICON);
      if (rock) {
        g.imageSmoothingEnabled = false;
        g.drawImage(rock, -7, -7, 14, 14);
      } else drawRock(g, 5, '#9a9488');
      break;
    }
    case 'spell': {
      // A spell's bolt: the pack's crackling orb in its element's colour (Fancy), or a glowing orb with a tail.
      const c = b.dtype ? DAMAGE_TYPES[b.dtype].color : '#fff6c2';
      const orb = !basic ? effectImage('orb') : null;
      if (orb) {
        drawEffectFrame(g, tinted(orb, c), 'orb', Math.floor(performance.now() / 70), 0, 0, 18, 'center', true);
        break;
      }
      g.rotate(a);
      g.fillStyle = c;
      g.globalAlpha = 0.3;
      g.fillRect(-14, -2.5, 12, 5);
      g.beginPath();
      g.arc(0, 0, 8, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.beginPath();
      g.arc(0, 0, 4.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.fillRect(-1.5, -1.5, 3, 3);
      break;
    }
    case 'pellet':
    case 'pistol':
      // An Opening or Closing Shot (a round that hits harder) is bigger, with a gold glow.
      if (b.dmg > 1.5) {
        g.fillStyle = 'rgba(255,211,77,0.4)';
        g.beginPath();
        g.arc(0, 0, 6, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = b.blast ? '#ff8a3d' : '#ffe9a0';
      g.beginPath();
      g.arc(0, 0, b.dmg > 1.5 ? 3.5 : 2.2, 0, Math.PI * 2);
      g.fill();
      break;
    default:
      // A bolt of one element (weapons that fire one type per bolt) takes its colour.
      g.fillStyle = b.crit ? '#ff6b6b' : b.dtype ? DAMAGE_TYPES[b.dtype].color : '#fff6c2';
      g.beginPath();
      g.arc(0, 0, b.crit ? 4 : 3, 0, Math.PI * 2);
      g.fill();
  }
  g.restore();
}

/** A chunky pixel rock of radius `r` around the origin: a dark outline, its colour, a lighter top and a crack. */
function drawRock(g: CanvasRenderingContext2D, r: number, color: string): void {
  const pts = [1, 0.85, 1, 0.9, 0.95, 0.8, 1, 0.9].map((k, i) => [Math.cos((i / 8) * Math.PI * 2) * r * k, Math.sin((i / 8) * Math.PI * 2) * r * k]);
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fillStyle = color;
  g.fill();
  g.lineWidth = Math.max(1.5, r * 0.12);
  g.strokeStyle = OUTLINE;
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.fillRect(-r * 0.5, -r * 0.6, r * 0.6, r * 0.3);
  g.strokeStyle = 'rgba(40,36,30,0.6)';
  g.lineWidth = Math.max(1, r * 0.08);
  g.beginPath();
  g.moveTo(r * 0.1, -r * 0.2);
  g.lineTo(r * 0.35, r * 0.15);
  g.lineTo(r * 0.2, r * 0.45);
  g.stroke();
}

/** Shield charges under a Hunter: lit while charged, faint while recharging. */
/**
 * A Hunter's shield charges as little shields under them: the charges left, centred (one sits dead centre when
 * there's an odd number), spreading out from the middle as there are more.
 */
function drawShieldPips(g: CanvasRenderingContext2D, x: number, y: number, guard: number): void {
  const gap = 9;
  for (let i = 0; i < guard; i++) drawMiniShield(g, x + (i - (guard - 1) / 2) * gap, y);
}

/** A tiny heater shield (about 7×8), silver with a gold boss and a black edge. */
function drawMiniShield(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.save();
  g.translate(Math.round(x), Math.round(y));
  g.beginPath();
  g.moveTo(-3.5, -4);
  g.lineTo(3.5, -4);
  g.lineTo(3.5, 0.5);
  g.quadraticCurveTo(3.2, 3.2, 0, 4.6);
  g.quadraticCurveTo(-3.2, 3.2, -3.5, 0.5);
  g.closePath();
  g.fillStyle = '#c9d4e0';
  g.fill();
  g.lineWidth = 1.4;
  g.strokeStyle = '#000';
  g.stroke();
  g.fillStyle = '#8fa2b8';
  g.fillRect(0, -3.3, 3, 3.3);
  g.fillStyle = '#ffd34d';
  g.fillRect(-1, -1.2, 2, 2);
  g.restore();
}

/** The stun timer under a dazed Hunter: a framed bar that empties as they come round. */
function drawStunBar(g: CanvasRenderingContext2D, x: number, y: number, w: number, frac: number): void {
  const h = 5;
  const l = Math.round(x - w / 2);
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(l, y, w, h);
  g.fillStyle = '#ffe066';
  g.fillRect(l, y, Math.round(w * Math.max(0, Math.min(1, frac))), h);
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.fillRect(l, y, Math.round(w * Math.max(0, Math.min(1, frac))), 1);
  g.lineWidth = 2;
  g.strokeStyle = '#000';
  g.strokeRect(l - 1, y - 1, w + 2, h + 2);
  g.lineWidth = 1;
  g.strokeStyle = '#d8d8d8';
  g.strokeRect(l - 2.5, y - 2.5, w + 5, h + 5);
}

/** Pixel colours where a weapon's waiting text breaks up: sparks and metal, magic, or a summoning haze. */
const EDGE_PIXELS: Record<string, string[]> = {
  'RELOADING!': ['#8a8f96', '#c4c8cc', '#5a5f66', '#ff3a2a', '#ff7a3a'],
  'RECHARGING!': ['#ffffff', '#ffd34d', '#e8a800', '#5ab0ff', '#9fd8ff'],
  'SUMMONING!': ['#ff8ad8', '#e040c0', '#b020a0', '#2a2a7a', '#3a3aa0'],
};

/**
 * Ability cooldowns as icons along one edge of the battlefield (Settings picks the edge). A recharging icon
 * is greyed out and refills with colour from the top down; when it's ready it gives a little pulse. Icons are
 * as tall as the DPS meter and share its row (leaving it room); when a row is full the rest go in a second
 * row, further in from the edge (below the icons and the meter, at the top).
 */
class CooldownBar {
  readonly el: HTMLDivElement;
  private lines: HTMLDivElement[] = [];
  private icons = new Map<string, { el: HTMLDivElement; color: HTMLSpanElement; line: HTMLElement; ready: boolean }>();

  constructor(
    parent: HTMLElement,
    private game: Game,
    private field: Field,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'cd-bar';
    parent.appendChild(this.el);
  }

  private line(i: number): HTMLDivElement {
    while (this.lines.length <= i) {
      const l = document.createElement('div');
      l.className = 'cd-line-wrap';
      this.el.appendChild(l);
      this.lines.push(l);
    }
    return this.lines[i];
  }

  update(): void {
    const st = this.game.state.settings;
    const list = st.cooldowns ? this.field.cooldowns() : [];
    const pos = st.cooldownPos;
    this.el.className = `cd-bar cd-${pos}`;
    this.el.classList.toggle('hidden', !list.length);
    const wrap = this.el.parentElement!;
    const meter = wrap.querySelector<HTMLElement>('#dpsMeter');
    const meterOn = !!meter && st.dps && !meter.classList.contains('hidden');
    const size = meterOn ? meter!.offsetHeight : 26;
    const gap = 6;
    const vertical = pos === 'left' || pos === 'right';
    // The first line shares its edge with the DPS meter when the meter sits on that edge: leave it room.
    const corner = st.dpsCorner;
    const meterHere = meterOn && (pos === 'top' ? corner[0] === 't' : pos === 'bottom' ? corner[0] === 'b' : pos === 'left' ? corner[1] === 'l' : corner[1] === 'r');
    const meterLen = meterHere ? (vertical ? meter!.offsetHeight : meter!.offsetWidth) + gap : 0;
    const room = (vertical ? wrap.clientHeight - 12 : wrap.clientWidth - 16) + gap;
    const perLine = Math.max(1, Math.floor(room / (size + gap)));
    // Keep the first line clear of the meter, leaving the same room at both ends so the icons stay centred.
    const firstLine = Math.max(0, Math.floor((room - 2 * meterLen) / (size + gap)));
    const first = this.line(0);
    first.style.padding = meterHere ? (vertical ? `${meterLen}px 0` : `0 ${meterLen}px`) : '0';
    this.el.style.setProperty('--cd-size', `${size}px`);
    const seen = new Set<string>();
    list.forEach((c, i) => {
      seen.add(c.key);
      let ic = this.icons.get(c.key);
      if (!ic) {
        const el = document.createElement('div');
        el.className = 'cd-icon';
        el.title = c.name;
        // A Hunter's special shows that Hunter's own icon; gear shows its emoji's icon.
        const icon = c.key in HUNTER_ICONS ? hunterIconHtml(c.key as keyof typeof HUNTER_ICONS) : c.icon;
        el.innerHTML = `<span class="cd-gray">${icon}</span><span class="cd-color">${icon}</span><i class="cd-line"></i>`;
        ic = { el, color: el.querySelector('.cd-color') as HTMLSpanElement, line: el.querySelector('.cd-line') as HTMLElement, ready: c.progress >= 1 };
        this.icons.set(c.key, ic);
      }
      const li = i < firstLine ? 0 : 1 + Math.floor((i - firstLine) / perLine);
      const at = li === 0 ? i : (i - firstLine) % perLine;
      const target = this.line(li);
      if (target.children[at] !== ic.el) target.insertBefore(ic.el, target.children[at] ?? null);
      // The coloured copy shows from the top down as it recharges.
      ic.color.style.clipPath = `inset(0 0 ${(1 - Math.min(1, c.progress)) * 100}% 0)`;
      // Fancy: a glowing line where the colour meets the grey.
      ic.line.style.top = `${Math.min(1, c.progress) * 100}%`;
      ic.line.classList.toggle('hidden', st.cooldownStyle !== 'fancy' || c.progress >= 1);
      const ready = c.progress >= 1;
      if (ready && !ic.ready) {
        ic.el.classList.remove('pulse');
        void ic.el.offsetWidth;
        ic.el.classList.add('pulse');
      }
      ic.ready = ready;
    });
    for (const [key, ic] of this.icons)
      if (!seen.has(key)) {
        ic.el.remove();
        this.icons.delete(key);
      }
    // Empty lines take no room (the first stays: it holds the gap beside the meter).
    this.lines.forEach((l, i) => l.classList.toggle('hidden', i > 0 && !l.childElementCount));
  }

  /** The icons' box within the battlefield, when they're showing. */
  rect(): { top: number; bottom: number; left: number; right: number } | null {
    if (this.el.classList.contains('hidden')) return null;
    let top = Infinity;
    let bottom = -Infinity;
    let left = Infinity;
    let right = -Infinity;
    for (const ic of this.icons.values()) {
      const e = ic.el;
      const line = e.parentElement as HTMLElement;
      const x = this.el.offsetLeft + line.offsetLeft + e.offsetLeft;
      const y = this.el.offsetTop + line.offsetTop + e.offsetTop;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y + e.offsetHeight);
      left = Math.min(left, x);
      right = Math.max(right, x + e.offsetWidth);
    }
    return Number.isFinite(top) ? { top, bottom, left, right } : null;
  }
}

/** A square in an effect made of squares: offset from its centre, size, and which colour of its palette. */
interface Cell {
  x: number;
  y: number;
  s: number;
  color: number;
}

/** Size of one "pixel" in pixel-circle effects, in world units. */
const PIXEL = 4;
const BLAST_TIME = 0.35;

/** A potion (or acid) pool's colours: [deep, body, rim, shine] as "r,g,b". */
const POOL_COLORS = { potion: ['26,78,34', '52,140,58', '140,232,120', '214,255,190'], acid: ['86,104,14', '150,186,30', '214,246,80', '248,255,190'] };

/**
 * A pool of Andrejz's potion (or an acid puddle): it spills out over the first moments, its edge rippling gently,
 * a darker middle under a bright rim and a glint of shine; bubbles swell up across it and pop in little rings; and
 * it shrinks a little and fades as it dries. Drawn from its age and remaining life alone, so nothing is stored.
 */
function drawPotionPool(g: CanvasRenderingContext2D, p: { x: number; y: number; r: number; life: number }, age: number, acid: boolean): void {
  const [deep, body, rim, shine] = POOL_COLORS[acid ? 'acid' : 'potion'];
  const spill = 1 - Math.pow(1 - Math.min(1, age / 0.3), 3); // eases out as it spreads
  const dry = Math.min(1, p.life / 0.8);
  const fade = Math.min(1, age / 0.12) * dry;
  const r = p.r * spill * (0.85 + 0.15 * dry);
  if (r < 1) return;
  const seed = Math.abs(p.x * 0.37 + p.y * 0.61);
  // The edge: a ring of points pushed in and out by two slow ripples.
  const edge = (k: number, wob: number) => {
    g.beginPath();
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * k * (1 + wob * (Math.sin(a * 3 + seed + age * 2.2) * 0.6 + Math.sin(a * 5 - seed * 1.3 - age * 1.7) * 0.4));
      const x = p.x + Math.cos(a) * rr;
      const y = p.y + Math.sin(a) * rr * 0.72;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.closePath();
  };
  g.save();
  // Splash ring as it lands.
  if (age < 0.35) {
    const t = age / 0.35;
    g.strokeStyle = `rgba(${rim},${0.7 * (1 - t)})`;
    g.lineWidth = 2.5 * (1 - t) + 0.5;
    g.beginPath();
    g.ellipse(p.x, p.y, p.r * (0.4 + 0.8 * t), p.r * (0.4 + 0.8 * t) * 0.72, 0, 0, Math.PI * 2);
    g.stroke();
  }
  edge(1, 0.07);
  g.fillStyle = `rgba(${body},${0.55 * fade})`;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = `rgba(${rim},${0.75 * fade})`;
  g.stroke();
  edge(0.62, 0.1);
  g.fillStyle = `rgba(${deep},${0.45 * fade})`;
  g.fill();
  // A glint of shine toward the top-left.
  g.fillStyle = `rgba(${shine},${0.35 * fade})`;
  g.beginPath();
  g.ellipse(p.x - r * 0.32, p.y - r * 0.26, r * 0.22, r * 0.08, -0.35, 0, Math.PI * 2);
  g.fill();
  // Bubbles: each swells over its cycle, then pops in a ring, at its own spot and phase.
  const n = Math.max(3, Math.min(9, Math.round(p.r / 9)));
  for (let i = 0; i < n; i++) {
    const cycle = 0.9 + ((i * 0.37) % 0.6);
    const t = ((((age + i * 0.29 + seed) % cycle) + cycle) % cycle) / cycle;
    const a = i * 2.4 + seed;
    const d = r * 0.7 * Math.sqrt((i + 0.5) / n);
    const bx = p.x + Math.cos(a + Math.floor((age + i * 0.29) / cycle) * 1.3) * d;
    const by = p.y + Math.sin(a + Math.floor((age + i * 0.29) / cycle) * 1.3) * d * 0.72;
    const big = Math.max(1.6, p.r * 0.07);
    if (t < 0.8) {
      const s = big * (0.3 + t);
      g.fillStyle = `rgba(${rim},${0.85 * fade})`;
      g.beginPath();
      g.arc(bx, by - s * 0.3, s, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgba(${shine},${0.8 * fade})`;
      g.fillRect(bx - s * 0.45, by - s * 0.95, Math.max(1, s * 0.4), Math.max(1, s * 0.4));
    } else {
      const k = (t - 0.8) / 0.2;
      g.strokeStyle = `rgba(${shine},${0.7 * (1 - k) * fade})`;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(bx, by, big * (1 + k * 1.4), big * (1 + k * 1.4) * 0.6, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  g.restore();
}
const FIRE_COLORS = ['#ffd23a', '#ff8a2a', '#e8321e'];

/**
 * A circle of radius `r` drawn as square pixels (like a circle in a block game), `thick` pixels wide, in the
 * current fill colour.
 */
function pixelCircle(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, px: number, thick = 1): void {
  const n = Math.ceil(r / px) + 1;
  for (let j = -n; j <= n; j++)
    for (let i = -n; i <= n; i++) {
      const d = Math.hypot(i * px, j * px);
      if (d <= r + px / 2 && d > r - px * (thick - 0.5)) g.fillRect(cx + i * px - px / 2, cy + j * px - px / 2, px, px);
    }
}

/** Two hex colours mixed: `k` of the way from `a` to `b`. */
function mixHex(a: string, b: string, k: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}

/** A blue-tinted copy of a sprite, for monsters chilled by Frost (made once per sprite). */
const frostCache = new WeakMap<CanvasImageSource, HTMLCanvasElement>();

/** How opaque the Clarity Border (a white outline round characters and projectiles) is at each setting. */
const CLARITY_ALPHA: Record<ClarityLevel, number> = { off: 0, low: 0.3, moderate: 0.6, strong: 0.95 };

/** One frame of a monster walk sheet, centred on the origin, with the character's longer side `size` across. */
function drawSheetFrame(g: CanvasRenderingContext2D, img: CanvasImageSource, sh: MonsterSheet, row: number, col: number, size: number, outline?: { of: HTMLImageElement; alpha: number }): void {
  const [bx, by, bw, bh] = sh.box;
  const k = size / Math.max(bw, bh);
  const F = sh.frame;
  if (outline && outline.alpha > 0) {
    const a = g.globalAlpha;
    g.globalAlpha = a * outline.alpha;
    g.drawImage(outlineOf(outline.of), col * F, row * F, F, F, -(bx + bw / 2) * k, -(by + bh / 2) * k, F * k, F * k);
    g.globalAlpha = a;
  }
  g.drawImage(img, col * F, row * F, F, F, -(bx + bw / 2) * k, -(by + bh / 2) * k, F * k, F * k);
}

/** The rolling boulder: a grey rock from the resources pack. */
const ROCK_ICON = 'resources3/011';

/** Rock and boulder spells tint the pack's effects to stone. */
const STONE_COLOR = '#a89c86';

/** The arc sheet's first frame with the bolt itself (before it, it charges up). */
const ARC_FIRST = 4;

/** The smash sheet's first frame of its outward burst (before it, sparks gather). */
const SMASH_START = 4;

/** Frames a second for strike effects: a quick thrust, a heavier punch. */
const STRIKE_FPS = { thrust: 36, fist: 24 };

/** The fist sheet tinted from purple to gold, once. */
let fistGold: HTMLCanvasElement | null = null;
function goldFist(src: HTMLImageElement): HTMLCanvasElement {
  if (fistGold) return fistGold;
  const c = document.createElement('canvas');
  c.width = src.naturalWidth;
  c.height = src.naturalHeight;
  const x = c.getContext('2d')!;
  x.filter = 'hue-rotate(125deg) saturate(0.9) brightness(1.4)';
  x.drawImage(src, 0, 0);
  fistGold = c;
  return c;
}

/**
 * A strike effect turned to its attack, starting at (x, y) and running `len` along angle `a`: a spear's thrust
 * (its streak `thick` across) or Sciirj's fist (out of its portal, tinted gold).
 */
interface Strike {
  key: 'thrust' | 'fist';
  /** The thrust's damage-type colour. */
  color?: string;
  x: number;
  y: number;
  a: number;
  len: number;
  thick: number;
  t: number;
}

function drawStrike(g: CanvasRenderingContext2D, img: HTMLImageElement, st: Strike): void {
  const sh = EFFECTS[st.key];
  const f = Math.min(sh.frames - 1, Math.floor(st.t * STRIKE_FPS[st.key]));
  const [bx, by, bw, bh] = sh.box;
  g.save();
  g.translate(st.x, st.y);
  g.imageSmoothingEnabled = false;
  if (st.key === 'fist') {
    // The sheet's portal is at the top with the fist reaching down: turn "down" toward the monster, with the
    // portal on Sciirj.
    g.rotate(st.a - Math.PI / 2);
    g.globalAlpha = 0.6; // ethereal
    const k = st.len / bh;
    g.drawImage(goldFist(img), f * sh.frame, 0, sh.frame, sh.frame, -(bx + bw / 2) * k, -by * k, sh.frame * k, sh.frame * k);
    g.restore();
    return;
  }
  g.rotate(st.a);
  const kx = st.len / bw;
  const ky = st.thick / bh;
  g.drawImage(tinted(img, st.color), f * sh.frame, 0, sh.frame, sh.frame, -bx * kx, -(by + bh / 2) * ky, sh.frame * kx, sh.frame * ky);
  g.restore();
}

/** Overall trail density and particle size (on top of each type's own). */
const TRAIL_DENSITY = 2.5;
const TRAIL_SIZE = 1.7;

/** Ranged weapons' projectiles, which leave a trail (spells, fireballs, potions and blood bolts have their own looks). */
const TRAIL_KINDS = new Set<BulletKind>(['arrow', 'bolt', 'pellet', 'pistol', 'ricochet', 'dagger', 'hammer']);

/**
 * Each damage type's trail: particles a second, colours, size, how long they last, gravity (+ falls, − rises),
 * how much they scatter, how fast they rise, and square pixels or round dots. Physical leaves none.
 */
const TRAILS: Partial<Record<DamageType, { rate: number; colors: string[]; size: number; life: number; gravity: number; drift: number; rise: number; square: boolean }>> = {
  // Embers that flicker up.
  fire: { rate: 45, colors: ['#ffd34d', '#ff7a2a', '#ff4a1a'], size: 2.4, life: 0.35, gravity: -60, drift: 30, rise: 20, square: true },
  // Glittering ice crystals that hang in the air.
  frost: { rate: 35, colors: ['#ffffff', '#c8f0ff', '#8fdcff'], size: 1.8, life: 0.5, gravity: 0, drift: 14, rise: 0, square: true },
  // Drips that fall away.
  acid: { rate: 28, colors: ['#e2ff6a', '#c6f03a', '#8ab820'], size: 1.9, life: 0.45, gravity: 280, drift: 12, rise: 0, square: false },
  // Bubbles that rise.
  poison: { rate: 24, colors: ['#a8f08a', '#6fdc5a', '#3a9a3a'], size: 2.2, life: 0.55, gravity: -30, drift: 16, rise: 15, square: false },
  // Golden sparkles.
  radiant: { rate: 40, colors: ['#ffffff', '#fff4b0', '#ffe36e'], size: 1.7, life: 0.35, gravity: 0, drift: 40, rise: 0, square: true },
  // Violet motes scattering.
  arcane: { rate: 32, colors: ['#e6ccff', '#c08cff', '#8a5ad8'], size: 1.9, life: 0.45, gravity: 0, drift: 70, rise: 0, square: false },
  // Ash and dead leaves that drift down.
  decay: { rate: 26, colors: ['#8a7448', '#5a4a30', '#2e2418'], size: 2.4, life: 0.55, gravity: 110, drift: 22, rise: 0, square: true },
  // Crackling sparks that jump off it.
  lightning: { rate: 50, colors: ['#ffffff', '#d0e0ff', '#8fb4ff'], size: 1.5, life: 0.16, gravity: 0, drift: 220, rise: 0, square: true },
  // Dark-pink motes.
  void: { rate: 30, colors: ['#ff9ae8', '#ff5fd7', '#7a2a8a'], size: 2.1, life: 0.45, gravity: 0, drift: 26, rise: 0, square: false },
};

/** Physical damage's colour: its attacks keep the effects' own white. */
const PHYSICAL_COLOR = DAMAGE_TYPES.physical.color;
/** The outline round a Physical summon (an elemental one is outlined in its element's colour). */
const SUMMON_PHYSICAL_RING = '#a24dff';
/** The monster a wisp-type summon looks like, by its kind of creature. */
const SUMMON_ART: Partial<Record<SummonType, EnemyId>> = { spirit: 'wraith', undead: 'skeleton', elemental: 'frostSprite', beast: 'wolf', construct: 'puppet' };
const tints = new WeakMap<object, Map<string, HTMLCanvasElement>>();

/**
 * A white effect sheet tinted toward a damage type's colour (light parts take the colour, keeping their shading
 * and transparency); Physical, or a colour it doesn't know, leaves the sheet as it is. Cached per sheet and colour.
 */
function tinted<T extends HTMLImageElement | HTMLCanvasElement>(src: T, color: string | undefined): T | HTMLCanvasElement {
  if (!color || color === PHYSICAL_COLOR || !/^#[0-9a-f]{6}$/i.test(color)) return src;
  let byColor = tints.get(src);
  if (!byColor) tints.set(src, (byColor = new Map()));
  const hit = byColor.get(color);
  if (hit) return hit;
  const w = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const h = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.drawImage(src, 0, 0);
  // Multiply by the colour lifted a little toward white (so it stays bright), then restore the sheet's alpha.
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = `rgb(${Math.round(r + (255 - r) * 0.2)},${Math.round(g + (255 - g) * 0.2)},${Math.round(b + (255 - b) * 0.2)})`;
  x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'destination-in';
  x.drawImage(src, 0, 0);
  byColor.set(color, c);
  return c;
}

/** A scratch canvas for drawing one sword swing at the battlefield's resolution (reused swing to swing). */
let sweepScratch: HTMLCanvasElement | null = null;
function sweepCanvas(g: CanvasRenderingContext2D, size: number): HTMLCanvasElement {
  const m = g.getTransform();
  const n = Math.max(8, Math.min(1024, Math.ceil(size * Math.hypot(m.a, m.b))));
  if (!sweepScratch) sweepScratch = document.createElement('canvas');
  if (sweepScratch.width !== n) {
    sweepScratch.width = n;
    sweepScratch.height = n;
  }
  return sweepScratch;
}

/**
 * The swirling rim of the black hole, silver-white, without its dark core: a blade's swing is a wedge of it
 * (see the sweeps). Built once the black hole sheet has loaded.
 */
let bladeRing: HTMLCanvasElement | null = null;
function bladeRingOf(src: HTMLImageElement): HTMLCanvasElement {
  if (bladeRing) return bladeRing;
  const c = document.createElement('canvas');
  c.width = src.naturalWidth;
  c.height = src.naturalHeight;
  const x = c.getContext('2d')!;
  x.drawImage(src, 0, 0);
  const img = x.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.3 * d[i] + 0.55 * d[i + 1] + 0.15 * d[i + 2];
    // The dark core and its thin inner rings go; the white rim and pink swirls turn silver-white.
    if (lum < 120) d[i + 3] = 0;
    else {
      const v = Math.min(255, 150 + lum * 0.45);
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = Math.min(255, v + 12);
    }
  }
  x.putImageData(img, 0, 0);
  bladeRing = c;
  return c;
}

interface Anim {
  key: EffectKey;
  x: number;
  y: number;
  size: number;
  anchor: 'center' | 'bottom';
  fps: number;
  t: number;
  /** Frame to start from (skipping a wind-up), and opacity. */
  start: number;
  alpha: number;
  /** A damage type's colour to tint it (a hammer's smash). */
  color?: string;
}

/**
 * One frame of a magic effect: its box's longer side `size` across, centred on (x, y), or with its bottom
 * edge there ('bottom'). `loop` wraps the frame number (projectiles, wells); otherwise it's clamped. `sizeBy`
 * sizes it by another sheet's box (the phases of one effect, so it doesn't jump between them).
 */
function drawEffectFrame(g: CanvasRenderingContext2D, img: HTMLImageElement | HTMLCanvasElement, key: EffectKey, frame: number, x: number, y: number, size: number, anchor: 'center' | 'bottom', loop = false, sizeBy: EffectKey = key): void {
  const sh = EFFECTS[key];
  const f = loop ? ((frame % sh.frames) + sh.frames) % sh.frames : Math.max(0, Math.min(sh.frames - 1, frame));
  const [bx, by, bw, bh] = EFFECTS[sizeBy].box;
  const k = size / Math.max(bw, bh);
  const dx = x - (bx + bw / 2) * k;
  const dy = anchor === 'bottom' ? y - (by + bh) * k : y - (by + bh / 2) * k;
  const smooth = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.drawImage(img, f * sh.frame, 0, sh.frame, sh.frame, dx, dy, sh.frame * k, sh.frame * k);
  g.imageSmoothingEnabled = smooth;
}

/** A pink copy of a monster's art, for one charmed by Norm (cached per image). */
const charmCache = new WeakMap<HTMLImageElement | HTMLCanvasElement, HTMLCanvasElement>();
function charmTint(img: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const hit = charmCache.get(img);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d')!;
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = 'rgba(255,110,200,0.55)';
  x.fillRect(0, 0, c.width, c.height);
  charmCache.set(img, c);
  return c;
}

/** A gold copy of a monster's art, for a gold monster (cached per image). */
const goldCache = new WeakMap<HTMLImageElement | HTMLCanvasElement, HTMLCanvasElement>();
function goldTint(img: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const hit = goldCache.get(img);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d')!;
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = 'rgba(255,200,40,0.6)';
  x.fillRect(0, 0, c.width, c.height);
  goldCache.set(img, c);
  return c;
}

/** Glints winking on and off round a gold monster. */
function drawGoldSparkle(g: CanvasRenderingContext2D, r: number, t: number): void {
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + t * 0.6;
    const life = (t * 1.6 + i * 0.37) % 1;
    const s = Math.sin(Math.PI * life) * 3;
    if (s < 0.4) continue;
    const x = Math.cos(a) * r * 0.9;
    const y = Math.sin(a) * r * 0.8 - r * 0.2;
    g.fillStyle = '#fff6c8';
    g.fillRect(x - s, y - 0.75, s * 2, 1.5);
    g.fillRect(x - 0.75, y - s, 1.5, s * 2);
  }
}

function frostTint(img: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const hit = frostCache.get(img);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d')!;
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = 'rgba(110,190,255,0.55)';
  x.fillRect(0, 0, c.width, c.height);
  frostCache.set(img, c);
  return c;
}

/** "#rrggbb" as "r,g,b" for rgba(). */
/** The element whose colour is nearest `color` (magic on the battlefield carries its element's colour). */
const elementCache = new Map<string, DamageType>();
function elementOf(color: string): DamageType {
  const known = elementCache.get(color);
  if (known) return known;
  const [r, g, b] = hexRgb(color).split(',').map(Number);
  let best: DamageType = 'physical';
  let bestD = Infinity;
  for (const [t, d] of Object.entries(DAMAGE_TYPES) as Array<[DamageType, { color: string }]>) {
    const [r2, g2, b2] = hexRgb(d.color).split(',').map(Number);
    const dist = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (dist < bestD) [best, bestD] = [t, dist];
  }
  elementCache.set(color, best);
  return best;
}

function hexRgb(hex: string): string {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
}

/** A sparse scatter of pixels across radius `r` (a burst's hit area, a decay aura's ground). */
function sparseCells(r: number, seed: number): Cell[] {
  let x = Math.abs(Math.floor(seed)) % 2147483646 || 1;
  const rand = () => (x = (x * 48271) % 2147483647) / 2147483647;
  const out: Cell[] = [];
  const n = Math.round((r * r) / 60);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * r;
    out.push({ x: Math.round((Math.cos(a) * d) / PIXEL) * PIXEL, y: Math.round((Math.sin(a) * d) / PIXEL) * PIXEL, s: rand() < 0.3 ? PIXEL * 2 : PIXEL, color: 0 });
  }
  return out;
}

/** Each decay aura's ground pattern, by the monster's phase (so it holds still as the monster moves). */
const auraCache = new Map<number, Cell[]>();
function auraCells(phase: number): Cell[] {
  const key = Math.round(phase * 1000);
  let cells = auraCache.get(key);
  if (!cells) {
    if (auraCache.size > 200) auraCache.clear();
    cells = sparseCells(STATUS.aura.radius, key + 1);
    auraCache.set(key, cells);
  }
  return cells;
}
