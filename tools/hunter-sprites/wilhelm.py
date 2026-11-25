"""Wilhelm: the Training Arena's braided fighter (Fighter_sword4), sword removed; hair medium tan-brown, skin much
lighter, the shirt (above the belt) red and the trousers (below it) leather brown. The sheet is a sword attack:
64px frames, 6 per row, rows down, left, right, up; the first frame of each row is the calm stance.
python -I wilhelm.py"""
import sys
sys.path.insert(0, '.')
from kit import *

F = 64
SRC = P + 'arena/PNG/Characters/Figters_sword/Without_shadow/Fighter_sword4_without_shadow.png'
SWORD = {(43, 41, 68), (103, 132, 182), (107, 155, 204), (91, 107, 152), (76, 83, 119)}
HAIR = {(153, 67, 29): (184, 138, 92), (140, 56, 31): (166, 120, 78), (122, 42, 27): (144, 102, 66),
        (105, 31, 22): (122, 84, 54), (84, 21, 20): (100, 68, 44), (69, 20, 22): (66, 44, 32)}
SKIN = {(206, 143, 104): (250, 214, 184), (188, 124, 99): (234, 188, 160), (157, 102, 82): (204, 156, 132),
        (120, 80, 72): (164, 118, 106), (98, 64, 63): (140, 100, 92)}
# The tunic's greens (outline to highlight), as a red shirt above the belt and leather-brown trousers below it.
SHIRT = {(39, 50, 24): (70, 18, 22), (55, 73, 31): (96, 22, 28), (79, 97, 38): (124, 28, 32),
         (95, 109, 40): (150, 34, 36), (113, 120, 44): (176, 44, 42), (138, 134, 45): (204, 62, 52)}
PANTS = {(39, 50, 24): (52, 32, 22), (55, 73, 31): (80, 50, 32), (79, 97, 38): (100, 64, 40),
         (95, 109, 40): (118, 76, 46), (113, 120, 44): (136, 90, 54), (138, 134, 45): (156, 106, 64)}
BELT = {(36, 32, 56), (36, 39, 64), (24, 21, 38)}


def build():
    im = Image.open(SRC).convert('RGBA')
    px = im.load()
    for row in range(im.height // F):
        for col in range(im.width // F):
            x0, y0 = col * F, row * F
            belt = next((y for y in range(y0, y0 + F) if any(px[x, y][3] and px[x, y][:3] in BELT for x in range(x0, x0 + F))), y0 + F)
            for y in range(y0, y0 + F):
                for x in range(x0, x0 + F):
                    c = px[x, y]
                    if not c[3]:
                        continue
                    k = c[:3]
                    if k in SWORD:
                        px[x, y] = (0, 0, 0, 0)
                    elif k in HAIR:
                        px[x, y] = HAIR[k] + (c[3],)
                    elif k in SKIN:
                        px[x, y] = SKIN[k] + (c[3],)
                    elif k in SHIRT:
                        px[x, y] = (SHIRT if y < belt else PANTS)[k] + (c[3],)
    return im


if __name__ == '__main__':
    w = build()
    w.save('out/wilhelm-sheet.png')
    o = Image.open(SRC).convert('RGBA')
    from PIL import ImageDraw
    K = 6
    z = Image.new('RGBA', (8 * 32, 40), (111, 127, 107, 255))
    for r in range(4):
        z.alpha_composite(o.crop((16, r * F + 14, 48, r * F + 50)), (r * 64, 4))
        z.alpha_composite(w.crop((16, r * F + 14, 48, r * F + 50)), (r * 64 + 32, 4))
    z = z.resize((z.width * K, z.height * K), Image.NEAREST)
    d = ImageDraw.Draw(z)
    for r, n in enumerate(('down', 'left', 'right', 'up')):
        d.text((r * 64 * K + 12, 4), 'pack', fill='#fff', font=FONT)
        d.text((r * 64 * K + 32 * K + 12, 4), f'Wilhelm, {n}', fill='#ffe36b', font=FONT)
    z.save('wilhelm-zoom.png')
    # Every frame, to check the sword is gone throughout.
    a = Image.new('RGBA', w.size, (111, 127, 107, 255))
    a.alpha_composite(w)
    a.resize((a.width * 2, a.height * 2), Image.NEAREST).save('wilhelm-all.png')
    print('ok')


def idle_sheet(sheet):
    """The game's layout: 12 idle frames per row (down, left, right, up), from the calm first frame of each row; on
    frames 6-11 everything above the belt (head and shirt) sits one pixel lower, a slow breath."""
    out = Image.new('RGBA', (12 * F, 4 * F))
    for r in range(4):
        base = sheet.crop((0, r * F, F, (r + 1) * F))
        bp = base.load()
        belt = next((y for y in range(F) if any(bp[x, y][3] and bp[x, y][:3] in {(36, 32, 56), (36, 39, 64), (24, 21, 38)} for x in range(F))), F)
        low = base.copy()
        upper = base.crop((0, 0, F, belt))
        lp = low.load()
        for y in range(belt):
            for x in range(F):
                lp[x, y] = (0, 0, 0, 0)
        low.alpha_composite(upper, (0, 1))
        for f in range(12):
            out.alpha_composite(low if f >= 6 else base, (f * F, r * F))
    return out


def gif(sheet, path, K=6):
    frames = []
    for f in range(12):
        z = Image.new('RGBA', (4 * 36, 40), (111, 127, 107, 255))
        for r in range(4):
            z.alpha_composite(sheet.crop((f * F + 14, r * F + 12, f * F + 50, r * F + 52)), (r * 36, 0))
        frames.append(z.resize((z.width * K, z.height * K), Image.NEAREST).convert('P', palette=Image.ADAPTIVE))
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=125, loop=0)


if __name__ == '__main__':
    idle = idle_sheet(Image.open('out/wilhelm-sheet.png'))
    idle.save('out/wilhelm.png')
    gif(idle, 'wilhelm-idle.gif')
