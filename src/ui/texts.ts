import { registerText } from '../core/textRegistry';

/**
 * The game's written text that no other editor covers: popups, toasts, tutorials, tooltips, menus and labels. Each
 * section is one page in the Text editor; each field one line in it (key `<section id>.<field>`). The game reads
 * them with tx / txp / txt (core/textRegistry.ts), filling in the {placeholders} listed with each section.
 *
 * Markup: **bold**; a blank line starts a new paragraph (in Text fields).
 */

interface SectionOpts {
  vars?: Record<string, string>;
  note?: string;
  /** Labels for fields not covered by LABELS ("Button" otherwise). */
  labels?: Record<string, string>;
}

const LABELS: Record<string, string> = { title: 'Title', body: 'Text', text: 'Text' };

function section(group: string, id: string, name: string, fields: Record<string, string>, opts: SectionOpts = {}): void {
  for (const [field, base] of Object.entries(fields)) {
    registerText({
      key: `${id}.${field}`,
      group,
      section: name,
      label: opts.labels?.[field] ?? LABELS[field] ?? `Button: ${field}`,
      base,
      vars: opts.vars,
      note: opts.note,
    });
  }
}

// ---- Popups: tips shown once, and the popups you open ----

const P = 'Popups';
section(
  P,
  'popup.welcome',
  'Welcome',
  {
    title: 'Welcome!',
    body: 'This is **Pocket Hunter**, an idle swarm slaying game!\n\nStart your journey by tapping on the monsters while your Hunter attacks.\n\nYou can change the name of your Hunter in {settings} **Settings**, from the menu at the top right.',
    name: 'Name my Hunter',
    go: "Let's hunt!",
  },
  { note: 'Shown once, the very first time the game opens.', vars: { settings: 'the Settings icon' } },
);
section(
  P,
  'popup.train',
  'Time to train',
  {
    title: "Time to train!",
    body: "You have enough gold to **Train** your Hunter! Tap **Train** in the **Hunters** tab to increase your strength!\n\nAfter enough training, your Hunter will level up, granting **Skill Points** that are used to unlock more power and abilities within the **Skill Tree**. \n\nTap on the Hunter's card to see more details, train quicker, upgrade their abilities, and change their equipment!",
    later: "Dismiss",
    go: 'Go to Hunters',
  },
  { note: 'Shown once, the first time you can afford to train your Hunter.' },
);
section(
  P,
  'popup.wolf',
  'A new monster',
  {
    title: "A new monster!",
    body: "The wolf is now ready to be unlocked! Open the **Bestiary** to see the wolf.\n\nIf you want to see more of the menu, you can **swipe up** on the tab bar or **long press** to expand it. To close the expanded menu, you can **swipe down**, **long press** again, or press the **red arrow** button to drop it down.",
    later: "Dismiss",
    go: 'Go to Bestiary',
  },
  { note: 'Shown once, when you can first afford to unlock the wolf.' },
);
section(
  P,
  'popup.craft',
  'Ready to craft',
  {
    title: "Time to craft!",
    ready: "You've gathered enough materials to craft your first item: the **{item}**.",
    waiting: "Head to the **Inventory** tab and go to **Crafting** to see what's available. New crafting recipes become available as you acquire new materials from slaying monsters. You can see all the materials you have in the **Materials** tab.",
    body: "When you craft an item, you can find it in your **Equipment** inside the **Inventory** tab. You can equip it to a Hunter from there, or by going into a Hunter's Equipment.",
    later: "Dismiss",
    go: 'Go to Crafting',
  },
  {
    note: 'Shown once, when you first have the materials to craft something. The first line is "When ready" if there is something to craft (always, when it pops up by itself), "Replay" from Tutorials otherwise.',
    vars: { item: 'the first thing you can craft' },
    labels: { ready: 'First line: when ready', waiting: 'First line: replay' },
  },
);
section(
  P,
  'popup.empower',
  'Empower unlocked',
  {
    title: "Empower unlocked!",
    body: "You've slain {kills} slimes, and they're growing stronger. Use the **Bestiary** to unlock new monsters, and **Empower** them to raise their drops, spawn rates, and health. \n\nWith every level, monsters will earn an **Evolution Point**. Tap a monster card to open their **Evolution Tree**.",
    later: "Dismiss",
    go: 'Go to Bestiary',
  },
  { note: 'Shown once, when the 100th slime falls.', vars: { kills: 'slimes needed (100)' } },
);
section(
  P,
  'popup.events',
  'Events unlocked',
  {
    title: "Events unlocked!",
    ready: '**{event}** is ready in the {area}.',
    body: "The **Events** tab shows the events for all areas you have access to. Events require 🗲 **Energy** to start. You hold up to {cap} ({capNoAds} with ads removed). You regain one energy every {regen}, even while you're away. If you're out of energy, you can watch an ad to refill your energy meter. Excess energy will **Overcharge** your bar, so none is wasted.",
    later: "Dismiss",
    go: 'Go to Events',
  },
  {
    note: 'Shown once, when the first event unlocks.',
    vars: { event: 'the event that is ready', area: 'the Wandering Woods', cap: 'energy held (5)', capNoAds: 'with ads removed (20)', regen: 'time per energy (20 minutes)', ad: 'energy per ad (5)', ads: 'ads a day (3)' },
    labels: { ready: 'First line' },
  },
);
section(
  P,
  'popup.minigames',
  'Minigames unlocked',
  {
    title: "Minigames unlocked!",
    body: "**{game}** is open in the Events tab.\n\nEvery area has a minigame that can be unlocked. Each play costs 🗲 **{cost} energy**.\n\nMinigames always pay **gold relative to where you are in the game**. They also drop materials and grant a **timed buff** relative to the game. They can give more drops, faster attacks, more gold, and more, each helping you across the whole game while it lasts.\n\nYour score earns up to **3 stars**. The better you do, the more you get. Each minigame's details page shows exactly what every rank pays.",
    later: "Dismiss",
    go: 'Play now',
  },
  { note: 'Shown once, when the first minigame (Hunting Practice) opens. Play now opens its details page.', vars: { game: "Galladair's Hunting Practice", cost: 'energy a play (3)' } },
);
section(
  P,
  'popup.quests',
  'Daily quests',
  {
    title: 'Daily Quests',
    body: "Welcome to the **{area}**! Your **Quest Log** is now open. Tap the 📜 scroll at the top of the screen to see it.\n\nEvery day brings **{daily} Daily Quests**, like playing events, taking on Guardians and swarms, and slaying monsters. Finish them all to earn **{gemsDaily} Exalted Gems**. Every week brings **{weekly} Weekly Quests** worth **{gemsWeekly} Exalted Gems**, and you can collect a **Daily Check-in** bonus of {checkin} more.\n\nDaily Quests change at midnight, and Weekly Quests change on Monday. Spend your Exalted Gems in the **Shop** on upgrades that last forever.",
    later: 'Dismiss',
    go: 'Open quests',
  },
  { note: 'Shown once, when you first arrive in the Restless Graveyard (the quest log opens then).', vars: { area: 'Restless Graveyard', daily: '3', gemsDaily: '5', weekly: '3', gemsWeekly: '20', checkin: '5' } },
);
section(
  P,
  'popup.eventsLocked',
  'Events locked',
  { title: 'Events locked', body: 'Slay {count} {noun} in the {area} to unlock the **Events** tab, starting with the **{event}**.\n\n**{progress}**', ok: 'OK' },
  { note: 'Tapping the greyed-out Events tab.', vars: { count: 'kills needed', noun: '"slimes"', area: 'the Wandering Woods', event: 'the Slime Swarm', progress: 'e.g. 420 / 1,000' } },
);
section(
  P,
  'popup.areasLocked',
  'Areas locked',
  {
    title: 'Areas locked',
    body: 'Defeat the **{woods} Guardian** to unlock the {grove} and the **Areas** tab.\n\nThe **Guardian Challenge** becomes available in the **Events** tab once you\'ve slain {kills} monsters in the {woods} and survived its **Slime Swarm**.',
    ok: 'OK',
  },
  { note: 'Tapping the greyed-out Areas tab.', vars: { woods: 'the Wandering Woods', grove: 'the Fey Grove', kills: 'kills needed' } },
);
section(
  P,
  'popup.slayer',
  'You are the Slayer',
  {
    title: 'You are the Slayer!',
    body: "{name} {is} now **the Slayer**! The Slayer's **Skill Tree** is now open, and training can continue up to **Lv {max}**.\n\nThe level curve starts over, so it only takes one session to reach Lv {next}, and training costs stay the same.",
    ok: 'Onward',
  },
  { note: 'When your Hunter takes the Ascend node.', vars: { name: "your Hunter's name", is: '"is" (or "are" if unnamed: "You are")', max: 'new level cap', next: 'the next level' } },
);
section(
  P,
  'popup.ascended',
  'Hunter ascended',
  {
    title: '{name} ascended!',
    body: '{name} is now **the {title}**! A new **Skill Tree** is now open, and training can continue up to **Lv {max}**.\n\nThe level curve starts over, so it only takes one session to reach Lv {next}, and training costs stay the same.',
    ok: 'Onward',
  },
  { note: 'When a Guild Hunter takes the Ascend node.', vars: { name: 'the Hunter', title: 'their ascended title', max: 'new level cap', next: 'the next level' } },
);
section(
  P,
  'popup.rift',
  'Time Eater defeated',
  {
    title: 'Unbound from time',
    body: "The Time Eater swallowed the moment, and you with it. Deep in the **{rift}**, your Hunters have come loose from time.\n\nYou can now **Regress**. Go back to the very beginning, keep every level and skill, and earn **Memory Shards** for everything this run has built. Spend them on the **Regression Tree** in the menu to come back stronger.",
    ok: 'Dismiss',
    regress: 'See Regression',
  },
  { note: 'After the Time Eater cutscene, the first time it falls (it opens Regression).', vars: { rift: 'the Void Rift' } },
);
section(
  P,
  'popup.noEnergy',
  'Not enough energy',
  {
    title: 'Not enough Energy',
    need: '**{event}** needs **{cost} Energy**, and you have **{have}**.',
    wait: 'You regain one Energy every {regen}. You will have enough in **{wait}**.',
    adsUsed: "You've watched all {ads} of today's Energy ads.",
    ad: 'Watch an ad to restore **{ad} Energy** ({left} of {ads} left today). Energy past {max} will **Overcharge** your bar, so none is wasted.',
    watch: '📺 Watch ad',
    notNow: 'Not now',
    ok: 'OK',
  },
  {
    note: 'Tapping Start or Play without enough energy. With ads left: first line, then the ad line. Without: first line, the wait line, then the ads-used line.',
    vars: { event: 'the event', cost: 'its cost', have: 'energy you have', regen: 'time per energy', wait: 'time until enough', ads: 'ads a day', ad: 'energy per ad', left: 'ads left today', max: 'your energy cap' },
    labels: { need: 'First line', wait: 'Wait line', adsUsed: 'Ads used up', ad: 'Ad offer' },
  },
);
section(
  P,
  'popup.buff',
  'Minigame buff',
  {
    from: 'From **{event}** ({hunter}).',
    timed: "Each play adds {per} for a par score ({par} points), from {low} to {high} depending on your score, up to {cap}. It keeps working while you're away, and runs down as it does.",
    blessing: 'A score of {score} or more adds {n} charges, up to {cap}. Each {what} you roll uses one charge. While you hold charges, your best tier is the one used.',
    charges: 'Each play adds {n} charge{s} ({great} for a great score), up to {cap}. Starting a **Guardian Challenge** uses one charge.',
    left: 'Time left',
    chargesLeft: 'Charges',
    close: 'Close',
  },
  {
    note: "Tapping a minigame buff's bar on the Events tab: its name, what it does, what's left, then where it's from and one of the three ways it fills.",
    vars: { event: 'the minigame', hunter: 'e.g. Galladair the Ranger', per: 'time a par score adds', par: 'par score', low: 'least a play adds', high: 'most a play adds', cap: 'most it holds', score: 'score needed', n: 'charges a play adds', what: 'Refine or Enchant', great: 'charges for a great score' },
    labels: { from: 'Where from', timed: 'Timed buffs', blessing: 'Blessing charges', charges: 'Giant Slayer charges', left: 'Label: time left', chargesLeft: 'Label: charges' },
  },
);
section(
  P,
  'popup.salvage',
  'Salvage a piece',
  { title: 'Salvage {item}?', body: "You'll get back half of its materials:", bodyMods: "You'll get back half of its materials, and half of what its modifiers cost:", cancel: 'Cancel', ok: 'Salvage' },
  { note: 'Salvaging one piece of gear (the second text if it has modifiers).', vars: { item: 'the gear' }, labels: { bodyMods: 'Text (with modifiers)' } },
);
section(
  P,
  'popup.salvageAll',
  'Salvage by rarity',
  { title: 'Salvage {n} piece{s}?', body: 'Every unequipped {rarities} piece will be salvaged, giving back half of its materials. Equipped gear is kept.', cancel: 'Cancel', ok: 'Salvage' },
  { note: 'Auto Salvage → Salvage now.', vars: { n: 'pieces', rarities: 'e.g. Common, Uncommon' } },
);
section(
  P,
  'popup.maxTrain',
  'Train to max',
  {
    title: 'Train to max?',
    train: 'Train **{name}** {count} times for 🪙 **{cost}**? This is the most you can afford right now.',
    empower: 'Empower the **{name}** {count} times for 🪙 **{cost}**? This is the most you can afford right now.',
    hint: 'Holding down the **Train** or **Empower** button on a card always trains as much as you can afford.',
    never: 'Do not show again',
    ok: 'OK',
    setting: 'Hold to train to max',
    settingBody: 'Holding down the **Train** or **Empower** button on a card trains as much as you can afford. **Ask first** shows a pop-up to confirm, and **Just train** skips it.',
  },
  {
    note: 'Holding down Train on a Hunter card, or Empower on a Bestiary card. OK trains to the max and asks again next time; Do not show again trains to the max and stops asking.',
    vars: { name: 'the Hunter or monster', count: 'how many times', cost: 'the total cost' },
    labels: { train: 'Text: Hunter', empower: 'Text: monster', hint: 'Text: second line', setting: 'Setting name', settingBody: 'Setting description' },
  },
);
section(
  P,
  'popup.autoSkills',
  'Spend skill points',
  {
    hunterTitle: 'Spend skill points?',
    hunter: "Spend **{name}'s** {points} skill point{s}? They're spread evenly: every skill within reach gets a point before any gets a second, and skills that open up along the way are evened out too. Ascending is always left to you.",
    hunterHint: 'Holding down a **Hunter card** always spends their skill points this way.',
    monsterTitle: 'Spend evolution points?',
    monster: "Spend the **{name}'s** {points} evolution point{s}? They're spread evenly: every evolution within reach gets a point before any gets a second, and evolutions that open up along the way are evened out too.",
    monsterHint: 'Holding down a **monster card** in the Bestiary always spends its evolution points this way.',
    never: 'Do not show again',
    ok: 'OK',
    hunterSetting: 'Hold a Hunter card to spend skill points',
    hunterSettingBody: "Holding down a Hunter's card spends their skill points evenly across their tree, a point in every skill within reach before any gets a second. **Ask first** shows a pop-up to confirm, and **Just spend** skips it.",
    monsterSetting: 'Hold a monster card to spend evolution points',
    monsterSettingBody: "Holding down a monster's card in the Bestiary spends its evolution points evenly across its tree, a point in every evolution within reach before any gets a second. **Ask first** shows a pop-up to confirm, and **Just spend** skips it.",
  },
  {
    note: "Holding down a Hunter's card (skill points) or a monster's card in the Bestiary (evolution points). Each has its own Do not show again.",
    vars: { name: 'the Hunter or monster', points: 'how many points', s: "'s' when more than one" },
    labels: { hunter: 'Text: Hunter', monster: 'Text: monster', hunterHint: 'Text: Hunter second line', monsterHint: 'Text: monster second line' },
  },
);
section(
  P,
  'popup.holdCardTip',
  'Tip: hold a card to spend points',
  {
    title: 'Tip: hold a card',
    body: "Holding a button works on cards too! When a Hunter has **skill points** to spend, **hold their card** and they're spent for you, spread evenly across their tree. Holding a monster's card in the **Bestiary** spends its **evolution points** the same way.",
    ok: 'Got it',
  },
  { note: "Shown once, after you've held a Train button to train to the max five times." },
);
section(
  P,
  'popup.mailbox',
  'While you were away',
  {
    title: 'While you were away…',
    body: 'These came up while you were gone. Tap one to read it.',
    close: 'Close',
    button: 'While you were away',
  },
  { note: "The envelope on the battlefield: one-time tips that came due while you were away, listed by their titles. Read one, then go where it points, or come back here with its other button." },
);
section(P, 'popup.quit', 'Quit', { title: 'Quit', body: "Close the game? Your progress is saved, and your Hunters keep hunting while you're away.", no: 'No', yes: 'Yes' }, { note: 'Menu → Quit.' });
section(
  P,
  'popup.reset',
  'Reset everything',
  { title: 'Reset everything?', body: 'This deletes your save, including your areas, Hunters, items, and materials. This cannot be undone.', cancel: 'Cancel', ok: 'Delete' },
  { note: 'Settings → Reset all progress.' },
);
section(
  P,
  'popup.noGems',
  'Not enough gems',
  { title: 'Not enough Exalted Gems', body: '**{item}** costs {gem} **{cost}**, and you have **{have}**.\n\nEarn more from Daily and Weekly Quests in the **Quest Log**, or get some here.', go: 'Get gems', notNow: 'Not now' },
  { note: "Tapping a shop upgrade you can't afford.", vars: { gem: 'the gem icon', item: 'the upgrade', cost: 'its price', have: 'gems you have' } },
);
section(
  P,
  'popup.buyPremium',
  'Buy an upgrade',
  {
    owned: 'With what you own: {total} (now {now}).',
    body: "Costs {gem} **{cost}** (you have {have}). It's permanent, and it multiplies on top of everything else.",
    buy: 'Buy',
    notNow: 'Not now',
  },
  { note: "Tapping one of today's upgrades in the Shop: its name, rarity and effect, the owned line if you have some of its kind, then the cost line.", vars: { total: 'your total with it', now: 'your total now', gem: 'the gem icon', cost: 'its price', have: 'gems you have' }, labels: { owned: 'Owned line', body: 'Cost line' } },
);
section(
  P,
  'popup.offline',
  'Welcome back',
  {
    title: 'Welcome back!',
    away: 'Offline time: **{away}**',
    cap: 'Max offline gains time: **{cap}**',
    loot: '🎁 {n} piece{s} of loot',
    lootSalvaged: '({n} auto-salvaged)',
    knockouts: '💫 Some Hunters were knocked out while you were away. Tap **Details** to see more.',
    doubledNoAds: '✨ Ads removed: your gold and materials are doubled',
    doubled: '✨ Doubled!',
    details: 'Details',
    double: 'Watch ad: ×2',
    collect: 'Collect',
  },
  {
    note: 'Coming back to the game after a while away.',
    vars: { away: 'time away', cap: 'the most time that counts', n: 'pieces' },
    labels: { away: 'Time away', cap: 'Time cap', loot: 'Loot line', lootSalvaged: 'Loot: salvaged', knockouts: 'Knockouts', doubledNoAds: 'Doubled (ads removed)', doubled: 'Doubled (ad)' },
  },
);
section(
  P,
  'popup.offlineDetails',
  'While you were away',
  {
    title: 'While you were away',
    total: '{away} away · 🪙 {gold} · ⚔️ {kills} monsters slain',
    materials: 'Materials',
    loot: 'Loot drops',
    salvaged: 'Salvaged equipment',
    areas: 'By area',
    area: '⚔️ {kills} monsters slain · 🪙 {gold}',
    knockedOut: '💫 Knocked out: {who}',
    lootCount: '🎁 {n} piece{s} of gear looted',
    lootSalvaged: '{n} salvaged',
    knockouts: 'Knocked out Hunters stop fighting. Make your Hunters stronger, or move them to an easier area, to keep monsters from slipping through.',
    back: 'Back',
    collect: 'Collect',
  },
  {
    note: 'Welcome back → Details.',
    vars: { away: 'time away', gold: 'gold', kills: 'monsters slain', who: 'Hunters and how often' },
    labels: { total: 'Summary', materials: 'Heading', loot: 'Heading', salvaged: 'Heading', areas: 'Heading', area: 'Area line', knockedOut: 'Area knockouts', knockouts: 'Knockout tip' },
  },
);

