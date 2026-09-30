import { areaDef, DAMAGE_TYPES, STATUS, enemyDef, eventDef, FIELD_ZOOM, GUARDIAN_TIME, hunterDef, materialDef, type EnemyId, type EnemyShape } from '../core/balance';
import { PLAYER_RADIUS, SUMMON_RADIUS, type Summon, type Bullet, type Enemy, type Field, type Helper } from '../core/field';
import { fmt } from '../core/format';
import type { Game, Shooter } from '../core/game';
import { canvasFont, fitCanvas, Fx } from './fx';
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
  /** Ability cooldown icons, overlaid on the battlefield. */
  private cooldownBar: CooldownBar;
  /** Melee sweeps and swipes: a fading arc in front of the attacker. */
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
          // Weak spots get bigger numbers (and show more often); resisted hits smaller ones.
          if (e.crit) this.fx.text(e.x, e.y, fmt(e.dmg), '#ff5a5a', e.affinity === 'weak' ? 19 : 16, 0.6);
          else if (e.affinity === 'weak') {
            if (Math.random() < 0.5) this.fx.text(e.x, e.y, `${fmt(e.dmg)}!`, DAMAGE_TYPES[e.dtype].color, 14, 0.55);
          } else if (Math.random() < 0.25) this.fx.text(e.x, e.y, fmt(e.dmg), DAMAGE_TYPES[e.dtype].color, e.affinity === 'resist' ? 9 : 11, 0.5);
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
        case 'sweep':
          this.sweeps.push({ ...e, t: 0 });
          if (e.heavy) this.shake = Math.max(this.shake, 0.12); // a hammer's smash
          break;
        case 'reload':
          break; // drawn each frame as "RELOADING!" (drawReloads)
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
    this.field.setView(w, h);
    const g = this.g;
    const [ground, speck] = areaDef(this.game.area).ground;
    g.fillStyle = ground;
    g.fillRect(0, 0, w, h);
    g.fillStyle = speck;
    for (const s of this.specks) g.fillRect(Math.round(s.x * w), Math.round(s.y * h), Math.ceil(s.r), Math.ceil(s.r));

    g.save();
    g.translate(w / 2, h / 2);
    if (this.shake > 0) g.translate((Math.random() - 0.5) * 24 * this.shake, (Math.random() - 0.5) * 24 * this.shake);
    g.scale(Z, Z);

    // Poison puddles on the ground
    for (const p of this.field.puddles) {
      const rgb = p.dtype === 'acid' ? '198,240,58' : '123,224,123';
      g.fillStyle = `rgba(${rgb},${0.25 * Math.min(1, p.life)})`;
      g.strokeStyle = `rgba(${rgb},${0.6 * Math.min(1, p.life)})`;
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

    // Tome spirits: a glowing wisp with a trailing tail, fading as their time runs out.
    for (const sm of this.field.summons) {
      if (sm.look === 'wolf') {
        this.drawWolf(g, sm);
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

    this.drawReloads(g);
    this.fx.draw(g);
    g.restore();
    this.drawHud(g);
    this.cooldownBar.update();
  }

  /** A wolf spirit: a pale blue-grey wolf head with ears, streaking when it lunges. */
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
    drawStatus(g, e, this.time);
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
      g.font = canvasFont(R * 1.1);
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
    const ev = this.game.activeEvent;
    if (ev && !boss) {
      const def = eventDef(ev.id);
      const bw = Math.min(w * 0.7, 300);
      const x = (w - bw) / 2;
      g.font = canvasFont(13, 700);
      g.fillStyle = '#9ff0a8';
      g.fillText(`${def.icon} ${def.name.toUpperCase()} · ${Math.ceil(ev.left)}s`, w / 2, 14);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(x, 24, bw, 6);
      g.fillStyle = '#3fcf6a';
      g.fillRect(x, 24, bw * Math.max(0, ev.left / def.duration), 6);
    }
    if (boss) {
      const bw = Math.min(w * 0.7, 300);
      const x = (w - bw) / 2;
      g.font = canvasFont(13, 700);
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

/** Status effects on a monster: flames (burn), bubbles (poison), a frosty ring (chill), a dark aura (decay), violet sparks (arcane). */
function drawStatus(g: CanvasRenderingContext2D, e: Enemy, t: number): void {
  const r = e.r;
  if (e.slow) {
    g.strokeStyle = 'rgba(143,220,255,0.85)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, r + 3, 0, Math.PI * 2);
    g.stroke();
  }
  const specks = (color: string, n: number, rise: number, speed: number) => {
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const p = (t * speed + i / n + e.phase) % 1;
      const x = Math.sin((i + 1) * 2.4 + e.phase * 3) * r * 0.7;
      const y = -r * 0.2 - p * rise;
      const s = 3 * (1 - p) + 1;
      g.globalAlpha = 1 - p;
      g.fillRect(x - s / 2, y - s / 2, s, s);
    }
    g.globalAlpha = 1;
  };
  if (e.burn) specks('#ff8a2a', 4, r * 1.6, 1.8);
  if (e.poison) specks('#6fdc5a', 3, r * 1.3, 0.9);
  if (e.aura) {
    // Decay's dark aura: a slowly pulsing ring the size of its reach.
    const pulse = 0.5 + 0.5 * Math.sin(t * 6 + e.phase);
    g.strokeStyle = `rgba(90,60,40,${0.35 + 0.3 * pulse})`;
    g.fillStyle = 'rgba(60,40,30,0.12)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, STATUS.aura.radius, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  if (e.exposed) {
    // Arcane: resistances stripped. Orbiting violet sparks.
    g.fillStyle = '#c08cff';
    for (let i = 0; i < 3; i++) {
      const a = t * 4 + (i * Math.PI * 2) / 3;
      g.fillRect(Math.cos(a) * (r + 5) - 1.5, Math.sin(a) * (r + 5) - 1.5, 3, 3);
    }
  }
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

/** Pixel colours where a weapon's waiting text breaks up: sparks and metal, magic, or a summoning haze. */
const EDGE_PIXELS: Record<string, string[]> = {
  'RELOADING!': ['#8a8f96', '#c4c8cc', '#5a5f66', '#ff3a2a', '#ff7a3a'],
  'RECHARGING!': ['#ffffff', '#ffd34d', '#e8a800', '#5ab0ff', '#9fd8ff'],
  'SUMMONING!': ['#ff8ad8', '#e040c0', '#b020a0', '#2a2a7a', '#3a3aa0'],
};

/**
 * Ability cooldowns as icons along one edge of the battlefield (Settings picks the edge). A recharging icon
 * is greyed out and refills with colour from the top down; when it's ready it gives a little pulse. Icons
 * shrink as more of them share the edge.
 */
class CooldownBar {
  private el: HTMLDivElement;
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

  update(): void {
    const st = this.game.state.settings;
    const list = st.cooldowns ? this.field.cooldowns() : [];
    this.el.className = `cd-bar cd-${st.cooldownPos}`;
    this.el.classList.toggle('hidden', !list.length);
    // Size: as big as fits, up to 34px, sharing the edge's length.
    const vertical = st.cooldownPos === 'left' || st.cooldownPos === 'right';
    const room = (vertical ? this.el.parentElement!.clientHeight : this.el.parentElement!.clientWidth) - 16;
    const size = Math.max(14, Math.min(34, room / Math.max(1, list.length) - 6));
    this.el.style.setProperty('--cd-size', `${size}px`);
    const seen = new Set<string>();
    for (const c of list) {
      seen.add(c.key);
      let ic = this.icons.get(c.key);
      if (!ic) {
        const el = document.createElement('div');
        el.className = 'cd-icon';
        el.title = c.name;
        el.innerHTML = `<span class="cd-gray">${c.icon}</span><span class="cd-color">${c.icon}</span><i class="cd-line"></i>`;
        this.el.appendChild(el);
        ic = { el, color: el.querySelector('.cd-color') as HTMLSpanElement, line: el.querySelector('.cd-line') as HTMLElement, ready: c.progress >= 1 };
        this.icons.set(c.key, ic);
      }
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
    }
    for (const [key, ic] of this.icons)
      if (!seen.has(key)) {
        ic.el.remove();
        this.icons.delete(key);
      }
  }
}
