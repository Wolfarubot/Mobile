# Monster Horde Idle

An incremental (idle) survivor game for Android, with iOS to follow. Your Hunter stands in the middle of the field and auto-shoots an endless horde closing in from every side, Vampire Survivors style. Enemies that reach the Hunter don't hurt them: they **stun** them and **run off with their loot**. You start in the Whispering Forest and push through **five areas**. Each has its own monsters and materials, and every area you open stays open for good. Recruit extra **Hunters** with their own specialties and station them in areas to keep earning while you hunt elsewhere.

## Core loop

| Layer | What happens |
|---|---|
| **Battlefield** | Your Hunter auto-fires at the nearest approaching enemy. Enemies arrive in packs from off-screen. One that reaches the Hunter **stuns** them and **flees**; if it gets off-screen it escapes with its gold and material. A short immunity after each stun means you always get some shots off. Tap anywhere for a blast, even while stunned. |
| **Areas** | Whispering Forest → Old Graveyard → Ember Caves → Frost Peaks → Void Rift. Get enough kills in an area (**mastery**) to challenge its **Guardian** (a giant version of the area's rarest monster, 45s timer; it stuns longer and bounces off). Beat it and the next area is **permanently unlocked**. Travel freely between unlocked areas with **◀ ▶** or the Areas tab. |
| **Monsters & archetypes** | 15 monsters, 3 per area. Each has its own **HP, speed, spawn rate, pack size, gold** and **material**, and belongs to an **archetype**: Slime (Green, Red, Magma, Shadow Slime), Undead (Skeleton, Zombie, Snow Wraith, Lich), Beast (Forest Wolf, Grave Bat, Fire Beetle, Ice Wolf), Demon (Imp, Void Horror) or Elemental (Frost Golem). |
| **Bestiary** (gold) | Each area starts with one monster; **unlock** the others to grow its horde. **Swarm** brings more of a monster; **Bounty** makes it pay more gold and drop more materials, but it **moves faster**. Permanent, and it also applies to Hunters stationed there. |
| **Hunters** (gold) | Your Hunter trains **Power**, **Rapid Fire** and **Steady Nerves** (shorter stuns). The **Hunter Guild** has 10 recruitable Hunters, each with their own **attack style**, range and perk (table below). Level them with gold and **station** one per area. They earn gold and materials there at 80% efficiency (offline too). Visit their area and they fight beside you. Monsters head for the **nearest** Hunter, so stationed Hunters can be stunned too. |
| **Forge** (materials) | **Equipment**: craft gear into your **Inventory**, upgrade it (up to Lv 10) or salvage it for half its materials. **Camp Upgrades**: the 10 original permanent items that boost every Hunter (Whetstone, Quickdraw Gloves, Monster Lure, Scavenger's Pouch, Bone Mail, Split Bow, Golden Idol, Frost Lance, Soul Lantern, Void Engine). Recipes use materials from each area in turn, so every new area opens up new gear. |
| **Equipment** | Every Hunter has 3 slots, always including **Armor**. Most (and you) have Weapon · Armor · Accessory. **Lance**: Melee · Armor · Accessory. **Wilhelm**: Long-range weapon (powers his sniper shots) · Short-range weapon (powers his akimbo pistols) · Armor. **Glimmer**: Armor · Accessory · Accessory. Tap a slot on a Hunter's card to equip from the inventory; a piece can only be worn by one Hunter at a time. 18 pieces across Weapons, Melee, Armor and Accessories modify damage, attack rate, range, crit, stun time, shield charges, gold, drops, area size and pierce. |
| **Offline** | Up to 8h: you farm your current area at 50% efficiency, and every stationed Hunter keeps farming theirs. The Welcome Back screen breaks down gold, kills and materials **per area**, with who earned them and how many times each Hunter was **knocked out** (shown only if it happened). Offline (and background) farming models the same pressure as the live field. Monsters slip through when Hunters can't keep up (limited by damage *and* shots per kill), each one that gets through stuns someone, stuns chain while monsters keep arriving, and dazed Hunters don't fight. So Hunters that are too weak for an area earn very little there, online or off. Stationed Hunters' cards warn when they spend real time stunned. |
| **Arena** | Tickets (max 3, one per 15 min, refill offline) buy minigame runs. |

### The Hunter Guild

| Hunter | Style | Perk |
|---|---|---|
| Mira the Alchemist ⚗️ | Lobs potions that leave a poison puddle | ×3 vs Slimes |
| Glimmer the Wizard 🧙 | Fireballs that explode for area damage | |
| Rin the Ranger 🏹 | Arrows that pierce up to 4 enemies | ×3 vs Beasts |
| Alric the Gravewarden ✝️ | Holy pulse hitting everything around him | ×3 vs Undead |
| Lance the Paladin 🛡️ | Short lance thrusts through a line | 3-hit shield before he's stunned (recharges) |
| Gus the Prospector 💰 | Shotgun: 5 pellets, close range | +75% gold |
| Sera the Demonbane 🗡️ | Rapid thrown daggers, short range | ×3 vs Demons |
| Wilhelm the Sniper 🎯 | Long-range piercing shots; akimbo pistols when enemies get close | |
| Pip the Scavenger 🎒 | Slingshot stones ricochet between 4 enemies | ×2 drops |
| Bjorn the Frostbreaker 🔨 | Frost hammers that slow enemies | ×3 vs Elementals |

Slot layouts live in each Hunter's `slots` in `HUNTERS`; the gear catalog is `GEAR` in `src/core/balance.ts`.

The battlefield is drawn zoomed out (`FIELD_ZOOM` in `balance.ts`), so monsters appear far off and walk in. Each Hunter only attacks within their range. Styles, ranges and damage multipliers live in `HUNTERS` in `src/core/balance.ts`.

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
    field.ts     the battlefield simulation: spawning, movement, attack styles, ranges, stuns & shields, fleeing, Guardians
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

Balancing: `SIM_SWEEP=1 npx vitest run tests/progression.test.ts --silent=false` runs a bot on the real (headless) battlefield and prints when each area unlocks, both for a **typical player** and for nonstop play. The typical player has a 40-minute first session, then checks in at 08:00 (15 min), 13:00 (10 min) and 18:00 (20 min) daily, with offline gains in between. Current pacing for that player: **Graveyard ~22 min** (first session), **Caves ~1 day**, **Frost Peaks ~3 days**, **Void Rift ~9 days**. The test suite fails if these drift out of range. `CALIBRATE=1 npx vitest run tests/calibrate.test.ts --silent=false` compares the offline/background model against the live battlefield for several Hunter strengths. The gates are each area's Guardian HP and mastery kills (`AREAS` in `balance.ts`).

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
