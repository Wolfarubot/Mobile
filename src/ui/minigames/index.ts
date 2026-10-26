import type { MinigameId } from '../../core/balance';
import { forgeStrike, FS_DECOR, FS_INTRO } from './forgeStrike';
import { graveRobbing, GR_DECOR, GR_INTRO } from './graveRobbing';
import { huntingPractice, HP_DECOR, HP_INTRO, HP_LIVES } from './huntingPractice';
import { icebreaker, IB_INTRO } from './icebreaker';
import { pixieSerenade, PS_DECOR, PS_INTRO } from './pixieSerenade';
import { puppetShow, PU_INTRO } from './puppetShow';
import { runeMatch, RM_INTRO } from './runeMatch';
import type { DecorOpts } from '../../render/backgrounds';
import type { MinigameApi, MinigameGame } from './shell';
import { shootingGallery, SG_DECOR, SG_INTRO } from './shootingGallery';

import { editableData, fromHtml, registerText, txp } from '../../core/textRegistry';

export { runMinigame } from './shell';

/** Every minigame: its title on the intro card, the intro text, lives, and the game itself. */
export const MINIGAMES: Record<MinigameId, { title: string; intro: string; lives: number; decor?: DecorOpts; create: (api: MinigameApi) => MinigameGame }> = {
  huntingPractice: { title: '🏹 Hunting Practice', intro: HP_INTRO, lives: HP_LIVES, decor: HP_DECOR, create: huntingPractice },
  pixieSerenade: { title: '🪕 Pixie Serenade', intro: PS_INTRO, lives: 3, decor: PS_DECOR, create: pixieSerenade },
  graveRobbing: { title: '🦹 Grave Robbing', intro: GR_INTRO, lives: 3, decor: GR_DECOR, create: graveRobbing },
  puppetShow: { title: '🎎 Puppet Show', intro: PU_INTRO, lives: 3, create: puppetShow },
  shootingGallery: { title: '🎯 Shooting Gallery', intro: SG_INTRO, lives: 0, decor: SG_DECOR, create: shootingGallery },
  forgeStrike: { title: '⚒️ Forge Strike', intro: FS_INTRO, lives: 3, decor: FS_DECOR, create: forgeStrike },
  runeMatch: { title: '✨ Rune Match', intro: RM_INTRO, lives: 0, create: runeMatch },
  icebreaker: { title: '🔨 Icebreaker', intro: IB_INTRO, lives: 3, create: icebreaker },
};

// The Text editor can change each game's title and intro (its intro in the editor's markup, shown as paragraphs).
editableData('Events', 'minigame', Object.entries(MINIGAMES).map(([id, m]) => [id, m, `Minigame · ${m.title}`]), { title: 'Title' });
for (const [id, m] of Object.entries(MINIGAMES)) {
  registerText({ key: `minigame.${id}.intro`, group: 'Events', section: `Minigame · ${m.title}`, label: 'Intro card', base: fromHtml(m.intro), note: 'The card shown before Start.' });
  m.intro = txp(`minigame.${id}.intro`);
}
