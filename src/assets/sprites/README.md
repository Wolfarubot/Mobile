# Sprites

Drop artwork here and it replaces the placeholder shapes automatically on the next build
(`npm run dev` picks it up after a refresh). No code changes needed.

| File | Used for |
|---|---|
| `hunter.png` | Your main Hunter in the middle of the field, and the art on your Hunter card |
| `hunters/<id>.png` | A recruited Hunter fighting beside you, and the art on their Guild card and full view |
| `enemies/<id>.png` | A regular enemy |
| `bosses/<id>.png` | That enemy as an area Guardian (optional: falls back to the enemy sprite, drawn bigger) |

Enemy ids (see `ENEMIES` in `src/core/balance.ts`, which also holds their stats):

| Area | Enemies (archetype) |
|---|---|
| Whispering Forest | `greenSlime` (slime), `wolf` (beast), `redSlime` (slime) |
| Old Graveyard | `skeleton` (undead), `zombie` (undead), `bat` (beast) |
| Ember Caves | `imp` (demon), `magmaSlime` (slime), `beetle` (beast) |
| Frost Peaks | `iceWolf` (beast), `golem` (elemental), `wraith` (undead) |
| Void Rift | `shadowSlime` (slime), `horror` (demon), `lich` (undead) |

The last enemy of each area is the model for that area's Guardian.

Hunter ids (see `HUNTERS`): `alchemist`, `glimmer`, `ranger`, `thief`, `lance`, `puppeteer`, `demonbane`, `wilhelm`, `scavenger`, `frostbreaker`.

Tips:
- Square PNG or WebP with a transparent background, around 128×128. Sprites are scaled to the enemy's size.
- Draw enemies and Hunters **facing right**; they're mirrored automatically.
- Leave a little padding; the sprite is drawn about 2.4× the enemy's collision radius.
- The battlefield is drawn zoomed out (60%), so sprites appear small; keep silhouettes bold.
- Keep the shapes readable at small sizes; there can be 100+ on screen.
