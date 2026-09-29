# Pocket Hunter

An incremental (idle) survivor game for Android, with iOS to follow. Your Hunter stands in the middle of the field and auto-shoots an endless horde closing in from every side, Vampire Survivors style. Enemies that reach the Hunter don't hurt them: they **stun** them and **run off with their loot**. You start in the Whispering Forest and push through **five areas**. Each has its own monsters and materials, and every area you open stays open for good. Recruit extra **Hunters** with their own specialties and station them in areas to keep earning while you hunt elsewhere.

## Core loop

| Layer | What happens |
|---|---|
| **Battlefield** | Your Hunter auto-fires at the nearest approaching enemy. Enemies arrive in packs from off-screen. One that reaches the Hunter **stuns** them and **flees**; if it gets off-screen it escapes with its gold and material. A stun always runs its course (more monsters arriving don't extend it), then a short immunity means you always get some shots off. Tap anywhere for a blast, even while stunned. |
| **Areas** | 10 areas, with more to come: Whispering Forest → Faerie Glade → Old Graveyard → Forsaken Crypt → Shadowy Depths → Ember Caves → Deep Mines → Frost Peaks → Stormcrest Cliffs → Void Rift. Get enough kills in an area (**mastery**) to unlock its **Guardian Challenge** event (a giant version of one of the area's monsters, 45s timer; it stuns longer and bounces off). Beat it and the next area is **permanently unlocked**. Travel between unlocked areas from the **Areas** tab, where each area shows its mastery progress and stats: slain, gold earned, escaped, knockouts, monsters unlocked and who is stationed there. The **Areas tab** is a 3-wide grid of area icons, each with slots showing the (up to 3) Hunters stationed there. Tap an area to see its description and monsters; a bar pinned to the bottom of the menu shows its name with **Details** (a full card: monsters with their drops, monsters slain, Guardian kills, events run, gold, escapes, knockouts, Active Hunters) or **Travel**. In Details, **Active Hunters** fills a row of 3 slots (empty ones outlined) and notes when your own Hunter is there; tap any slot to open the assign screen, where you drag Hunters into or out of the area's slots, double-tap one to assign it to a free slot, or tap one to get an **Assign** / **Unassign** button right on its icon. |
| **Monsters & archetypes** | 55 monsters: 5 in each area (10 in the Void Rift). The first comes with the area and the rest are unlocked in the Bestiary. Each has its own **HP, speed, spawn rate, pack size, gold**, **material** it drops, weaknesses and resistances, and an **archetype**: Slime, Beast, Undead, Demon, Elemental, Humanoid, Plant or Dragon. Forest: Green Slime, Forest Wolf, Red Slime, Goblin, Killer Bee. Faerie Glade: Toadstool, Pixie, Wild Boar, Mandragora, Treant. Graveyard: Skeleton, Zombie, Grave Bat, Ghoul, Ghost. Crypt: Carrion Crow, Mummy, Banshee, Bone Knight, Necromancer. Shadowy Depths: Gloomcrawler, Duskmoth, Shadow Wisp, Umbral Ooze, Deep Lurker. Caves: Imp, Magma Slime, Fire Beetle, Salamander, Hellhound. Deep Mines: Kobold, Basilisk, Lava Golem, Fire Drake, Cave Troll. Peaks: Ice Wolf, Frost Golem, Snow Wraith, Yeti, Frost Sprite. Stormcrest Cliffs: Harpy, Snow Owl, Griffin, Ice Wyvern, Frost Giant. Rift: Shadow Slime, Void Horror, Lich, Shade, Watcher, Dark Knight, Succubus, Chimera, Void Wyrm, Behemoth. Guardians: Red Slime, Treant, Grave Bat, Necromancer, Deep Lurker, Fire Beetle, Cave Troll, Snow Wraith, Ice Wyvern (the Rift has none yet). New areas reuse the materials of the area before them. |
| **Bestiary** (gold) | Each area starts with one monster; **unlock** the others to grow its horde. **Empower** opens once you've slain 100 slimes (a one-time popup explains the Bestiary). Empower a monster with gold (the ×1/×10/×100/MAX switch, pinned to the top of the Bestiary, sets how many sessions): each session adds +2% HP, +3% gold and +2% material drops, every level multiplies those (×1.03 HP, ×1.05 gold, ×1.03 drops), so it grows exponentially with level; each session costs 15% more than the last. Empower sessions raise its **level** on the same curve as Hunter training, and every level earns an **evolution point**. Each card shows what the monster drops, its level and progress toward the next. Tap a monster (cards say **Expand ›**) for its full view, with two sub-tabs: **Stats** (what it drops, Empower, its stats including how many you've slain) and **Evolution** (its tree; the tab shows unspent points). Each row of the tree opens after slaying enough of that monster (100 for the root, 1,000 for the branches, 5,000 for the signature nodes, 20,000 for the capstone; rarer monsters need fewer), so you can't jump ahead. Each archetype has its own tree, shaped like a Hunter's: a signature root (Slimes: +25% HP and +25% gold), three branches, **Wealth** (gold), **Horde** (spawns) and **Harvest** (materials), a signature node under each (Slimes' **Small Hordes** makes them arrive in bigger packs; Beasts', Demons' and Dragons' gold nodes also make them faster), and a capstone. Permanent, and it applies wherever the monster is hunted, including by stationed Hunters. Older saves turn each Swarm and Bounty level into an Empower session. |
| **Hunters** (gold) | Every Hunter, you included, **trains** with gold: each session adds a little damage and costs a bit more than the last. Enough sessions raise their **level** (3 sessions for Lv 2, then 4 more for Lv 3, and so on), and every level earns a **skill point** for their **skill tree**. Every tree branches from a signature root node into Attack Power, Attack Speed and Recovery Speed, then a signature node under each branch and a capstone at the bottom; a node needs a point in the one it hangs from. Some nodes cost more than one point (shown on the node), so every Guild Hunter's first tree costs exactly 39 points and is complete at **Lv 40**. Then a gold **Ascend** node appears (10 points, so **Lv 50**); Guild Hunters can't train past Lv 50 until they ascend. Their training cost grows 8.5% per session up to Lv 30, then only 1% per session (Lv 40 costs about 38× a Lv 30 session, Lv 50 about 3,900×, Lv 100 about a billion×), so Ascension is a long climb rather than a wall; your own Hunter's costs are unchanged. Ascending gives them a new title (e.g. Reginald the Alchemist becomes the Archalchemist), keeps Lv 50, starts the level curve over (1 session to Lv 51, 2 to Lv 52, ...) at the same training price, opens an **Ascended tree** (50 points: Awakening, Mastery, Fervor, Resolve, Precision, Reach, Fortune, and a capstone of their own that opens at Lv 100) and raises the cap to **Lv 100**. Your own Hunter's tree is unchanged for now. Lance's root, **Zone of Protection**, is his shield, and his **Rallying Oath** gives every other Hunter a hit. The **Hunter Guild** has 11 recruitable Hunters (a locked Hunter's card tells a short story of where they are and how to win them over), each with their own **attack style**, range and perk (table below). Each card shows the Hunter's art, a gold dot in the corner counting unspent skill points, their name, ability, location and DPS, equipped gear and a **Train** button (the ×1/×10/×100/MAX switch, pinned to the top of the Hunters tab and repeated in each Hunter's Overview, sets how many sessions). **Tap a card** (they say **Expand ›** in the corner) for a full-screen view with three sub-tabs: **Overview** (training, DPS, damage, attack rate, range, stun time, shield, crit, **enemies slain**, stationing), **Equipment** (each slot; tap one to choose from your unequipped gear that fits) and **Skills** (the tree); close it to return to the battlefield. **Station** up to 3 Hunters per area (besides yours); Hunters sharing an area farm it together. They earn gold and materials there at 80% efficiency (offline too). Visit their area and they fight beside you. Monsters head for the **nearest** Hunter, so stationed Hunters can be stunned too. |
| **Inventory** (materials) | Three sub-tabs: **Materials** (what you've collected from slain monsters), **Equipment** (the gear and Upgrades you've crafted; tap one for details. **Filter** narrows it by Type (cycle through Melee, Ranged, Magic, Armor, Accessories and Upgrades), Rarity, Damage type and Level) and **Crafting** (every recipe you know). Craft gear into your inventory, upgrade it (up to Lv 10) or salvage it for half its materials. **Upgrades**: the 10 original permanent items that boost every Hunter (Whetstone, Quickdraw Gloves, Monster Lure, Scavenger's Pouch, Bone Mail, Split Bow, Golden Idol, Frost Lance, Soul Lantern, Void Engine). Recipes use materials from each area in turn, so every new area opens up new gear. |
| **Equipment** | Every Hunter has 3 slots, always including **Armor**. Most (and you) have Ranged weapon · Armor · Accessory. **Lance**: Melee · Armor · Accessory. **Wilhelm**: Long-range weapon (powers his sniper shots) · Short-range weapon (powers his akimbo pistols) · Armor. **Reginald**: Weapon (ranged **or** magic) · Armor · Accessory. **Glimmer**: Magic weapon · Robe · Accessory. Tap a slot in a Hunter's Equipment sub-tab to open the gear picker: the equipped piece's card on top, the piece you're inspecting below it (showing what each stat gains or loses) with an Equip button to swap, and your whole inventory as a grid; a piece can only be worn by one Hunter at a time. 24 pieces across Ranged, Melee and **Magic** weapons (wands, staffs and focuses, for Reginald and Glimmer), Armor and Accessories modify damage, attack rate, range, crit, stun time, shield charges, gold, drops, area size and pierce. Every weapon has a **damage type**: Physical, Fire, Acid, Frost, Radiant, Poison, Arcane, Decay or Void (most bows, crossbows and spears are Physical). A Hunter deals their weapon's type, or their own without one (you: Physical; Reginald: Poison; Glimmer: Fire; Alric and Lance: Radiant; Sera: Arcane; Pip: Acid; Bjorn: Frost; the rest Physical). Reginald's potions and Glimmer's fireballs always deal their own type. Types show as coloured tags on weapons, in the Hunter view and in the damage numbers, and the Filter can narrow by them; every monster has **weaknesses** (×1.5 damage from those types) and **resistances** (×0.5), shown in the Bestiary and the area details; weak hits show bigger damage numbers with a “!”. Hits can also trigger their type's **status effect**, at the weapon's own chance (shown on its card; Hunters fighting without a weapon use their own chance, and plain Physical weapons never trigger one): **Fire** burns (30% of the hit again over 2s, with a small chance each tick to spread to monsters right next to it, weaker each time), **Poison** poisons (40% of the hit over 4s, plus 1–6% of the monster's max HP by weapon rarity, Common to Exalted; a tenth of that on Guardians), **Frost** chills (half speed for 1.2s), **Acid** drops an acid puddle that hurts everything in it for 3s, **Radiant** bursts for 60% of the hit on everything nearby, **Decay** gives the monster a dark aura that hurts the monsters around it for 4s, and **Arcane** strips its resistances for 4s. Physical and Void have no effect. Glimmer's fireballs always burn; Reginald's puddle ticks don't re-poison. Effects show on monsters as flames, bubbles, a frosty ring, a dark aura or violet sparks. Every piece has a **rarity**, shown as its colour on Hunter cards, slots, the inventory and recipes: Common (grey), Uncommon (green), Rare (blue), Very Rare (lavender), Legendary (violet), Exotic (gold), Relic (red), Artifact (orange), Exalted (magenta). Rarer gear comes from later areas' materials. |
| **Settings** (⚙️ in the top bar) | **Name** your Hunter (shown on their card and around the game). **Handedness**: right-handed puts the Train buttons on the right, left-handed on the left. **Tab order**: drag the menu tabs (or use the arrows) to reorder them (default Hunters, Equipment, Bestiary, Events, Areas). **Font**: Pixel (default), Terminal, Jersey, Arcade, Rounded or System, all bundled so they work offline and sized to match. **Reset all progress** lives here too. |
| **Offline** | Up to 8h (the Welcome Back screen only appears after 15+ minutes away; shorter breaks are credited silently): you farm your current area at 50% efficiency, and every stationed Hunter keeps farming theirs. The Welcome Back screen breaks down gold, kills and materials **per area**, with who earned them and how many times each Hunter was **knocked out** (shown only if it happened). Offline (and background) farming models the same pressure as the live field. Monsters slip through when Hunters can't keep up (limited by damage *and* shots per kill), each one that gets through stuns someone (unless they're already dazed or immune), and dazed Hunters don't fight. So Hunters that are too weak for an area earn very little there, online or off. Stationed Hunters' cards warn when they spend real time stunned. |
| **Events** | The tab stays greyed out until the Whispering Forest Guardian Challenge unlocks (600 forest kills); then a one-time popup explains events. Each area has events, unlocked by slaying monsters there. Once unlocked, an event goes on a **cooldown** each time you start it (cooldowns run offline too), and only one event runs at a time. The Events tab shows the events of the area you're in. **Guardian Challenge** (every area, unlocks at mastery, 5 min cooldown): the first win opens the next area, and later wins pay a bounty. **Slime Swarm** (Whispering Forest, unlocks at 2,500 forest kills, 15 min cooldown): for 60s only slimes spawn, twice as often and twice as fast. |

### The Hunter Guild

Hunters become available through their home area's events, then cost gold to recruit. The Hunters tab shows your Hunter, everyone you've recruited, and only the next 3 still to come.

| Hunter | Unlocked by | Style | Perk |
|---|---|---|---|
| Reginald the Alchemist ⚗️ | Beat the Whispering Forest Guardian | Magic bolts; every 4s a potion whose poison puddle keeps hurting (weapon damage powers the poison, weapon attack rate widens the puddle) | ×3 vs Slimes |
| Galladair the Ranger 🏹 | Beat the Whispering Forest Guardian 2 times | Arrows that pierce up to 4 enemies | ×3 vs Beasts |
| Alric the Gravewarden ✝️ | Beat the Old Graveyard Guardian | Holy pulse hitting everything around him | ×3 vs Undead |
| Lance the Paladin 🛡️ | Beat the Old Graveyard Guardian 2 times | Short lance thrusts through a line | Skill tree: Zone of Protection (3-hit recharging shield), Rallying Oath (every other Hunter gets a 1-hit shield) |
| Gus the Prospector 💰 | Beat the Old Graveyard Guardian 3 times | Shotgun: 5 pellets, close range | +75% gold |
| Glimmer the Wizard 🧙 | Beat the Forsaken Crypt Guardian | Magic bolts; every 4s a fireball that explodes for area damage (weapon damage powers the blast, weapon attack rate widens it) | |
| Wilhelm the Sniper 🎯 | Beat the Shadowy Depths Guardian | Long-range piercing shots; akimbo pistols when enemies get close | Separate long-range and short-range weapon slots |
| Celeste the Psion 🔮 | Beat the Shadowy Depths Guardian 2 times | Long psychic beams (Arcane) that pierce every monster in a line | ×3 vs Dragons |
| Sera the Demonbane 🗡️ | Beat the Ember Caves Guardian | Rapid thrown daggers, short range | ×3 vs Demons |
| Pip the Scavenger 🎒 | Beat the Ember Caves Guardian 2 times | Slingshot stones ricochet between 4 enemies | ×2 drops |
| Bjorn the Frostbreaker 🔨 | Beat the Frost Peaks Guardian | Frost hammers that slow enemies | ×3 vs Elementals |

Card descriptions are each Hunter's `ability`, and slot layouts are their `slots`, in `HUNTERS`; skill trees are `SKILL_TREES`; the gear catalog is `GEAR` in `src/core/balance.ts`.

The battlefield is drawn zoomed out (`FIELD_ZOOM` in `balance.ts`), so monsters appear far off and walk in. Each Hunter only attacks within their range. Styles, ranges and damage multipliers live in `HUNTERS` in `src/core/balance.ts`.

## Adding your art

Drop PNGs into `src/assets/sprites/` (`hunter.png`, `hunters/<id>.png`, `enemies/<id>.png`, optional `bosses/<id>.png`) and they replace the placeholder shapes on the next build. No code changes are needed. See [`src/assets/sprites/README.md`](src/assets/sprites/README.md) for all ids and sizes. Monster, area and Hunter stats live in `src/core/balance.ts`.

## Tech

- **TypeScript + HTML5 Canvas**, bundled with **Vite**. No game engine and no image assets: everything is drawn with simple shapes.
- **Look**: Game Boy Advance-style. A bundled pixel font (Pixelify Sans, so it works offline), square windows with thick borders and hard shadows, and a battlefield drawn at one canvas pixel per screen point, then scaled up crisply. Each area tints the menus with a muted (desaturated) version of its palette over a darker backdrop, so the brightly coloured battlefield stands out, and gives the battlefield its own ground colour (`palette` and `ground` in `AREAS`; applied by `src/ui/theme.ts`).
- **Capacitor** wraps the web build as a native Android app (`android/`). The same code becomes the iOS app later.
- Saves use `@capacitor/preferences` (SharedPreferences / UserDefaults natively, localStorage on web). It autosaves every 10s and when the app is backgrounded.

```
src/
  core/        pure game logic, no DOM (unit-tested)
    balance.ts   every tunable number and content table (areas, monsters, archetypes, Hunters, items, hangar)
    game.ts      economy & progression: areas, events & Guardians, Hunters & stationing, bestiary, shops, forge, background farming
    field.ts     the battlefield simulation: spawning, movement, attack styles, ranges, stuns & shields, fleeing, Guardians
    offline.ts   offline cap + ticket regen
    state.ts     save format + migration
    save.ts      persistence
  render/      canvas: battlefield view, particles, sprite loader
  assets/sprites/  drop-in artwork (optional)
  ui/          DOM panels (Hunters / Areas / Bestiary / Equipment / Events), modals
tests/         vitest: economy, field, events, saves, and a bot that plays the real battlefield to check pacing
```

## Running it

```bash
npm install
npm run dev        # play in a browser at http://localhost:5173 (use phone view in devtools)
npm test           # unit tests + progression pacing check
```

Balancing: `SIM_SWEEP=1 npx vitest run tests/progression.test.ts --silent=false` runs a bot on the real (headless) battlefield and prints when each area unlocks, both for a **typical player** and for nonstop play. The typical player has a 40-minute first session, then checks in at 08:00 (15 min), 13:00 (10 min) and 18:00 (20 min) daily, with offline gains in between. Current pacing for that player: **Faerie Glade ~18 min** (first session), **Graveyard ~14 h** (next morning), **Crypt ~1 day**, **Caves ~1.8 days**, **Deep Mines ~3 days**, **Frost Peaks ~5 days**, **Stormcrest Cliffs ~8 days**, and the **Void Rift** weeks in (past the 14-day simulation). `SIM_OUT=pace.json` writes the typical player's unlock times in hours. The test suite fails if these drift out of range. `CALIBRATE=1 npx vitest run tests/calibrate.test.ts --silent=false` compares the offline/background model against the live battlefield for several Hunter strengths. The gates are each area's Guardian HP and mastery kills (`AREAS` in `balance.ts`).

### On an Android phone

**Easiest:** every push to GitHub runs the **Build** workflow, which uploads `pocket-hunter-debug-apk`. Download it from the workflow run's *Artifacts*, copy the APK to your phone, and install it. You'll need to allow "install unknown apps".

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
- More area events (each area's own twist on the horde)
- Boss-only rare materials and legendary items; achievements
- Rewarded ads ("double your offline gold") or IAP; cloud save
- Replace procedural art with a commissioned sprite set
- Release signing & Play Store listing (`./gradlew bundleRelease`)
