"""Azir (golden lich), Thomas (witch-hat mage), Marceline (wide-hat wizard in black with purple accents and very dark
purple hair), Kargesh (the blacksmith, hair white), Ted (freckled farmhand), Sciirj (red-haired caped fighter).
Each sheet in its own pack's layout; ORDER gives its rows for the game's down, left, right, up. python -I batch3.py"""
import sys
sys.path.insert(0, '.')
from kit import *

SHEETS = {
    'azir': ('lich/PNG/Lich3/Without_shadow/Lich3_Idle_without_shadow.png', 64, 64, (0, 2, 3, 1)),
    'thomas': ('guild/PNG/Mage1_without_shadow.png', 64, 52, (0, 2, 3, 1)),
    'marceline': ('guild/PNG/Mage3_without_shadow.png', 64, 52, (0, 2, 3, 1)),
    'kargesh': ('smith/PNG/Smith/Idle_Walk/Smith_idle_without_shadow.png', 48, 48, (0, 1, 2, 3)),
    'ted': ('market/PNG/Characters/Character_citizens_animation/Without_shadow/Citizen4_Idle_without_shadow.png', 32, 32, (0, 1, 2, 3)),
    'sciirj': ('guild/PNG/Fighter2_Idle_without_shadow.png', 32, 32, (0, 1, 2, 3)),
}

# Marceline: the hat and robe's blues to black (darkest to lightest), the pale-yellow accents to purple, her dark
# brown hair to a very dark purple.
MARCELINE = {
    (35, 28, 59): (18, 16, 22), (38, 35, 76): (28, 26, 34), (41, 36, 80): (28, 26, 34), (41, 41, 93): (36, 34, 44),
    (49, 56, 116): (46, 44, 56), (53, 72, 135): (58, 56, 70), (57, 89, 150): (70, 68, 84), (77, 102, 156): (80, 78, 96),
    (59, 108, 159): (82, 80, 98), (60, 128, 172): (96, 94, 114),
    (224, 225, 149): (186, 120, 230), (210, 200, 129): (160, 96, 206), (190, 171, 111): (130, 74, 176),
    (172, 142, 94): (146, 84, 192), (158, 123, 84): (124, 70, 168), (84, 56, 37): (60, 32, 80),
    (102, 62, 54): (74, 48, 92), (85, 50, 46): (58, 36, 74), (58, 37, 34): (44, 26, 58), (46, 28, 26): (34, 20, 46),
    (33, 21, 21): (22, 13, 30),
}
# Kargesh: his dark red hair and beard to white (outline to highlight).
KARGESH = {(51, 24, 38): (92, 90, 102), (64, 28, 42): (142, 142, 154), (68, 30, 43): (160, 160, 172),
           (81, 34, 47): (184, 184, 194), (93, 37, 48): (204, 204, 212), (119, 38, 47): (236, 236, 240)}
RECOLOUR = {'marceline': MARCELINE, 'kargesh': KARGESH}


def build(name):
    f, fw, fh, order = SHEETS[name]
    im = Image.open(P + f).convert('RGBA')
    table = RECOLOUR.get(name)
    if table:
        px = im.load()
        for y in range(im.height):
            for x in range(im.width):
                c = px[x, y]
                if c[3] and c[:3] in table:
                    px[x, y] = table[c[:3]] + (c[3],)
    return im


if __name__ == '__main__':
    cards = []
    labels = {'azir': 'Azir: golden lich, as drawn', 'thomas': 'Thomas: witch-hat mage, as drawn',
              'marceline': 'Marceline: wide-hat wizard, black + purple', 'kargesh': 'Kargesh: the blacksmith, white hair',
              'ted': 'Ted: freckled farmhand, as drawn', 'sciirj': 'Sciirj: red-haired caped fighter, as drawn'}
    for name in SHEETS:
        im = build(name)
        im.save(f'out/{name}.png')
        f, fw, fh, order = SHEETS[name]
        orig = Image.open(P + f).convert('RGBA')
        cards.append(card(labels[name], 'facing down, left, right, up', [im.crop((0, r * fh, fw, (r + 1) * fh)) for r in order], K=5))
        if name in RECOLOUR:
            cards.append(card('  (as in the pack)', '', [orig.crop((0, r * fh, fw, (r + 1) * fh)) for r in order], K=5))
    print(grid(cards, 2, 'batch3.png'))
