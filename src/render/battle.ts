import { areaDef, DAMAGE_TYPES, gearDef, WEAPON_CLASSES, STATUS, enemyDef, eventDef, fieldZoom, GUARDIAN_TIME, hunterDef, materialDef, type EnemyId, type EnemyShape } from '../core/balance';
import { PLAYER_RADIUS, SUMMON_RADIUS, type Summon, type Bullet, type Enemy, type Field, type Helper } from '../core/field';
import { fmt } from '../core/format';
import type { Game, Shooter } from '../core/game';
import type { FxKey } from '../core/state';
import { canvasFont, fitCanvas, Fx } from './fx';
import { effectImage, gearImage, hunterSheetImage, monsterSheetImage, sprite } from './sprites';
import { HUNTER_SHEETS } from './hunterSheets';
import { EFFECTS, type EffectKey } from './effectSheets';
import { areaBackground } from './backgrounds';
import { MONSTER_SHEETS, SHEETS, type MonsterSheet } from './monsterSheets';
import { GEAR_SPRITES } from '../core/gearSprites';
import { emojiIconKey } from '../ui/emojiIcons';

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
/** Animated walk sheets: the character's longer side, × the monster's radius (detailed art needs room). */
const SHEET_SCALE = 3.3;

/** Draws the survivor-style battlefield: the Hunter in the middle, the horde closing in. */
export class BattleView {
  private g: CanvasRenderingContext2D;
  private fx = new Fx();
  private pickups: Pickup[] = [];
  private rings: Ring[] = [];
  /** Each puddle's squares, generated once. */
  private puddleCells = new WeakMap<object, Cell[]>();
  /** When each puddle first appeared (for its cloud's animation). */
  private puddleBorn = new WeakMap<object, number>();
  /** Explosions (fireballs, staff spells): a burst of fiery squares that spreads and fades. */
  private blasts: Array<{ x: number; y: number; r: number; t: number; cells: Cell[]; colors: string[] }> = [];
  private beams: Beam[] = [];
  /** Animated magic effects playing once (explosions, strikes, puffs): see effectSheets.ts. */
  private anims: Anim[] = [];
  /** Ability cooldown icons, overlaid on the battlefield. */
  private cooldownBar: CooldownBar;
  /** Melee sweeps and swipes: a fading arc in front of the attacker. */
  /** Each Hunter's last weapon attack (seconds since, and the angle), for the held-weapon animation. */
  private swings = new Map<Shooter, { t: number; a: number }>();
  private sweeps: Array<{ x: number; y: number; a: number; arc: number; r: number; color: string; t: number }> = [];
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
    this.cooldownBar = new CooldownBar(canvas.parentElement!, game, field);
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
          if (e.crit) this.fx.text(e.x, e.y, fmt(e.dmg), '#ff5a5a', e.affinity === 'weak' ? 19 : 16, 0.6);
          else if (e.affinity === 'weak') {
            if (Math.random() < 0.5) this.fx.text(e.x, e.y, `${fmt(e.dmg)}!`, DAMAGE_TYPES[e.dtype].color, 14, 0.55);
          } else if (Math.random() < 0.25) this.fx.text(e.x, e.y, fmt(e.dmg), DAMAGE_TYPES[e.dtype].color, e.affinity === 'resist' ? 9 : 11, 0.5);
          break;
        case 'kill': {
          const color = e.boss ? '#ffd34d' : enemyDef(e.enemy).color;
          if (this.fancy) this.playEffect('puff', e.x, e.y, e.boss ? 90 : 26, 'center', 22);
          this.fx.burst(e.x, e.y, color, e.boss ? 40 : 8, e.boss ? 260 : 140, e.boss ? 5 : 3, 0);
          this.dropPickup(e.x, e.y, '#ffd34d', false, e.boss ? 12 : 1);
          if (e.reward.material) this.dropPickup(e.x, e.y, materialDef(e.reward.material).color, true, Math.min(8, e.reward.amount));
          if (e.boss) this.shake = 0.4;
          break;
        }
        case 'blast':
          // An elemental tap ability gets its spell: a fire explosion, a lightning strike or a falling ice shard.
          if (this.fancy && e.color === DAMAGE_TYPES.fire.color) this.playEffect('explosion', e.x, e.y, this.game.tapRadius * 2);
          else if (this.fancy && e.color === DAMAGE_TYPES.lightning.color) this.playEffect('lightning', e.x, e.y + 6, this.game.tapRadius * 2.4, 'bottom', 22);
          else if (this.fancy && e.color === DAMAGE_TYPES.frost.color) this.playEffect('ice', e.x, e.y + 6, this.game.tapRadius * 1.8, 'bottom', 20);
          this.rings.push({ x: e.x, y: e.y, t: 0, r: this.game.tapRadius, color: e.color ? hexRgb(e.color) : '255,255,255', max: 0.25 });
          if (e.color) this.fx.burst(e.x, e.y, e.color, 10, 160, 3, 0);
          break;
        case 'explode': {
          const radiant = e.color === DAMAGE_TYPES.radiant.color;
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
          // Lightning called down from the sky (Thunder Totem, Thunder Call) strikes as a bolt.
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
          // A hammer's ground slam: a shockwave ring, dust kicked up all around, and a jolt.
          this.rings.push({ x: e.x, y: e.y, t: 0, r: e.r, color: '232,216,176', max: 0.35 });
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            this.fx.burst(e.x + Math.cos(a) * e.r * 0.6, e.y + Math.sin(a) * e.r * 0.6, i % 2 ? '#c8b48a' : '#8a7a5a', 2, 90, 4, 300, true);
          }
          this.shake = Math.max(this.shake, 0.16);
          break;
        case 'sweep':
          this.sweeps.push({ ...e, t: 0 });
          if (e.heavy) this.shake = Math.max(this.shake, 0.12); // a hammer's smash
          break;
        case 'attack':
          this.swings.set(e.who, { t: 0, a: e.a });
          break;
        case 'reload':
          break; // drawn each frame as "RELOADING!" (drawReloads)
        case 'dodge':
          this.fx.text(e.x, e.y - 30, 'DODGE', '#c8f0ff', 12, 0.6);
          break;
        case 'thorns':
          if (this.fancy) this.playEffect('spikes', e.x, e.y + e.r, Math.max(30, e.r * 2.6), 'bottom', 24);
          break;
        case 'guard':
          if (this.fancy) this.playEffect('shield', e.x, e.y, (PLAYER_RADIUS + 12) * 2, 'center', 24);
          else this.rings.push({ x: e.x, y: e.y, t: 0, r: PLAYER_RADIUS + 10, color: '255,232,163', max: 0.3 });
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
          } else if (e.who !== 'main') {
            const h = this.field.helpers.find((x) => x.id === e.who);
            if (h) this.fx.text(h.x, h.y - PLAYER_RADIUS - 22, 'STUNNED!', '#ffe066', 14, 0.8);
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
    for (const b of this.blasts) b.t += dt;
    this.blasts = this.blasts.filter((b) => b.t < BLAST_TIME);
    for (const a of this.anims) a.t += dt;
    this.anims = this.anims.filter((a) => a.t * a.fps < EFFECTS[a.key].frames);
    this.rings = this.rings.filter((r) => r.t < r.max);
    for (const b of this.beams) b.t += dt;
    this.beams = this.beams.filter((b) => b.t < 0.25);
    for (const sw of this.swings.values()) sw.t += dt;
    for (const w of this.sweeps) w.t += dt;
    this.sweeps = this.sweeps.filter((w) => w.t < 0.2);
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
    // One canvas pixel per CSS pixel (not per device pixel): drawn chunky, then scaled up crisply.
    const { w, h } = fitCanvas(this.canvas, this.g, 1);
    this.w = w;
    this.h = h;
    Z = fieldZoom(this.game.area);
    this.fx.textScale = 1 / Z;
    this.field.setView(w, h);
    const g = this.g;
    const painted = areaBackground(this.game.area, w, h);
    if (painted) g.drawImage(painted, 0, 0);
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

    // Poison and acid puddles: a cluster of green squares (acid's are simply smaller puddles).
    const basic = this.game.state.settings.aoeStyle === 'basic';
    for (const p of this.field.puddles) {
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
      if (!p.dtype) {
        // Reginald's potion puddle: a poison cloud that billows up, churns while it lasts, then thins away.
        let born = this.puddleBorn.get(p);
        if (born === undefined) this.puddleBorn.set(p, (born = this.time));
        const age = this.time - born;
        const fps = 14;
        const startLen = EFFECTS.cloudStart.frames / fps;
        const endLen = EFFECTS.cloudFinish.frames / fps;
        const [key, frame] =
          age < startLen ? (['cloudStart', Math.floor(age * fps)] as const)
          : p.life < endLen ? (['cloudFinish', Math.floor((endLen - p.life) * fps)] as const)
          : (['cloudCycle', Math.floor((age - startLen) * fps)] as const);
        const img = effectImage(key);
        if (img) {
          g.globalAlpha = 0.85;
          drawEffectFrame(g, img, key, frame, p.x, p.y + p.r * 0.45, p.r * 2.3, 'bottom', key === 'cloudCycle', 'cloudCycle');
          g.globalAlpha = 1;
          continue;
        }
      }
      let cells = this.puddleCells.get(p);
      if (!cells) {
        cells = squareCluster(p.r, Math.max(4, p.r / 6), p.x * 7 + p.y * 13);
        this.puddleCells.set(p, cells);
      }
      g.globalAlpha = 0.75 * Math.min(1, p.life);
      for (const c of cells) {
        g.fillStyle = PUDDLE_GREENS[c.color];
        g.fillRect(p.x + c.x - c.s / 2, p.y + c.y - c.s / 2, c.s, c.s);
      }
      g.globalAlpha = 1;
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

    for (const b of this.field.bullets) drawBullet(g, b, this.time, this.game.state.settings.aoeStyle === 'basic');

    // Tome spirits: a glowing wisp with a trailing tail, fading as their time runs out.
    for (const sm of this.field.summons) {
      if (sm.look === 'wolf') {
        this.drawWolf(g, sm);
        continue;
      }
      if (sm.look === 'puppet') {
        this.drawPuppet(g, sm);
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
      g.strokeStyle = b.color;
      g.globalAlpha = 1 - b.t / 0.25;
      g.lineWidth = b.width;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(b.x1, b.y1);
      if (b.kinks) {
        // A jagged bolt: points along the line, each pushed sideways by its kink.
        const dx = b.x2 - b.x1;
        const dy = b.y2 - b.y1;
        const len = Math.hypot(dx, dy) || 1;
        const n = b.kinks.length;
        for (let i = 0; i < n; i++) {
          const k = (i + 1) / (n + 1);
          g.lineTo(b.x1 + dx * k - (dy / len) * b.kinks[i], b.y1 + dy * k + (dx / len) * b.kinks[i]);
        }
      }
      g.lineTo(b.x2, b.y2);
      g.stroke();
      g.globalAlpha = 1;
    }

    for (const w of this.sweeps) {
      // The blade's arc sweeps across (a trailing crescent), fading out.
      const k = w.t / 0.2;
      const from = w.a - w.arc / 2;
      const to = from + w.arc * Math.min(1, k * 2.5);
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
      if (img) drawEffectFrame(g, img, a.key, Math.floor(a.t * a.fps), a.x, a.y, a.size, a.anchor);
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
      const y = s.y + (st.reloadPos === 'below' ? 1 : -1) * (PLAYER_RADIUS + 14 / Z);
      // What's left of the wait: the text from the left edge, shrinking toward it as the wait runs.
      const edge = x - 4 + (w + 8) * (1 - p);
      g.save();
      g.beginPath();
      g.rect(x - 4, y - 20, edge - (x - 4), 40);
      g.clip();
      g.lineWidth = 3 / Z;
      g.strokeStyle = 'rgba(0,0,0,0.75)';
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

  /** Effect art is the Fancy area effect style (Settings); Basic keeps plain shapes. */
  private get fancy(): boolean {
    return this.game.state.settings.aoeStyle !== 'basic';
  }

  /** Plays a magic effect once: `size` is its longer side; 'bottom' anchors strikes that come down from above. */
  private playEffect(key: EffectKey, x: number, y: number, size: number, anchor: 'center' | 'bottom' = 'center', fps = 18): void {
    if (this.anims.length > 120) return; // keep the busiest moments cheap
    this.anims.push({ key, x, y, size, anchor, fps, t: 0 });
  }

  private drawEnemy(g: CanvasRenderingContext2D, e: Enemy): void {
    const def = enemyDef(e.type);
    const r = e.r;
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
      const src = e.slow && this.fxOn('chill') ? frostTint(sheet) : sheet;
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.ellipse(0, r * 1.1, r * 0.9, r * 0.32, 0, 0, Math.PI * 2);
      g.fill();
      drawSheetFrame(g, src, sh, sh.order.indexOf(dir), col, r * SHEET_SCALE);
      if (e.flash > 0.5) {
        g.globalAlpha = 0.5;
        g.globalCompositeOperation = 'lighter';
        drawSheetFrame(g, sheet, sh, sh.order.indexOf(dir), col, r * SHEET_SCALE);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = e.fleeing ? 0.8 : 1;
      }
    } else if (img) {
      const size = r * SPRITE_SCALE;
      const bob = Math.sin(e.phase * 10) * r * 0.06;
      g.scale(dirX < 0 ? -1 : 1, 1);
      // Chilled by Frost: drawn with a blue tint.
      g.drawImage(e.slow && this.fxOn('chill') ? frostTint(img) : img, -size / 2, -size / 2 + bob, size, size);
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
      g.fillStyle = e.flash > 0.5 ? '#ffffff' : e.slow && this.fxOn('chill') ? mixHex(body, '#8fdcff', 0.55) : body;
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
    this.drawHeldWeapon(g, 'main', 0, 0, f.aim, R, f.stunned);

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

  /**
   * A Hunter's animated idle from their sheet, facing where they aim (rows: down, left, right, up), standing on
   * their shadow. False if they have no sheet or it hasn't loaded.
   */
  private drawHunterSheet(g: CanvasRenderingContext2D, who: Shooter, aim: number, R: number, phase = 0): boolean {
    const sh = HUNTER_SHEETS[who];
    const img = sh && hunterSheetImage(who);
    if (!sh || !img) return false;
    const c = Math.cos(aim);
    const s = Math.sin(aim);
    const row = Math.abs(c) >= Math.abs(s) ? (c < 0 ? 1 : 2) : s > 0 ? 0 : 3;
    const col = Math.floor((this.time + phase) * 8) % sh.frames[row];
    const [bx, by, bw, bh] = sh.box;
    const k = (R * 2.7) / Math.max(bw, bh);
    const F = sh.frame;
    g.imageSmoothingEnabled = false;
    // Feet (the box's bottom) on the shadow.
    g.drawImage(img, col * F, row * F, F, F, -(bx + bw / 2) * k, R * 1.05 - (by + bh) * k, F * k, F * k);
    return true;
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
      const ic = gearImage(emojiIconKey(def.icon));
      if (ic) {
        g.imageSmoothingEnabled = false;
        g.drawImage(ic, -R * 0.7, -R * 0.7, R * 1.4, R * 1.4);
      } else g.fillText(def.icon, 0, 1);
    }
    g.restore();
    this.drawHeldWeapon(g, h.id, h.x, h.y, h.aim, R, h.stun > 0, h.close);
    drawShieldPips(g, h.x, h.y + R + (h.stun > 0 ? 17 : 9), h.guard, this.game.guardOf(h.id));
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
    if (h.stun > 0) {
      drawDizzy(g, R, this.time, 0.9);
      const bw = 30;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(-bw / 2, R + 8, bw, 5);
      g.fillStyle = '#ffe066';
      g.fillRect(-bw / 2, R + 8, bw * (h.stun / Math.max(0.01, h.stunTotal)), 5);
    }
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

  private drawHud(g: CanvasRenderingContext2D): void {
    const w = this.w;
    const boss = this.field.enemies.find((e) => e.boss);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const ev = this.game.activeEvent;
    const bw = Math.min(w * 0.7, 300);
    const x = (w - bw) / 2;
    const y0 = ev || boss ? this.hudTop(x, x + bw, boss ? 38 : 26) : 0;
    if (ev && !boss) {
      const def = eventDef(ev.id);
      g.font = canvasFont(13, 700);
      g.fillStyle = '#9ff0a8';
      const label = `${def.name.toUpperCase()} · ${Math.ceil(ev.left)}s`;
      const ic = gearImage(emojiIconKey(def.icon));
      if (ic) {
        // The event's icon, then its name and time, centred together.
        const tw = g.measureText(label).width;
        const left = w / 2 - (tw + 18) / 2;
        g.imageSmoothingEnabled = false;
        g.drawImage(ic, left, y0 + 3, 14, 14);
        g.fillText(label, left + 18 + tw / 2, y0 + 10);
      } else g.fillText(`${def.icon} ${label}`, w / 2, y0 + 10);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(x, y0 + 20, bw, 6);
      g.fillStyle = '#3fcf6a';
      g.fillRect(x, y0 + 20, bw * Math.max(0, ev.left / def.duration), 6);
    }
    if (boss) {
      g.font = canvasFont(13, 700);
      g.fillStyle = '#ff9aa6';
      const bossDef = enemyDef(boss.type);
      g.fillText(`${bossDef.guardianOnly ? bossDef.name.toUpperCase() : `${areaDef(this.game.area).name.toUpperCase()} GUARDIAN`} · ${fmt(Math.max(0, boss.hp))}`, w / 2, y0 + 10);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(x, y0 + 20, bw, 10);
      g.fillStyle = '#ff4d6d';
      g.fillRect(x, y0 + 20, bw * Math.max(0, boss.hp / boss.maxHp), 10);
      // A Guardian beaten before 0 HP (the Time Eater) shows where the win is.
      const winAt = bossDef.winAt ?? 0;
      if (winAt > 0) {
        g.fillStyle = '#ffe36e';
        g.fillRect(Math.round(x + bw * winAt) - 1, y0 + 17, 2, 16);
      }
      const t = Math.max(0, this.game.bossTimer / GUARDIAN_TIME);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(x, y0 + 33, bw, 5);
      g.fillStyle = t < 0.3 ? '#ff4d4d' : '#ffb04d';
      g.fillRect(x, y0 + 33, bw * t, 5);
    }

    if (this.banner) {
      const k = this.banner.life;
      g.globalAlpha = k < 0.2 ? k / 0.2 : k > 1.6 ? Math.max(0, 1 - (k - 1.6) / 0.4) : 1;
      g.font = canvasFont(26, 700);
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
  const sheetKey = MONSTER_SHEETS[id];
  const sheet = sheetKey ? monsterSheetImage(sheetKey) : null;
  if (sheetKey && sheet && !(sheet.complete && sheet.naturalWidth > 0)) sheet.addEventListener('load', () => drawEnemyPortrait(canvas, id), { once: true });
  if (sheetKey && sheet && sheet.complete && sheet.naturalWidth > 0) {
    const sh = SHEETS[sheetKey];
    drawSheetFrame(g, sheet, sh, sh.order.indexOf('D'), 0, r * 2.8);
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
function drawBullet(g: CanvasRenderingContext2D, b: Bullet, t: number, basic = false): void {
  const a = Math.atan2(b.vy, b.vx);
  g.save();
  g.translate(b.x, b.y);
  switch (b.kind) {
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
    case 'pellet':
    case 'pistol':
      g.fillStyle = '#ffe9a0';
      g.beginPath();
      g.arc(0, 0, 2.2, 0, Math.PI * 2);
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

/** Shield charges under a Hunter: lit while charged, faint while recharging. */
function drawShieldPips(g: CanvasRenderingContext2D, x: number, y: number, guard: number, max: number): void {
  for (let i = 0; i < max; i++) {
    g.fillStyle = i < guard ? '#ffe8a3' : 'rgba(255,255,255,0.2)';
    g.beginPath();
    g.arc(x + (i - (max - 1) / 2) * 7, y, 2.6, 0, Math.PI * 2);
    g.fill();
  }
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
        el.innerHTML = `<span class="cd-gray">${c.icon}</span><span class="cd-color">${c.icon}</span><i class="cd-line"></i>`;
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
const PUDDLE_GREENS = ['#b4f04a', '#4caf3a', '#2a6e26'];
const FIRE_COLORS = ['#ffd23a', '#ff8a2a', '#e8321e'];

/**
 * A round patch of squares in two sizes (`big` and half that) filling radius `r`, laid out on a grid with a
 * little jitter so it reads as a cluster rather than a checkerboard. Deterministic for a given `seed`.
 */
function squareCluster(r: number, big: number, seed: number): Cell[] {
  let x = Math.abs(Math.floor(seed)) % 2147483646 || 1;
  const rand = () => (x = (x * 48271) % 2147483647) / 2147483647;
  const out: Cell[] = [];
  const step = big * 0.9;
  for (let gy = -r; gy <= r; gy += step)
    for (let gx = -r; gx <= r; gx += step) {
      const d = Math.hypot(gx, gy);
      if (d > r - step * 0.3) continue;
      // Thinner towards the rim, so the edge is ragged.
      if (d > r * 0.6 && rand() < (d / r - 0.6) * 1.6) continue;
      const small = rand() < 0.45;
      const s = small ? big / 2 : big;
      out.push({ x: gx + (rand() - 0.5) * step * 0.6, y: gy + (rand() - 0.5) * step * 0.6, s, color: Math.floor(rand() * 3) });
    }
  return out;
}

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
/** One frame of a monster walk sheet, centred on the origin, with the character's longer side `size` across. */
function drawSheetFrame(g: CanvasRenderingContext2D, img: CanvasImageSource, sh: MonsterSheet, row: number, col: number, size: number): void {
  const [bx, by, bw, bh] = sh.box;
  const k = size / Math.max(bw, bh);
  const F = sh.frame;
  g.drawImage(img, col * F, row * F, F, F, -(bx + bw / 2) * k, -(by + bh / 2) * k, F * k, F * k);
}

interface Anim {
  key: EffectKey;
  x: number;
  y: number;
  size: number;
  anchor: 'center' | 'bottom';
  fps: number;
  t: number;
}

/**
 * One frame of a magic effect: its box's longer side `size` across, centred on (x, y), or with its bottom
 * edge there ('bottom'). `loop` wraps the frame number (projectiles, wells); otherwise it's clamped. `sizeBy`
 * sizes it by another sheet's box (the phases of one effect, so it doesn't jump between them).
 */
function drawEffectFrame(g: CanvasRenderingContext2D, img: HTMLImageElement, key: EffectKey, frame: number, x: number, y: number, size: number, anchor: 'center' | 'bottom', loop = false, sizeBy: EffectKey = key): void {
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
