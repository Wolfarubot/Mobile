# Monster Horde Idle

An incremental (idle) monster-slaying game for Android, with iOS to follow. Tap to strike, hire slayers who fight for you, even while the app is closed, and jump into short arcade minigames to earn big rewards.

## Core loop

| Layer | What happens |
|---|---|
| **Tap** | Tap the monster to strike. 5% chance of a ×5 crit. Each tap also deals 2% of your slayer DPS, so tapping stays useful. |
| **Slayers** | 12 heroes (Squire → Void Lord) deal damage per second automatically. Levels cost ×1.07 more each; damage doubles at level 10 and triples every 25 levels. Buy ×1 / ×10 / ×100 / MAX. |
| **Stages** | 10 kills clear a stage. Every 5th stage is a **boss** with 10× HP and a 30s timer. Fail and you drop back to farm until you tap **Fight Boss**. A new zone look every 10 stages. |
| **Offline** | While the app is closed, slayers farm your current stage at 50% efficiency for up to 8h. You get a "Welcome back" summary when you return. |
| **Arena (minigames)** | Spend a ticket (max 3, one refills every 15 min, even offline) to play. Rewards: gold based on your stage, plus **Frenzy** (×2 damage, up to 5 min), so active play speeds up idle progress. |
| **Ascension (prestige)** | From stage 50, reset for **Soul Shards**: +10% damage each, permanently. |

### Minigames

- **🏰 Horde Rush** (45s): monsters swarm your tower from all sides. Tap to smash groups (3+ = combo multiplier). Kills charge a ring. When it's full, tap the tower for a screen-clearing **Nova**. Golden monsters are worth extra; brutes take two hits.
- **⚔️ Blade Storm** (30s): monsters are hurled into the air, Fruit Ninja style. Swipe through them and slice 3+ in one swipe for a bonus. Spiked bombs cost 5 seconds.
- **💥 Power Strike** (12 swings): a timing bar against a giant boss. Hit the gold zone for PERFECT; chained perfects build a damage streak. It speeds up every swing.

## Tech

- **TypeScript + HTML5 Canvas**, bundled with **Vite**. No game engine, no image assets: all monsters are drawn procedurally (`src/render/monsterArt.ts`).
- **Capacitor** wraps the web build as a native Android app (`android/`). The same code becomes the iOS app later.
- Saves use `@capacitor/preferences` (SharedPreferences / UserDefaults natively, localStorage on web). It autosaves every 10s and when the app is backgrounded.

```
src/
  core/        pure game logic, no DOM (unit-tested)
    balance.ts   every tunable number & formula
    game.ts      simulation: damage, kills, bosses, shop, prestige, rewards
    offline.ts   offline progress + ticket regen
    state.ts     save format + migration
    save.ts      persistence
  render/      canvas: battle scene, monster art, particles
  minigames/   runner (harness) + one file per minigame
  ui/          DOM panels (Slayers / Arena / Souls), modals
tests/         vitest: engine, balance, and a bot that plays to check pacing
```

## Running it

```bash
npm install
npm run dev        # play in a browser at http://localhost:5173 (use phone view in devtools)
npm test           # unit tests + progression pacing check
```

Balancing: `SIM_SWEEP=1 npx vitest run tests/progression.test.ts --silent=false` prints how long a tapping bot takes to reach each stage. Currently the first Ascension (stage 50) takes about 80 minutes of optimal active play.

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
- Slayer skills with cooldowns (e.g. "Rain of Arrows": 10s of ×10 DPS)
- More minigames and daily challenges / leaderboards per minigame
- Equipment/relic drops from bosses; achievements
- Rewarded ads ("double your offline gold") or IAP; cloud save
- Replace procedural art with a commissioned sprite set
- Release signing & Play Store listing (`./gradlew bundleRelease`)