// ---- Toasts: the short messages above the tab bar ----

const T = 'Toasts';
section(
  T,
  'toast.gear',
  'Gear',
  {
    loot: '🎁 Loot! {item}',
    salvaged: '♻️ Looted and salvaged: {item}',
    crafted: 'Crafted {item}!',
    upgraded: 'Upgraded {item} to {stars}★!',
    salvagedN: '♻️ Salvaged {n} piece{s}',
    perfect: '🌟 Perfect! {item}: {mod}',
    refine: '⚒️ {item}: {mod}',
    enchant: '✨ {item}: {mod}',
    equip: 'Equip',
  },
  {
    vars: { item: 'the item (with its icon for loot)', stars: 'its new stars', n: 'pieces', mod: 'the new modifier' },
    labels: { loot: 'Loot drop', salvaged: 'Loot auto-salvaged', crafted: 'Crafted', upgraded: 'Upgrade crafted again', salvagedN: 'Salvaged by rarity', perfect: 'Modifier: perfect', refine: 'Modifier: refine', enchant: 'Modifier: enchant', equip: 'Equip button on a crafted toast' },
  },
);
section(
  T,
  'toast.areas',
  'Areas',
  { here: "You're already in {area}", busy: 'Finish the event first!', traveled: 'Traveled to {area}!', full: '{area} is full', fullSwap: '{area} is full: tap a Hunter there to swap' },
  {
    vars: { area: 'the area' },
    labels: { here: 'Already there', busy: 'Event running', traveled: 'Traveled', full: 'Area full', fullSwap: 'Area full (swap)' },
  },
);
section(
  T,
  'toast.rewards',
  'Rewards & shop',
  { energy: '🗲 +{n} energy', gems: '💎 +{n} Exalted Gems', bought: '{item} bought', noAds: '🚫 Ads removed. Thank you!' },
  { vars: { n: 'amount', item: 'the upgrade' }, labels: { energy: 'Energy ad', gems: 'Gems', bought: 'Shop upgrade bought', noAds: 'Remove Ads bought' } },
);

