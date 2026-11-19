"""
Evolution-tree icon colours: each monster's tree should read as one colour family. The node icons come from several
ability packs, each a dark coloured panel behind bright art, so a tree can mix red, navy and green panels.

For every monster: the panel hue most of its icons share (the dark, saturated pixels; or the monster's own colour
when no hue has 40% of them) is the tree's colour. An icon with less than 60% of its panel near that hue has its
panel retinted to it (brightness kept), along with art in the old panel's colour (red rims on a red panel). Then any
icon's bright accents far from the tree's colour (a purple hexagram on a red tree) take it too; gold and orange
(treasure) are left alone. Results go to public/icons/evo/<monster>-<node>.png, and src/core/nodeSprites.ts points
those nodes there.

Sources (the pack icon each node used before) are in evo_sources.json. Run from the repo root:
    python3 tools/icons/evo_recolor.py
then point the listed nodes at evo/<monster>-<node> in nodeSprites.ts (unchanged nodes keep their pack icon).
"""
import colorsys, json, math, os, re
from collections import Counter
from PIL import Image

SRC = json.load(open('tools/icons/evo_sources.json'))
OUT = os.environ.get('EVO_OUT', 'public/icons/evo')
TOL = 35 / 360


def hdist(a, b):
    d = abs(a - b) % 1
    return min(d, 1 - d)


def pixels(key):
    im = Image.open(f'public/icons/{key}.png').convert('RGBA')
    return im, [(*colorsys.rgb_to_hsv(r / 255, g / 255, b / 255), a) for r, g, b, a in im.getdata()]


def panel(hsv):
    """The most common hue among the dark, saturated (panel) pixels, or None."""
    bins, hues = Counter(), {}
    for h, s, v, a in hsv:
        if a < 128 or s < 0.25 or v < 0.06 or v > 0.55:
            continue
        k = int(h * 24) % 24
        bins[k] += 1
        hues.setdefault(k, []).append(h)
    if not bins or bins.most_common(1)[0][1] < 40:
        return None
    L = hues[bins.most_common(1)[0][0]]
    return (math.atan2(sum(math.sin(h * 2 * math.pi) for h in L), sum(math.cos(h * 2 * math.pi) for h in L)) / (2 * math.pi)) % 1


def stray(h, s, v, target):
    return s > 0.35 and v > 0.55 and not (20 / 360 <= h <= 60 / 360) and hdist(h, target) > 60 / 360


def main():
    bal = open('src/core/balance.ts').read()
    colors = dict(re.findall(r"\{ id: '([A-Za-z0-9]+)', name: '[^']*', area: '[^']*'.*?color: '(#[0-9a-fA-F]{6})'", bal))
    trees = {}
    for ref, key in SRC.items():
        m, node = ref.split('/')
        trees.setdefault(m, []).append((node, key))
    os.makedirs(OUT, exist_ok=True)
    done = 0
    for m, nodes in trees.items():
        info = {node: (key, *pixels(key)) for node, key in nodes}
        hues = {node: panel(hsv) for node, (key, im, hsv) in info.items()}
        hs = [h for h in hues.values() if h is not None]
        if not hs:
            continue
        best = max(((sum(hdist(h, c) <= 25 / 360 for h in hs), c) for c in hs))
        group = [h for h in hs if hdist(h, best[1]) <= 25 / 360]
        target = (math.atan2(sum(math.sin(h * 2 * math.pi) for h in group), sum(math.cos(h * 2 * math.pi) for h in group)) / (2 * math.pi)) % 1
        if best[0] < 0.4 * len(hs) and m in colors:
            h, s, v = colorsys.rgb_to_hsv(*[int(colors[m][i:i + 2], 16) / 255 for i in (1, 3, 5)])
            if s > 0.25:
                target = h
        for node, (key, im, hsv) in info.items():
            h0 = hues[node]
            dark = [(h, s, v) for h, s, v, a in hsv if a >= 128 and s >= 0.25 and 0.06 <= v <= 0.55]
            outlier = h0 is not None and len(dark) >= 40 and sum(hdist(h, target) <= TOL for h, s, v in dark) / len(dark) < 0.6
            accents = sum(1 for h, s, v, a in hsv if a >= 128 and stray(h, s, v, target)) >= 25
            if not outlier and not accents:
                continue
            px = im.load()
            W, H = im.size
            for y in range(H):
                for x in range(W):
                    r, g, b, a = px[x, y]
                    if a == 0:
                        continue
                    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
                    if s < 0.2:
                        continue
                    if outlier and v <= 0.55:
                        nh = target
                    elif outlier and hdist(h, h0) <= 25 / 360:
                        nh = (h + target - h0) % 1
                    elif stray(h, s, v, target):
                        nh = target
                    else:
                        continue
                    r2, g2, b2 = colorsys.hsv_to_rgb(nh, s, v)
                    px[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
            im.save(f'{OUT}/{m}-{node}.png', optimize=True)
            print(f'evo:{m}/{node}')
            done += 1
    print(done, 'recoloured')


if __name__ == '__main__':
    main()
