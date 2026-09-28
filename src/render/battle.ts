import { BOSS_TIME, HEROES, zoneFor } from '../core/balance';
import { fmt } from '../core/format';
import type { Game } from '../core/game';
import { drawMonster, monsterLook, type MonsterLook } from './monsterArt';
import { fitCanvas, Fx } from './fx';

interface Bolt {
  x: number;
  y: number;
  tx: number;
  ty: number;
  t: number;
  hue: number;
}

/** The main idle battle scene: one monster at a time, tap to strike, slayers auto-attack. */
export class BattleView {
  private g: CanvasRenderingContext2D;
  private fx = new Fx();
  private look: MonsterLook;
  private time = 0;
  private hurt = 0;
  private squash = 0;
  private spawnAnim = 1;
  private deathAnim = 0;
  private deadLook: MonsterLook | null = null;
  private bolts: Bolt[] = [];
  private heroTimers: number[] = HEROES.map(() => Math.random());
  private dpsTick = 0;
  private shake = 0;
  private banner: { text: string; color: string; life: number } | null = null;
  private w = 0;
  private h = 0;
  private monsterIndex = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private game: Game,
  ) {
    this.g = canvas.getContext('2d')!;
    this.look = this.makeLook();

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      this.onTap(e.clientX - r.left, e.clientY - r.top);
    });

    game.on((e) => {
      switch (e.type) {
        case 'kill': {
          const { x, y, size } = this.monsterRect();
          this.fx.burst(x, y, `hsl(${this.look.hue} 60% 55%)`, 22, 300, 6);
          this.fx.burst(x, y, '#ffd34d', e.boss ? 30 : 10, 260, 4);
          this.fx.text(x, y - size * 0.6, `+${fmt(e.gold)}`, '#ffd34d', e.boss ? 34 : 26, 1.1);
          this.deadLook = this.look;
          this.deathAnim = 1;
          break;
        }
        case 'spawn':
          this.monsterIndex++;
          this.look = this.makeLook();
          this.spawnAnim = 0;
          if (e.boss) this.showBanner('BOSS FIGHT!', '#ff5a5a');
          break;
        case 'stageClear':
          break;
        case 'bossFail':
          this.showBanner('Boss escaped…', '#ffb04d');
          break;
        case 'prestige':
          this.showBanner(`+${e.shards} Soul Shards`, '#c89bff');
          break;
      }
    });
  }

  showBanner(text: string, color: string): void {
    this.banner = { text, color, life: 0 };
  }

  private makeLook(): MonsterLook {
    const s = this.game.state;
    return monsterLook(s.stage, this.monsterIndex, this.game.isBoss, zoneFor(s.stage).hueBase);
  }

  private monsterRect() {
    const size = Math.min(this.w, this.h) * (this.game.isBoss ? 0.27 : 0.21);
    return { x: this.w / 2, y: this.h * 0.52, size };
  }

  private onTap(x: number, y: number): void {
    const hit = this.game.tap();
    if (!hit) return;
    const m = this.monsterRect();
    this.hurt = 1;
    this.squash = 1;
    this.fx.slash(m.x + (x - m.x) * 0.3, m.y + (y - m.y) * 0.3, m.size * 0.9);
    this.fx.burst(m.x + (x - m.x) * 0.3, m.y + (y - m.y) * 0.3, '#fff', hit.crit ? 12 : 5, 200, 3);
    if (hit.crit) {
      this.shake = 0.25;
      this.fx.text(x, y - 40, `CRIT ${fmt(hit.amount)}!`, '#ff5a5a', 28);
    } else {
      this.fx.text(x, y - 30, fmt(hit.amount), '#fff', 24);
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt * 6);
    this.squash = Math.max(0, this.squash - dt * 7);
    this.spawnAnim = Math.min(1, this.spawnAnim + dt * 4);
    this.deathAnim = Math.max(0, this.deathAnim - dt * 4);
    this.shake = Math.max(0, this.shake - dt);
    if (this.banner) {
      this.banner.life += dt;
      if (this.banner.life > 1.8) this.banner = null;
    }
    this.fx.update(dt);

    const m = this.monsterRect();
    const owned = HEROES.map((_, i) => i).filter((i) => this.game.state.heroes[i] > 0);
    const shown = owned.slice(-6);
    shown.forEach((heroIdx, slot) => {
      this.heroTimers[heroIdx] -= dt;
      if (this.heroTimers[heroIdx] <= 0 && this.game.monsterAlive) {
        this.heroTimers[heroIdx] = 0.8 + Math.random() * 0.6;
        const p = this.heroPos(slot, shown.length);
        this.bolts.push({ x: p.x, y: p.y, tx: m.x + (Math.random() - 0.5) * m.size, ty: m.y + (Math.random() - 0.5) * m.size, t: 0, hue: (heroIdx * 47) % 360 });
      }
    });
    for (const b of this.bolts) b.t += dt * 2.2;
    for (const b of this.bolts.filter((b) => b.t >= 1)) {
      this.fx.burst(b.tx, b.ty, `hsl(${b.hue} 90% 65%)`, 5, 120, 3);
      this.hurt = Math.max(this.hurt, 0.35);
    }
    this.bolts = this.bolts.filter((b) => b.t < 1);

    this.dpsTick += dt;
    if (this.dpsTick >= 1) {
      this.dpsTick = 0;
      if (this.game.dps > 0 && this.game.monsterAlive) this.fx.text(m.x + m.size * 0.9, m.y - m.size * 0.2, fmt(this.game.dps), '#9fe0ff', 18, 0.8);
    }
  }

  private heroPos(slot: number, count: number) {
    const spacing = Math.min(56, (this.w - 40) / Math.max(count, 1));
    const x0 = this.w / 2 - ((count - 1) * spacing) / 2;
    return { x: x0 + slot * spacing, y: this.h - 30 };
  }

  render(): void {
    const { w, h } = fitCanvas(this.canvas, this.g);
    this.w = w;
    this.h = h;
    const g = this.g;
    const s = this.game.state;
    const zone = zoneFor(s.stage);

    g.save();
    if (this.shake > 0) g.translate((Math.random() - 0.5) * 12 * this.shake * 4, (Math.random() - 0.5) * 12 * this.shake * 4);

    // Sky & ground
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, zone.skyTop);
    sky.addColorStop(1, zone.skyBottom);
    g.fillStyle = sky;
    g.fillRect(-20, -20, w + 40, h + 40);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 5; i++) {
      const mx = ((i * 173 + this.time * 6) % (w + 200)) - 100;
      g.beginPath();
      g.ellipse(mx, h * 0.18 + (i % 3) * 22, 70, 16, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = zone.ground;
    g.beginPath();
    g.moveTo(-20, h * 0.72);
    g.quadraticCurveTo(w / 2, h * 0.64, w + 20, h * 0.72);
    g.lineTo(w + 20, h + 20);
    g.lineTo(-20, h + 20);
    g.fill();

    // Monster
    const m = this.monsterRect();
    if (this.deathAnim > 0 && this.deadLook) {
      g.globalAlpha = this.deathAnim;
      drawMonster(g, this.deadLook, m.x, m.y + (1 - this.deathAnim) * 20, m.size * (1 + (1 - this.deathAnim) * 0.4), { t: this.time, hurt: 1, squash: 1 });
      g.globalAlpha = 1;
    }
    if (this.game.monsterAlive) {
      const k = this.spawnAnim;
      const pop = k < 1 ? 1 - (1 - k) ** 3 * 0.6 : 1;
      g.globalAlpha = k;
      drawMonster(g, this.look, m.x, m.y, m.size * pop, { t: this.time, hurt: this.hurt, squash: this.squash, boss: this.game.isBoss });
      g.globalAlpha = 1;
    }

    // Slayer bolts & badges
    for (const b of this.bolts) {
      const x = b.x + (b.tx - b.x) * b.t;
      const y = b.y + (b.ty - b.y) * b.t - Math.sin(b.t * Math.PI) * 60;
      g.fillStyle = `hsl(${b.hue} 90% 65%)`;
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fill();
    }
    const owned = HEROES.map((_, i) => i).filter((i) => s.heroes[i] > 0).slice(-6);
    g.font = '24px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    owned.forEach((heroIdx, slot) => {
      const p = this.heroPos(slot, owned.length);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.arc(p.x, p.y, 20, 0, Math.PI * 2);
      g.fill();
      g.fillText(HEROES[heroIdx].icon, p.x, p.y + 1 + Math.sin(this.time * 4 + slot) * 1.5);
    });

    this.fx.draw(g);
    g.restore();

    this.drawHud(g, m);
  }

  private drawHud(g: CanvasRenderingContext2D, m: { x: number; y: number; size: number }): void {
    const s = this.game.state;
    const w = this.w;
    const barW = Math.min(w * 0.7, 320);
    const x = (w - barW) / 2;
    const y = 14;

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '800 16px system-ui, sans-serif';
    g.fillStyle = this.game.isBoss ? '#ff8080' : '#fff';
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 3;
    const name = this.look.name;
    g.strokeText(name, w / 2, y + 8);
    g.fillText(name, w / 2, y + 8);

    // HP bar
    const frac = this.game.monsterAlive ? Math.max(0, s.monsterHp / this.game.maxHp) : 0;
    roundRect(g, x, y + 22, barW, 16, 8, 'rgba(0,0,0,0.5)');
    if (frac > 0) roundRect(g, x + 2, y + 24, (barW - 4) * frac, 12, 6, this.game.isBoss ? '#ff4d6d' : '#5ee07a');
    g.font = '700 11px system-ui, sans-serif';
    g.fillStyle = '#fff';
    g.fillText(`${fmt(Math.max(0, s.monsterHp))} / ${fmt(this.game.maxHp)}`, w / 2, y + 30);

    // Boss timer
    if (this.game.isBoss && this.game.monsterAlive) {
      const t = Math.max(0, s.bossTimer / BOSS_TIME);
      roundRect(g, x, y + 42, barW, 8, 4, 'rgba(0,0,0,0.5)');
      roundRect(g, x + 1, y + 43, (barW - 2) * t, 6, 3, t < 0.3 ? '#ff4d4d' : '#ffb04d');
      g.font = '800 13px system-ui, sans-serif';
      g.fillStyle = '#ffd0a0';
      g.fillText(`⏱ ${s.bossTimer.toFixed(1)}s`, w / 2, y + 62);
    }

    if (this.banner) {
      const k = this.banner.life;
      const a = k < 0.2 ? k / 0.2 : k > 1.4 ? Math.max(0, 1 - (k - 1.4) / 0.4) : 1;
      g.globalAlpha = a;
      g.font = '900 34px system-ui, sans-serif';
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      const by = m.y - m.size * 1.5;
      g.strokeText(this.banner.text, w / 2, by);
      g.fillStyle = this.banner.color;
      g.fillText(this.banner.text, w / 2, by);
      g.globalAlpha = 1;
    }
  }
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string): void {
  g.fillStyle = fill;
  g.beginPath();
  g.roundRect(x, y, Math.max(0, w), h, Math.min(r, w / 2, h / 2));
  g.fill();
}
