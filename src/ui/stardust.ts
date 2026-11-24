/**
 * The Regression view's backdrop: motes of white, pink and blue drifting slowly through a dark purple void, each
 * twinkling and swaying a little, wrapping round the edges. Drawn on its own canvas behind the view; it stops by
 * itself once the canvas has been taken off the page.
 */

const COLORS = ['#ffffff', '#ffffff', '#ff9ae0', '#ff6fd0', '#9fd2ff', '#6fb6ff'];
/** About one mote per this many square CSS pixels. */
const AREA_PER_MOTE = 3200;

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  /** Twinkle and sway phases and speeds. */
  tw: number;
  twSpeed: number;
  sway: number;
  swaySpeed: number;
}

export function startStardust(canvas: HTMLCanvasElement): void {
  const g = canvas.getContext('2d')!;
  let W = 0;
  let H = 0;
  let motes: Mote[] = [];
  let last = performance.now();

  const spawn = (): Mote => {
    const a = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 9;
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 2, // a slight upward drift overall
      size: Math.random() < 0.18 ? 2 + Math.random() * 1.5 : 1 + Math.random(),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      tw: Math.random() * Math.PI * 2,
      twSpeed: 0.6 + Math.random() * 1.6,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.2 + Math.random() * 0.5,
    };
  };

  const fit = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || (w === W && h === H)) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const keep = motes.length > 0;
    W = w;
    H = h;
    const n = Math.round((W * H) / AREA_PER_MOTE);
    if (!keep) motes = Array.from({ length: n }, spawn);
    else {
      while (motes.length < n) motes.push(spawn());
      motes.length = n;
    }
  };

  const frame = (now: number) => {
    if (!canvas.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fit();
    g.clearRect(0, 0, W, H);
    for (const m of motes) {
      m.tw += m.twSpeed * dt;
      m.sway += m.swaySpeed * dt;
      m.x += (m.vx + Math.cos(m.sway) * 4) * dt;
      m.y += (m.vy + Math.sin(m.sway * 1.3) * 3) * dt;
      // Round the edges.
      if (m.x < -4) m.x += W + 8;
      else if (m.x > W + 4) m.x -= W + 8;
      if (m.y < -4) m.y += H + 8;
      else if (m.y > H + 4) m.y -= H + 8;
      const alpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(m.tw));
      const x = Math.round(m.x);
      const y = Math.round(m.y);
      const s = m.size;
      // A soft halo round the bigger ones, then the mote itself as a crisp pixel square.
      if (s >= 2) {
        g.globalAlpha = alpha * 0.22;
        g.fillStyle = m.color;
        g.fillRect(x - s * 1.5, y - s * 1.5, s * 4, s * 4);
      }
      g.globalAlpha = alpha;
      g.fillStyle = m.color;
      g.fillRect(x, y, s, s);
    }
    g.globalAlpha = 1;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });
}
