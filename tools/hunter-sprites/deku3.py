"""Deku's body with only the green cape taken off: its three greens and its dark-green outline, nothing else; any edge
of the body the cape covered gets the robe's own outline. python -I deku3.py"""
import sys
sys.path.insert(0, '.')
from kit import *

CAPE = {(22, 96, 63), (20, 115, 54), (20, 133, 40), (15, 52, 48)}
OUTLINE = (26, 24, 42, 255)


def uncaped(b):
    b = b.copy()
    px = b.load()
    W, H = b.size
    gone = [(x, y) for y in range(H) for x in range(W) if px[x, y][3] and px[x, y][:3] in CAPE]
    for x, y in gone:
        px[x, y] = (0, 0, 0, 0)
    solid = lambda x, y: 0 <= x < W and 0 <= y < H and px[x, y][3] > 0
    # The hand and its own brown outline don't count: no outline pixels hung off the hand.
    HAND = {(89, 49, 46), (233, 179, 142), (255, 202, 150), (192, 138, 123), (165, 116, 108), (126, 86, 85)}
    light = lambda x, y: solid(x, y) and hsv(px[x, y][:3])[2] >= 0.25 and px[x, y][:3] != OUTLINE[:3] and px[x, y][:3] not in HAND
    for x, y in gone:
        if any(light(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            px[x, y] = OUTLINE
    return b


if __name__ == '__main__':
    orig = body('M', 6)
    b = uncaped(orig)
    h = head('M', 6)
    b.save('out/deku-body-nocape.png')
    z = Image.new('RGBA', (8 * 40, 2 * 40), (111, 127, 107, 255))
    for r in range(4):
        z.alpha_composite(orig.crop((12, r * 64 + 14, 52, r * 64 + 54)), (r * 80, 0))
        z.alpha_composite(b.crop((12, r * 64 + 14, 52, r * 64 + 54)), (r * 80 + 40, 0))
        z.alpha_composite(stack(orig, h).crop((12, r * 64 + 14, 52, r * 64 + 54)), (r * 80, 40))
        z.alpha_composite(stack(b, h).crop((12, r * 64 + 14, 52, r * 64 + 54)), (r * 80 + 40, 40))
    z.resize((z.width * 6, z.height * 6), Image.NEAREST).save('deku-nocape.png')
    print('ok')
