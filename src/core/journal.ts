import type { AreaId, EnemyId, HunterId } from './balance';

/**
 * Journal entries: short pages of lore the player unlocks as they play, read from the menu (Journal).
 * Written in the Journal editor (an Artifact) and copied here; each says what unlocks it. Once unlocked, an entry stays
 * in the Journal for good (seen.journalFound), even when a Regression resets what unlocked it.
 */
export type JournalUnlock =
  /** Open from the start. */
  | { kind: 'start' }
  /** This many of a monster slain. */
  | { kind: 'kills'; enemy: EnemyId; count: number }
  /** A monster unlocked in the Bestiary. */
  | { kind: 'monster'; enemy: EnemyId }
  /** An area reached (unlocked). */
  | { kind: 'area'; area: AreaId }
  /** An event completed this many times (a Guardian beaten, a swarm survived). */
  | { kind: 'event'; event: string; times: number }
  /** A Guild Hunter recruited. */
  | { kind: 'hunter'; hunter: HunterId }
  /** Your Hunter reaching this level. */
  | { kind: 'level'; level: number }
  /** Regressed this many times. */
  | { kind: 'regressions'; count: number }
  /** An area made Unbound (its Regression Tree node bought) and reached. */
  | { kind: 'unbound'; area: AreaId }
  /** An Unbound area's Guardian beaten. */
  | { kind: 'unboundGuardian'; area: AreaId };

export interface JournalEntry {
  id: string;
  title: string;
  /** An emoji, or a pixel icon "<pack>/<NNN>" from public/icons. */
  icon: string;
  /** The page's text; blank lines split paragraphs. */
  body: string;
  unlock: JournalUnlock;
}

