"""Ba'al, a copper dragonborn bard: a lizardman's head, recoloured copper with turquoise eyes, on a hunter body
(following the body's own head position every frame). python -I baal.py"""
import sys
sys.path.insert(0, '.')
from kit import *

F = 64
SIDE_DY = int(sys.argv[2]) if len(sys.argv) > 2 else -1
L = P + 'lizard/Tiled_files/'
# The lizardmen sheets' rows are front, back, facing left, facing right; the game's are down, left, right, up.
LROW = {0: 0, 1: 2, 2: 3, 3: 1}

COPPER = [(0.80, (246, 180, 112)), (0.66, (224, 136, 74)), (0.52, (196, 110, 58)), (0.40, (160, 84, 44)),
          (0.28, (122, 60, 34)), (0.18, (86, 40, 28)), (0.0, (52, 24, 20))]
PALE = [(0.75, (250, 214, 160)), (0.62, (232, 186, 130)), (0.0, (196, 150, 104))]
TURQUOISE = [(0.7, (96, 236, 214)), (0.0, (30, 168, 160))]


def ramp(table, v):
    for lim, col in table:
        if v >= lim:
            return col
    return table[-1][1]


def copper(im, kind):
    im = im.copy()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            c = px[x, y]
            if not c[3]:
                continue
            h, s, v = hsv(c[:3])
            if v < 0.1:
                continue  # the outline
            if kind == 'L1':
                if 190 <= h <= 215 and s > 0.8:
                    px[x, y] = ramp(TURQUOISE, v) + (c[3],)
                elif s < 0.25:
                    px[x, y] = ramp(PALE, v) + (c[3],)  # throat and belly scales: pale copper
                else:
                    px[x, y] = ramp(COPPER, v) + (c[3],)
            else:  # L2: green scales, tan spines, red eyes
                if s > 0.9 and h < 20:
                    px[x, y] = ramp(TURQUOISE, v) + (c[3],)
                elif 140 <= h <= 200:
                    px[x, y] = ramp(COPPER, v) + (c[3],)
                elif c[:3] == (153, 101, 76):
                    px[x, y] = (236, 190, 120, c[3])  # the crest's spines: bright copper-gold
                elif c[:3] == (61, 34, 33):
                    px[x, y] = (120, 62, 30, c[3])
    return im


SKIN = {(255, 202, 150): (246, 180, 112), (233, 179, 142): (224, 136, 74), (192, 138, 123): (196, 110, 58),
        (165, 116, 108): (160, 84, 44), (126, 86, 85): (122, 60, 34)}


def skin_copper(im):
    im = im.copy()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            c = px[x, y]
            if c[3] and c[:3] in SKIN:
                px[x, y] = SKIN[c[:3]] + (c[3],)
    return im


def head_on(body_img, ref_head, lizard_head, dy=0, dx=0):
    """Puts the lizard head where the hunter's own head is, frame by frame: its jaw on the chin; centred facing
    down or up, its back of the head lined up with the hunter's from the sides."""
    out = Image.new('RGBA', body_img.size)
    for row in range(4):
        n = sum(1 for col in range(body_img.width // F) if ref_head.crop((col * F, row * F, (col + 1) * F, (row + 1) * F)).getbbox())
        for col in range(n):
            rb = ref_head.crop((col * F, row * F, (col + 1) * F, (row + 1) * F)).getbbox()
            lcol = col * 4 // n
            lf = lizard_head.crop((lcol * F, LROW[row] * F, (lcol + 1) * F, (LROW[row] + 1) * F))
            lb = lf.getbbox()
            if not rb or not lb:
                continue
            piece = lf.crop(lb)
            y = rb[3] - (lb[3] - lb[1]) + (dy if row in (0, 3) else SIDE_DY)
            if row in (0, 3):
                x = (rb[0] + rb[2]) // 2 - (lb[2] - lb[0]) // 2
            elif row == 1:  # facing left: centred over the neck, nudged forward (left)
                x = (rb[0] + rb[2]) // 2 - (lb[2] - lb[0]) // 2 - dx
            else:  # facing right: nudged forward (right)
                x = (rb[0] + rb[2]) // 2 - (lb[2] - lb[0]) // 2 + dx
            out.alpha_composite(piece, (col * F + x, row * F + y))
    return out


if __name__ == '__main__':
    cards = [card("Ba'al: now", 'Archer 3, copper skin', Image.open('/home/user/Mobile/public/hunters/bard.png').convert('RGBA'), K=5)]
    bd = skin_copper(body('A', 3))
    ref = head('A', 3)
    for n, suf, kind, label, dy in ((1, '_', 'L1', 'A', 2), (2, '__', 'L2', 'B', 2)):
        lh = copper(Image.open(L + f'Lizardman{n}_Idle{suf}head.png').convert('RGBA'), kind)
        sheet = stack(bd, head_on(bd, ref, lh, dy=dy, dx=int(sys.argv[1]) if len(sys.argv) > 1 else 2))
        sheet.save(f'out/baal-{label}.png')
        cards.append(card(f"Ba'al {label}", f'Lizardman {n} head, copper; current body', sheet, K=5))
    # For comparison: the whole crested lizardman in copper (with its tail), no sword.
    lb = copper(Image.open(L + 'Lizardman2_Idle__body.png').convert('RGBA'), 'L2')
    lh = copper(Image.open(L + 'Lizardman2_Idle__head.png').convert('RGBA'), 'L2')
    full = stack(lb, lh)
    full = Image.merge('RGBA', full.split())
    rows = [full.crop((0, LROW[r] * F, F, (LROW[r] + 1) * F)) for r in range(4)]
    cards.append(card("Ba'al C", 'The whole crested lizardman in copper (with tail)', rows, K=5))
    print(grid(cards, 2, 'baal.png'))
