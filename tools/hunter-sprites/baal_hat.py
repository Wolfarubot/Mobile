"""Ba'al as the whole copper lizardman wearing Archer 6's feathered hat (the hat alone: crown, feather and brim).
python -I baal_hat.py"""
import sys
sys.path.insert(0, '.')
from kit import *
from baal import copper, LROW, L, F

# The hat's own colours on Archer 6's head (crown, feather, brim and band); the face and hair are left behind.
HAT = {(47, 36, 73), (182, 42, 181), (205, 38, 174), (25, 23, 29), (98, 45, 136), (42, 45, 57), (52, 59, 74),
       (56, 67, 82), (125, 44, 150), (80, 43, 126), (31, 30, 38), (70, 41, 113), (72, 25, 22), (37, 38, 48),
       (138, 59, 38), (94, 30, 28), (162, 77, 41), (174, 91, 39)}


def hat_only(im):
    im = im.copy()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            c = px[x, y]
            if c[3] and c[:3] not in HAT:
                px[x, y] = (0, 0, 0, 0)
    return im


def brim_row(piece):
    """The hat's lowest row (the brim) inside its trimmed frame."""
    return piece.height - 1


def dress(lbody, lhead, hats, sink=6, side_in=7):
    """Puts the hat on the lizardman's head, frame by frame. sink: rows of head under the brim."""
    out = Image.new('RGBA', lbody.size)
    headl = lhead.copy()
    hatl = Image.new('RGBA', lbody.size)
    for game_row in range(4):
        lr = LROW[game_row]
        hf = hats.crop((0, game_row * F, F, (game_row + 1) * F))
        hb = hf.getbbox()
        if not hb:
            continue
        hat = hf.crop(hb)
        for col in range(lbody.width // F):
            fb = lhead.crop((col * F, lr * F, (col + 1) * F, (lr + 1) * F)).getbbox()
            if not fb:
                continue
            x0, y0 = col * F, lr * F
            top = fb[1]
            if game_row in (0, 3):
                cx = (fb[0] + fb[2]) // 2
            elif game_row == 1:  # facing left: snout to the left, the skull on the right
                cx = fb[2] - side_in
            else:
                cx = fb[0] + side_in
            # Line the hat's crown (not the feather) up over the skull: centre on the brim's middle.
            # Per-direction nudges (pixels right, down): facing down, left, right, up.
            ndx, ndy = {0: (1, 4), 1: (0, 2), 2: (0, 2), 3: (0, 4)}[game_row]
            hx = x0 + cx - hat.width // 2 + ndx
            hy = y0 + top + sink - hat.height + ndy
            hatl.alpha_composite(hat, (hx, hy))
            # Anything of the head poking up through the hat (the crest's spikes) goes.
            hp, lp = hatl.load(), headl.load()
            for x in range(hx, hx + hat.width):
                ys = [y for y in range(hy, hy + hat.height) if hp[x, y][3]]
                if ys:
                    for y in range(y0, min(ys)):
                        lp[x, y] = (0, 0, 0, 0)
    out = stack(lbody, headl, hatl)
    # Facing down: close the 1-pixel notch either side between the brim and the head's outline, in the head's own
    # outline colour, so the side of the head runs straight up into the brim.
    EDGE = (52, 24, 20, 255)
    px = out.load()
    y0, y1 = LROW[0] * F, (LROW[0] + 1) * F
    filled = []
    for y in range(y0 + 1, y1 - 1):
        for x in range(out.width):
            if px[x, y][3] == 0 and px[x, y + 1] == EDGE and px[x, y - 1][3] and px[x, y - 1][:3] in HAT:
                filled.append((x, y))
    for x, y in filled:
        px[x, y] = EDGE
    print('filled', len(filled), 'pixels')
    return out


if __name__ == '__main__':
    hats = hat_only(head('A', 6))
    cards = []
    for n, suf, kind, label in ((2, '__', 'L2', 'crested'),):
        lb = copper(Image.open(L + f'Lizardman{n}_Idle{suf}body.png').convert('RGBA'), kind)
        lh = copper(Image.open(L + f'Lizardman{n}_Idle{suf}head.png').convert('RGBA'), kind)
        full = dress(lb, lh, hats)
        full.save(f'out/baal-hat-{label}.png')
        rows = [full.crop((0, LROW[r] * F, F, (LROW[r] + 1) * F)) for r in range(4)]
        cards.append(card(f"Ba'al: {label} lizardman + Archer 6 hat", 'copper, turquoise eyes, no sword', rows, K=5))
    print(grid(cards, 1, 'baal-hat.png'))
