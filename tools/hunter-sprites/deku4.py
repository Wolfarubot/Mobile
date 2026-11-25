"""Deku, final: Mage 6 with the green cape taken off (facing down, left and right) and the turtle shell on his back:
tucked behind him from the sides with just its flat border hidden, centred behind him facing down, and over his back
from behind (as approved). python -I deku4.py"""
import sys
sys.path.insert(0, '.')
from kit import *
from deku import BACK, paint, grid_of
from deku2 import SIDE, FRONT

# Facing down: the right side as it was, the left side brought in 2 pixels (two columns out of the shell's left half).
FRONT_L = '\n'.join(r[:3] + r[5:] for r in grid_of(FRONT))
from deku3 import uncaped

F = 64


def solid_mask(im):
    a = im.getchannel('A').load()
    return lambda x, y: 0 <= x < im.width and 0 <= y < im.height and a[x, y] > 0


def build():
    orig = body('M', 6)
    nocape = uncaped(orig)
    h = head('M', 6)
    # Facing down, left and right: no cape. From behind: the approved look, the shell over the cape.
    b = nocape.copy()
    if "capeup" in sys.argv: b.paste(orig.crop((0, 3 * F, orig.width, 4 * F)), (0, 3 * F))
    # The robe's darker blues, darkest to lightest, become the hood's greens; the light-blue trim stays.
    ROBE_TO_HOOD = {(26, 24, 42): (15, 52, 48), (32, 31, 51): (17, 64, 52), (42, 36, 56): (19, 77, 57),
                    (41, 43, 67): (22, 96, 63), (50, 54, 82): (20, 115, 54), (56, 64, 94): (20, 133, 40),
                    (64, 73, 104): (32, 152, 35)}
    if 'blue' not in sys.argv:
        px = b.load()
        for y in range(b.height):
            for x in range(b.width):
                c = px[x, y]
                if c[3] and c[:3] in ROBE_TO_HOOD:
                    px[x, y] = ROBE_TO_HOOD[c[:3]] + (c[3],)
    fig = stack(b, h)
    on = solid_mask(fig)
    behind = Image.new('RGBA', orig.size)
    over = Image.new('RGBA', orig.size)
    side = grid_of(SIDE)
    sh, sw = len(side), max(len(r) for r in side)
    for row in range(4):
        for col in range(orig.width // F):
            x0, y0 = col * F, row * F
            bb = b.crop((x0, y0, x0 + F, y0 + F)).getbbox()
            if not bb:
                continue
            top = y0 + bb[1]
            if row == 3:
                ob = orig.crop((x0, y0, x0 + F, y0 + F)).getbbox()
                paint(over, BACK, x0 + (ob[0] + ob[2]) // 2 - 6, y0 + ob[1] - 5)
            elif row == 0:
                paint(behind, FRONT_L, x0 + (bb[0] + bb[2]) // 2 - 6, top - 1)
            else:
                # The flat side's border column must sit under the figure on every row the shell spans: find the
                # figure's back edge on those rows and take the innermost one.
                # The tuck is measured where the shell sat before; it's then drawn 2 pixels higher.
                ys = range(top, top + sh)
                if row == 2:  # facing right: the back is the left edge; the flat side is the shell's right column
                    edges = [min(x for x in range(x0, x0 + F) if on(x, y)) for y in ys if any(on(x, y) for x in range(x0, x0 + F))]
                    flat_x = max(edges)
                    paint(behind, SIDE, flat_x - (sw - 1), top - 2)
                else:  # facing left: the back is the right edge; the shell is mirrored, flat side its left column
                    edges = [max(x for x in range(x0, x0 + F) if on(x, y)) for y in ys if any(on(x, y) for x in range(x0, x0 + F))]
                    flat_x = min(edges)
                    paint(behind, SIDE, flat_x, top - 2, flip=True)
    out = stack(behind, fig)
    out.alpha_composite(over)
    return out


if __name__ == '__main__':
    d = build()
    d.save('out/deku-final.png')
    from PIL import ImageDraw
    K = 7
    z = Image.new('RGBA', (4 * 40, 48), (111, 127, 107, 255))
    for r in range(4):
        z.alpha_composite(d.crop((12, r * 64 + 14, 52, r * 64 + 54)), (r * 40, 8))
    z = z.resize((z.width * K, z.height * K), Image.NEAREST)
    dr = ImageDraw.Draw(z)
    for i, n in enumerate(('facing down', 'facing left', 'facing right', 'facing up')):
        dr.text((i * 40 * K + 70, 6), n, fill='#fff', font=FONT)
    z.save('deku-final-zoom.png')
    print('ok')
