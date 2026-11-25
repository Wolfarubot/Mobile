# Hunter sprite rework (in progress)

Scripts that build the new hunter sprites from the CraftPix packs (the packs themselves aren't in the repo; `kit.py`'s
`P` points at where they were unpacked), and the sheets approved so far, before they're converted into the game's
`public/hunters/` format.

| Hunter | Built from | Script |
| --- | --- | --- |
| Andrejz | Archer 2 head (grey-white hair, fair skin), Swordsman 6 body (steel as leather) | `batch2.py` |
| Galladair | Current head (Mage 3, light-blue skin), Archer 6 body | `batch2.py` |
| Glimmer | Guild Hall Ember mage: crimson skin, flame-coloured hair (option D) | `glimmer.py 356 out.png notips` |
| Deku | Mage 6 without the cape, robe in the hood's greens, a turtle shell on the back | `deku4.py` |
| Ba'al | Crested lizardman in copper, Archer 6's hat, lute 011 on the back | `baal_lute.py 3` |
| Lance | Archer 9 as drawn, the red plumes removed from the shoulder pads up (the cape kept) | `lance.py` |
| Theon | Market Square's red-haired woman (Citizen 5), hair purplish black (32px frames) | `theon.py` |
| Wilhelm | Arena braided fighter's head (tan-brown hair, light skin) lined up in place of Archer 3's head, Archer 3's hat on top; Archer 3 body with a red cowl, tan shirt, leather trousers | `wilhelm.py`, then `wilhelm3.py` |
| Alias | Archer 7: red cloak and armour, black mask and trousers, brown tuft, lighter skin, white trim | `alias.py` |

Glimmer's and Ba'al's sheets are in their packs' own layouts (Glimmer: 64x52 frames, rows down/up/right/left;
Ba'al: 64px frames, rows down/up/left/right); they're re-laid into the game's layout when installed.