export const JOURNAL: JournalEntry[] = [
  {
    id: 'firstPage',
    title: 'The Beginning of the Journey',
    icon: 'wands-books/081',
    body: "I picked up a quest to get rid of some slimes within the woods. Something is causing the monsters to attack, and they've been getting very close to the village. I can defeat them for now, but I have to find out why the monsters have been going wild.",
    unlock: { kind: 'start' },
  },
  {
    id: 'slimeScience',
    title: 'Slime Science',
    icon: 'rpg-items/041',
    body: "A hundred slimes down. When slain, they leave behind a goo that manages to keep its shape. \n\nAn alchemist named Andrejz keeps asking for more of it. He won't say what it's for, but he's promised to help me if I get him enough of it. I could use the help.",
    unlock: { kind: 'kills', count: 100, enemy: 'greenSlime' },
  },
  {
    id: 'hunter-alchemist',
    title: 'The Alchemist',
    icon: '⚗️',
    body: "Andrejz finally told me what the slime goo was for: potions. Poison ones, mostly.\n\nAndrejz has agreed to come along and throw them at things. I've asked for them to be thrown away from me.",
    unlock: { kind: 'hunter', hunter: 'alchemist' },
  },
  {
    id: 'woodsGuardian',
    title: 'The Guardian of the Woods',
    icon: 'armor7/068',
    body: "It was bigger than any tree in the forest, and it was waiting for me.\n\nWhen it fell, the path north opened. Whatever made these monsters angry, it is somewhere further in.\n\nAn archer named Galladair came through the woods after the guardian was defeated. She thanked me for helping her defend the village. Since the monsters are no longer attacking as much, she's decided to help us fend off other monsters.",
    unlock: { kind: 'hunter', hunter: 'ranger' },
  },
  {
    id: 'feyGrove',
    title: 'Into the Fey Grove',
    icon: 'nature/043',
    body: "The trees glow here, and the pixies laugh at everything. The mushrooms looked beautiful, until they started walking towards me.\n\nThere's music in the grove that doesn't come from anyone I can see. Maybe if I can clear out these pixies, I'll find the source of this music.",
    unlock: { kind: 'area', area: 'glade' },
  },
  {
    id: 'fxmb792qs4or4g9934b6',
    title: 'Draconic Stories',
    icon: '📜',
    body: "After defeating the massive mushroom that came at us, another man approached us from the woods. He's one of those dragon people, with scales like copper. He approached playing a lute, letting out such sweet music. He said he was dancing with pixies, when he heard the commotion. The Pixie Queen told him to go find the source of the madness, finally letting him go. Now that he's free, he can join us.",
    unlock: { kind: 'hunter', hunter: 'bard' },
  },
  {
    id: 'mbiejhzwdrtxajf7007z',
    title: 'Watcher of the Woods',
    icon: '📜',
    body: 'After fighting off mushrooms for a while, an old man approached me from the woods. He said his name is Deku. He was stuck in his house for a long time. Mushrooms covered his house and blocked him from leaving, but the surge of them coming to attack me freed them. He wants to help find the source of the creature. It looks like he draws power from these woods. It seems like he has an infinite amount of wolves.',
    unlock: { kind: 'hunter', hunter: 'druid' },
  },
  {
    id: 'graveyard',
    title: 'Restless Ground',
    icon: '📜',
    body: 'The dead here do not stay down. Someone, or something, keeps calling them back up.\n\nI have started sleeping with my boots on.',
    unlock: { kind: 'area', area: 'graveyard' },
  },
  {
    id: 'hunter-thief',
    title: 'A Light-Fingered Friend',
    icon: '🦹',
    body: "A man in a red hood was going through the Skeleton King's things before it had even stopped moving. He calls himself Alias.\n\nHe says he only steals from monsters. My coin purse feels lighter anyway.",
    unlock: { kind: 'hunter', hunter: 'thief' },
  },
  {
    id: 'hunter-lance',
    title: 'The Paladin',
    icon: '🛡️',
    body: 'So many of the dead have fallen here that a paladin came to see who was doing it: Lance.\n\nLance has sworn to see the graveyard quiet again, and stands between us and anything that bites.',
    unlock: { kind: 'hunter', hunter: 'lance' },
  },
  {
    id: 'area-crypt',
    title: 'The Forbidden Crypt',
    icon: '⚰️',
    body: "Under the graveyard there are stairs, and under the stairs there is a crypt older than the village.\n\nThe puppets down here move on their own. I don't like the way they look at me.",
    unlock: { kind: 'area', area: 'crypt' },
  },
  {
    id: 'hunter-glimmer',
    title: 'Glimmer',
    icon: '🧙',
    body: 'When the Awoken Lich fell, a figure of living flame stepped out of the dark: Glimmer.\n\nGlimmer had been sealed in the crypt for a very long time, and is eager to burn something.',
    unlock: { kind: 'hunter', hunter: 'glimmer' },
  },
  {
    id: 'hunter-puppeteer',
    title: 'The Puppeteer',
    icon: '🎎',
    body: 'Theon says the puppets in the crypt were hers, once, before something else took hold of their strings.\n\nShe has made new ones. These ones fight for us.',
    unlock: { kind: 'hunter', hunter: 'puppeteer' },
  },
  {
    id: 'area-depths',
    title: 'The Shadowy Depths',
    icon: '🕳️',
    body: 'Below the crypt the dark has weight. Our torches only reach a few feet, and something always seems to be just past the light.\n\nWhatever is behind all this is still further down.',
    unlock: { kind: 'area', area: 'depths' },
  },
  {
    id: 'hunter-wilhelm',
    title: 'The Sniper',
    icon: '🎯',
    body: "Wilhelm had been hunting the Beholden Watcher alone for weeks. He shot it in the eye while we kept it busy.\n\nHe says the dark doesn't bother him if he can see the target. He can always see the target.",
    unlock: { kind: 'hunter', hunter: 'wilhelm' },
  },
  {
    id: 'hunter-celeste',
    title: 'The Psion',
    icon: '🔮',
    body: "Celeste followed the Gazing Eyes here. The eyes are watching for someone, Celeste says, and Celeste wants to know who.\n\nA copy made of thought alone fights at Celeste's side, just as well as the real one.",
    unlock: { kind: 'hunter', hunter: 'celeste' },
  },
  {
    id: 'area-caves',
    title: 'The Ember Mines',
    icon: '🌋',
    body: "The tunnels open into old mines, and the mines are on fire. Imps run through the flames laughing.\n\nThe heat is unbearable. Kargesh, a smith we met at the entrance, says that's what makes the ore so good.",
    unlock: { kind: 'area', area: 'caves' },
  },
  {
    id: 'hunter-blacksmith',
    title: 'The Blacksmith',
    icon: '⚒️',
    body: 'Kargesh has set up an anvil just inside the mines. The fires here burn hotter than anything in the village, apparently.\n\nKargesh can rework our gear, folding new strength into old steel.',
    unlock: { kind: 'hunter', hunter: 'blacksmith' },
  },
  {
    id: 'hunter-scavenger',
    title: 'The Monk',
    icon: '👊',
    body: "Sciirj walked into the mines with no weapon at all and punched an imp clean across the tunnel.\n\nThe monsters are disturbing Sciirj's meditation, so Sciirj is coming with us until they stop.",
    unlock: { kind: 'hunter', hunter: 'scavenger' },
  },
  {
    id: 'hunter-enchantress',
    title: 'The Enchantress',
    icon: '✨',
    body: 'With the Demon Lord gone, a witch named Marceline came out of hiding, after being trapped in the deepest shaft.\n\nMarceline can weave enchantments into our gear, and says the runes in the caverns below are older than any spell in the books.',
    unlock: { kind: 'hunter', hunter: 'enchantress' },
  },
  {
    id: 'area-mines',
    title: 'The Venom Caverns',
    icon: '🦂',
    body: 'Someone dug too deep, and the caverns below the mines are full of poison. Kobolds swarm the tunnels.\n\nEvery breath tastes green. We are not staying long.',
    unlock: { kind: 'area', area: 'mines' },
  },
  {
    id: 'hunter-osteomancer',
    title: 'The Osteomancer',
    icon: '🦴',
    body: "Gideon is more bone than skin, and says the dead owe a few favours.\n\nWalls of bone rise to keep the monsters back. I've decided not to ask whose bones.",
    unlock: { kind: 'hunter', hunter: 'osteomancer' },
  },
  {
    id: 'area-peaks',
    title: 'The Frost Peaks',
    icon: '🏔️',
    body: 'We climbed out of the caverns into snow. The wind up here cuts like a blade, and the wolves are made of ice.\n\nThe path keeps going up.',
    unlock: { kind: 'area', area: 'peaks' },
  },
  {
    id: 'hunter-haunter',
    title: 'The Haunter',
    icon: '👻',
    body: "When the Frost Gargoyle broke apart, Lilith was standing where it had been. They say they have been haunting these peaks for a hundred winters.\n\nWhat they touch withers, and what falls near them doesn't stay quiet.",
    unlock: { kind: 'hunter', hunter: 'haunter' },
  },
  {
    id: 'hunter-bloodblade',
    title: 'The Blood Blade',
    icon: '🩸',
    body: 'Themus has been killing ice wolves for as long as anyone can remember, with a sword that drinks the blood of whatever it cuts.\n\nThe wolves never stop coming. Now Themus wants to know why.',
    unlock: { kind: 'hunter', hunter: 'bloodblade' },
  },
  {
    id: 'area-cliffs',
    title: 'The Ascendant Steps',
    icon: '🪜',
    body: 'Above the peaks there are stairs cut into the mountain, climbing into the clouds. Nobody knows who carved them.\n\nHarpies nest on every landing.',
    unlock: { kind: 'area', area: 'cliffs' },
  },
  {
    id: 'hunter-artificer',
    title: 'The Artificer',
    icon: '⚙️',
    body: 'Reginald was patching up a clockwork turret halfway up the steps when the Harpy Storm hit. The turret saved us.\n\nReginald has a way with gear: everything works better with Reginald nearby.',
    unlock: { kind: 'hunter', hunter: 'artificer' },
  },
  {
    id: 'hunter-archivist',
    title: 'The Archivist',
    icon: '📖',
    body: "Thomas has written down every Hunter who ever climbed these steps. Now we're written down too.\n\nThe tome remembers what each of us can do, and Thomas can call it up at will.",
    unlock: { kind: 'hunter', hunter: 'archivist' },
  },
  {
    id: 'area-fortress',
    title: 'The Cloud Fortress',
    icon: '🏰',
    body: 'At the top of the steps, a fortress sits on the clouds. Storms circle it, and knights in silver armour guard the gates.\n\nWhoever built this did not want visitors.',
    unlock: { kind: 'area', area: 'fortress' },
  },
  {
    id: 'hunter-gambler',
    title: 'The Gambler',
    icon: '🎲',
    body: "Ted bet me that I couldn't afford the hiring fee. I could.\n\nTed rolls dice for everything, including fights, and swears the dice always come good in the end.",
    unlock: { kind: 'hunter', hunter: 'gambler' },
  },
  {
    id: 'hunter-lichlord',
    title: 'The Lich',
    icon: '💀',
    body: "After the second Cloudburst, a lich in golden robes stepped down from the storm and bowed: Azir.\n\nWhatever is behind all this is an old enemy, Azir says. Azir's skeletons march with us now.",
    unlock: { kind: 'hunter', hunter: 'lichlord' },
  },
  {
    id: 'area-meteors',
    title: 'The Meteor Field',
    icon: '☄️',
    body: 'Past the fortress, the sky has broken. Stars fall here and keep moving after they land.\n\nSomething out there is eating them.',
    unlock: { kind: 'area', area: 'meteors' },
  },
  {
    id: 'hunter-spaceslime',
    title: 'Norm',
    icon: '🌌',
    body: 'A slime fell out of the Meteor Shower: purple, sparkling and very friendly. We named the slime Norm.\n\nMonsters that look at Norm for too long start fighting each other.',
    unlock: { kind: 'hunter', hunter: 'spaceslime' },
  },
  {
    id: 'hunter-alien',
    title: 'Visitor from the Stars',
    icon: '👽',
    body: "Tonk crashed into the field a long time ago and has been shooting meteorites with eye lasers ever since.\n\nTonk doesn't speak our language, but points at the sky a lot. I think Tonk wants to go home.",
    unlock: { kind: 'hunter', hunter: 'alien' },
  },
  {
    id: 'area-rift',
    title: 'The Void Rift',
    icon: '♾️',
    body: 'At the edge of the meteor field, the world simply ends. Beyond it is the rift: no sky, no ground, only things that should not exist.\n\nThis is where the madness comes from. I can feel it.',
    unlock: { kind: 'area', area: 'rift' },
  },
  {
    id: 'hunter-riftwalker',
    title: 'The Rift Walker',
    icon: '🌀',
    body: "Id came out of the Shadow Tide like a hole in the air. Id doesn't speak, but understands.\n\nId walks between rifts the way we walk through doors, and time seems to bend nearby.",
    unlock: { kind: 'hunter', hunter: 'riftwalker' },
  },
  {
    id: 'regress-1',
    title: 'Again',
    icon: '⏳',
    body: "The Time Eater swallowed everything, and I woke up at the edge of the Wandering Woods with this journal in my hands.\n\nThe pages are still written. I remember all of it. This time, I know what's coming.",
    unlock: { kind: 'regressions', count: 1 },
  },
  {
    id: 'regress-5',
    title: 'Again, and Again',
    icon: '⌛',
    body: 'Five times now I have watched the world unwind and start over.\n\nEach time I am a little stronger, and each time the monsters are a little more familiar. I wonder if the Time Eater remembers me too.',
    unlock: { kind: 'regressions', count: 5 },
  },
  {
    id: 'unbound-forest',
    title: 'The Woods, Unbound',
    icon: '🌲',
    body: 'The Wandering Woods are not the woods I remember. The trees are darker, and the slimes are not afraid of me anymore.\n\nSomething has broken loose here. I think it was me.',
    unlock: { kind: 'unbound', area: 'forest' },
  },
  {
    id: 'unbound-rift',
    title: 'The Rift, Unbound',
    icon: '♾️',
    body: 'I have come back to the Void Rift, and it has come loose from everything holding it together.\n\nThe Time Eater is waiting at the centre. It is bigger than before.',
    unlock: { kind: 'unbound', area: 'rift' },
  },
  {
    id: 'unbound-timeEater',
    title: 'The End of Time',
    icon: '🕰️',
    body: 'The Unbound Time Eater is dead.\n\nNo world unwinding, no waking at the edge of the woods. Just quiet, and the sound of a clock that has started ticking again.',
    unlock: { kind: 'unboundGuardian', area: 'rift' },
  },
];
