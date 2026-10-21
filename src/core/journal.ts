import type { AreaId, EnemyId, HunterId } from './balance';

/**
 * Journal entries: short pages of lore the player unlocks as they play, read from the menu (Journal).
 * Written in the Journal editor (an Artifact) and copied here; each says what unlocks it.
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
  | { kind: 'level'; level: number };

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
    title: 'The First Page',
    icon: 'wands-books/081',
    body: "Bought this journal from a peddler at the edge of the Wandering Woods. He said every hunter worth the name keeps one.\n\nSo: day one. Slimes everywhere. They don't bite, exactly, but they don't stop either.",
    unlock: { kind: 'start' },
  },
  {
    id: 'slimeScience',
    title: 'Slime Science',
    icon: 'rpg-items/041',
    body: "A hundred slimes down. They pop into goo that dries into something almost like glass.\n\nAn alchemist named Andrejz keeps asking for more of it. He won't say what for.",
    unlock: { kind: 'kills', enemy: 'greenSlime', count: 100 },
  },
  {
    id: 'woodsGuardian',
    title: 'The Guardian of the Woods',
    icon: 'armor7/068',
    body: 'It was bigger than any tree in the forest, and it was waiting for me.\n\nWhen it fell, the path north opened. Whatever made these monsters, it is somewhere further in.',
    unlock: { kind: 'event', event: 'guardian-forest', times: 1 },
  },
  {
    id: 'feyGrove',
    title: 'Into the Fey Grove',
    icon: 'nature/043',
    body: "The trees glow here, and the pixies laugh at everything. They laughed harder when they started biting.\n\nThere's music in the grove that doesn't come from anyone I can see.",
    unlock: { kind: 'area', area: 'glade' },
  },
  {
    id: 'graveyard',
    title: 'Restless Ground',
    icon: 'resources1/011',
    body: 'The dead here do not stay down. Someone, or something, keeps calling them back up.\n\nI have started sleeping with my boots on.',
    unlock: { kind: 'area', area: 'graveyard' },
  },
];
