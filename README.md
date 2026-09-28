# Monster Horde Idle

An incremental (idle) survivor game for Android, with iOS to follow. Your hero stands in the middle of the field and auto-shoots an endless horde closing in from every side, Vampire Survivors style, with deliberately simple flat-shape art. Enemies drop gold and materials. Gold trains your hero; materials are forged into items. It keeps fighting while the app is closed, and the Arena has minigames for active play, including a bullet hell with its own upgrade tree.

## Core loop

| Layer | What happens |
|---|---|
| **Battlefield** | The hero auto-fires at the nearest enemy. Enemies arrive in packs from off-screen and walk inward; each one touching you drains HP. Tap anywhere for a blast that hits everything nearby. |
| **Stages** | 40 kills clear a stage. Every 5th stage is a **boss** with a 30s timer. Get overrun (HP hits 0) or let the boss time out and you fall back a stage and stop auto-advancing. **◀ ▶** move between unlocked stages (farm older zones for their materials); **AUTO** toggles pushing forward. |
| **Zones** | Every 10 stages: new colors, a new enemy shape and a new material: Slime Goo, Bone, Ember, Frost Shard, Ectoplasm, Void Dust. |
| **Train** (gold) | **Power** (damage, ×2 every 25 levels), **Rapid Fire** (attack rate), **Vitality** (regen + damage reduction). Reset on Ascension. |
| **Forge** (materials) | 10 permanent items. Examples: Whetstone (+damage), Quickdraw Gloves (+attack rate), **Monster Lure (+enemy spawns)**, **Scavenger's Pouch (+material drops)**, Split Bow (+projectiles), Frost Lance (pierce), Golden Idol (+gold), Bone Mail (armor), Soul Lantern (crit), Void Engine. Recipes need materials from several zones. |
| **Offline** | While the app is closed, the hero farms the current stage at 50% efficiency for up to 8h, limited by both damage and spawn rate, earning gold and that zone's material. |
| **Arena** | Tickets (max 3, one per 15 min, refill offline) buy minigame runs. |
| **Ascension** | From stage 50, reset for **Soul Shards** (+10% damage each). Items, materials and Hangar upgrades are kept. |

### Minigames

- **🚀 Sky Siege** (bullet hell, the featured game): drag to fly; the ship auto-fires. Dodge aimed shots, rotating rings and a spiral-firing boss; only the ship's purple core can be hit. Downed monsters drop **material gems** (from any zone you've reached, worth more the further you've progressed) and you earn **Stars**. Stars buy permanent **Hangar** upgrades: Treasure Hunter (+materials), Rich Skies (+drops), Twin Cannons, Shield (extra hits), Magnet and Endurance (longer runs).
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
    game.ts      economy & progression: stats, kills/rewards, stages, bosses, shops, forge, prestige
    field.ts     the battlefield simulation: spawning, movement, shooting, collisions, contact damage
    offline.ts   offline progress + ticket regen
    state.ts     save format + migration
    save.ts      persistence
  render/      canvas: battlefield view, particles (monsterArt.ts is used by the older minigames)
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

Balancing: `SIM_SWEEP=1 npx vitest run tests/progression.test.ts --silent=false` runs a bot on the real (headless) battlefield and prints how long it takes to reach each stage. Currently stages 1–35 take ~11 minutes, then the wall starts; the first Ascension (stage 50) takes the bot about 2 hours without minigames or offline time.

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
- Elite enemies and enemy variety per zone (fast, tanky, ranged)
- Daily challenges / leaderboards for Sky Siege; more Hangar upgrades
- Boss-only rare materials and legendary items; achievements
- Rewarded ads ("double your offline gold") or IAP; cloud save
- Replace procedural art with a commissioned sprite set
- Release signing & Play Store listing (`./gradlew bundleRelease`)
