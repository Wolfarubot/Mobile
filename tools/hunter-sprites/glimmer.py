"""Glimmer, a fire genasi: the Guild Hall's Ember mage with medium red skin and hair of flame that licks up above the
head, flickering frame to frame. python -I glimmer.py <tone hue> <out.png>"""
import sys
sys.path.insert(0, '.')
from kit import *
import colorsys

tone = float(sys.argv[1]) if len(sys.argv) > 1 else 2
TIPS = "notips" not in sys.argv
out = sys.argv[2] if len(sys.argv) > 2 else 'out/glimmer.png'
src = Image.open(P + 'guild/PNG/Mage2_without_shadow.png').convert('RGBA')
FW, FH = 64, 52

is_skin = lambda h, s, v: 5 <= h <= 32 and 0.4 <= s <= 0.65 and v >= 0.3
is_hair = lambda h, s, v: 205 <= h <= 262 and s >= 0.2


def rgb(h, s, v):
    r, g, b = colorsys.hsv_to_rgb((h % 360) / 360, s, v)
    return (round(r * 255), round(g * 255), round(b * 255), 255)


OUTLINE = (92, 22, 12, 255)
EMBER = rgb(12, 0.9, 0.78)
ORANGE = rgb(26, 0.92, 0.98)
YELLOW = rgb(46, 0.72, 1.0)
WHITE_HOT = rgb(52, 0.35, 1.0)

im = src.copy()
px = im.load()
W, H = im.size
hair = [[False] * W for _ in range(H)]
for y in range(H):
    for x in range(W):
        c = px[x, y]
        if c[3] == 0:
            continue
        h, s, v = hsv(c[:3])
        if is_skin(h, s, v):
            px[x, y] = rgb(tone, 0.58, min(1, v * 1.08))
        elif is_hair(h, s, v):
            hair[y][x] = True
            if v < 0.2:
                px[x, y] = OUTLINE  # the hair's own dark edge: a deep ember red, not a navy cap
            else:
                t = max(0, min(1, (v - 0.2) / 0.25))
                px[x, y] = rgb(14 + 30 * t, 0.92 - 0.2 * t, 0.7 + 0.3 * t)

# Flame tips above the hair: per frame, per column, a little tongue of fire whose height flickers.
import random
for fy in (range(H // FH) if TIPS else []):
    for fx in range(W // FW):
        rnd = random.Random(fy * 31 + fx * 7)
        x0, y0 = fx * FW, fy * FH
        cols = {}
        for x in range(x0, x0 + FW):
            for y in range(y0, y0 + FH):
                if hair[y][x]:
                    cols[x] = y
                    break
        if not cols:
            continue
        xs = sorted(cols)
        for i, x in enumerate(xs):
            top = cols[x]
            if i == 0 or i == len(xs) - 1:
                continue
            # Taller tongues in the middle of the head, a flicker that changes with the frame.
            mid = 1 - abs(i - (len(xs) - 1) / 2) / ((len(xs) - 1) / 2)
            hgt = int(round(mid * 3.2 + rnd.choice([-1, 0, 0, 1]) + (1 if (i + fx) % 3 == 0 else 0)))
            if hgt <= 0:
                continue
            for k in range(1, hgt + 1):
                y = top - k
                if y < y0:
                    break
                px[x, y] = YELLOW if k == 1 else ORANGE if k < hgt else EMBER
            if top - hgt - 1 >= y0:
                px[x, top - hgt - 1] = OUTLINE
        # The hair's crown, just under the tongues, glows white-hot.
        for x in xs[2:-2]:
            if rnd.random() < 0.35:
                px[x, cols[x]] = WHITE_HOT

im.save(out)
print(out)
