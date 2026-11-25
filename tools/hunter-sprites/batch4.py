"""Lilith (Swordsman 8: gold trim to purple, the orange cape blue, the red plume dark purple), Reginald (Swordsman 9's
body, Swordsman 4's head with its helmet in Swordsman 9's colours), Themus (the arena's red-tunic fighter's head on
Swordsman 6's body). All in the base packs' layout: 64px frames, 12 per row, rows down, left, right, up.
python -I batch4.py"""
import sys
sys.path.insert(0, '.')
from kit import *

F = 64
EYE = (210, 221, 232)
SKIN = {(225, 178, 110), (190, 134, 95), (164, 111, 89), (121, 80, 72), (246, 202, 116)}


def rgb(h, s, v):
    r, g, b = colorsys.hsv_to_rgb((h % 360) / 360, max(0, min(1, s)), max(0, min(1, v)))
    return (round(r * 255), round(g * 255), round(b * 255))


def remap(im, fn):
    """fn(rgb, h, s, v) -> new rgb or None, cached per colour."""
    im = im.copy()
    px = im.load()
    cache = {}
    for y in range(im.height):
        for x in range(im.width):
            c = px[x, y]
            if not c[3]:
                continue
            k = c[:3]
            if k not in cache:
                cache[k] = fn(k, *hsv(k))
            if cache[k]:
                px[x, y] = cache[k] + (c[3],)
    return im


# ---- Lilith ----
def lilith_fn(c, h, s, v):
    if c in SKIN or c == EYE or v < 0.1:
        return None
    if 36 <= h <= 60 and s > 0.35:                      # gold trim, highlight to shade
        return rgb(278, min(1, s * 0.85 + 0.1), v * 0.92)
    if c in {(133, 73, 38), (107, 49, 29), (91, 42, 25), (188, 121, 66), (119, 65, 54)}:   # the trim's brown shade
        return rgb(272, 0.62, v * 0.85)
    return None


def lilith_head_fn(c, h, s, v):
    r = lilith_fn(c, h, s, v)
    if r:
        return r
    if c in SKIN or c == EYE or v < 0.1:
        return None
    if ((h >= 330 or h <= 14) and s > 0.5) or c == (201, 87, 24):   # the plume's reds, very dark purple
        return rgb(284, 0.55, v * 0.62 + 0.04)
    return None


def lilith_body_fn(c, h, s, v):
    r = lilith_fn(c, h, s, v)
    if r:
        return r
    if c in SKIN or v < 0.1:
        return None
    if (h >= 350 or h <= 34) and s > 0.55:             # the cape's flame reds and oranges, deep to bright blue
        return rgb(222, 0.78 - 0.25 * max(0, v - 0.7), 0.2 + v * 0.85)
    return None


def lilith():
    return stack(remap(body('S', 8), lilith_body_fn), remap(head('S', 8), lilith_head_fn))


# ---- Reginald ----
COPPER = {(72, 25, 22): (14, 13, 22), (123, 52, 34): (23, 22, 37), (138, 59, 38): (35, 42, 60),
          (162, 77, 41): (48, 49, 73), (177, 90, 38): (62, 67, 92), (195, 106, 32): (84, 91, 134)}
STEEL_BLUE = {(48, 61, 78): (35, 42, 60), (99, 111, 136): (59, 77, 95), (111, 137, 166): (93, 129, 168),
              (122, 161, 188): (107, 171, 204), (140, 188, 221): (124, 217, 238), (181, 237, 255): (241, 249, 254)}
STEEL_GOLD = {(48, 61, 78): (107, 49, 29), (99, 111, 136): (133, 73, 38), (111, 137, 166): (211, 152, 58),
              (122, 161, 188): (235, 191, 44), (140, 188, 221): (235, 191, 44), (181, 237, 255): (255, 248, 154)}


def reginald(steel):
    table = {**COPPER, **steel}
    return stack(body('S', 9), remap(head('S', 4), lambda c, *_: table.get(c)))


