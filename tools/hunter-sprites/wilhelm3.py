"""Wilhelm, take three: a new Archer 3 head. Archer 3's hat comes off; Wilhelm's head (from the recoloured arena
fighter) goes where Archer 3's head was, lined up by the eyes (or, from behind, by the neck), following the head's
bob frame by frame; the hat goes back on exactly where it was. That head then sits on Archer 3's body.
python -I wilhelm3.py"""
import sys
sys.path.insert(0, '.')
from kit import *
from wilhelm import gif
from wilhelm2 import head_pieces, HAT, SKIN, HAIR_NEW, recolour

F = 64
EYE = (210, 221, 232)


def centroid(pts):
    return (sum(x for x, _ in pts) / len(pts), sum(y for _, y in pts) / len(pts))


def new_head():
    pieces = head_pieces(Image.open('out/wilhelm-sheet.png'))
    ah = head('A', 3)
    ap = ah.load()
    hat = Image.new('RGBA', ah.size)
    hp = hat.load()
    for y in range(ah.height):
        for x in range(ah.width):
            if ap[x, y][3] and ap[x, y][:3] in HAT:
                hp[x, y] = ap[x, y]
    heads = Image.new('RGBA', ah.size)
    for r in range(4):
        piece, ax, ay = pieces[r]
        pp = piece.load()
        # Archer 3's head in this row's first frame: where its eyes (or its neck) are.
        a_eyes = [(x, y) for y in range(F) for x in range(F) if ap[x, r * F + y][:3] == EYE and ap[x, r * F + y][3]]
        w_eyes = [(x, y) for y in range(F) for x in range(F) if pp[x, y][:3] == EYE and pp[x, y][3]]
        if a_eyes and w_eyes:
            (hx, hy), (wx, wy) = centroid(a_eyes), centroid(w_eyes)
            off = (round(hx - wx), round(hy - wy))
        else:
            face = [(x, y) for y in range(F) for x in range(F) if ap[x, r * F + y][3] and ap[x, r * F + y][:3] not in HAT]
            fx = (min(x for x, _ in face) + max(x for x, _ in face)) // 2
            fy = max(y for _, y in face)
            off = (fx - ax, fy - ay)
        hat0 = hat.crop((0, r * F, F, (r + 1) * F)).getbbox()
        for col in range(ah.width // F):
            hb = hat.crop((col * F, r * F, (col + 1) * F, (r + 1) * F)).getbbox()
            if not hb:
                continue
            bob = (hb[0] - hat0[0], hb[1] - hat0[1])
            heads.alpha_composite(piece, (col * F + off[0] + bob[0], r * F + off[1] + bob[1]))
    # The face and neck may only cover the body where Archer 3's own head did (or where there's no body behind
    # them); the braid's hair may hang over the body.
    hdp = heads.load()
    bp = body('A', 3).load()
    for y in range(heads.height):
        for x in range(heads.width):
            c = hdp[x, y]
            if c[3] and c[:3] not in HAIR_NEW and bp[x, y][3] and not (ap[x, y][3] and ap[x, y][:3] not in HAT):
                hdp[x, y] = (0, 0, 0, 0)
    # Hair poking up above the hat's crown goes; then the hat goes back on.
    for r in range(4):
        for col in range(ah.width // F):
            x0, y0 = col * F, r * F
            for x in range(x0, x0 + F):
                ys = [y for y in range(y0, y0 + F) if hp[x, y][3]]
                if ys:
                    for y in range(y0, min(ys)):
                        if hdp[x, y][3] and hdp[x, y][:3] in HAIR_NEW:
                            hdp[x, y] = (0, 0, 0, 0)
    return stack(heads, hat)


# Archer 3's outfit: the cowl red, the shirt under it tan, the trousers leather brown (each darkest to lightest).
OUTFIT = {
    (15, 42, 47): (60, 14, 18), (11, 60, 60): (100, 20, 26), (27, 100, 78): (156, 34, 36), (28, 110, 77): (176, 42, 42),
    (30, 141, 76): (206, 60, 52),
    (31, 29, 37): (74, 54, 36), (41, 39, 53): (132, 100, 66), (44, 42, 54): (140, 108, 72), (55, 54, 72): (176, 140, 96),
    (59, 60, 80): (198, 162, 114),
    (70, 50, 40): (58, 36, 24), (124, 111, 100): (110, 70, 42), (136, 128, 112): (126, 82, 50),
    (171, 164, 146): (152, 102, 62), (189, 184, 166): (170, 118, 74),
}


if __name__ == '__main__':
    nh = new_head()
    nh.save('out/wilhelm-head.png')
    w = stack(recolour(recolour(body('A', 3), SKIN), OUTFIT), nh)
    w.save('out/wilhelm3.png')
    from PIL import ImageDraw
    K = 6
    z = Image.new('RGBA', (8 * 36, 44), (111, 127, 107, 255))
    orig = Image.open('out/wilhelm3-prev.png')
    for r in range(4):
        z.alpha_composite(orig.crop((14, r * F + 10, 50, r * F + 50)), (r * 72, 4))
        z.alpha_composite(w.crop((14, r * F + 10, 50, r * F + 50)), (r * 72 + 36, 4))
    z = z.resize((z.width * K, z.height * K), Image.NEAREST)
    d = ImageDraw.Draw(z)
    for r, n in enumerate(('down', 'left', 'right', 'up')):
        d.text((r * 72 * K + 20, 4), 'before', fill='#fff', font=FONT)
        d.text((r * 72 * K + 36 * K + 20, 4), f'Wilhelm, {n}', fill='#ffe36b', font=FONT)
    z.save('wilhelm3-zoom.png')
    gif(w, 'wilhelm3-idle.gif')
    print('ok')
