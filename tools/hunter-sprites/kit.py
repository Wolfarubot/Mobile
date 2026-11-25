"""Hunter sprite kit: loads base-pack heads and bodies and other packs' sheets, recolours by hue band, composes
sheets in the game's layout (64px frames; rows down, left, right, up), and draws preview cards."""
import colorsys, os
from PIL import Image, ImageDraw, ImageFont

P = '/tmp/claude-0/-home-user-Mobile/020ef0c1-3030-542e-903e-7e6a7d954cd3/scratchpad/packs/'
FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 20)
FONT_S = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 16)


def part_paths(kind, n):
    """(body, head) for Swordsman (S), Mage (M) or Archer (A) level n's idle."""
    if kind == 'S':
        if n <= 3:
            pre = f'sw13/Tiled_files/Swordsman{n}/Swordsman_lvl{n}_Idle_'
        elif n <= 6:
            pre = f'sw46/Tiled_files/Swordsman_lvl{n}/lvl{n}_Idle_'
        else:
            pre = f'sw79/Tiled_files/Swordsman_lvl{n}/lvl{n}_Idle_'
        return P + pre + 'body.png', P + pre + 'head.png'
    if kind == 'M':
        pk = 'mg13' if n <= 3 else 'mg46' if n <= 6 else 'mg79'
        pre = f'{pk}/PNG/Mage_{n}lvl/Parts/Mage_{n}lvl_Idle/Mage_lvl{n}_Idle_'
        return P + pre + 'body.png', P + pre + 'head.png'
    if n <= 3:
        d = {1: 'Archer_Lvl1', 2: 'Archer_Lvl2', 3: 'Archer_lvl3'}[n]
        base = f'ar13/PNG/{d}/Parts/Archer_lvl{n}_Idle/'
        return P + base + f'0_0002_Archer_lvl{n}_Idle_body.png', P + base + f'0_0001_Archer_lvl{n}_Idle_head.png'
    m = {4: 'ar46/PNG/Archer_Lvl4/Parts/Archer_lvl4_Idle/lvl4_Idle_', 5: 'ar46/PNG/Archer_Lvl5/Parts/Archer_lvl5_Idle/lvl5_Idle_',
         6: 'ar46/PNG/Archer_Lvl6/Parts/Archer_lvl6_Idle/Archer_lvl6_Idle_', 7: 'ar79/PNG/Archer_Lvl7/Parts/Archer_lvl7_Idle/Archer_lvl7_Idle_',
         8: 'ar79/PNG/Archer_Lvl8/Parts/Archer_lv8_Idle/Archer_lvl8_Idle_', 9: 'ar79/PNG/Archer_Lvl9/Parts/Archer_lv9_Idle/Archer_lvl9_Idle_'}
    return P + m[n] + 'body.png', P + m[n] + 'head.png'


def body(kind, n):
    return Image.open(part_paths(kind, n)[0]).convert('RGBA')


def head(kind, n):
    return Image.open(part_paths(kind, n)[1]).convert('RGBA')


def stack(*layers):
    out = layers[0].copy()
    for l in layers[1:]:
        out.alpha_composite(l)
    return out


def hsv(c):
    h, s, v = colorsys.rgb_to_hsv(c[0] / 255, c[1] / 255, c[2] / 255)
    return h * 360, s, v


def recolor(im, sel, fn):
    """Recolours every pixel whose (hue, sat, val) passes sel with fn(h, s, v) -> (h, s, v)."""
    im = im.copy()
    px = im.load()
    cache = {}
    for y in range(im.height):
        for x in range(im.width):
            c = px[x, y]
            if c[3] == 0:
                continue
            key = c[:3]
            if key not in cache:
                h, s, v = hsv(key)
                if sel(h, s, v):
                    nh, ns, nv = fn(h, s, v)
                    r, g, b = colorsys.hsv_to_rgb((nh % 360) / 360, max(0, min(1, ns)), max(0, min(1, nv)))
                    cache[key] = (round(r * 255), round(g * 255), round(b * 255))
                else:
                    cache[key] = None
            if cache[key]:
                px[x, y] = cache[key] + (c[3],)
    return im


def palette(im, n=40):
    cols = im.getcolors(1 << 20) or []
    cols = [(cnt, c) for cnt, c in cols if c[3] > 0]
    cols.sort(reverse=True)
    return [(cnt, c[:3], tuple(round(x, 2) for x in hsv(c[:3]))) for cnt, c in cols[:n]]


def frame(sheet, row, col=0, F=64):
    return sheet.crop((col * F, row * F, (col + 1) * F, (row + 1) * F))


def card(title, sub, sheet, F=64, K=4, rows=(0, 1, 2, 3), w=None):
    """A preview: the title, a subtitle and the first frame of each facing, at K times."""
    cw = 34 * K
    w = w or 4 * cw + 16
    h = 40 * K + 70
    c = Image.new('RGB', (w, h), '#6f7f6b')
    d = ImageDraw.Draw(c)
    d.text((8, 6), title, fill='#fff', font=FONT)
    d.text((8, 32), sub, fill='#e8f0c0', font=FONT_S)
    for i, r in enumerate(rows):
        fr = sheet.crop((0, r * F, F, (r + 1) * F)) if isinstance(sheet, Image.Image) else sheet[i]
        bb = fr.getbbox()
        if not bb:
            continue
        fr = fr.crop(bb)
        k = min(K, (cw - 4) / fr.width, (38 * K) / fr.height)
        fr = fr.resize((max(1, int(fr.width * k)), max(1, int(fr.height * k))), Image.NEAREST)
        c.paste(fr, (8 + i * cw + (cw - fr.width) // 2, h - 8 - fr.height), fr)
    return c


def grid(cards, cols, out):
    w = max(c.width for c in cards)
    h = max(c.height for c in cards)
    rows = (len(cards) + cols - 1) // cols
    s = Image.new('RGB', (cols * w, rows * h), '#5d6b59')
    for i, c in enumerate(cards):
        s.paste(c, ((i % cols) * w, (i // cols) * h))
    s.save(out)
    return s.size
