# Monster Horde Idle

An incremental (idle) survivor game for Android, with iOS to follow. Your Hunter stands in the middle of the field and auto-shoots an endless horde closing in from every side, Vampire Survivors style. Enemies that reach the Hunter don't hurt them: they **stun** them and **run off with their loot**. You start in the Whispering Forest and push through **five areas**. Each has its own monsters and materials, and every area you open stays open for good. Recruit extra **Hunters** with their own specialties and station them in areas to keep earning while you hunt elsewhere.

## Core loop

| Layer | What happens |
|---|---|
| **Battlefield** | Your Hunter auto-fires at the nearest approaching enemy. Enemies arrive in packs from off-screen. One that reaches the Hunter **stuns** them and **flees**; if it gets off-screen it escapes with its gold and material. A short immunity after each stun means you always get some shots off. Tap anywhere for a blast, even while stunned. |
| **Areas** | Whispering Forest → Old Graveyard → Ember Caves → Frost Peaks → Void Rift. Get enough kills in an area (**mastery**) to challenge its **Guardian** (a giant version of the area's rarest monster, 45s timer; it stuns longer and bounces off). Beat it and the next area is **permanently unlocked**. Travel freely between unlocked areas with **◀ ▶** or the Areas tab. |
| **Monsters & archetypes** | 15 monsters, 3 per area. Each has its own **HP, speed, spawn rate, pack size, gold** and **material**, and belongs to an **archetype**: Slime (Green, Red, Magma, Shadow Slime), Undead (Skeleton, Zombie, Snow Wraith, Lich), Beast (Forest Wolf, Grave Bat, Fire Beetle, Ice Wolf), Demon (Imp, Void Horror) or Elemental (Frost Golem). |
| **Bestiary** (gold) | Each area starts with one monster; **unlock** the others to grow its horde. **Swarm** brings more of a monster; **Bounty** makes it pay more gold and drop more materials, but it **moves faster**. Permanent, and it also applies to Hunters stationed there. |
| **Hunters** (gold) | Your Hunter trains **Power**, **Rapid Fire** and **Steady Nerves** (shorter stuns). The **Hunter Guild** has 7 recruitable Hunters with perks: Mira the Alchemist (×3 vs Slimes), Rin the Ranger (×3 vs Beasts), Alric the Gravewarden (×3 vs Undead), Gus the Prospector (+75% gold), Sera the Demonbane (×3 vs Demons), Pip the Scavenger (×2 drops) and Bjorn the Frostbreaker (×3 vs Elementals). Level them with gold and **station** one per area. They earn gold and materials there at 80% efficiency (offline too). Visit their area and they fight beside you. |
| **Forge** (materials) | 10 permanent items that boost **every** Hunter: Whetstone, Quickdraw Gloves, Monster Lure, Scavenger's Pouch, Bone Mail, Split Bow, Golden Idol, Frost Lance, Soul Lantern and Void Engine. Recipes use materials from each area in turn, so every new area opens up new gear. |
| **Offline** | Up to 8h: you farm your current area at 50% efficiency, and every stationed Hunter keeps farming theirs. |
| **Arena** | Tickets (max 3, one per 15 min, refill offline) buy minigame runs. |

## Adding your art

Drop PNGs into `src/assets/sprites/` (`hunter.png`, `hunters/<id>.png`, `enemies/<id>.png`, optional `bosses/<id>.png`) and they replace the placeholder shapes on the next build. No code changes are needed. See [`src/assets/sprites/README.md`](src/assets/sprites/README.md) for all ids and sizes. Monster, area and Hunter stats live in `src/core/balance.ts`.

### Minigames

- **🚀 Sky Siege** (bullet hell, the featured game): drag to fly; the ship auto-fires. Dodge aimed shots, rotating rings and a spiral-firing boss; only the ship's purple core can be hit. Downed monsters drop **material gems** (of the monsters you've unlocked, worth more the more areas you've opened) and you earn **Stars**. Stars buy permanent **Hangar** upgrades: Treasure Hunter (+materials), Rich Skies (+drops), Twin Cannons, Shield (extra hits), Magnet and Endurance (longer runs).
- **⚔️ Blade Storm**: swipe to slice monsters flung into the air, avoid bombs. Pays gold + Frenzy.
- **💥 Power Strike**: timing bar against a giant boss. Pays gold + Frenzy.

**Frenzy** doubles all damage for up to 5 minutes, so active play speeds up the idle game.

## Tech

- **TypeScript + HTML5 Canvas**, bundled with **Vite**. No game engine and no image assets: everything is drawn with simple shapes.
- **Capacitor** wraps the web build as a native Android app (`android/`). The same code becomes the iOS app later.
- Saves use `@capacitor/preferences` (SharedPreferences / UserDefaults natively, localStorage on web). It autosaves every 10s and when the app is backgrounded.

```
src/
  core/        pure game logic, no DOM (unit-tested)
    balance.ts   every tunable number and content table (areas, monsters, archetypes, Hunters, items, hangar)
    game.ts      economy & progression: areas, Guardians, Hunters & stationing, bestiary, shops, forge, background farming
    field.ts     the battlefield simulation: spawning, movement, shooting (you + stationed Hunter), stuns, fleeing, Guardians
    offline.ts   offline cap + ticket regen
    state.ts     save format + migration
    save.ts      persistence
  render/      canvas: battlefield view, particles, sprite loader (monsterArt.ts is used by the older minigames)
  assets/sprites/  drop-in artwork (optional)
  minigames/   runner (harness) + one file per minigame
  ui/          DOM panels (Slayers / Arena / Souls), modals
tests/         vitest: economy, field, minigames, saves, and a bot that plays the real battlefield to check pacing
```

## Running it

```bash
npm install
npm run dev        # play in a browser at http://localhost:5173 (use phone view in devtools)
npm test           # unit tests + progression pacing check
```

Balancing: `SIM_SWEEP=1 npx vitest run tests/progression.test.ts --silent=false` runs a bot on the real (headless) battlefield (training, Bestiary, Hunters, Forge, Guardians) and prints when each area unlocked. Currently: Graveyard ~6 min, Caves ~48 min, Peaks ~1h50, Void Rift ~3h15 of optimal play without minigames or offline time.

### On an Android phone

**Easiest:** every push to GitHub runs the **Build** workflow, which uploads `monster-horde-debug-apk`. Download it from the workflow run's *Artifacts*, copy the APK to your phone, and install it. You'll need to allow "install unknown apps".

**With Android Studio:**

```bash
npm run android    # builds, syncs into android/, opens Android Studio → press Run
```

### iOS (later, needs a Mac with Xcode)

```bash
npm install
npx cap add ios
npm run ios        # opens Xcode → pick a device → Run
```

## Roadmap ideas

- Sound effects & haptics (`@capacitor/haptics`) on hits, crits and kills
- Local notification when tickets are full or the offline cap is reached (`@capacitor/local-notifications`)
- Active skills with cooldowns (nova, orbiting blades, freeze) and more weapon types
- Enemy traits (splitters, shielded, ranged), elite variants, Guardian attack patterns
- A prestige layer that fits permanent areas (e.g. harder "tiers" of each area for bigger rewards)
- More Hunters, Hunter gear slots, and more areas
- Daily challenges / leaderboards for Sky Siege; more Hangar upgrades
- Boss-only rare materials and legendary items; achievements
- Rewarded ads ("double your offline gold") or IAP; cloud save
- Replace procedural art with a commissioned sprite set
- Release signing & Play Store listing (`./gradlew bundleRelease`)
