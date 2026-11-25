import sys
sys.path.insert(0, '.')
from kit import *

OUT = 'out'


def remap(im, table):
    im = im.copy()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            c = px[x, y]
            if c[3] and c[:3] in table:
                px[x, y] = table[c[:3]] + (c[3],)
    return im


# Galladair: the head as it is in the game now (Mage 3, skin turned light blue), on Archer 6's body.
BLUE_SKIN = {(255, 202, 150): (223, 243, 255), (233, 179, 142): (182, 220, 243), (192, 138, 123): (141, 184, 219),
             (165, 116, 108): (113, 147, 187), (126, 86, 85): (82, 99, 133)}
galladair = stack(remap(body('A', 6), BLUE_SKIN), remap(head('M', 3), BLUE_SKIN))
galladair.save(f'{OUT}/galladair.png')

# Andrejz: Archer 2's head with grey-white hair and fair skin, on Swordsman 6's body with its steel turned to leather.
is_hair = lambda h, s, v: 205 <= h <= 245 and s >= 0.15 and v <= 0.5


def grey_white(h, s, v):
    # The hair's darkest shade is its outline: kept as it was. The rest goes a step lighter.
    if v < 0.2:
        return (220, 0.06, min(1, 0.55 + 0.62 * v))
    return (220, 0.05, min(1, 0.66 + 0.72 * v))


FAIR = [(0.78, (255, 202, 150)), (0.70, (233, 179, 142)), (0.55, (192, 138, 123)), (0.45, (165, 116, 108)), (0.33, (126, 86, 85))]
is_tan = lambda h, s, v: 10 <= h <= 32 and s >= 0.55 and v >= 0.33


def fair_skin(im):
    im = im.copy()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            c = px[x, y]
            if not c[3]:
                continue
            h, s, v = hsv(c[:3])
            if is_tan(h, s, v):
                for lim, col in FAIR:
                    if v >= lim:
                        px[x, y] = col + (c[3],)
                        break
    return im


is_steel = lambda h, s, v: 185 <= h <= 248 and s >= 0.15


def leather(h, s, v):
    return (24 + 6 * v, 0.62 - 0.22 * v, min(1, 0.16 + 0.66 * v))


a_head = fair_skin(recolor(head('A', 2), is_hair, grey_white))
a_body = recolor(body('S', 6), is_steel, leather)
andrejz = stack(a_body, a_head)
andrejz.save(f'{OUT}/andrejz.png')

H = '/home/user/Mobile/public/hunters/'
gl = Image.open(f'{OUT}/glimmer-D.png')
cards = [
    card('Glimmer: D (chosen)', 'Ember mage, crimson skin, flame-coloured hair', [gl.crop((0, r * 52, 64, (r + 1) * 52)) for r in (0, 3, 2, 1)], K=5),
    card('Galladair: now', 'Mage 3, blue skin', Image.open(H + 'ranger.png').convert('RGBA'), K=5),
    card('Galladair: new', 'Same head, Archer 6 body', galladair, K=5),
    card('Andrejz: now', 'Swordsman 2', Image.open(H + 'alchemist.png').convert('RGBA'), K=5),
    card('Andrejz: new', 'Archer 2 head (grey-white hair), Swordsman 6 body (leather)', andrejz, K=5),
]
# Rows: Glimmer alone; Galladair now and new; Andrejz now and new.
blank = card('', '', Image.new('RGBA', (64, 256)), K=5)
print(grid([cards[3], cards[4]], 2, 'andrejz.png'))
