"""Ba'al with lute 011 slung on his back: as drawn from behind (between his body and head), mirrored and darkened
(its back, no sound hole) facing down, and edge-on behind him from the sides. python -I baal_lute.py"""
import sys
sys.path.insert(0, '.')
from kit import *
from baal import copper, LROW, L, F
import baal_hat

LUTE = Image.open('/home/user/Mobile/public/icons/instruments/011.png').convert('RGBA')
LUTE = LUTE.crop(LUTE.getbbox())


def shade(im, k):
    im = im.copy()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            c = px[x, y]
            if c[3]:
                px[x, y] = (int(c[0] * k), int(c[1] * k), int(c[2] * k), c[3])
    return im


def back_side(im):
    """The lute's back: the soundboard details (sound hole, strings, frets) become plain wood, and it's darker."""
    WOOD = (165, 98, 67)
    im = im.copy()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            c = px[x, y]
            if c[3] and c[:3] in {(57, 42, 28), (146, 126, 106)}:
                px[x, y] = WOOD + (c[3],)
    return shade(im, 0.72)


def edge_on(im, width):
    """Turned upright (neck straight up) and squeezed to its edge-on width."""
    up = im.rotate(45, resample=Image.NEAREST, expand=True)
    up = up.crop(up.getbbox())
    return up.resize((width, up.height), Image.NEAREST)


FRONT = back_side(LUTE).transpose(Image.FLIP_LEFT_RIGHT)
# Edge-on from the side (facing right: the bowl bulges out to the left, the flat soundboard edge against his back),
# drawn in the lute's own colours: a outline, e wood, d the soundboard's bright edge, b dark wood, c tuning pegs.
SIDE_PATTERN = """
...aac
..acba
....ab
....ab
....ab
....ab
....ab
....ab
....ab
....ab
...aed
..aeed
.aeeed
.aeeed
aeeeed
aeeeed
aeeeed
aebeed
.aeeed
.aebed
..aeed
...aad
....a.
"""
LUTE_COLS = {'a': (42, 29, 13), 'e': (165, 98, 67), 'd': (239, 183, 117), 'b': (104, 76, 60), 'c': (146, 126, 106)}


def side_lute():
    rows = SIDE_PATTERN.strip('\n').split('\n')
    im = Image.new('RGBA', (max(len(r) for r in rows), len(rows)))
    px = im.load()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != '.':
                px[x, y] = LUTE_COLS[ch] + (255,)
    return shade(im, 0.88)


SIDE = side_lute()


RIGHT_OUT = int(sys.argv[1]) if len(sys.argv) > 1 else 3


