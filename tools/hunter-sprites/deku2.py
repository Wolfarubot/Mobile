"""Deku A, finished: Mage 6 with the green cape taken off, and the turtle shell on the back (over it from behind and
from the sides, centred behind him facing down). python -I deku2.py"""
import sys
sys.path.insert(0, '.')
from kit import *
from deku import SHELL, BACK, paint, grid_of

# From the side (facing right, so the shell is on the left): a dome, its flat side against the back.
SIDE = '''
...OOO
..OLLO
.OLHLO
OLLMDO
OLMMDO
OLMDDO
OLMMDO
OLMDDO
ORMMDO
ORMDDO
.ORDDO
..OOOO
'''
# Facing down: the whole shell behind him, wider than his body so its rim shows either side.
FRONT = '''
...OOOOOOOOOOO...
..OLLLLLLLLLLLO..
.OLLMMMMMMMMMLLO.
OLMMDDDDDDDDDMMLO
OLMDDDDDDDDDDDMLO
OLMDDDDDDDDDDDMLO
OLMDDDDDDDDDDDMLO
ORMDDDDDDDDDDDMRO
ORMMDDDDDDDDDMMRO
.ORMMMMMMMMMMMRO.
..ORRRRRRRRRRRO..
...OOOOOOOOOOO...
'''

F = 64
OUTLINE = (26, 24, 42, 255)
ROBE = [(0.24, (26, 24, 42)), (0.33, (42, 36, 56)), (1.0, (56, 64, 94))]
is_cape = lambda h, s, v: 125 <= h <= 200 and s >= 0.6


def uncaped(b):
    """Takes the cape off: outside the figure it goes (with the cut edge outlined); over the chest it becomes robe."""
    b = b.copy()
    px = b.load()
    W, H = b.size
    cape = set()
    for y in range(H):
        for x in range(W):
            c = px[x, y]
            if c[3] and is_cape(*hsv(c[:3])):
                cape.add((x, y))
    kept = lambda x, y: 0 <= x < W and 0 <= y < H and px[x, y][3] and (x, y) not in cape
    inside, outside = [], []
    for (x, y) in cape:
        fx = (x // F) * F
        left = any(kept(i, y) for i in range(fx, x))
        right = any(kept(i, y) for i in range(x + 1, fx + F))
        (inside if left and right else outside).append((x, y))
    for (x, y) in inside:
        v = hsv(px[x, y][:3])[2]
        for lim, col in ROBE:
            if v <= lim:
                px[x, y] = col + (255,)
                break
    for (x, y) in outside:
        px[x, y] = (0, 0, 0, 0)
    # The cape's own dark edge pixels, now floating: gone. Then outline where the cape was cut from the figure.
    def solid(x, y):
        return 0 <= x < W and 0 <= y < H and px[x, y][3] > 0
    for y in range(H):
        for x in range(W):
            c = px[x, y]
            if c[3] and hsv(c[:3])[2] < 0.25:
                if not any(solid(x + dx, y + dy) and hsv(px[x + dx, y + dy][:3])[2] >= 0.25 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    px[x, y] = (0, 0, 0, 0)
    for (x, y) in outside:
        if not solid(x, y) and any(solid(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            px[x, y] = OUTLINE
    return b


def build():
    orig = body('M', 6)
    b = uncaped(orig)
    h = head('M', 6)
    behind = Image.new('RGBA', orig.size)
    over = Image.new('RGBA', orig.size)
    for row in range(4):
        for col in range(orig.width // F):
            x0, y0 = col * F, row * F
            bb = b.crop((x0, y0, x0 + F, y0 + F)).getbbox()
            ob = orig.crop((x0, y0, x0 + F, y0 + F)).getbbox()
            if not bb:
                continue
            if row == 3:  # from behind: as approved, over the back
                paint(over, BACK, x0 + (ob[0] + ob[2]) // 2 - 6, y0 + ob[1] - 2)
            elif row == 0:  # facing down: centred behind the body, peeking out around it
                paint(behind, FRONT, x0 + (bb[0] + bb[2]) // 2 - 8, y0 + bb[1] - 1)
            elif row == 2:  # facing right: on the back (the left side), over the body
                paint(over, SIDE, x0 + bb[0] - 3, y0 + bb[1])
            else:  # facing left: on the back (the right side)
                paint(over, SIDE, x0 + bb[2] - 3, y0 + bb[1], flip=True)
    # Behind the figure, then the body, the shell on the back, and the head (hood) over all.
    out = stack(behind, b, over, h)
    return out


if __name__ == '__main__':
    d = build()
    d.save('out/deku-final.png')
    cards = [card('Deku: now', 'Mage 6', Image.open('/home/user/Mobile/public/hunters/druid.png').convert('RGBA'), K=5),
             card('Deku: new', 'Cape removed, shell on his back', d, K=5)]
    print(grid(cards, 2, 'deku-final.png'))
    z = Image.new('RGBA', (4 * 40, 40), (111, 127, 107, 255))
    for r in range(4):
        z.alpha_composite(d.crop((12, r * 64 + 14, 52, r * 64 + 54)), (r * 40, 0))
    z.resize((z.width * 7, z.height * 7), Image.NEAREST).save('deku-final-zoom.png')