// ---- Tutorials: the Tutorials menu and its guides ----

const G = 'Tutorials';
section(
  G,
  'tut.menu',
  'Tutorials menu',
  {
    title: 'Tutorials',
    guides: 'Guides',
    tips: 'Tips',
    weapons: 'Weapon types',
    weaponsDesc: 'How each kind of weapon attacks, including range, speed, reloads, knockback, and more.',
    damage: 'Damage types & status effects',
    damageDesc: 'What each damage type does, and monster weaknesses and resistances.',
    modify: 'Modifying gear',
    modifyDesc: 'Modifier slots, Refine and Enchant, rolling, and Perfect rolls.',
    welcome: 'Welcome',
    welcomeDesc: 'Getting started.',
    training: 'Training',
    trainingDesc: 'Making your Hunter stronger. Opens after {train} slimes.',
    crafting: 'Crafting',
    craftingDesc: 'Materials, gear, and Upgrades.',
    wolf: 'New monsters & the full-screen menu',
    wolfDesc: 'Unlocking the wolf, and expanding the menu over the battlefield.',
    empower: 'Empower',
    empowerDesc: 'Unlocking and Empowering monsters. Opens after {empower} slimes.',
    eventsLocked: 'Unlocking Events',
    eventsLockedDesc: 'How to open the Events tab.',
    events: 'Events',
    eventsDesc: 'Guardian Challenges, swarms, minigames, and Energy.',
    minigames: 'Minigames',
    minigamesDesc: 'What minigames pay, their buffs, and their star ranks.',
    quests: 'Daily Quests',
    questsDesc: 'Daily and Weekly Quests, the Daily Check-in, and the Exalted Gems they pay.',
    timeEater: 'The Time Eater',
    timeEaterDesc: 'Replay the cutscene from the Void Rift.',
  },
  {
    note: 'Menu → Tutorials: the page title, two headings, and a name and a line for each tip.',
    vars: { train: 'slimes to open Training', empower: 'slimes to open Empower' },
    labels: Object.fromEntries(
      ['title:Page title', 'guides:Heading', 'tips:Heading', 'weapons:Row', 'damage:Row', 'modify:Row', 'welcome:Row', 'training:Row', 'crafting:Row', 'wolf:Row', 'empower:Row', 'eventsLocked:Row', 'events:Row', 'minigames:Row', 'timeEater:Row']
        .map((s) => s.split(':'))
        .flatMap(([k, v]) => [
          [k, v],
          [`${k}Desc`, `${v === 'Row' ? 'Row line' : v}`],
        ]),
    ),
  },
);
section(
  G,
  'tut.weapons',
  'Weapon types guide',
  {
    title: 'Weapon types',
    body: "Each weapon type comes in three **archetypes**. There's the standard form, and two others that trade one strength for another. For example, a Maul slams slower over a much larger area, and a Mallet swings quicker over a smaller one. A new weapon can change how a Hunter fights, not just how hard they hit.\n\nEvery hit starts from the weapon's own damage, which goes up when you upgrade it. Training, skills, Upgrades, and armor or accessory bonuses all multiply it. Heavier weapon types have higher base damage for their rarity.\n\nYour Hunter can wield any weapon and attacks the way it does. Guild Hunters keep their own signature attack, but their weapon's type changes its speed, damage, and range.\n\nEvery type trades off speed, damage, reach, and how many monsters it hits, so none is simply the best. Melee hits knock surviving monsters back.",
  },
  { note: "The guide's opening card. Each weapon type's own description is under Combat." },
);
section(
  G,
  'tut.weapons.tome',
  'Weapon types guide: tomes',
  {
    tomeSummons:
      "Every creature a Tome summons has a **summon type**: {types}. Any bonus your Hunter has against that kind of monster makes their summons of that kind hit harder too. These bonuses are called **banes**, and come from Guild Hunter passives, accessories, and the Bane enchantment. For example, +20% damage against Undead also makes undead summons hit 20% harder. Spirits aren't a kind of monster, so banes don't help them.",
  },
  { note: 'Under the Tome on the Weapon types guide.', vars: { types: 'the summon types' }, labels: { tomeSummons: 'Summon types and banes' } },
);
section(
  G,
  'tut.modify',
  'Modifying gear guide',
  {
    title: 'Modifying gear',
    body: "Rarer gear has **modifier slots**, shown on its card. Tap **Modify** on a piece's card, pick a slot, and choose **Refine** or **Enchant**. Refine adds equipment stat bonuses once Kargesh the Blacksmith has joined, and Enchant adds elemental and magical effects once Marceline the Enchantress has joined.\n\n**Roll** pays the cost shown and gives you {choices} random choices to pick from. You start with 2. The **Codex of Choices** Upgrade from the Ascendant Steps adds a third, and the **Sigil of Fate** from the Void Rift adds a fourth. The one you pick goes in the slot, replacing whatever was there. If you don't like any of them, **Reroll** gives you a fresh set for the same cost.\n\nThe same modifier is stronger on rarer gear. A roll at the very top of its range is **Perfect**, and shows a rainbow border. Blessings from Kargesh's and Marceline's minigames give each choice extra tries at a Perfect roll.",
    ok: 'Got it',
  },
  { note: 'Tutorials → Modifying gear (the Modify window keeps to its buttons).', vars: { choices: 'choices a roll draws' } },
);
section(
  G,
  'tut.damage',
  'Damage types guide',
  {
    title: 'Damage types',
    body: "Every attack deals a damage type. It uses the weapon's type, or the Hunter's if the weapon has none.\n\nMonsters can be **Weak** to a type (×{weak} damage) or **Resist** it (×{resist}). You can see which on their card in the **Bestiary**.\n\nMost types can inflict a **status effect**, and a weapon's status chance sets how often. A monster can only have one of each effect at a time, and a new one refreshes it. **Bleeding** is the exception, since it stacks.",
    heading: 'Damage types',
    none: 'No status effect. Pure damage that few monsters resist.',
  },
  { note: "The guide's opening card. Each damage type's status effect is under Combat.", vars: { weak: 'weak multiplier', resist: 'resist multiplier' }, labels: { heading: 'Heading', none: 'Type with no effect' } },
);

