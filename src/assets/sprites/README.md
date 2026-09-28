# Sprites

Drop artwork here and it replaces the placeholder shapes automatically on the next build
(`npm run dev` picks it up after a refresh). No code changes needed.

| File | Used for |
|---|---|
| `hunter.png` | The Hunter in the middle of the field |
| `enemies/<id>.png` | A regular enemy |
| `bosses/<id>.png` | That enemy's boss version (optional: falls back to the enemy sprite, drawn bigger) |

Enemy ids: `slime`, `skeleton`, `imp`, `golem`, `wraith`, `horror`, as listed in `ENEMIES` in `src/core/balance.ts`.
Their stats (HP, speed, gold, spawn rate, pack size, material, unlock cost) are in that table too.

Tips:
- Square PNG or WebP with a transparent background, around 128×128. Sprites are scaled to the enemy's size.
- Draw enemies **facing right**; they're mirrored automatically when walking left.
- Leave a little padding; the sprite is drawn about 2.4× the enemy's collision radius.
- Keep the shapes readable at small sizes; there can be 100+ on screen.
