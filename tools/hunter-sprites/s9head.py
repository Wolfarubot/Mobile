"""Swordsman 9's head without its body: the side views have a notch at the back of the helmet, under the brim, that
the body's raised armour collar filled. Fills each row of the helmet between its front and back edges (down to the
face guard's bottom) with Swordsman 9's body pixels from the same frame. python -I s9head.py out.png"""
import sys
sys.path.insert(0, '.')
from kit import *

F = 64


def fixed():
    h = head('S', 9)
    b = body('S', 9)
    hp, bp = h.load(), b.load()
    out = h.copy()
    op = out.load()
    for r in (1, 2):  # facing left, right
        for c in range(h.width // F):
            x0, y0 = c * F, r * F
            box = h.crop((x0, y0, x0 + F, y0 + F)).getbbox()
            if not box:
                continue
            # The face guard's bottom: the lowest row with skin-free helmet pixels that isn't the plume's tail.
            rows = {}
            for y in range(box[1], box[3]):
                xs = [x for x in range(box[0], box[2]) if hp[x0 + x, y0 + y][3]]
                if xs:
                    rows[y] = xs
            wide = [y for y, xs in rows.items() if max(xs) - min(xs) >= 8]
            last = max(wide)
            for y in range(box[1], last + 1):
                xs = rows.get(y)
                if not xs:
                    continue
                for x in range(min(xs), max(xs) + 1):
                    X, Y = x0 + x, y0 + y
                    if not hp[X, Y][3] and bp[X, Y][3]:
                        op[X, Y] = bp[X, Y]
    return out


if __name__ == '__main__':
    out = fixed()
    out.save(sys.argv[1])
    z = Image.new('RGBA', (4 * 30, 3 * 34), (255, 0, 255, 255))
    for i, im in enumerate([head('S', 9), out, stack(body('S', 1), out)]):
        for r in range(4):
            z.alpha_composite(im.crop((17, r * F + 10, 47, r * F + 44)), (r * 30, i * 34))
    z.resize((z.width * 8, z.height * 8), Image.NEAREST).save('s9fix.png')