// ---- Tooltips: what shows when you hold or tap a small marker ----

const TT = 'Tooltips';
section(
  TT,
  'tip.markers',
  'Markers',
  {
    skillPoints: 'Unspent Skill Points',
    evoPoints: 'Unspent Evolution Points',
    tuned: 'Tuned by Reginald the Artificer',
    energy: 'Energy cost',
    journalNew: '{n} new',
    flying: 'Flies over rocks, trees and graves',
    ranged: 'Shoots projectiles from afar',
  },
  {
    vars: { n: 'unread entries' },
    labels: { skillPoints: 'Hunter tile dot', evoPoints: 'Monster tile dot', tuned: "Reginald's tuning stars", energy: 'Event energy pips', journalNew: 'Journal "!"', flying: 'Flying monster tag', ranged: 'Ranged monster tag' },
  },
);
section(
  TT,
  'tip.gear',
  'Gear tags',
  {
    dmgOne: 'This weapon deals **{type}** damage.',
    dmgPerShot: 'Each projectile deals one of its types in turn, at full damage: {types}.',
    dmgSplit: 'Each hit is split evenly between its {n} types: {types}.',
    proc: '**{pct}%** chance per hit to apply **{status}**: {effect}.',
    noProc: "This weapon doesn't inflict its status effect.",
    poisonHp: 'plus {pct}% of its max HP ({guardian}% on Guardians)',
    special: 'Special: {how}, starting with {first}.',
    specialProc: 'Each element can inflict its status effect.',
    specialProcAdvanced: 'Each element can inflict its status effect (**{pct}%** chance per hit).',
    typeBonus: '+{pct}% {type} damage, whatever deals it.',
    typeBonusSimple: 'More {type} damage, whatever deals it.',
    baneSimple: 'Deals extra damage to {kind}s.',
    finder: 'At {stars}★, your {kind} kills have a {pct}% chance to drop {material}.',
    finderSimple: 'At {stars}★, your {kind} kills can drop {material}.',
    archetype: '**{name}**: {desc}',
    spell: 'After its bolts, this Staff casts **{spell}**: {desc}',
    tome: 'Every **{every} seconds**, summons {a} **{creature}** that charges through the monsters for {duration} seconds, striking every one it runs past, then fades. Attack speed summons it sooner. Summon type: **{type}**.',
    tomeBane: 'Bonus damage against **{kind}s** (a bane) makes it hit harder too.',
    tomeSpirit: "Spirits aren't a kind of monster, so no bane makes them hit harder.",
    tomeAdvanced: 'Every {guild} seconds for a Guild Hunter, before attack speed. Each strike deals {bites}× the Tome\'s hit, and it can strike the same monster again after a moment.',
    tomeLunge: 'Every {cooldown} seconds, it lunges into a faster charge, its strikes hitting for {damage}× instead.',
    bane: '+{pct}% damage against {kind}s.',
    ownDamage: 'Has its own damage, raised by your bonuses instead of your weapon.',
    unique: '**Unique**: {text}.',
    builtIn: '**Built-in**: {text}.',
  },
  {
    note: "What a tag on a gear card says when tapped. With Advanced tooltips off (Settings), the plain versions show; on, the ones with the numbers. Weapon, armor and accessory types, spells and damage types use their own descriptions (under Combat).",
    vars: {
      pct: 'percent',
      type: 'damage or summon type',
      types: 'its damage types',
      n: 'how many types',
      status: 'the status effect',
      effect: 'what the effect does',
      guardian: 'percent on Guardians',
      how: 'how it changes elements',
      first: 'its first element',
      name: 'archetype',
      weapon: 'weapon type',
      desc: 'its description',
      spell: 'the spell',
      kind: 'monster kind',
      stars: 'stars needed',
      material: 'the material',
      text: "the enchantment's effect",
      creature: 'what it summons',
      a: '"a" or "an"',
      every: 'seconds between summons (your Hunter)',
      guild: 'seconds between summons (a Guild Hunter)',
      duration: 'seconds it hunts',
      bites: "strike damage × the tome's hit",
      cooldown: 'seconds between lunges',
      damage: "lunge strike damage × the tome's hit",
    },
    labels: {
      dmgOne: 'Damage type: one type',
      dmgPerShot: 'Damage type: one per projectile',
      dmgSplit: 'Damage type: split hits',
      proc: 'Damage type: status chance (advanced)',
      noProc: 'Damage type: no status (advanced)',
      poisonHp: 'Poison: max HP part (advanced)',
      special: 'Special weapon',
      specialProc: 'Special weapon: status',
      specialProcAdvanced: 'Special weapon: status (advanced)',
      typeBonus: 'Damage type bonus (advanced)',
      typeBonusSimple: 'Damage type bonus',
      archetype: 'Weapon archetype',
      spell: 'Staff spell',
      tome: 'Tome summon',
      tomeBane: 'Tome summon: banes',
      tomeSpirit: 'Tome summon: spirits and banes',
      tomeAdvanced: 'Tome summon (advanced)',
      tomeLunge: 'Tome summon: lunge (advanced)',
      bane: 'Bane (advanced)',
      baneSimple: 'Bane',
      ownDamage: 'Ability damage note (advanced)',
      finder: 'Finder (advanced)',
      finderSimple: 'Finder',
      unique: 'Unique enchantment',
      builtIn: 'Built-in enchantment',
    },
  },
);

