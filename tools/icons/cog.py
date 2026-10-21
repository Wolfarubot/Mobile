"""
Draws the Settings cog (public/icons/custom/002.png): a 32x32 gear in the item packs' palette and style (dark brown
outline, warm grey metal lit from the top-left, a dark side edge for thickness), since none of the packs has one.
Run: python3 tools/icons/cog.py  (needs Pillow)
"""
import math
from pathlib import Path
from PIL import Image

OUT, MID, DARK, DEEP, HI, WARM = (0x2a,0x1d,0x0d), (0x92,0x7e,0x6a), (0x68,0x4c,0x3c), (0x39,0x2a,0x1c), (0xef,0xd8,0xa1), (0xef,0xb7,0x75)

def shape(teeth, ro, rb, rh, tooth, c, rot=0.0):
    def inside(x, y):
        dx, dy = x - c, y - c; r = math.hypot(dx, dy); a = math.atan2(dy, dx) + rot
        if r <= rh: return False
        if r <= rb: return True
        if r > ro: return False
        seg = 2 * math.pi / teeth
        d = abs(((a + seg / 2) % seg) - seg / 2)
        return d <= seg * tooth / 2 * (1 - 0.28 * (r - rb) / (ro - rb))
    return inside

def cog(teeth=8, ro=13.2, rb=10.0, rh=3.6, tooth=0.42, ring=6.4, depth=1, rot=0.0):
    N = 32; c = 15.0
    face = shape(teeth, ro, rb, rh, tooth, c, rot)
    F = [[face(x, y) for x in range(N)] for y in range(N)]
    # The cog's thickness: the face shifted down-right, seen as a dark side edge.
    S = [[any(0 <= y - k < N and 0 <= x - k < N and F[y - k][x - k] for k in range(1, depth + 1)) and not F[y][x] for x in range(N)] for y in range(N)]
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0)); px = img.load()
    def f(x, y): return 0 <= x < N and 0 <= y < N and F[y][x]
    def solid(x, y): return 0 <= x < N and 0 <= y < N and (F[y][x] or S[y][x])
    for y in range(N):
        for x in range(N):
            if S[y][x]:
                px[x, y] = DEEP + (255,)
                continue
            if not F[y][x]:
                if any(solid(x + i, y + j) for i, j in ((1,0),(-1,0),(0,1),(0,-1))): px[x, y] = OUT + (255,)
                continue
            dx, dy = x - c, y - c; r = math.hypot(dx, dy)
            hub = r <= rh + 1.8
            if not hub:
                # Lit from the top-left: the first pixel in from an up/left edge is bright, the next warm.
                if not f(x - 1, y) and not f(x, y - 1): col = WARM
                elif not f(x - 1, y) or not f(x, y - 1): col = HI
                elif not f(x + 1, y) or not f(x, y + 1): col = DARK
                else: col = MID
            else:
                # The axle hole's rim faces the other way: shaded top-left, lit bottom-right.
                if not f(x - 1, y) or not f(x, y - 1): col = DEEP
                elif not f(x + 1, y) or not f(x, y + 1): col = HI
                else: col = MID
            # A groove ring between hub and body: dark on its top-left half, a lit lip below it.
            if ring and abs(r - ring) < 0.55:
                col = DARK if (dx + dy) < 0 else DEEP
                if (dx + dy) > 4: col = DARK
            elif ring and abs(r - (ring + 1)) < 0.5 and (dx + dy) > 2 and col == MID:
                col = WARM
            px[x, y] = col + (255,)
    return img

if __name__ == '__main__':
    out = Path(__file__).resolve().parents[2] / 'public/icons/custom/002.png'
    cog(depth=2).save(out)
    print(out)
