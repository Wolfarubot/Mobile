"""Wilhelm, take two: his head (cut from the recoloured arena fighter's calm frames, braid included) on Archer 3's body,
following the body's idle bob, with Archer 3's own hat on top. python -I wilhelm2.py [dx dy for the head]"""
import sys
sys.path.insert(0, '.')
from kit import *
from wilhelm import HAIR, SHIRT, gif

F = 64
HAIR_NEW = set(HAIR.values())
SHIRT_NEW = set(SHIRT.values())
HAT = {(51, 30, 28), (114, 75, 39), (138, 96, 49), (56, 39, 37), (97, 59, 36), (127, 103, 84), (70, 34, 31),
       (84, 46, 36), (104, 79, 67), (153, 129, 107)}
SKIN = {(208, 142, 78): (250, 214, 184), (187, 117, 66): (234, 188, 160), (160, 97, 66): (204, 156, 132),
        (125, 71, 50): (164, 118, 106), (94, 50, 39): (140, 100, 92)}
HDX = int(sys.argv[1]) if len(sys.argv) > 1 else 0
HDY = int(sys.argv[2]) if len(sys.argv) > 2 else 0
HAT_DY = [int(v) for v in sys.argv[3].split(',')] if len(sys.argv) > 3 else [0, 2, 2, 0]


def head_pieces(sheet):
    """Per direction: the head, found by spreading out from the eyes (or, from behind, the hair) through every
    connected pixel that isn't the outfit; the braid comes with the hair. With its anchor: the neck's bottom-centre."""
    from wilhelm import PANTS
    stop = SHIRT_NEW | set(PANTS.values()) | {(36, 32, 56), (36, 39, 64), (24, 21, 38), (38, 18, 25), (66, 33, 36),
                                             (75, 39, 39), (62, 41, 38)}
    out = []
    for r in range(4):
        fr = sheet.crop((0, r * F, F, (r + 1) * F))
        px = fr.load()
        head_top = next(y for y in range(F) if any(px[x, y][3] for x in range(F)))
        # The head is 13 rows, crown to neck; only the braid's hair carries on below that.
        ok = lambda x, y: (0 <= x < F and 0 <= y < F and px[x, y][3] and px[x, y][:3] not in stop
                           and (y < head_top + 13 or px[x, y][:3] in HAIR_NEW))
        seeds = [(x, y) for y in range(F) for x in range(F) if px[x, y][3] and px[x, y][:3] == (210, 221, 232)]
        if not seeds:
            top = next(y for y in range(F) if any(px[x, y][3] for x in range(F)))
            seeds = [(x, top) for x in range(F) if px[x, top][3]]
        seen, todo = set(seeds), list(seeds)
        while todo:
            x, y = todo.pop()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (x + dx, y + dy)
                if n not in seen and ok(*n):
                    seen.add(n)
                    todo.append(n)
        piece = Image.new('RGBA', (F, F))
        pp = piece.load()
        for x, y in seen:
            pp[x, y] = px[x, y]
        face = [(x, y) for x, y in seen if px[x, y][:3] not in HAIR_NEW]
        ax = (min(x for x, _ in face) + max(x for x, _ in face)) // 2
        out.append((piece, ax, max(y for _, y in face)))
    return out


def recolour(im, table):
    im = im.copy()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            c = px[x, y]
            if c[3] and c[:3] in table:
                px[x, y] = table[c[:3]] + (c[3],)
    return im


def build():
    pieces = head_pieces(Image.open('out/wilhelm-sheet.png'))
    bd = recolour(body('A', 3), SKIN)
    ah = head('A', 3)
    hat = ah.copy()
    hp = hat.load()
    for y in range(hat.height):
        for x in range(hat.width):
            if hp[x, y][3] and hp[x, y][:3] not in HAT:
                hp[x, y] = (0, 0, 0, 0)
    # Per direction, how far the hat comes down (pixels): facing down, left, right, up.
    moved = Image.new('RGBA', hat.size)
    for r, dy in enumerate(HAT_DY):
        moved.alpha_composite(hat.crop((0, r * F, hat.width, (r + 1) * F)), (0, r * F + dy))
    hat = moved
    hp = hat.load()
    heads = Image.new('RGBA', bd.size)
    for r in range(4):
        piece, ax, ay = pieces[r]
        for col in range(bd.width // F):
            rb = ah.crop((col * F, r * F, (col + 1) * F, (r + 1) * F)).getbbox()
            if not rb:
                continue
            # The Archer 3 face's bottom-centre: under the hat, where the chin meets the body.
            fr = ah.crop((col * F, r * F, (col + 1) * F, (r + 1) * F))
            fp = fr.load()
            face = [(x, y) for y in range(F) for x in range(F) if fp[x, y][3] and fp[x, y][:3] not in HAT]
            fx = (min(x for x, _ in face) + max(x for x, _ in face)) // 2
            fy = max(y for _, y in face)
            heads.alpha_composite(piece, (col * F + fx - ax + HDX, r * F + fy - ay + HDY))
    # Hair poking up above the hat's crown goes.
    hdp = heads.load()
    for col in range(bd.width // F):
        for r in range(4):
            x0, y0 = col * F, r * F
            for x in range(x0, x0 + F):
                ys = [y for y in range(y0, y0 + F) if hp[x, y][3]]
                if ys:
                    for y in range(y0, min(ys)):
                        if hdp[x, y][3] and hdp[x, y][:3] in HAIR_NEW:
                            hdp[x, y] = (0, 0, 0, 0)
    return stack(bd, heads, hat)


if __name__ == '__main__':
    w = build()
    w.save('out/wilhelm2.png')
    from PIL import ImageDraw
    K = 6
    z = Image.new('RGBA', (4 * 36, 44), (111, 127, 107, 255))
    for r in range(4):
        z.alpha_composite(w.crop((14, r * F + 10, 50, r * F + 50)), (r * 36, 4))
    z = z.resize((z.width * K, z.height * K), Image.NEAREST)
    d = ImageDraw.Draw(z)
    for r, n in enumerate(('facing down', 'facing left', 'facing right', 'facing up')):
        d.text((r * 36 * K + 40, 4), n, fill='#fff', font=FONT)
    z.save('wilhelm2-zoom.png')
    gif(w, 'wilhelm2-idle.gif')
    print('ok')