section(
  TT,
  'tip.effect',
  'Gear abilities (plain)',
  {
    thorns: 'Thorns: monsters that reach you take damage.',
    block: 'Shield burst: each block blasts nearby monsters.',
    evade: 'Evasion: a chance to slip past a monster that reaches you.',
    pulse: 'Pulse: every so often, a burst of damage around you.',
    summon: 'Every so often, summons {name}s that charge through the monsters for a while, striking every one they pass.',
    wave: 'Wave: melee attacks can send out a wave of damage.',
    strike: 'Lightning strike: every so often, lightning strikes several monsters.',
    chill: 'Chill aura: monsters near you move at half speed.',
    spell: '{spell}: {desc}',
    unique: '{name}: every so often, {desc}.',
    potion: 'Potion: every so often, gain a short boost to {stat}.',
  },
  {
    note: "An accessory's or armor's ability tag with Advanced tooltips off. On, it shows the exact damage, chance, cooldown and duration instead.",
    vars: { name: 'the creature', spell: 'the spell', desc: 'its description', stat: 'the stat it boosts' },
    labels: { thorns: 'Thorns', block: 'Shield burst', evade: 'Evasion', pulse: 'Pulse', summon: 'Summoner', wave: 'Wave', strike: 'Lightning strike', chill: 'Chill aura', spell: 'Spell', unique: 'Unique', potion: 'Potion' },
  },
);
section(
  TT,
  'tip.settings',
  'Advanced tooltips setting',
  {
    title: 'Advanced tooltips',
    body: "Changes what a gear tag says when tapped. **Simple** says what each thing does. **Advanced** adds the numbers, like how often a status effect is inflicted, how much it deals and for how long, and each ability's damage and cooldown.",
    simple: 'Simple',
    advanced: 'Advanced',
  },
  { note: 'Settings → Display.', labels: { title: 'Name', body: 'Description', simple: 'Option', advanced: 'Option' } },
);

