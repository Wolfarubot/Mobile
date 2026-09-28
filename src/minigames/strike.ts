import { drawMonster, monsterLook, type MonsterLook } from '../render/monsterArt';
import { Fx } from '../render/fx';
import { roundRect } from '../render/battle';
import { drawMgHud } from './runner';
import type { MinigameDef, MinigameInstance, MinigameResult } from './types';

const SWINGS = 12;
const PAUSE = 0.55;

/** Power Strike: time your swings against a giant boss. Perfect hits build a damage streak. */
class Strike implements MinigameInstance {
  private fx = new Fx();
  private swing = 0;
  private marker = 0; // 0..1 along the bar
  private dir = 1;
  private speed = 0.7;
  private zoneCenter = 0.5;
  private zoneWidth = 0.22;
  private pause = 0;
  private streak = 0;
  private bestStreak = 0;
  private perfects = 0;
  private score = 0;
  private units = 0;
  private time = 0;
  private hurt = 0;
  private shake = 0;
  private boss: MonsterLook = monsterLook(Math.floor(Math.random() * 999), 0, true, Math.random() * 360);
  private w: number;
  private h: number;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.newSwing();
  }

  get finished() {
    return this.swing >= SWINGS && this.pause <= 0;
  }

  private newSwing(): void {
    this.speed = 0.7 + this.swing * 0.12;
    this.zoneWidth = Math.max(0.1, 0.24 - this.swing * 0.011);
    this.zoneCenter = this.zoneWidth / 2 + 0.05 + Math.random() * (0.9 - this.zoneWidth);
    this.marker = Math.random() < 0.5 ? 0 : 1;
    this.dir = this.marker === 0 ? 1 : -1;
  }

  update(dt: number, w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt * 4);
    this.shake = Math.max(0, this.shake - dt);
    this.fx.update(dt);

    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0 && this.swing < SWINGS) this.newSwing();
      return;
    }
    this.marker += this.dir * this.speed * dt;
    if (this.marker > 1) {
      this.marker = 2 - this.marker;
      this.dir = -1;
    } else if (this.marker < 0) {
      this.marker = -this.marker;
      this.dir = 1;
    }
  }

  down(): void {
    if (this.pause > 0 || this.swing >= SWINGS) return;
    const off = Math.abs(this.marker - this.zoneCenter);
    const bx = this.w / 2;
    const by = this.h * 0.42;
    let label: string;
    let color: string;
    if (off < this.zoneWidth * 0.18) {
      this.streak++;
      this.perfects++;
      const pts = Math.round(100 * (1 + this.streak * 0.25));
      this.score += pts;
      this.units += Math.round(8 * (1 + this.streak * 0.25));
      label = `PERFECT! +${pts}`;
      color = '#ffd34d';
      this.shake = 0.35;
      this.fx.burst(bx, by, '#ffd34d', 30, 380, 6);
    } else if (off < this.zoneWidth / 2) {
      const pts = Math.round(40 * (1 + this.streak * 0.25));
      this.score += pts;
      this.units += Math.round(4 * (1 + this.streak * 0.25));
      label = `Good +${pts}`;
      color = '#9fe0ff';
      this.shake = 0.15;
      this.fx.burst(bx, by, '#fff', 14, 260, 4);
    } else {
      this.streak = 0;
      label = 'Miss';
      color = '#ff8080';
    }
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    if (label !== 'Miss') {
      this.hurt = 1;
      this.fx.slash(bx, by, Math.min(this.w, this.h) * 0.3);
    }
    this.fx.text(bx, by - Math.min(this.w, this.h) * 0.45, label, color, 32, 1);
    this.swing++;
    this.pause = PAUSE;
  }

  move(): void {}
  up(): void {}

  render(g: CanvasRenderingContext2D, w: number, h: number): void {
    g.save();
    if (this.shake > 0) g.translate((Math.random() - 0.5) * 30 * this.shake, (Math.random() - 0.5) * 30 * this.shake);
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#2a0d0d');
    bg.addColorStop(1, '#5c1a1a');
    g.fillStyle = bg;
    g.fillRect(-20, -20, w + 40, h + 40);

    const size = Math.min(w, h) * 0.26;
    drawMonster(g, this.boss, w / 2, h * 0.42, size, { t: this.time, hurt: this.hurt, squash: this.hurt, boss: true });
    this.fx.draw(g);
    g.restore();

    // Timing bar
    const barW = Math.min(w - 40, 420);
    const bx = (w - barW) / 2;
    const by = h * 0.78;
    roundRect(g, bx, by, barW, 34, 17, 'rgba(0,0,0,0.55)');
    const zx = bx + (this.zoneCenter - this.zoneWidth / 2) * barW;
    roundRect(g, zx, by + 3, this.zoneWidth * barW, 28, 10, '#3fa05a');
    const px = bx + (this.zoneCenter - this.zoneWidth * 0.18) * barW;
    roundRect(g, px, by + 3, this.zoneWidth * 0.36 * barW, 28, 8, '#ffd34d');
    const mx = bx + this.marker * barW;
    g.fillStyle = '#fff';
    g.fillRect(mx - 3, by - 8, 6, 50);

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 16px system-ui, sans-serif';
    g.fillStyle = '#fff';
    g.fillText(`Swing ${Math.min(this.swing + 1, SWINGS)} / ${SWINGS}   ·   Streak ${this.streak}`, w / 2, by + 64);
    g.font = '500 14px system-ui, sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillText('Tap anywhere when the marker is in the gold zone', w / 2, by + 90);

    drawMgHud(g, w, `🗡 ${SWINGS - this.swing} left`, SWINGS - this.swing <= 2, this.score);
  }

  result(): MinigameResult {
    return {
      score: this.score,
      units: this.units,
      summary: `${this.perfects} perfect strikes · best streak ${this.bestStreak}`,
    };
  }
}

export const powerStrike: MinigameDef = {
  id: 'strike',
  name: 'Power Strike',
  icon: '💥',
  tagline: 'Time your blows against a giant boss.',
  howTo: 'Tap when the marker is in the zone. Gold center = PERFECT. Chain perfects for a growing damage streak.',
  rewards: '🪙 Gold + Frenzy',
  create: (w, h) => new Strike(w, h),
};
