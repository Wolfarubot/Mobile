"""
Skill tree icon colours: every Hunter's two trees (base and Ascended) read as one colour scheme.

The ability packs (ab-*) each hold two classes, 50 icons apiece, and each half is drawn in exactly five colours (a dark
panel, a darker shade, two accents and a shared cream). Each Hunter has a home half (`home` in skill_sources.json). A
node whose icon (its source in `sources`) is from another half is redrawn in the home half's five colours: the source
half's colours, ranked by brightness, map to the home half's at the same rank, so dark stays dark and the cream art
stays cream. Results go to public/icons/skill/<tree>-<node>.png ("+" in an Ascended tree's name becomes "_asc").

Sources are each node's pick in skill_picks.json, else the icon it had (and the Ascend node, shared by everyone,
starts from Paladin 019). Run from the repo root:
    python3 tools/icons/skill_recolor.py
It rewrites the Hunter tree entries of src/core/nodeSprites.ts (monster evolution trees are left alone).
"""
import json, os, re
from collections import Counter
from PIL import Image

CFG = json.load(open('tools/icons/skill_sources.json'))
PICKS = json.load(open('tools/icons/skill_picks.json'))
OUT = 'public/icons/skill'


def half(key):
    pack, n = key.split('/')
    return f'{pack}:{1 if int(n) <= 50 else 2}'


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


_pal = {}


def palette(h):
    """A half's five colours, darkest first."""
    if h not in _pal:
        pack, part = h.split(':')
        c = Counter()
        for i in range(1, 51) if part == '1' else range(51, 101):
            im = Image.open(f'public/icons/{pack}/{i:03d}.png').convert('RGBA')
            c.update(p[:3] for p in im.get_flattened_data() if p[3] > 200)
        _pal[h] = sorted([k for k, _ in c.most_common(5)], key=lum)
    return _pal[h]


def recolor(src, home):
    a, b = palette(half(src)), palette(home)
    im = Image.open(f'public/icons/{src}.png').convert('RGBA')
    near = lambda c: min(range(len(a)), key=lambda i: sum((x - y) ** 2 for x, y in zip(c, a[i])))
    cache = {}
    out = []
    for p in im.get_flattened_data():
        if p[3] == 0:
            out.append(p)
            continue
        if p[:3] not in cache:
            cache[p[:3]] = b[near(p[:3])]
        out.append((*cache[p[:3]], p[3]))
    im.putdata(out)
    return im


def main():
    os.makedirs(OUT, exist_ok=True)
    home = CFG['home']
    sprites = {}
    for key in CFG['sources']:
        src = PICKS.get(key, CFG['sources'][key])
        tree = key.split('/')[0]
        h = home[tree.rstrip('+')]
        if half(src) == h:
            sprites[key] = src
        else:
            name = key.replace('+', '_asc').replace('/', '-')
            recolor(src, h).save(f'{OUT}/{name}.png')
            sprites[key] = f'skill/{name}'
    # Rewrite the Hunter tree entries of nodeSprites.ts, keeping everything else (monster trees) in place.
    path = 'src/core/nodeSprites.ts'
    ts = open(path).read()
    trees = {k.split('/')[0] for k in sprites}
    lines = [l for l in ts.split('\n') if not (m := re.match(r'\s*"([^"/]+)/', l)) or m.group(1) not in trees]
    end = max(i for i, l in enumerate(lines) if l.strip() == '};')
    body = [f'  "{k}": \'{v}\',' for k, v in sprites.items()]
    start = next(i for i, l in enumerate(lines) if l.startswith('export const NODE_SPRITES')) + 1
    lines[start:start] = body
    open(path, 'w').write('\n'.join(lines))
    print(len(sprites), 'nodes,', sum(v.startswith('skill/') for v in sprites.values()), 'recoloured')


main()