// ---- Events: the event card, the details page and the minigame screens ----

const E = 'Events';
section(
  E,
  'event.card',
  'Event card',
  { minigame: 'Play for gold, materials, and {buff}: {desc}', best: 'Best {score}', notPlayed: 'Not played yet', details: 'Details', reward: 'Reward: {what}' },
  {
    note: 'The card pinned under the event tiles.',
    vars: { buff: "the minigame's buff", desc: 'what it does', score: 'best score', what: 'what finishing it gives' },
    labels: { minigame: "Minigame's line", best: 'Best score', notPlayed: 'Not played', details: 'Details button', reward: 'Reward line' },
  },
);
section(
  E,
  'event.detail',
  'Event details page',
  {
    with: 'With {hunter} · {area}',
    rewards: 'Rewards',
    opens: 'Beating it the first time opens the **{area}**.',
    opened: 'Beating it the first time opened the **{area}**.',
    bounty: 'Every win pays a Guardian bounty of 🪙 **{gold}**, {material}, and a piece of gear.',
    time: 'You have {time} seconds to bring it down once it appears.',
    swarm: 'It lasts {time} seconds. Everything slain drops loot as usual, so twice the monsters means twice the gold and materials.',
    joins: '{hunter} joins after {how}.',
    completed: 'Completed {n} time{s}.',
    best: 'Your best',
    ranks: 'Star rankings',
    ranksNote: 'Rewards grow with every point you score. Here is what a play earns at each rank.',
    points: '{score}+ points',
    gold: "Gold is measured against your income, so it's always worth playing wherever you are. A par score ({par} points) pays {new} of your gold income while {area} is the furthest area you've reached, and {old} after that.",
    drops: 'Drops: {list}.',
    timedNote: "It keeps working while you're away (your Hunters' gains while you're gone count it), and runs down as it does.",
    blessingNote: 'Each {what} you roll uses one charge.',
    slayerNote: 'Starting a Guardian Challenge uses one charge, instead of energy.',
    stardustNote: 'Coming back after 15 minutes or more away uses one charge.',
  },
  {
    note: "An event's Details page.",
    vars: { hunter: 'the Hunter', area: 'an area', gold: 'bounty gold', material: 'its material', time: 'seconds', how: 'how they unlock', n: 'times', score: 'score', par: 'par score', new: 'e.g. 1 h', old: 'e.g. 20 min', list: 'the drop rates', what: 'Refine or Enchant' },
    labels: { with: 'Who and where', rewards: 'Heading', opens: 'Guardian: opens', opened: 'Guardian: opened', bounty: 'Guardian: bounty', time: 'Guardian: time', swarm: 'Swarm', joins: 'Hunter joins', completed: 'Times completed', best: 'Best label', ranks: 'Heading', ranksNote: 'Ranks note', points: 'Rank score', gold: 'Gold note', drops: 'Drops note', timedNote: 'Timed buff note', blessingNote: 'Blessing note', slayerNote: 'Giant Slayer note', stardustNote: 'Stardust note' },
  },
);
section(
  E,
  'event.echo',
  'Rift Echo',
  {
    now: 'This hour: {game} · next game in {time}',
    intro: '**Rift Echo:** double the gold, paid with Void Rift materials, and twice the buff for twice as long.',
    title: 'Rift Echo: {game}',
  },
  {
    note: "The Void Rift's hourly minigame: the card's line, the intro card's extra paragraph, and the game's title.",
    vars: { game: "this hour's game", time: 'time until it changes' },
    labels: { now: "Card: this hour's game", intro: 'Intro card line', title: 'Game title' },
  },
);
section(
  E,
  'minigame.screen',
  'Minigame screen',
  { start: 'Start', quit: 'Quit', best: 'Best: {score}', done: 'All done!', points: '{n} point{s}', none: 'No rewards this time.', newBest: 'New best!', collect: 'Collect' },
  {
    note: "Every minigame's intro card, buttons and results card. Each game's own intro is on its own page.",
    vars: { score: 'best score', n: 'score' },
    labels: { best: 'Intro: best', done: 'Results title', points: 'Results score', none: 'Results: nothing earned', newBest: 'Results: new best' },
  },
);

