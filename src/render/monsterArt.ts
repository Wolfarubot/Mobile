// Procedural monsters: no image assets needed, every stage gets a distinct creature.

export function seeded(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Species = 'slime' | 'eyeball' | 'ghost' | 'imp' | 'shroom';
const SPECIES: Species[] = ['slime', 'eyeball', 'ghost', 'imp', 'shroom'];
const SPECIES_NAMES: Record<Species, string[]> = {
  slime: ['Slime', 'Ooze', 'Blob', 'Gloop'],
  eyeball: ['Gazer', 'Watcher', 'Beholdling', 'Peeper'],
  ghost: ['Wisp', 'Specter', 'Haunt', 'Shade'],
  imp: ['Imp', 'Gremlin', 'Fiend', 'Goblin'],
  shroom: ['Shroomling', 'Sporeling', 'Toadstool', 'Myconid'],
};
const ADJECTIVES = ['Angry', 'Sneaky', 'Grumpy', 'Feral', 'Rotten', 'Hungry', 'Wicked', 'Giant', 'Spiky', 'Cursed', 'Rabid', 'Vile'];
const BOSS_TITLES = ['King', 'Overlord', 'Matriarch', 'Warlord', 'Tyrant', 'Elder'];

export interface MonsterLook {
  species: Species;
  hue: number;
  name: string;
  eyes: number;
  horns: boolean;
  seed: number;
}

export function monsterLook(stage: number, index: number, boss: boolean, hueBase: number): MonsterLook {
  const seed = stage * 7919 + index * 104729 + (boss ? 1 : 0);
  const r = seeded(seed);
  const species = SPECIES[Math.floor(r() * SPECIES.length)];
  const hue = (hueBase + (r() - 0.5) * 140 + 360) % 360;
  const noun = SPECIES_NAMES[species][Math.floor(r() * 4)];
  const adj = ADJECTIVES[Math.floor(r() * ADJECTIVES.length)];
  const name = boss ? `${noun} ${BOSS_TITLES[Math.floor(r() * BOSS_TITLES.length)]}` : `${adj} ${noun}`;
  return { species, hue, name, eyes: species === 'eyeball' ? 1 : 1 + Math.floor(r() * 3), horns: boss || r() < 0.3, seed };
}

export interface DrawOpts {
  t: number; // time, for idle animation
  hurt: number; // 0..1 flash amount
  squash: number; // 0..1 hit squash
  boss?: boolean;
}

/** Draws a monster centered at (x, y) whose body fits roughly within `size` (radius). */
export function drawMonster(g: CanvasRenderingContext2D, look: MonsterLook, x: number, y: number, size: number, o: DrawOpts): void {
  const bob = Math.sin(o.t * 3 + look.seed) * size * 0.04;
  const sx = 1 + o.squash * 0.18;
  const sy = 1 - o.squash * 0.15;
  const body = `hsl(${look.hue} 60% 50%)`;
  const dark = `hsl(${look.hue} 55% 30%)`;
  const light = `hsl(${look.hue} 70% 68%)`;

  g.save();
  g.translate(x, y + bob);

  // Shadow
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath();
  g.ellipse(0, size * 0.95 - bob, size * 0.8 * sx, size * 0.16, 0, 0, Math.PI * 2);
  g.fill();

  g.scale(sx, sy);
  g.translate(0, size * 0.15 * o.squash);

  if (look.horns) drawHorns(g, size, o.boss ? '#f4e3b0' : light);

  g.fillStyle = body;
  g.strokeStyle = dark;
  g.lineWidth = Math.max(2, size * 0.06);
  if (look.species === 'shroom') {
    // Stem first, then the cap is the main body path.
    g.beginPath();
    g.moveTo(-size * 0.4, size * 0.85);
    g.lineTo(-size * 0.35, -size * 0.1);
    g.lineTo(size * 0.35, -size * 0.1);
    g.lineTo(size * 0.4, size * 0.85);
    g.closePath();
    g.fillStyle = '#efe2c8';
    g.fill();
    g.stroke();
    if (o.hurt > 0) flashFill(g, o.hurt);
    g.fillStyle = body;
  }
  bodyPath(g, look, size, o.t);
  g.fill();
  g.stroke();
  if (o.hurt > 0) flashFill(g, o.hurt);

  // Highlight
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.ellipse(-size * 0.35, -size * 0.45, size * 0.18, size * 0.1, -0.6, 0, Math.PI * 2);
  g.fill();

  if (look.species === 'shroom') drawSpots(g, size, look.seed);
  drawFace(g, look, size, o.t);

  if (o.boss) drawCrown(g, size, look.species === 'shroom' ? -size * 0.85 : -size * 1.0);
  g.restore();
}

/** Refills the current path white; used as the hit flash (no offscreen canvas needed). */
function flashFill(g: CanvasRenderingContext2D, amount: number): void {
  g.fillStyle = `rgba(255,255,255,${amount * 0.7})`;
  g.fill();
}

function bodyPath(g: CanvasRenderingContext2D, look: MonsterLook, size: number, t: number): void {
  g.beginPath();
  switch (look.species) {
    case 'slime': {
      const w = Math.sin(t * 4) * size * 0.04;
      g.moveTo(-size, size * 0.85);
      g.bezierCurveTo(-size * 1.05, -size * 0.2, -size * 0.5, -size * 0.95 + w, 0, -size * 0.95 + w);
      g.bezierCurveTo(size * 0.5, -size * 0.95 + w, size * 1.05, -size * 0.2, size, size * 0.85);
      g.closePath();
      break;
    }
    case 'eyeball':
      g.arc(0, 0, size * 0.85, 0, Math.PI * 2);
      break;
    case 'ghost': {
      g.moveTo(-size * 0.8, size * 0.85);
      g.lineTo(-size * 0.8, -size * 0.1);
      g.arc(0, -size * 0.1, size * 0.8, Math.PI, 0);
      g.lineTo(size * 0.8, size * 0.85);
      for (let i = 0; i < 4; i++) {
        const x0 = size * 0.8 - (i + 1) * size * 0.4;
        g.quadraticCurveTo(x0 + size * 0.2, size * (0.55 + 0.1 * Math.sin(t * 5 + i)), x0, size * 0.85);
      }
      g.closePath();
      break;
    }
    case 'imp':
      g.ellipse(0, size * 0.05, size * 0.75, size * 0.85, 0, 0, Math.PI * 2);
      break;
    case 'shroom':
      g.ellipse(0, -size * 0.25, size, size * 0.6, 0, Math.PI, 0);
      g.closePath();
      break;
  }
}

function drawHorns(g: CanvasRenderingContext2D, size: number, color: string): void {
  g.fillStyle = color;
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = size * 0.04;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(side * size * 0.35, -size * 0.6);
    g.quadraticCurveTo(side * size * 0.9, -size * 0.9, side * size * 0.75, -size * 1.35);
    g.quadraticCurveTo(side * size * 0.6, -size * 0.9, side * size * 0.1, -size * 0.75);
    g.closePath();
    g.fill();
    g.stroke();
  }
}

