"""Deku as a turtle person: a shell (drawn at the hunters' pixel scale in the river turtle's colours) on Deku's
current sprite, or on a turtle-green base head and Mage 1 body. python -I deku.py"""
import sys
sys.path.insert(0, '.')
from kit import *

OUT = 'out'
# The river turtle's shell colours, plus an outline.
SHELL = {'O': (58, 30, 24), 'D': (115, 66, 52), 'M': (181, 89, 69), 'L': (208, 119, 83), 'H': (242, 184, 136), 'R': (140, 74, 58)}

# From behind: 13 x 14, a domed shell with a ridge of scutes down the middle and plates either side.
BACK = """
....OOOOO....
..OOLLHLLOO..
.OLLDLHLDLLO.
.OLDMDLDMDLO.
OLLDMMDMMDLLO
OLDDDDLDDDDLO
OLMMMDLDMMMLO
OLMMMDLDMMMLO
OLDDDDLDDDDLO
ORMMDMMMDMMRO
ORMMDDMDDMMRO
.ORRDRRRDRRO.
..OORRRRROO..
....OOOOO....
"""
# From the side (facing right; the shell is on the back, to the left): 6 x 14.
SIDE = """
..OOO.
.OLLO.
OLHLO.
OLLDO.
OLMDO.
ODDDO.
OLMDO.
OLMDO.
ODDDO.
ORMDO.
ORMDO.
.ORRO.
..OOO.
......
"""
# From the front: the rim showing past each shoulder, 2 wide, 9 tall.
RIM = """
.O
OL
OM
OD
OM
OM
OD
OR
.O
"""


def grid_of(s):
    return [r for r in s.strip('\n').split('\n')]


def paint(img, pattern, x0, y0, flip=False):
    px = img.load()
    rows = grid_of(pattern)
    w = max(len(r) for r in rows)
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            if ch == '.':
                continue
            x = x0 + ((w - 1 - i) if flip else i)
            y = y0 + j
            if 0 <= x < img.width and 0 <= y < img.height:
                px[x, y] = SHELL[ch] + (255,)


def with_shell(sheet, body_layer, F=64):
    """Draws the shell on every frame: behind the figure facing down and to the sides, over it from behind."""
    back = Image.new('RGBA', sheet.size)
    front = Image.new('RGBA', sheet.size)
    for row in range(sheet.height // F):
        for col in range(sheet.width // F):
            fr = body_layer.crop((col * F, row * F, (col + 1) * F, (row + 1) * F))
            bb = fr.getbbox()
            if not bb:
                continue
            x0, y0 = col * F, row * F
            cx = x0 + (bb[0] + bb[2]) // 2
            top = y0 + bb[1]  # the body layer's top: the shoulders
            if row == 3:  # from behind: over the body
                paint(front, BACK, cx - 6, top - 2)
            elif row == 0:  # facing down: the rim past each shoulder, behind
                paint(back, RIM, x0 + bb[0] - 1, top)
                paint(back, RIM, x0 + bb[2] - 1, top, flip=True)
            elif row == 2:  # facing right: the shell on the left
                paint(back, SIDE, x0 + bb[0] - 3, top - 1)
            else:  # facing left: the shell on the right
                paint(back, SIDE, x0 + bb[2] - 3, top - 1, flip=True)
    out = stack(back, sheet)
    out.alpha_composite(front)
    return out


# Turtle skin: the base skins mapped by brightness onto the river turtle's greens.
GREENS = [(0.92, (196, 206, 112)), (0.82, (166, 176, 79)), (0.7, (146, 160, 74)), (0.58, (129, 148, 71)),
          (0.45, (96, 124, 58)), (0.0, (62, 88, 42))]
is_skin = lambda h, s, v: (h <= 42 or h >= 350) and 0.3 <= s <= 0.62 and v >= 0.3


def turtle_skin(im, eyes=True):
    im = im.copy()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            c = px[x, y]
            if not c[3]:
                continue
            h, s, v = hsv(c[:3])
            if is_skin(h, s, v):
                for lim, col in GREENS:
                    if v >= lim:
                        px[x, y] = col + (c[3],)
                        break
            elif eyes and 215 <= h <= 232 and s >= 0.55:
                px[x, y] = (54, 38, 20, c[3])  # dark turtle eyes
    return im


is_tunic = lambda h, s, v: 60 <= h <= 110 and s <= 0.2 and v >= 0.15


def tan(h, s, v):
    return (38, 0.42, min(1, 0.2 + 0.85 * v))


cards = []
H = '/home/user/Mobile/public/hunters/'
now = Image.open(H + 'druid.png').convert('RGBA')
cards.append(card('Deku: now', 'Mage 6', now))

# A: Deku as he is, with a shell.
mb, mh = body('M', 6), head('M', 6)
a = with_shell(stack(mb, mh), mb)
a.save(f'{OUT}/deku-A.png')
cards.append(card('Deku A', 'Current Deku plus a turtle shell', a))

# B: the base character's bald head in turtle green, Mage 1's body with green skin and a tan tunic (the plastron), a shell.
bh = turtle_skin(Image.open(P + 'basemale/Tiled_files/Unarmed_Idle3_head.png').convert('RGBA'))
b1 = recolor(turtle_skin(body('M', 1)), is_tunic, tan)
b = with_shell(stack(b1, bh), b1)
b.save(f'{OUT}/deku-B.png')
cards.append(card('Deku B', 'Base head (turtle green), Mage 1 body (tan belly), shell', b))

# C: the same turtle, keeping Deku's druid hood: Mage 6 head with green skin, on B's body.
ch = turtle_skin(head('M', 6))
c = with_shell(stack(b1, ch), b1)
c.save(f'{OUT}/deku-C.png')
cards.append(card('Deku C', 'Deku hood, turtle skin, tan belly, shell', c))

print(grid(cards, 2, 'deku.png'))