// ---- Menus & labels ----

const M = 'Menus & labels';
section(
  M,
  'menu.main',
  'Menu',
  { title: 'Menu', account: 'Account', tutorials: 'Tutorials', journal: 'Journal Entries', shop: 'Shop', regression: 'Regression', settings: 'Settings', quit: 'Quit', close: 'Close' },
  { note: 'The menu button at the top right.', labels: { title: 'Title', account: 'Item', tutorials: 'Item', journal: 'Item', shop: 'Item', regression: 'Item (after the Time Eater)', settings: 'Item', quit: 'Item' } },
);
section(
  M,
  'settings.feedback',
  'Submit Feedback',
  {
    title: 'Submit Feedback',
    blurb: 'Any feedback, bug reports, quality of life changes, or update requests can be submitted here.',
    bug: 'Bug',
    qol: 'Quality of life',
    request: 'Update request',
    other: 'Other',
    placeholder: 'Tell us what happened, or what you would like to see…',
    send: 'Send',
    note: "Your message is sent with your game's version, device type and progress, to help track down bugs.",
    sent: 'Thanks! Your feedback was sent.',
    wait: 'You can send more feedback in {s}s.',
    notReady: "Feedback isn't connected yet. It will be soon!",
    failed: "Couldn't send your feedback. Check your connection and try again.",
  },
  { note: 'The card at the top of Settings.', vars: { s: 'seconds' }, labels: { sent: 'Toast after sending', wait: 'Toast: sent one moments ago', notReady: 'Toast: not connected', failed: 'Toast: no connection' } },
);
section(
  M,
  'menu.account',
  'Account',
  {
    title: 'Account',
    signedOut: 'Not signed in',
    signedOutNote: 'Sign in to keep your progress safe online and carry it to any phone or tablet.',
    signIn: 'Sign in',
    signOut: 'Sign out',
    signedIn: 'Signed in with {provider}',
    chooseTitle: 'Sign in',
    chooseNote: 'Pick how you want to sign in. Your game stays on this device either way.',
    google: 'Continue with Google',
    apple: 'Continue with Apple',
    email: 'Continue with email',
    emailTitle: 'Sign in with email',
    emailAddress: 'Email address',
    password: 'Password',
    emailSignIn: 'Sign in',
    emailCreate: 'Create account',
    forgot: 'Forgot password?',
    resetSent: 'If an account uses {email}, a link to reset its password is on its way.',
    comingSoon: 'Online accounts are being set up and aren\'t available yet. Your progress is saved on this device.',
    cancel: 'Cancel',
    statsTitle: 'Your Stats',
    regressionTitle: 'Regression',
    deleteTitle: 'Delete Account',
    deleteNote: 'Deletes your online account and everything saved with it. The game on this device is kept.',
    deleteSignedOut: 'Sign in to manage your account.',
    delete: 'Delete account',
    deleteConfirm: 'Delete your account? This removes it and your online save for good, and can\'t be undone. Your game on this device is kept.',
    deleteYes: 'Delete',
    deleted: 'Your account has been deleted.',
    failed: 'That didn\'t work. Check your connection and try again.',
  },
  {
    note: 'Menu → Account: signing in, your lifetime stats, and deleting the account.',
    vars: { provider: 'Google, Apple or email', email: 'the address typed' },
    labels: { signedOutNote: 'Under "Not signed in"', chooseNote: 'Sign-in choices: note', comingSoon: 'Shown while sign-in is not connected', resetSent: 'After Forgot password', deleteConfirm: 'Delete: confirm', deleted: 'Toast after deleting', failed: 'Error toast' },
  },
);
section(
  M,
  'menu.regression',
  'Regression',
  {
    title: 'Regression',
    tree: 'Regression Tree',
    regress: 'Regress',
    treeNote: 'Spend your Memory Shards here. Start from **Stabilize** in the centre. Each node can be bought once, and opens once a node next to it is owned. Everything here lasts forever.',
    regressNote: "Go back to day 1 in the Wandering Woods. Every Hunter keeps their levels, training, and skills, but Guild Hunters must be recruited again. Gold, materials, gear, Upgrades, areas, and the Bestiary start over. You gain **{shards}** Memory Shards for everything this run has built.",
    worth: "This run's worth",
    gold: 'Gold',
    materials: 'Materials',
    gear: 'Gear and Upgrades (×{weight})',
    total: 'Total',
    shardsNow: 'Memory Shards now',
    runs: 'Regressions',
    runTime: 'This run',
    button: 'Regress for {shards} Memory Shards',
    confirmTitle: 'Regress?',
    confirmBody: 'You go back to day 1 with **{shards}** Memory Shards. Gold, materials, gear, Upgrades, areas, and the Bestiary are lost, but levels and skills stay.',
    confirmYes: 'Regress',
    confirmNo: 'Not yet',
    buy: 'Buy for {cost}',
    maxed: 'Owned ✓',
    cost: 'Costs',
    soon: 'Coming soon',
    locked: 'Buy a node next to this one first.',
    share: 'Spend at most',
    regressFor: 'Regress now and the shards it pays will cover this.',
  },
  {
    vars: { shards: 'Memory Shards', weight: 'gear weighting', cost: 'shards' },
    labels: { title: 'Title', tree: 'Tab', regress: 'Tab', treeNote: 'Tree note', regressNote: 'Regress note', button: 'Regress button', confirmTitle: 'Confirm title', confirmBody: 'Confirm text', confirmYes: 'Confirm button', confirmNo: 'Cancel button', buy: 'Node buy button', maxed: 'Node owned', cost: 'Node price label', soon: 'Node not yet for sale', locked: 'Node locked note', share: 'Auto Empower share label', regressFor: 'Node note when regressing now would pay for it' },
  },
);
section(
  M,
  'menu.tabs',
  'Tab bar',
  { hunters: 'Hunters', inventory: 'Inventory', beasts: 'Bestiary', events: 'Events', areas: 'Areas' },
  { note: 'The five tabs along the bottom.', labels: { hunters: 'Tab', inventory: 'Tab', beasts: 'Tab', events: 'Tab', areas: 'Tab' } },
);
section(
  M,
  'menu.loading',
  'Loading screen',
  { title: 'Pocket Hunter', by: 'By Variette Studios' },
  { note: 'The splash shown while the game loads.', labels: { title: 'Title', by: 'Byline' } },
);
section(
  M,
  'menu.quests',
  'Quest Log',
  {
    dailyNote: 'Daily Quests reset at midnight. Exalted Gems buy permanent upgrades in the Shop.',
    weeklyNote: 'Weekly Quests reset at midnight going into Monday. Finishing all your Daily Quests in a day counts toward the week.',
    allDaily: 'Finish every Daily Quest',
    allWeekly: 'Finish every Weekly Quest',
    checkIn: 'Daily Check-in',
    checkInAd: 'Watch an ad, once a day.',
    checkInNoAds: 'Collect it once a day.',
  },
  { labels: { dailyNote: 'Daily page note', weeklyNote: 'Weekly page note', allDaily: 'Daily bonus', allWeekly: 'Weekly bonus', checkIn: 'Check-in', checkInAd: 'Check-in line', checkInNoAds: 'Check-in line (ads removed)' } },
);
section(
  M,
  'menu.shop',
  'Shop',
  {
    test: 'Test mode: purchases go through without any payment until store billing is added.',
    removeAds: 'No more ads! Your Energy bar grows to {cap} and refills all the way on its own, your offline gold and materials are always doubled, and you can collect the Daily Check-in bonus without an ad.',
    today: "Today's upgrades",
    stock: 'Permanent upgrades for every Hunter in every area, kept through every Regression. {n} new items in {time}.',
    merchant: 'Monster Merchant',
    merchantNote: 'Trade {amount} of a material for {gems} Exalted Gems, once a day for each material. {n} new materials in {time}.',
  },
  {
    vars: { cap: 'energy cap without ads', n: 'items (or materials) a day', time: 'time to the next stock', amount: 'materials per trade', gems: 'gems per trade' },
    labels: { test: 'Test mode note', removeAds: 'Remove Ads', today: 'Heading', stock: 'Stock note', merchant: 'Merchant heading', merchantNote: 'Merchant note' },
  },
);
