# Hunter sprites

Scripts that build the new hunter sprites from the CraftPix packs (the packs themselves aren't in the repo; `kit.py`'s
`P` points at where they were unpacked), the approved sheets in `approved/`, and `install.py`, which lays them out
in the game's format (64px frames; rows down, left, right, up; feet on one line) as `public/hunters/<id>.png` and
prints each one's `HUNTER_SHEETS` entry.

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
| Azir | Lich 3 (golden lich), as drawn | `batch3.py` |
| Thomas | Guild Hall witch-hat mage (Mage 1), as drawn | `batch3.py` |
| Marceline | Guild Hall wide-hat wizard (Mage 3): black with purple accents, very dark purple hair | `batch3.py` |
| Kargesh | Blacksmith pack's smith, hair and beard white | `batch3.py` |
| Ted | Market Square freckled farmhand (Citizen 4), as drawn | `batch3.py` |
| Sciirj | Guild Hall red-haired caped fighter (Fighter 2), as drawn | `batch3.py` |
| Lilith | Swordsman 8: purple trim, blue cape, dark purple plume | `batch4.py` |
| Reginald | Swordsman 9 body, Swordsman 4 head with the helmet in Swordsman 9's navy and pale blue (option A) | `batch4.py` |
| Themus | Training Arena red-tunic fighter's head (Fighter_sword1) on Swordsman 6's body | `batch4.py` |

Some approved sheets are in their packs' own layouts (frame sizes and row orders are listed in `install.py`). The
Guild Hall mages (Glimmer, Thomas, Marceline) only come with a spell cast, so their idle is the cast's calm first
frame, breathing.
