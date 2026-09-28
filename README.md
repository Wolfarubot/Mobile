# Monster Horde Idle

An incremental (idle) survivor game for Android, with iOS to follow. The Hunter stands in the middle of the field and auto-shoots an endless horde closing in from every side, Vampire Survivors style. Enemies that reach the Hunter don't hurt them: they **stun** them and **run off with their loot**. Getting stronger means fewer get away. Gold trains the Hunter and grows the horde; materials dropped by each monster type are forged into permanent items. It keeps fighting while the app is closed, and the Arena has minigames for active play, including a bullet hell with its own upgrade tree.

## Core loop

| Layer | What happens |
|---|---|
| **Battlefield** | The Hunter auto-fires at the nearest approaching enemy. Enemies arrive in packs from off-screen. One that reaches the Hunter **stuns** them (no shooting) and **flees**; if it makes it off-screen it escapes with its gold and material. After a stun the Hunter gets a short immunity, so they always get some shots off. Tap anywhere for a blast, even while stunned. |
| **Stages** | 40 kills clear a stage. If 40 enemies escape first, the Hunter **falls back a stage** and stops auto-advancing, so idle play settles on the best stage you can hold. Every 5th stage is a **boss** (a giant version of your toughest unlocked monster, 30s timer): it stuns longer and bounces off instead of fleeing. **◀ ▶** move between unlocked stages; **AUTO** toggles pushing forward. |
| **Bestiary** (gold) | 6 monster types, each with its own **HP, movement speed, spawn rate, pack size, gold** and **material**: Slime, Skeleton, Imp, Frost Golem, Wraith, Void Horror. **Unlock** new ones to join the horde. **Swarm** brings more of a type. **Bounty** makes it pay more gold and drop more materials, but it **moves faster**. Resets on Ascension. |
| **Train** (gold) | **Power** (damage, ×2 every 25 levels), **Rapid Fire** (attack rate), **Steady Nerves** (shorter stuns). Reset on Ascension. |
| **Forge** (materials) | 10 permanent items, for example Whetstone (+damage), Quickdraw Gloves (+attack rate), Monster Lure (+all spawns), Scavenger's Pouch (+material drops), Split Bow (+projectiles), Frost Lance (pierce), Golden Idol (+gold), Bone Mail (shorter stuns), Soul Lantern (crit) and Void Engine. Each material comes from one monster type, so unlocking monsters opens up recipes. |
| **Offline** | While the app is closed the Hunter farms the current stage at 50% efficiency for up to 8h. If the horde brings more HP per second than the Hunter can deal, the rest escape. |
| **Arena** | Tickets (max 3, one per 15 min, refill offline) buy minigame runs. |
| **Ascension** | From stage 50, reset for **Soul Shards** (+10% damage each). Items, materials and Hangar upgrades are kept. |

## Adding your art

Drop PNGs into `src/assets/sprites/` (`hunter.png`, `enemies/<id>.png`, optional `bosses/<id>.png`) and they replace the placeholder shapes on the next build. No code changes are needed. See [`src/assets/sprites/README.md`](src/assets/sprites/README.md) for names and sizes. Enemy stats live in the `ENEMIES` table in `src/core/balance.ts`.

### Minigames

- **🚀 Sky Siege** (bullet hell, the featured game): drag to fly; the ship auto-fires. Dodge aimed shots, rotating rings and a spiral-firing boss; only the ship's purple core can be hit. Downed monsters drop **material gems** (of the monster types you've unlocked, worth more the further you've progressed) and you earn **Stars**. Stars buy permanent **Hangar** upgrades: Treasure Hunter (+materials), Rich Skies (+drops), Twin Cannons, Shield (extra hits), Magnet and Endurance (longer runs).
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
    balance.ts   every tunable number, formula and content table (upgrades, items, zones, hangar)
    game.ts      economy & progression: stats, enemy roster, kills/escapes, stages, bosses, shops, forge, prestige
    field.ts     the battlefield simulation: spawning, movement, shooting, collisions, stuns, fleeing
    offline.ts   offline progress + ticket regen
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

Balancing: `SIM_SWEEP=1 npx vitest run tests/progression.test.ts --silent=false` runs a bot on the real (headless) battlefield and prints how long it takes to reach each stage. Currently stage 10 takes ~4 minutes and stage 30 ~11; the wall starts around 35–40, and the first Ascension (stage 50) takes the bot about 2.5 hours without minigames or offline time.

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
- Enemy traits (splitters, shielded, ranged), elite variants, per-enemy boss attacks
- Daily challenges / leaderboards for Sky Siege; more Hangar upgrades
- Boss-only rare materials and legendary items; achievements
- Rewarded ads ("double your offline gold") or IAP; cloud save
- Replace procedural art with a commissioned sprite set
- Release signing & Play Store listing (`./gradlew bundleRelease`)
