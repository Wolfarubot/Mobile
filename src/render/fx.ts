// Lightweight particles and floating text for the battle view.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  gravity: number;
  /** Drawn as a square pixel instead of a round dot. */
  square?: boolean;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  max: number;
}

interface Slash {
  x: number;
  y: number;
  angle: number;
  life: number;
  len: number;
}

export class Fx {
  /** Multiplier on floating text size and rise speed (to stay readable in a zoomed-out view). */
  textScale = 1;
  particles: Particle[] = [];
  floaters: Floater[] = [];
  slashes: Slash[] = [];

  /** Particle burst. Pass gravity 0 for top-down scenes. */
  burst(x: number, y: number, color: string, count = 14, speed = 220, size = 5, gravity = 600, square = false): void {
    if (this.particles.length > 400) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - (gravity > 0 ? speed * 0.3 : 0),
        life: 0,
        max: 0.5 + Math.random() * 0.4,
        size: size * (0.6 + Math.random() * 0.8),
        color,
        gravity,
        square,
      });
    }
  }

  text(x: number, y: number, text: string, color = '#fff', size = 22, max = 0.9): void {
    if (this.floaters.length > 45) this.floaters.shift();
    this.floaters.push({ x: x + (Math.random() - 0.5) * 60, y: y + (Math.random() - 0.5) * 24, text, color, size, life: 0, max });
  }

  slash(x: number, y: number, len = 90): void {
    this.slashes.push({ x, y, angle: -0.9 + (Math.random() - 0.5) * 0.9, life: 0, len });
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.life += dt;
      p.vy += p.gravity * dt;
      if (!p.gravity) {
        const drag = 0.02 ** dt; // top-down particles slow to a stop instead of falling
        p.vx *= drag;
        p.vy *= drag;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const f of this.floaters) {
      f.life += dt;
      f.y -= 70 * this.textScale * dt;
    }
    for (const s of this.slashes) s.life += dt;
    this.particles = this.particles.filter((p) => p.life < p.max);
    this.floaters = this.floaters.filter((f) => f.life < f.max);
    this.slashes = this.slashes.filter((s) => s.life < 0.18);
  }

  draw(g: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      g.globalAlpha = 1 - p.life / p.max;
      g.fillStyle = p.color;
      if (p.square) {
        g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        continue;
      }
      g.beginPath();
      g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    g.lineCap = 'round';
    for (const s of this.slashes) {
      const k = s.life / 0.18;
      const dx = Math.cos(s.angle) * s.len;
      const dy = Math.sin(s.angle) * s.len;
      g.strokeStyle = `rgba(255,255,255,${1 - k})`;
      g.lineWidth = 8 * (1 - k) + 1;
      g.beginPath();
      g.moveTo(s.x - dx * (1 - k), s.y - dy * (1 - k));
      g.lineTo(s.x + dx, s.y + dy);
      g.stroke();
    }

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const f of this.floaters) {
      const k = f.life / f.max;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.4 : 1;
      g.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      g.font = canvasFont(f.size * pop * this.textScale, 700);
      g.lineWidth = 4 * this.textScale;
      g.strokeStyle = 'rgba(0,0,0,0.75)';
      g.strokeText(f.text, f.x, f.y);
      g.fillStyle = f.color;
      g.fillText(f.text, f.x, f.y);
    }
    g.globalAlpha = 1;
  }
}

/** Sizes a canvas to its CSS box at device pixel ratio; returns CSS width/height. */
/** The UI's font (chosen in Settings), also used for text drawn on canvases. */
let canvasFamily = "'Pixelify Sans', system-ui, sans-serif";
let canvasScale = 1;

export function setCanvasFont(family: string, scale = 1): void {
  canvasFamily = family;
  canvasScale = scale;
}

/** A canvas font string in the chosen font, sized to match the default font. */
export function canvasFont(px: number, weight = 400): string {
  return `${weight} ${Math.round(px * canvasScale)}px ${canvasFamily}`;
}

/** Sizes a canvas to its CSS box at `scale` canvas pixels per CSS pixel (defaults to the device pixel ratio). */
export function fitCanvas(canvas: HTMLCanvasElement, g: CanvasRenderingContext2D, scale?: number): { w: number; h: number } {
  const dpr = scale ?? Math.min(window.devicePixelRatio || 1, 2.5);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}
