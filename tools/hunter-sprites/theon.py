"""Theon: the Market Square pack's red-haired woman (Citizen 5) with her hair purplish black. Her sheet is 32px frames,
12 per row, rows down, left, right, up. python -I theon.py"""
import sys
sys.path.insert(0, '.')
from kit import *

SRC = P + 'market/PNG/Characters/Character_citizens_animation/Without_shadow/Citizen5_Idle_without_shadow.png'
# The hair's shades, brightest to darkest (the last is its outline), each to a purplish black.
HAIR = {(224, 117, 33): (104, 80, 132), (209, 94, 38): (88, 66, 114), (193, 78, 40): (74, 54, 98),
        (175, 62, 41): (62, 44, 84), (159, 51, 40): (52, 36, 72), (132, 38, 38): (42, 29, 60),
        (103, 32, 35): (27, 19, 38)}


def build():
    im = Image.open(SRC).convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            c = px[x, y]
            if c[3] and c[:3] in HAIR:
                px[x, y] = HAIR[c[:3]] + (c[3],)
    return im


if __name__ == '__main__':
    t = build()
    t.save('out/theon.png')
    o = Image.open(SRC).convert('RGBA')
    from PIL import ImageDraw
    K = 8
    z = Image.new('RGBA', (8 * 28, 34), (111, 127, 107, 255))
    for r in range(4):
        z.alpha_composite(o.crop((2, r * 32, 30, r * 32 + 30)), (r * 56, 4))
        z.alpha_composite(t.crop((2, r * 32, 30, r * 32 + 30)), (r * 56 + 28, 4))
    z = z.resize((z.width * K, z.height * K), Image.NEAREST)
    d = ImageDraw.Draw(z)
    for r, n in enumerate(('down', 'left', 'right', 'up')):
        d.text((r * 56 * K + 16, 4), 'pack', fill='#fff', font=FONT)
        d.text((r * 56 * K + 28 * K + 16, 4), f'Theon, facing {n}', fill='#ffe36b', font=FONT)
    z.save('theon-zoom.png')
    print('ok')