# ---- Themus ----
ARENA1 = P + 'arena/PNG/Characters/Figters_sword/Without_shadow/Fighter_sword1_without_shadow.png'
SWORD = {(43, 41, 68), (103, 132, 182), (107, 155, 204), (91, 107, 152), (76, 83, 119), (125, 189, 246)}
TUNIC = {(153, 56, 57), (171, 64, 58), (131, 49, 57), (112, 44, 58), (90, 34, 43), (73, 29, 33), (164, 71, 54),
         (189, 75, 60), (121, 46, 58), (120, 46, 43)}


def arena_heads():
    """Per direction, the fighter's calm frame cut above the tunic (sword removed), with its eye centre (or None)
    and the head's bottom-centre."""
    sheet = Image.open(ARENA1).convert('RGBA')
    out = []
    for r in range(4):
        fr = sheet.crop((0, r * F, F, (r + 1) * F))
        px = fr.load()
        # The tunic starts on the first row with a run of its reds (the eyes are red too, but only a pixel or two).
        neck = next(y for y in range(F) if sum(1 for x in range(F) if px[x, y][3] and px[x, y][:3] in TUNIC) >= 5)
        piece = Image.new('RGBA', (F, F))
        pp = piece.load()
        for y in range(neck):
            for x in range(F):
                if px[x, y][3] and px[x, y][:3] not in SWORD:
                    pp[x, y] = px[x, y]
        eyes = [(x, y) for y in range(F) for x in range(F) if pp[x, y][3] and pp[x, y][:3] == EYE]
        bb = piece.getbbox()
        out.append((piece, eyes, ((bb[0] + bb[2]) / 2, bb[3])))
    return out


def centroid(pts):
    return (sum(x for x, _ in pts) / len(pts), sum(y for _, y in pts) / len(pts))


def themus(dx=(0, 0, 0, 0), dy=(0, 0, 0, 0)):
    bd = body('S', 6)
    sh = head('S', 6)
    sp = sh.load()
    heads = Image.new('RGBA', bd.size)
    for r, (piece, eyes, (ax, ay)) in enumerate(arena_heads()):
        s_eyes = [(x, y) for y in range(F) for x in range(F) if sp[x, r * F + y][3] and sp[x, r * F + y][:3] == EYE]
        b0 = sh.crop((0, r * F, F, (r + 1) * F)).getbbox()
        # Chin on the old chin; across, eyes over the old eyes (from behind, centred).
        if eyes and s_eyes:
            off = (round(centroid(s_eyes)[0] - centroid(eyes)[0]), b0[3] - ay)
        else:
            off = (round((b0[0] + b0[2]) / 2 - ax), b0[3] - ay)
        off = (off[0] + dx[r], off[1] + dy[r])
        for col in range(bd.width // F):
            hb = sh.crop((col * F, r * F, (col + 1) * F, (r + 1) * F)).getbbox()
            if not hb:
                continue
            bob = (hb[0] - b0[0], hb[3] - b0[3])
            heads.alpha_composite(piece, (col * F + off[0] + bob[0], r * F + off[1] + bob[1]))
    return stack(bd, heads)


if __name__ == '__main__':
    out = {'lilith': lilith(), 'reginald-A': reginald(STEEL_BLUE), 'reginald-B': reginald(STEEL_GOLD), 'themus': themus()}
    for k, v in out.items():
        v.save(f'out/{k}.png')
    from PIL import ImageDraw
    K = 6
    rows = [('Lilith', out['lilith']), ('  Swordsman 8 as drawn', stack(body('S', 8), head('S', 8))),
            ('Reginald A: helmet rim blue', out['reginald-A']), ('Reginald B: helmet rim gold', out['reginald-B']),
            ('Themus', out['themus'])]
    W = 4 * 44 * K
    sheet = Image.new('RGB', (W, len(rows) * (52 * K + 34)), '#5d6b59')
    d = ImageDraw.Draw(sheet)
    for i, (lab, im) in enumerate(rows):
        z = Image.new('RGBA', (4 * 44, 52), (111, 127, 107, 255))
        for r in range(4):
            z.alpha_composite(im.crop((10, r * F + 6, 54, r * F + 58)), (r * 44, 0))
        y = i * (52 * K + 34)
        sheet.paste(z.resize((z.width * K, z.height * K), Image.NEAREST), (0, y + 34))
        d.text((10, y + 6), lab, fill='#fff', font=FONT)
    sheet.save('batch4.png')
    print('ok')