function drawSpots(g: CanvasRenderingContext2D, size: number, seed: number): void {
  const r = seeded(seed + 3);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.arc((r() - 0.5) * size * 1.4, -size * 0.35 - r() * size * 0.4, size * (0.06 + r() * 0.08), 0, Math.PI * 2);
    g.fill();
  }
}

function drawFace(g: CanvasRenderingContext2D, look: MonsterLook, size: number, t: number): void {
  const blink = Math.sin(t * 1.3 + look.seed) > 0.97;
  const eyeY = look.species === 'shroom' ? size * 0.2 : -size * 0.15;
  const eyeR = look.species === 'eyeball' ? size * 0.42 : size * 0.16;
  const n = look.eyes;
  for (let i = 0; i < n; i++) {
    const ex = n === 1 ? 0 : (i - (n - 1) / 2) * size * 0.42;
    g.fillStyle = '#fff';
    g.beginPath();
    if (blink) g.ellipse(ex, eyeY, eyeR, eyeR * 0.12, 0, 0, Math.PI * 2);
    else g.arc(ex, eyeY, eyeR, 0, Math.PI * 2);
    g.fill();
    if (!blink) {
      const look_ = Math.sin(t * 0.7 + look.seed) * eyeR * 0.3;
      g.fillStyle = look.species === 'eyeball' ? `hsl(${(look.hue + 180) % 360} 70% 40%)` : '#1a1020';
      g.beginPath();
      g.arc(ex + look_, eyeY + eyeR * 0.1, eyeR * 0.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#000';
      g.beginPath();
      g.arc(ex + look_, eyeY + eyeR * 0.1, eyeR * 0.25, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Angry brows
  if (look.species !== 'eyeball') {
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = size * 0.06;
    g.lineCap = 'round';
    const span = n === 1 ? size * 0.2 : ((n - 1) / 2) * size * 0.42 + size * 0.2;
    g.beginPath();
    g.moveTo(-span, eyeY - eyeR - size * 0.12);
    g.lineTo(-size * 0.05, eyeY - eyeR - size * 0.02);
    g.moveTo(span, eyeY - eyeR - size * 0.12);
    g.lineTo(size * 0.05, eyeY - eyeR - size * 0.02);
    g.stroke();
  }
  // Mouth with fangs
  const my = look.species === 'eyeball' ? size * 0.55 : look.species === 'shroom' ? size * 0.55 : size * 0.35;
  g.fillStyle = '#2a0f1a';
  g.beginPath();
  g.ellipse(0, my, size * 0.28, size * 0.12, 0, 0, Math.PI);
  g.fill();
  g.fillStyle = '#fff';
  for (const fx of [-0.15, 0.15]) {
    g.beginPath();
    g.moveTo(size * (fx - 0.06), my);
    g.lineTo(size * (fx + 0.06), my);
    g.lineTo(size * fx, my + size * 0.1);
    g.closePath();
    g.fill();
  }
}

function drawCrown(g: CanvasRenderingContext2D, size: number, y: number): void {
  const w = size * 0.5;
  g.fillStyle = '#ffd34d';
  g.strokeStyle = '#a8761a';
  g.lineWidth = size * 0.04;
  g.beginPath();
  g.moveTo(-w, y);
  g.lineTo(-w, y - size * 0.25);
  g.lineTo(-w * 0.5, y - size * 0.12);
  g.lineTo(0, y - size * 0.35);
  g.lineTo(w * 0.5, y - size * 0.12);
  g.lineTo(w, y - size * 0.25);
  g.lineTo(w, y);
  g.closePath();
  g.fill();
  g.stroke();
}
