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
    title: '💪 Time to train!',
    body: "You have enough gold to **Train** your Hunter! Tap **Train** in the Hunters tab to increase your strength!\n\nAfter training enough, your Hunter will level up, granting **Skill Points** that can unlock more power and abilities.\n\nOpen the Hunter's card to see more details, upgrade their abilities, and change their equipment!\n\nIn the full card, the **×1 / ×10 / ×100 / MAX** switch under Training sets how many levels each tap of Train buys; MAX buys as many as you can afford. Your choice applies to every Hunter's Train button.",
    later: 'Later',
    go: 'Go to Hunters',
  },
  { note: 'Shown once, the first time you can afford to train your Hunter.' },
);
section(
  P,
  'popup.wolf',
  'A new monster',
  {
    title: '🐺 A new monster!',
    body: 'The wolf is now ready to be unlocked! Scroll down in the **Bestiary** to see the wolf.\n\nAdditionally, you can **swipe up** on the tab bar, or **long press** it, to expand the menu. To close the expanded menu, you can swipe down, long press again, or press the **red arrow** button to drop it down.',
    later: 'Later',
    go: 'Go to Bestiary',
  },
  { note: 'Shown once, when you can first afford to unlock the wolf.' },
);
section(
  P,
  'popup.craft',
  'Ready to craft',
  {
    title: '🔨 Ready to craft!',
    ready: "You've gathered enough materials to craft your first item: **{item}**.",
    waiting: 'Once you gather enough materials, you can craft your first item.',
    body: 'Monsters drop materials when slain. Spend them in **Inventory → Crafting** on gear for your Hunters and on Upgrades that make everyone stronger.',
    later: 'Later',
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
    title: '👾 Empower unlocked!',
    body: "You've slain {kills} slimes. In the **Bestiary**, unlock new monsters to join an area's horde, and **Empower** them with gold: tougher, but they pay more gold and drop more materials.\n\nEvery level earns an **evolution point**. Tap a monster to evolve it; slaying more of it opens further evolutions. It all applies wherever they're hunted, including by stationed Hunters.",
    later: 'Later',
    go: 'Go to Bestiary',
  },
  { note: 'Shown once, when the 100th slime falls.', vars: { kills: 'slimes needed (100)' } },
);
section(
  P,
  'popup.events',
  'Events unlocked',
  {
    title: '🎉 Events unlocked!',
    ready: '**{event}** is ready in the {area}.',
    body: "The Events tab shows the events of every area you've opened. Slay monsters in an area to unlock its events. Each event costs 🗲 **energy** to start: a swarm 1, a Guardian 1 to 3 (more in later areas), a minigame 3. You hold up to {cap} ({capNoAds} with ads removed), and one comes back every {regen}, even while you're away. Out of energy, you can watch an ad for {ad} more, {ads} times a day.",
    later: 'Later',
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
    title: '🎮 Minigames unlocked!',
    body: "**{game}** is open in the Events tab.\n\nEvery area has a minigame starring one of its Hunters, opened by recruiting them. Each play costs 🗲 **{cost} energy**.\n\nMinigames always pay **gold relative to where you are in the game**, measured against your income, so they never fall behind. They also drop materials and fill a **temporary buff**: more drops, faster attacks, more gold, and more, each helping you across the whole game while it lasts.\n\nYour score earns up to **3 stars**, and the better you do, the more you get. Each minigame's details page shows exactly what every rank pays.",
    later: 'Later',
    go: 'Play now',
  },
  { note: 'Shown once, when the first minigame (Hunting Practice) opens. Play now opens its details page.', vars: { game: "Galladair's Hunting Practice", cost: 'energy a play (3)' } },
);
section(
  P,
  'popup.eventsLocked',
  'Events locked',
  { title: '🔒 Events', body: 'Slay {count} {noun} in the {area} to unlock Events, starting with the {event}.\n\n**{progress}**', ok: 'OK' },
  { note: 'Tapping the greyed-out Events tab.', vars: { count: 'kills needed', noun: '"slimes"', area: 'the Wandering Woods', event: 'the Slime Swarm', progress: 'e.g. 420 / 1,000' } },
);
section(
  P,
  'popup.areasLocked',
  'Areas locked',
  {
    title: '🔒 Areas',
    body: 'Beat the **{woods} Guardian** to unlock the {grove}, and the Areas tab with it.\n\nThe Guardian Challenge opens in Events once you\'ve slain {kills} monsters in the {woods} and survived its Slime Swarm.',
    ok: 'OK',
  },
  { note: 'Tapping the greyed-out Areas tab.', vars: { woods: 'the Wandering Woods', grove: 'the Fey Grove', kills: 'kills needed' } },
);
section(
  P,
  'popup.slayer',
  'You are the Slayer',
  {
    title: '⚔️ You are the Slayer!',
    body: "{name} {is} now **the Slayer**. The Slayer's tree is open, and training goes on to **Lv {max}**: the level curve starts over (1 session to Lv {next}), at the same training price.",
    ok: 'Onward',
  },
  { note: 'When your Hunter takes the Ascend node.', vars: { name: "your Hunter's name", is: '"is" (or "are" if unnamed: "You are")', max: 'new level cap', next: 'the next level' } },
);
section(
  P,
  'popup.ascended',
  'Hunter ascended',
  {
    title: '🌟 {name} ascended!',
    body: '{name} is now **the {title}**. A new skill tree is open, and training goes on to **Lv {max}**: the level curve starts over (1 session to Lv {next}), at the same training price.',
    ok: 'Onward',
  },
  { note: 'When a Guild Hunter takes the Ascend node.', vars: { name: 'the Hunter', title: 'their ascended title', max: 'new level cap', next: 'the next level' } },
);
section(
  P,
  'popup.rift',
  'Time Eater defeated',
  {
    title: '⏳ Unbound from time',
    body: "The Time Eater swallowed the moment, and you with it. Deep in the **{rift}**, your Hunters have come loose from time.\n\nYou can **regress**: go back to the very beginning, keeping every level and skill, and earn **Memory Shards** for all this run has built. Spend them on the Regression Tree (in the menu) to come back stronger.",
    ok: 'Later',
    regress: 'See Regression',
  },
  { note: 'After the Time Eater cutscene, the first time it falls (it opens Regression).', vars: { rift: 'the Void Rift' } },
);
section(
  P,
  'popup.noEnergy',
  'Not enough energy',
  {
    title: '🗲 Not enough energy',
    need: '**{event}** needs **{cost}** energy, and you have **{have}**.',
    wait: 'Energy comes back 1 every {regen}: enough for this in **{wait}**.',
    adsUsed: "You've watched today's {ads} energy ads.",
    ad: 'Watch an ad to restore **{ad} energy** ({left} of {ads} left today). Energy past {max} overcharges your bar.',
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
    timed: "Each play adds {per} for a par score ({par} points), from {low} to {high} by score, up to {cap}. It only runs down while you're playing, not while you're away.",
    blessing: 'A score of {score} or more adds {n} charges, up to {cap}. Each {what} you roll spends one; your best tier while you hold charges is the one used.',
    charges: 'Each play adds {n} charge{s} ({great} for a great score), up to {cap}. Starting a Guardian Challenge spends one.',
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
  { title: '♻️ Salvage {n} piece{s}?', body: 'Every unequipped {rarities} piece goes, for half its materials. Equipped gear is kept.', cancel: 'Cancel', ok: 'Salvage' },
  { note: 'Auto Salvage → Salvage now.', vars: { n: 'pieces', rarities: 'e.g. Common, Uncommon' } },
);
section(P, 'popup.quit', 'Quit', { title: 'Quit', body: "Close the game? Your progress is saved, and your Hunters keep hunting while you're away.", no: 'No', yes: 'Yes' }, { note: 'Menu → Quit.' });
section(
  P,
  'popup.reset',
  'Reset everything',
  { title: 'Reset everything?', body: 'This deletes your save: areas, Hunters, items and materials. It cannot be undone.', cancel: 'Cancel', ok: 'Delete' },
  { note: 'Settings → Reset all progress.' },
);
section(
  P,
  'popup.noGems',
  'Not enough gems',
  { title: '{gem} Not enough Exalted Gems', body: '**{item}** costs {gem} **{cost}**; you have **{have}**.\n\nEarn more from daily and weekly quests in the Quest Log, or get some here.', go: 'Get gems', notNow: 'Not now' },
  { note: "Tapping a shop upgrade you can't afford.", vars: { gem: 'the gem icon', item: 'the upgrade', cost: 'its price', have: 'gems you have' } },
);
section(
  P,
  'popup.buyPremium',
  'Buy an upgrade',
  {
    owned: 'With what you own: {total} (now {now}).',
    body: "Costs {gem} **{cost}** (you have {have}). It's permanent, and multiplies on top of everything else.",
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
    knockouts: '💫 Some Hunters were knocked out while you were away. See Details.',
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
    knockouts: 'Knocked-out Hunters stop fighting. Get stronger (or pick an easier area) to keep monsters from slipping through.',
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
    weaponsDesc: 'How each kind of weapon attacks: range, speed, reloads, knockback and more.',
    damage: 'Damage types & status effects',
    damageDesc: 'What each damage type does, weaknesses and resistances.',
    modify: 'Modifying gear',
    modifyDesc: 'Modifier slots, Refine and Enchant, rolling and Perfect rolls.',
    welcome: 'Welcome',
    welcomeDesc: 'Getting started.',
    training: 'Training',
    trainingDesc: 'Making your Hunter stronger (opens after {train} slimes).',
    crafting: 'Crafting',
    craftingDesc: 'Materials, gear and Upgrades.',
    wolf: 'New monsters & the full-screen menu',
    wolfDesc: 'Unlocking the wolf, and raising the menu over the battlefield.',
    empower: 'Empower',
    empowerDesc: 'Unlocking and empowering monsters (opens after {empower} slimes).',
    eventsLocked: 'Unlocking Events',
    eventsLockedDesc: 'How to open the Events tab.',
    events: 'Events',
    eventsDesc: 'Guardian Challenges, swarms, minigames and energy.',
    minigames: 'Minigames',
    minigamesDesc: 'What minigames pay, their buffs and star ranks.',
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
    body: "Each type comes in three archetypes: its standard form and two takes that trade one strength for another (a Maul slams slower over a much larger area, a Mallet quicker over a smaller one), so a new weapon can change how a Hunter fights, not just how hard.\n\nEvery hit starts from the weapon's own damage (the starting Short Sword and Short Bow: 1), which upgrading it raises; training, skills, Upgrades and armor or accessory bonuses multiply it. Heavier types have higher base damage for their rarity.\n\nYour Hunter can wield any weapon and attacks the way it does. Guild Hunters keep their own signature attack; their weapon's type reshapes its speed, damage and range.\n\nEvery type trades speed, damage, reach and crowd hits, so none is simply best. Melee hits knock surviving monsters back.",
  },
  { note: "The guide's opening card. Each weapon type's own description is under Combat." },
);
section(
  G,
  'tut.weapons.tome',
  'Weapon types guide: tomes',
  {
    tomeSummons:
      "Every creature a tome calls up has a **summon type**: {types}. Any bonus your Hunter has against that kind of monster (a **bane**, from a Guild Hunter's passive, an accessory or a Bane enchantment) makes their summons of that kind hit that much harder too: +20% damage against Undead also means undead summons bite 20% harder. Spirits aren't a kind of monster, so banes don't help them.",
  },
  { note: 'Under the Tome on the Weapon types guide.', vars: { types: 'the summon types' }, labels: { tomeSummons: 'Summon types and banes' } },
);
section(
  G,
  'tut.modify',
  'Modifying gear guide',
  {
    title: '🛠️ Modifying gear',
    body: "Rarer gear has **modifier slots** (shown on its card). Open **Modify** from a piece's card, pick a slot, and choose **Refine** (equipment stat bonuses, once Kargesh the Blacksmith has joined) or **Enchant** (elemental and magical effects, once Marceline the Enchantress has joined), in either order.\n\n**Roll** pays the cost shown and draws {choices} random choices (2 to start; the **Codex of Choices** Upgrade from the Ascendant Steps adds a third, the **Sigil of Fate** from the Void Rift a fourth); pick one and it goes in the slot, replacing whatever was there. Not keen on any of them? **Reroll** draws a fresh set for the same cost.\n\nThe same modifier is stronger on rarer gear. A roll at the very top of its range is **Perfect**, and shows a rainbow border. Blessings from Kargesh's and Marceline's minigames give each choice extra tries at a Perfect roll.",
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
    body: "Every attack deals a damage type: a weapon's own, or the Hunter's if the weapon has none.\n\nMonsters can be **Weak** to a type (×{weak} damage) or **Resist** it (×{resist}); their Bestiary card shows which.\n\nMost types can inflict a **status effect**. A weapon's proc chance sets how often. A monster holds one of each effect at a time, and a new one refreshes it. **Bleeding** is the exception: it stacks.",
    heading: 'Damage types',
    none: 'No status effect: pure damage that few monsters resist.',
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
    skillPoints: 'Unspent skill points',
    evoPoints: 'Unspent evolution points',
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
    noProc: "This weapon doesn't set off its status effect.",
    poisonHp: 'plus {pct}% of its max HP ({guardian}% on Guardians)',
    special: 'Special: {how}, starting with {first}.',
    specialProc: 'Each element can set off its status effect.',
    specialProcAdvanced: 'Each element can set off its status effect (**{pct}%** chance per hit).',
    typeBonus: '+{pct}% {type} damage, whatever deals it.',
    typeBonusSimple: 'More {type} damage, whatever deals it.',
    baneSimple: 'Deals extra damage to {kind}s.',
    finder: 'At {stars}★: your {kind} kills have a {pct}% chance to drop {material}.',
    finderSimple: 'At {stars}★: your {kind} kills can drop {material}.',
    archetype: '**{name}**, a kind of {weapon}: {desc}',
    spell: 'After its bolts, this staff casts **{spell}**: {desc}',
    tome: 'Summons {a} **{creature}** about every **{every}s** (sooner with attack speed). It hunts monsters for {duration}s, then fades. Summon type: **{type}**.',
    tomeBane: 'Bonus damage against **{kind}s** (a bane) makes it hit that much harder too.',
    tomeSpirit: "Spirits aren't a kind of monster, so no bane makes them hit harder.",
    tomeAdvanced: 'Every {guild}s for a Guild Hunter (before attack speed). Each bite deals {bites}× the tome\'s hit.',
    tomeLunge: 'Every {cooldown}s it lunges at a monster, hitting for {damage}× a bite.',
    bane: '+{pct}% damage against {kind}s.',
    ownDamage: 'Own damage, raised by your bonuses, not your weapon.',
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
      bites: "bite damage × the tome's hit",
      cooldown: 'seconds between lunges',
      damage: 'lunge damage × a bite',
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
    block: 'Shield burst: each block blasts the monsters nearby.',
    evade: 'Evasion: a chance to slip past a monster that reaches you.',
    pulse: 'Pulse: every so often, a burst of damage around you.',
    summon: 'Summons {name}s every so often to hunt monsters for a while.',
    wave: 'Melee attacks can send out a wave of damage.',
    strike: 'Every so often, lightning strikes several monsters.',
    chill: 'Chill aura: monsters near you move at half speed.',
    spell: '{spell}: {desc}',
    unique: '{name}: every so often, {desc}.',
    potion: 'Potion: every so often in a fight, you drink it for a short boost to {stat}.',
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
    body: "What a gear tag says when tapped. Simple says what each thing does; Advanced adds the numbers: how often a status effect sets off, how much it deals and for how long, and each ability's damage and cooldown.",
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
  { minigame: 'Play for gold, materials and {buff}: {desc}', best: 'Best {score}', notPlayed: 'Not played yet', details: 'Details', reward: 'Reward: {what}' },
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
    bounty: 'Every win pays a Guardian bounty: 🪙 **{gold}**, {material}, and a piece of gear.',
    time: 'You have {time}s to bring it down once it appears.',
    swarm: 'It lasts {time}s. Everything slain drops as usual, so twice the monsters means twice the gold and materials.',
    joins: '{hunter} joins after {how}.',
    completed: 'Completed {n} time{s}.',
    best: 'Your best',
    ranks: 'Star rankings',
    ranksNote: 'Rewards grow with every point you score. Here is what a play earns at each rank.',
    points: '{score}+ points',
    gold: "Gold is measured against your income, so it's always worth playing wherever you are: a par score ({par} points) pays {new} of your gold income while {area} is the furthest area you've reached, and {old} after that.",
    drops: 'Drops: {list}.',
    timedNote: "It only runs down while you're playing, not while you're away.",
    blessingNote: 'Each {what} you roll spends one.',
    slayerNote: 'Starting a Guardian Challenge spends one.',
    stardustNote: 'Coming back after 15 minutes or more away spends one.',
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
  { title: 'Menu', tutorials: 'Tutorials', journal: 'Journal Entries', shop: 'Shop', regression: 'Regression', settings: 'Settings', quit: 'Quit', close: 'Close' },
  { note: 'The menu button at the top right.', labels: { title: 'Title', tutorials: 'Item', journal: 'Item', shop: 'Item', regression: 'Item (after the Time Eater)', settings: 'Item', quit: 'Item' } },
);
section(
  M,
  'menu.regression',
  'Regression',
  {
    title: 'Regression',
    tree: 'Regression Tree',
    regress: 'Regress',
    treeNote: 'Spend Memory Shards on the web. Start from Stabilize in the centre; a node opens once a node joined to it has a rank. Everything here lasts forever.',
    regressNote: "Go back to day 1 in the Wandering Woods. Every Hunter keeps their levels, training and skills (Guild Hunters must be recruited again). Gold, materials, gear, Upgrades, areas and the Bestiary start over. You gain **{shards}** Memory Shards for what this run has built.",
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
    confirmBody: 'You go back to day 1 with **{shards}** Memory Shards. Gold, materials, gear, Upgrades, areas and the Bestiary are lost; levels and skills stay.',
    confirmYes: 'Regress',
    confirmNo: 'Not yet',
    buy: 'Buy for {cost}',
    maxed: 'Maxed',
    soon: 'Coming soon',
    locked: 'Buy a node joined to this one first.',
    share: 'Spend at most',
  },
  {
    vars: { shards: 'Memory Shards', weight: 'gear weighting', cost: 'shards' },
    labels: { title: 'Title', tree: 'Tab', regress: 'Tab', treeNote: 'Tree note', regressNote: 'Regress note', button: 'Regress button', confirmTitle: 'Confirm title', confirmBody: 'Confirm text', confirmYes: 'Confirm button', confirmNo: 'Cancel button', buy: 'Node buy button', maxed: 'Node maxed', soon: 'Node not yet for sale', locked: 'Node locked note', share: 'Auto Empower share label' },
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
    dailyNote: 'Daily quests reset at midnight. Exalted Gems buy permanent upgrades in the Shop (coming soon).',
    weeklyNote: 'Weekly quests reset at midnight going into Monday. Finishing your dailies on a day counts toward the week.',
    allDaily: 'Finish every daily quest',
    allWeekly: 'Finish every weekly quest',
    checkIn: 'Daily check-in',
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
    removeAds: 'No more ads. Your energy bar grows to {cap} and refills all the way on its own, your offline gold and materials are always doubled, and the daily check-in bonus is yours without an ad.',
    today: "Today's upgrades",
    stock: 'Permanent, for every Hunter in every area, kept through every Ascension. {n} new items in {time}.',
    merchant: 'Monster Merchant',
    merchantNote: 'He takes {amount} of a material for {gems} Exalted Gems, once a day for each. {n} new materials in {time}.',
  },
  {
    vars: { cap: 'energy cap without ads', n: 'items (or materials) a day', time: 'time to the next stock', amount: 'materials per trade', gems: 'gems per trade' },
    labels: { test: 'Test mode note', removeAds: 'Remove Ads', today: 'Heading', stock: 'Stock note', merchant: 'Merchant heading', merchantNote: 'Merchant note' },
  },
);
