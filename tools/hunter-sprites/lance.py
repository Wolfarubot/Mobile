"""Lance: Archer 9 as drawn, without the big red feathered wings. The wings' colours also make up the flame-coloured
cape at his back, so on each row only the plume-coloured pixels outside the body's own extent go.
python -I lance.py"""
import sys
sys.path.insert(0, '.')
from kit import *

F = 64
PLUME = {(78, 22, 38), (190, 45, 32), (167, 39, 49), (137, 35, 59), (115, 33, 59), (213, 69, 26)}


def unwinged(b):
    b = b.copy()
    px = b.load()
    for row in range(b.height // F):
        for col in range(b.width // F):
            x0, y0 = col * F, row * F
            extent = None
            for y in range(y0, y0 + F):
                xs = [x for x in range(x0, x0 + F) if px[x, y][3] and px[x, y][:3] not in PLUME]
                if xs:
                    extent = (min(xs), max(xs))
                for x in range(x0, x0 + F):
                    c = px[x, y]
                    if c[3] and c[:3] in PLUME and (extent is None or not extent[0] <= x <= extent[1]):
                        px[x, y] = (0, 0, 0, 0)
    return b


if __name__ == '__main__':
    orig = stack(body('A', 9), head('A', 9))
    new = stack(unwinged(body('A', 9)), head('A', 9))
    new.save('out/lance.png')
    from PIL import ImageDraw
    K = 6
    z = Image.new('RGBA', (8 * 36, 44), (111, 127, 107, 255))
    for r in range(4):
        z.alpha_composite(orig.crop((14, r * 64 + 12, 50, r * 64 + 48)), (r * 72, 8))
        z.alpha_composite(new.crop((14, r * 64 + 12, 50, r * 64 + 48)), (r * 72 + 36, 8))
    z = z.resize((z.width * K, z.height * K), Image.NEAREST)
    d = ImageDraw.Draw(z)
    for r, n in enumerate(('down', 'left', 'right', 'up')):
        d.text((r * 72 * K + 20, 6), 'Archer 9', fill='#fff', font=FONT)
        d.text((r * 72 * K + 36 * K + 20, 6), f'Lance, facing {n}', fill='#ffe36b', font=FONT)
    z.save('lance-zoom.png')
    print('ok')
