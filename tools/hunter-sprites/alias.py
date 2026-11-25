"""Alias: Archer 7 recoloured. Cloak and armour red; trousers and face mask black; the tuft of hair brown; lighter
skin; the hood's trim and the armour's and cape's gold trim white. python -I alias.py"""
import sys
sys.path.insert(0, '.')
from kit import *

RED = [(0.93, (238, 92, 84)), (0.84, (220, 64, 58)), (0.70, (204, 46, 44)), (0.56, (168, 34, 36)),
       (0.44, (136, 26, 30)), (0.34, (106, 20, 26)), (0.27, (84, 16, 22)), (0.0, (62, 12, 18))]
BLACK = [(0.5, (70, 70, 80)), (0.4, (54, 54, 62)), (0.3, (42, 42, 48)), (0.2, (32, 32, 37)), (0.0, (22, 22, 26))]
WHITE = [(0.95, (255, 255, 255)), (0.85, (236, 238, 242)), (0.7, (208, 212, 220)), (0.5, (164, 168, 180)),
         (0.0, (110, 112, 124))]
BROWN = [(0.9, (176, 120, 72)), (0.75, (142, 92, 54)), (0.0, (98, 62, 38))]
SKIN = {(187, 117, 66): (233, 179, 142), (160, 97, 66): (192, 138, 123), (125, 71, 50): (165, 116, 108)}

OUTLINE = (25, 23, 29)
# Head: the hood's darks, its trim, the tuft of hair (and its shading), the green mask.
HOOD = {(52, 59, 74), (42, 45, 57), (56, 67, 82), (37, 38, 48), (42, 36, 56), (31, 30, 38)}
HOOD_TRIM = {(105, 130, 166), (123, 158, 194), (180, 227, 243), (86, 99, 134)}
TUFT = {(134, 173, 208), (180, 229, 246), (77, 80, 116)}
MASK = {(31, 59, 55), (50, 121, 72), (37, 73, 65), (44, 98, 75), (25, 46, 46)}
# Body: gold trim (and its dark edges), green trousers.
GOLD = {(255, 229, 83), (235, 191, 44), (200, 149, 50), (255, 248, 154), (211, 152, 58), (107, 49, 29), (81, 34, 27)}
PANTS = {(44, 98, 75), (25, 46, 46), (50, 121, 72), (37, 73, 65), (53, 134, 65), (31, 59, 55)}


def ramp(table, v):
    for lim, col in table:
        if v >= lim:
            return col
    return table[-1][1]


def recolour(im, rule):
    im = im.copy()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            c = px[x, y]
            if c[3]:
                n = rule(c[:3])
                if n:
                    px[x, y] = n + (c[3],)
    return im


def head_rule(c):
    v = hsv(c)[2]
    if c in SKIN:
        return SKIN[c]
    if c in MASK:
        return ramp(BLACK, v)
    if c in TUFT:
        return ramp(BROWN, v)
    if c in HOOD_TRIM:
        return ramp(WHITE, v + 0.25)
    if c in HOOD:
        return ramp(RED, v + 0.1)
    return None


def body_rule(c):
    h, s, v = hsv(c)
    if c in SKIN:
        return SKIN[c]
    if c in PANTS:
        return ramp(BLACK, v)
    if c in GOLD:
        return ramp(WHITE, v + 0.05)
    if c == OUTLINE:
        return None
    if 195 <= h <= 262 and s >= 0.1:  # the cloak's darks and the armour's blues
        return ramp(RED, v + 0.1)
    return None


def build():
    return stack(recolour(body('A', 7), body_rule), recolour(head('A', 7), head_rule))


if __name__ == '__main__':
    a = build()
    a.save('out/alias.png')
    cards = [card('Archer 7 as it is', '(Ted now)', stack(body('A', 7), head('A', 7)), K=5),
             card('Alias: new', 'red cloak and armour, black mask and trousers, white trim', a, K=5)]
    print(grid(cards, 2, 'alias.png'))
