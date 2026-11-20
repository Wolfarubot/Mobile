"""
The new Time Eater's game sheets (public/monsters/time-eater*.png): walk, thrust (attack), overhead swing (attack3),
special and death, 8 frames each in one row of square frames, at half the rig's size (the wings back at the size they
loom over the Rift). Each 2x2 block of the rig becomes the colour most of it is (or clear), so the pixel art stays crisp.
"""
import sys, math, random
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import numpy as np
from PIL import Image
from rig import render, P
import anims
from anims import pose, walk, thrust, swing, arc

OUT = sys.argv[1]
FRAME = 448

def special():
  # The knight's flames flare up and die down: the wings flare and a red glow rises round it, then settles.
  flare = [0, 6, 18, 22, 18, 12, 6, 0]; glow = [0, 0.35, 1, 1, 0.75, 0.5, 0.25, 0]
  return [pose(wings=f, dy=-2 * g, uarmR=-2 * g, staff=2 * g) for f, g in zip(flare, glow)], glow

def glow_ring(img, a):
  if a <= 0: return img
  al = np.array(img)[:, :, 3] > 0
  ring = np.zeros_like(al)
  for dy in range(-3, 4):
    for dx in range(-3, 4):
      if dx * dx + dy * dy <= 10: ring |= np.roll(np.roll(al, dy, 0), dx, 1)
  ring &= ~al
  g = np.zeros(al.shape + (4,), np.uint8); g[ring] = (255, 70, 60, int(200 * a))
  out = Image.fromarray(g); out.alpha_composite(img); return out

def death():
  # The knight drops its sword, then crumbles to pieces that fall and fade; the staff is left lying where it fell.
  base = render(pose(no_staff=1))
  full = render(pose())
  # The staff on the ground at its feet, lying flat.
  staff = render(pose(uarmR=0, staff=0))  # (only to keep sizes)
  from rig import CROPS
  st = CROPS['staff'].rotate(38, resample=Image.NEAREST, expand=True)
  st = st.crop(st.getbbox())
  a = np.array(base)[:, :, 3] > 0; ys = np.where(a.any(1))[0]
  feet = np.array(render(pose(no_staff=1, no_wings=1)))[:, :, 3] > 0
  fy = np.where(feet.any(1))[0]; fx = np.where(feet.any(0))[0]
  ground = fy.max(); cx = (fx.min() + fx.max()) // 2
  lying = Image.new('RGBA', base.size); lying.alpha_composite(st, (cx - st.width // 2 + 20, ground - st.height + 6))
  # Chunks of the body (and wings), each breaking off at its own moment, the lower ones first.
  rnd = random.Random(7); B = 8; arr = np.array(base); chunks = []
  for y in range(0, arr.shape[0], B):
    for x in range(0, arr.shape[1], B):
      c = arr[y:y + B, x:x + B]
      if (c[:, :, 3] > 0).sum() < 4: continue
      tb = 0.15 + 0.6 * (1 - (y - ys.min()) / max(1, ground - ys.min())) * 0.5 + rnd.random() * 0.35
      chunks.append((x, y, Image.fromarray(c.copy()), tb, rnd.uniform(-1, 1)))
  frames = [full]
  for k in range(1, 8):
    t = k / 7; f = Image.new('RGBA', base.size)
    for x, y, im, tb, drift in chunks:
      if t < tb: f.alpha_composite(im, (x, y)); continue
      u = t - tb
      if u > 0.45: continue
      ny = min(ground - B, int(y + 900 * u * u)); nx = int(x + drift * 60 * u)
      piece = im.copy(); al = np.array(piece); al[:, :, 3] = (al[:, :, 3] * max(0, 1 - u / 0.45)).astype(np.uint8)
      f.alpha_composite(Image.fromarray(al), (nx, ny))
    out = lying.copy(); out.alpha_composite(f); frames.append(out)
  return frames

def downsample(img):
  # Each 2x2 block: a colour two or more of its pixels share (clear if two or more are clear), else its top-left.
  a = np.array(img).astype(np.int64); H, W = a.shape[:2]; a = a[:H // 2 * 2, :W // 2 * 2]
  p = [a[0::2, 0::2], a[0::2, 1::2], a[1::2, 0::2], a[1::2, 1::2]]
  key = [(q[..., 0] << 24) | (q[..., 1] << 16) | (q[..., 2] << 8) | np.where(q[..., 3] > 0, 255, 0) for q in p]
  out = p[0].copy(); best = np.zeros(key[0].shape, int)
  for i in range(4):
    n = sum((key[i] == key[j]).astype(int) for j in range(4))
    take = n > best; out[take] = p[i][take]; best = np.maximum(best, n)
  clear = sum((q[..., 3] == 0).astype(int) for q in p) >= 2
  out[clear] = 0
  return Image.fromarray(out.astype(np.uint8))

def sheet(frames, name):
  small = [downsample(f) for f in frames]
  w, h = small[0].size
  ox, oy = (FRAME - w) // 2, FRAME - h
  out = Image.new('RGBA', (FRAME * len(small), FRAME))
  for i, f in enumerate(small): out.alpha_composite(f, (FRAME * i + ox, oy))
  out.save(f'{OUT}/{name}.png')
  return ox, oy

def with_arcs(frames_durs, arcs):
  poses, _ = frames_durs; out = []
  for i, p in enumerate(poses):
    f = render(p)
    if i in arcs:
      layer = Image.new('RGBA', f.size); arc(layer, p, *arcs[i])
      if p.get('staff_front'): f.alpha_composite(layer)
      else: layer.alpha_composite(f); f = layer
    out.append(f)
  return out

ox, oy = sheet([render(p) for p in walk()[0]], 'time-eater')
sheet([render(p) for p in thrust()[0]], 'time-eater-attack')
sheet(with_arcs(swing(), {2: (100, 15), 4: (60, -40)}), 'time-eater-attack3')
sp, gl = special(); sheet([glow_ring(render(p), g) for p, g in zip(sp, gl)], 'time-eater-special')
sheet(death(), 'time-eater-death')
# The box: the body (horns to feet, no wings or staff), shrunk by 1.5 about its middle, so the game (which draws a box's
# longer side at the Guardian's size) draws the body 1.5x the old knight's.
body = np.array(render({'no_staff': 1, 'no_wings': 1}))[:, :, 3] > 0
ys = np.where(body.any(1))[0]; xs = np.where(body.any(0))[0]
x0, x1, y0, y1 = xs.min() / 2 + ox, xs.max() / 2 + ox, ys.min() / 2 + oy, ys.max() / 2 + oy
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; side = (y1 - y0) / 1.5
print('frame', FRAME, 'body', [round(x0), round(y0), round(x1 - x0), round(y1 - y0)], 'box', [round(cx - side / 2), round(cy - side / 2), round(side), round(side)])
