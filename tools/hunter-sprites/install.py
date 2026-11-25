"""Lays every approved sheet out in the game's format and writes it to public/hunters/<id>.png: 64px frames, rows
down, left, right, up, each character's feet on the same line (y = 44) and centred across. Prints each sheet's
frames per row and bounding box for HUNTER_SHEETS (src/render/hunterSheets.ts).

Sheets that come from packs with no idle animation (the Guild Hall mages only have a spell cast) use the cast's calm
first frame, breathing: on frames 6-11 the upper body sits a pixel lower.
python -I install.py [preview.png]"""
import os
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(HERE, 'approved')
OUT = os.path.join(HERE, '..', '..', 'public', 'hunters')
F = 64
FEET = 44

# game id: (sheet, frame w, frame h, frames in the source rows, source row for down/left/right/up, how)
# how: 'anim' copies the frames; 'breathe' makes a 12-frame breathing idle from each row's first frame.
SHEETS = {
    'alchemist': ('andrejz.png', 64, 64, 12, (0, 1, 2, 3), 'anim'),
    'ranger': ('galladair.png', 64, 64, 12, (0, 1, 2, 3), 'anim'),
    'druid': ('deku.png', 64, 64, 12, (0, 1, 2, 3), 'anim'),
    'thief': ('alias.png', 64, 64, 12, (0, 1, 2, 3), 'anim'),
    'lance': ('lance.png', 64, 64, 12, (0, 1, 2, 3), 'anim'),
    'wilhelm': ('wilhelm.png', 64, 64, 12, (0, 1, 2, 3), 'anim'),
    'haunter': ('lilith.png', 64, 64, 12, (0, 1, 2, 3), 'anim'),
    'artificer': ('reginald.png', 64, 64, 12, (0, 1, 2, 3), 'anim'),
    'bloodblade': ('themus.png', 64, 64, 12, (0, 1, 2, 3), 'anim'),
    'bard': ('baal.png', 64, 64, 4, (0, 2, 3, 1), 'anim'),
    'lichlord': ('azir.png', 64, 64, 4, (0, 2, 3, 1), 'anim'),
    'blacksmith': ('kargesh.png', 48, 48, 6, (0, 1, 2, 3), 'anim'),
    'puppeteer': ('theon.png', 32, 32, 12, (0, 1, 2, 3), 'anim'),
    'gambler': ('ted.png', 32, 32, 12, (0, 1, 2, 3), 'anim'),
    'scavenger': ('sciirj.png', 32, 32, 12, (0, 1, 2, 3), 'anim'),
    'glimmer': ('glimmer.png', 64, 52, 7, (0, 2, 3, 1), 'breathe'),
    'archivist': ('thomas.png', 64, 52, 7, (0, 2, 3, 1), 'breathe'),
    'enchantress': ('marceline.png', 64, 52, 7, (0, 2, 3, 1), 'breathe'),
}


def frames_of(im, fw, fh, n, row):
    out = []
    for c in range(n):
        fr = im.crop((c * fw, row * fh, (c + 1) * fw, (row + 1) * fh))
        if fr.getbbox():
            out.append(fr)
    return out


def breathe(fr):
    """12 frames from one: the top 55% of the character a pixel lower on frames 6-11."""
    bb = fr.getbbox()
    cut = bb[1] + round((bb[3] - bb[1]) * 0.55)
    low = Image.new('RGBA', fr.size)
    low.alpha_composite(fr.crop((0, cut, fr.width, fr.height)), (0, cut))
    low.alpha_composite(fr.crop((0, 0, fr.width, cut)), (0, 1))
    return [fr] * 6 + [low] * 6


def clean(fr, keep=8):
    """Drops specks (the spell's sparkles): connected bits smaller than `keep` pixels."""
    px = fr.load()
    out = fr.copy()
    op = out.load()
    seen = set()
    for y in range(fr.height):
        for x in range(fr.width):
            if (x, y) in seen or not px[x, y][3]:
                continue
            comp, todo = [], [(x, y)]
            seen.add((x, y))
            while todo:
                cx, cy = todo.pop()
                comp.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < fr.width and 0 <= ny < fr.height and (nx, ny) not in seen and px[nx, ny][3]:
                            seen.add((nx, ny))
                            todo.append((nx, ny))
            if len(comp) < keep:
                for cx, cy in comp:
                    op[cx, cy] = (0, 0, 0, 0)
    return out


def centred(fr):
    """A frame moved into a 64px frame with the character's middle (median column) centred and feet on FEET."""
    px = fr.load()
    pts = [(x, y) for y in range(fr.height) for x in range(fr.width) if px[x, y][3]]
    xs = sorted(x for x, _ in pts)
    mx = xs[len(xs) // 2]
    bottom = max(y for x, y in pts if abs(x - mx) <= 6)
    out = Image.new('RGBA', (F, F))
    out.alpha_composite(fr, (F // 2 - mx, FEET - bottom)) if fr.width <= F else None
    return out


def install(gid):
    name, fw, fh, n, order, how = SHEETS[gid]
    im = Image.open(os.path.join(A, name)).convert('RGBA')
    rows = []
    for r in order:
        fs = frames_of(im, fw, fh, n, r)
        if how == 'breathe':
            fs = breathe(centred(clean(fs[0])))
        rows.append(fs)
    # One offset for the whole sheet: the down-facing first frame's feet on FEET, its middle on the frame's middle.
    bb = rows[0][0].getbbox()
    ox, oy = (0, 0) if how == 'breathe' else (F // 2 - (bb[0] + bb[2]) // 2, FEET - bb[3])
    width = max(len(r) for r in rows)
    sheet = Image.new('RGBA', (width * F, 4 * F))
    for ri, fs in enumerate(rows):
        for c, fr in enumerate(fs):
            sheet.alpha_composite(fr, (c * F + ox, ri * F + oy))
    # The box: every frame's pixels, in frame coordinates.
    box = None
    for ri, fs in enumerate(rows):
        for c in range(len(fs)):
            b = sheet.crop((c * F, ri * F, (c + 1) * F, (ri + 1) * F)).getbbox()
            if b:
                box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    sheet.save(os.path.join(OUT, f'{gid}.png'), optimize=True)
    return sheet, [len(r) for r in rows], [box[0], box[1], box[2] - box[0], box[3] - box[1]]


if __name__ == '__main__':
    done = {}
    for gid in SHEETS:
        sheet, counts, box = install(gid)
        done[gid] = sheet
        print(f"  {gid}: {{ frame: 64, frames: {counts}, box: {box} }},")
    if len(sys.argv) > 1:
        K = 4
        cell = 40
        prev = Image.new('RGBA', (4 * cell * K, len(done) * cell * K), (111, 127, 107, 255))
        for i, (gid, sh) in enumerate(done.items()):
            for r in range(4):
                fr = sh.crop((12, r * F + 6, 52, r * F + 46)).resize((cell * K, cell * K), Image.NEAREST)
                prev.alpha_composite(fr, (r * cell * K, i * cell * K))
        prev.save(sys.argv[1])