def pixel_shrink(im, scale):
    """Shrinks pixel art cleanly: a smooth downscale, every pixel snapped back to the sprite's own colours, and the
    dark outline redrawn round the new silhouette."""
    if scale == 1:
        return im
    pal = sorted({c[:3] for c in im.getdata() if c[3]})
    w, h = round(im.width * scale), round(im.height * scale)
    small = im.resize((w, h), Image.LANCZOS)
    out = Image.new('RGBA', (w, h))
    sp, op = small.load(), out.load()
    dark = min(pal, key=lambda c: sum(c))
    for y in range(h):
        for x in range(w):
            c = sp[x, y]
            if c[3] < 110:
                continue
            best = min(pal, key=lambda p: (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2)
            op[x, y] = best + (255,)
    # The outline: any filled pixel on the edge becomes the outline colour.
    edge = []
    for y in range(h):
        for x in range(w):
            if op[x, y][3] and any(not (0 <= x + dx < w and 0 <= y + dy < h) or op[x + dx, y + dy][3] == 0 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                edge.append((x, y))
    for x, y in edge:
        op[x, y] = dark + (255,)
    return out


def build(scale=1.0, front_at=(0, 0), back_at=(0, 0), side_at=(0, 0)):
    lute = pixel_shrink(LUTE, scale)
    front = back_side(lute).transpose(Image.FLIP_LEFT_RIGHT)
    side = SIDE  # the sides keep the full-size, hand-drawn lute
    hats = baal_hat.hat_only(head('A', 6))
    lb = copper(Image.open(L + 'Lizardman2_Idle__body.png').convert('RGBA'), 'L2')
    lh = copper(Image.open(L + 'Lizardman2_Idle__head.png').convert('RGBA'), 'L2')
    dressed = baal_hat.dress(lb, lh, hats)  # body + head + hat, as approved
    behind = Image.new('RGBA', lb.size)
    between = Image.new('RGBA', lb.size)
    for game_row in range(4):
        lr = LROW[game_row]
        for col in range(lb.width // F):
            bb = lb.crop((col * F, lr * F, (col + 1) * F, (lr + 1) * F)).getbbox()
            if not bb:
                continue
            x0, y0 = col * F, lr * F
            cx = (bb[0] + bb[2]) // 2
            if game_row == 3:  # from behind: across his back, the bowl low on his left, neck up past his right
                dx, dy = back_at
                between.alpha_composite(lute, (x0 + cx - lute.width // 2 + dx, y0 + bb[1] + 8 - lute.height // 2 + dy))
            elif game_row == 0:  # facing down: mirrored, its back to us, behind him
                dx, dy = front_at
                behind.alpha_composite(front, (x0 + cx - front.width // 2 + dx, y0 + bb[1] + 8 - front.height // 2 + dy))
            else:  # from the sides: upright and edge-on, behind his back
                dx, dy = side_at
                # Tucked so the flat soundboard edge sits just inside his back at chest height.
                fr = lb.crop((x0, y0, x0 + F, y0 + F))
                ap = fr.getchannel('A').load()
                ty = bb[1] + 8
                xs = [x for x in range(F) if ap[x, ty]]
                if game_row == 1:  # facing left: the back is on the right; the lute mirrored
                    piece = side.transpose(Image.FLIP_LEFT_RIGHT)
                    x = x0 + max(xs) - 1 + dx
                else:
                    piece = side
                    x = x0 + min(xs) + 1 - piece.width - dx + 1 - RIGHT_OUT
                behind.alpha_composite(piece, (x, y0 + bb[1] + 2 - piece.height // 2 + dy))
    # From behind, the lute goes over the body but under the head and hat.
    out = stack(behind, lb)
    out.alpha_composite(between)
    head_hat = dressed.copy()
    # Re-lay the head and hat over the lute: the dressed sheet minus the body.
    px, bp = head_hat.load(), lb.load()
    for y in range(head_hat.height):
        for x in range(head_hat.width):
            if px[x, y] == bp[x, y]:
                px[x, y] = (0, 0, 0, 0)
    out.alpha_composite(head_hat)
    return out


def preview(sheet, path, K=6):
    from PIL import ImageDraw
    z = Image.new('RGBA', (4 * 56, 68), (111, 127, 107, 255))
    for i in range(4):
        r = LROW[i]
        z.alpha_composite(sheet.crop((4, r * F, 60, r * F + 60)), (i * 56, 8))
    z = z.resize((z.width * K, z.height * K), Image.NEAREST)
    d = ImageDraw.Draw(z)
    for i, n in enumerate(('facing down', 'facing left', 'facing right', 'facing up')):
        d.text((i * 56 * K + 110, 4), n, fill='#fff', font=FONT)
    z.save(path)


if __name__ == '__main__':
    full = build()
    full.save('out/baal-lute.png')
    preview(full, 'baal-lute.png')
    # Chosen: 80% facing up and down (facing up moved 3 pixels right); full size from the sides, 2 pixels lower and
    # 3 pixels closer to his back.
    final = build(scale=0.8, back_at=(3, 0), side_at=(-3, 2))
    final.save('out/baal-final.png')
    preview(final, 'baal-final.png')
    print('ok')
