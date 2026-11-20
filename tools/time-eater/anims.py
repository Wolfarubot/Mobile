"""
The new Time Eater's walk and two attacks, posed after the old knight's sheets (public/monsters/time-eater*.png),
frame for frame: the walk (sword held across the body, a steady stride with the knee up on the passing frames), the
thrust (levelled at the chest, then lunged out to the right) and the overhead swing (raised straight up with a slash
arc, brought down to the lower right with another, a follow-through, then back). Staff angles are given as where the
staff points overall (0: its resting diagonal, down and to the right; +35 level, pointing right; +125 straight up),
and turned into the angle in the hand from the arm's angles.
"""
import sys, math
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from rig import render, P, rotpt, ROOT
from PIL import Image, ImageDraw

def pose(torso=0, head=0, uarmR=0, handR=0, staff=0, uarmL=0, handL=0, wings=0, dy=0, front=0, legs=None, dx=0, **extra):
  p = {'torso': torso, 'head': head, 'uarmR': uarmR, 'handR': handR, 'staff': staff - uarmR - handR - torso,
       'uarmL': uarmL, 'handL': handL, 'wingL': -wings, 'wingR': wings, 'dy': dy, 'dx': dx, 'staff_front': front}
  p.update(legs or {'thighL': -0.4 * torso, 'thighR': -0.4 * torso})
  p.update(extra)
  return p

def walk():
  out = []
  for i in range(8):
    a = 2 * math.pi * i / 8; c = math.cos(a); s = math.sin(a)
    legs = {'thighL': 12 * c, 'thighR': -12 * c,
            # the knee comes up as each leg passes (frame 2 the left, frame 6 the right)
            'shinL': -22 * max(0, s), 'footL': 10 * max(0, s), 'shinR': -22 * max(0, -s), 'footR': -10 * max(0, -s)}
    out.append(pose(torso=1.5 * c, head=-1.5 * c, uarmR=-3 * c, handR=2 * c, staff=-2 * c, uarmL=-8 * c, handL=-5 * c,
                    wings=4 * math.sin(2 * a), dy=-3 * abs(s) + 1, legs=legs))
  return out, [110] * 8

def thrust():
  K = [
    dict(),                                                                              # ready
    dict(uarmR=45, handR=55, staff=35, uarmL=10, handL=40, wings=4, dy=-1),             # levelled at the chest
    dict(uarmR=48, handR=55, staff=35, uarmL=12, handL=42, wings=6, dy=-1),
    dict(uarmR=40, handR=50, staff=35, uarmL=8, handL=35, wings=8, dy=-1, torso=2),     # drawn back a touch
    dict(uarmR=85, handR=5, staff=35, uarmL=-25, handL=-10, wings=-8, dy=2, torso=-6, dx=10, front=1),  # the lunge
    dict(uarmR=88, handR=2, staff=35, uarmL=-28, handL=-12, wings=-10, dy=2, torso=-7, dx=12, front=1),
    dict(uarmR=85, handR=5, staff=35, uarmL=-25, handL=-10, wings=-8, dy=2, torso=-6, dx=10, front=1),
    dict(uarmR=10, handR=8, staff=8, uarmL=-4, handL=-2, wings=-2, dy=0),               # back
  ]
  return [pose(**k) for k in K], [140, 110, 110, 160, 80, 120, 140, 140]

def swing():
  K = [
    dict(), dict(uarmR=-6, handR=-4, staff=-4, wings=-2),                               # ready, a breath
    dict(uarmR=160, handR=5, staff=125, uarmL=10, handL=8, wings=18, dy=-4, torso=3),   # raised straight up (arc)
    dict(uarmR=162, handR=5, staff=125, uarmL=12, handL=8, wings=20, dy=-4, torso=3),
    dict(uarmR=70, handR=0, staff=20, uarmL=-15, handL=-6, wings=-12, dy=2, torso=-5, front=1),  # down (arc)
    dict(uarmR=40, handR=0, staff=-5, uarmL=-20, handL=-8, wings=-14, dy=3, torso=-7, dx=6, front=1),  # follow-through
    dict(uarmR=36, handR=0, staff=-6, uarmL=-18, handL=-8, wings=-10, dy=3, torso=-6, dx=5, front=1),
    dict(uarmR=10, handR=4, staff=2, wings=-2, dy=1),                                   # back
  ]
  return [pose(**k) for k in K], [140, 110, 150, 110, 80, 220, 120, 140]

ARC = (232, 214, 216)   # the slash: pale, a touch of the body's rose
def shoulder(p):
  """Where the staff arm's shoulder is in a frame (the arc swings round it)."""
  from rig import render as _r  # noqa: just to share coordinates with the rig's root
  root = (ROOT[0] + p.get('dx', 0), ROOT[1] + p.get('dy', 0))
  t = P['torso']; j = t['joints']['shR']; pv = t['pivot']
  r = rotpt((j[0] - pv[0], j[1] - pv[1]), p.get('torso', 0))
  return root[0] + r[0], root[1] + r[1]
def arc(img, p, a0, a1, r=330, w=44):
  """A crescent slash from angle a0 to a1 (degrees, 0 = right, 90 = up), thickest in the middle."""
  cx, cy = shoulder(p); d = ImageDraw.Draw(img, 'RGBA'); n = 40
  outer = []; inner = []
  for k in range(n + 1):
    t = k / n; a = math.radians(a0 + (a1 - a0) * t); th = w * math.sin(math.pi * t)
    outer.append((cx + math.cos(a) * r, cy - math.sin(a) * r)); inner.append((cx + math.cos(a) * (r - th), cy - math.sin(a) * (r - th)))
  d.polygon(outer + inner[::-1], fill=(*ARC, 215))

def build(name, frames_durs, arcs=None):
  poses, durs = frames_durs
  frames = []
  for i, p in enumerate(poses):
    f = render(p)
    if arcs and i in arcs:
      layer = Image.new('RGBA', f.size); arc(layer, p, *arcs[i])
      # behind the body when it's raised overhead, in front as it comes down
      if p.get('staff_front'): f.alpha_composite(layer)
      else: layer.alpha_composite(f); f = layer
    frames.append(f)
  W, H = frames[0].size
  sheet = Image.new('RGBA', (W * len(frames), H))
  for i, f in enumerate(frames): sheet.alpha_composite(f, (W * i, 0))
  sheet.save(f'{sys.argv[1]}/{name}-sheet.png')
  crop = (60, 100, 820, 780); fr = []
  for f in frames:
    b = Image.new('RGBA', f.size, (122, 116, 136, 255)); b.alpha_composite(f); fr.append(b.crop(crop).convert('P', palette=Image.ADAPTIVE))
  fr[0].save(f'{sys.argv[1]}/te-{name}.gif', save_all=True, append_images=fr[1:], duration=durs, loop=0)
  cw, ch = crop[2] - crop[0], crop[3] - crop[1]
  grid = Image.new('RGBA', (cw * 4, ch * 2), (122, 116, 136, 255))
  for i, f in enumerate(frames): grid.alpha_composite(f.crop(crop), (cw * (i % 4), ch * (i // 4)))
  grid.resize((grid.width // 2, grid.height // 2), Image.NEAREST).save(f'{sys.argv[1]}/te-{name}-frames.png')

if __name__ == '__main__':
  # previews: python3 anims.py <dir>
  build('walk', walk())
  build('thrust', thrust())
  build('swing', swing(), arcs={2: (100, 15), 4: (60, -40)})
