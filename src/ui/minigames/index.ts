import type { MinigameId } from '../../core/balance';
import { forgeStrike, FS_INTRO } from './forgeStrike';
import { graveRobbing, GR_INTRO } from './graveRobbing';
import { huntingPractice, HP_INTRO, HP_LIVES } from './huntingPractice';
import { icebreaker, IB_INTRO } from './icebreaker';
import { pixieSerenade, PS_INTRO } from './pixieSerenade';
import { puppetShow, PU_INTRO } from './puppetShow';
import { runeMatch, RM_INTRO } from './runeMatch';
import type { MinigameApi, MinigameGame } from './shell';
import { shootingGallery, SG_INTRO } from './shootingGallery';

export { runMinigame } from './shell';

/** Every minigame: its title on the intro card, the intro text, lives, and the game itself. */
export const MINIGAMES: Record<MinigameId, { title: string; intro: string; lives: number; create: (api: MinigameApi) => MinigameGame }> = {
  huntingPractice: { title: '🏹 Hunting Practice', intro: HP_INTRO, lives: HP_LIVES, create: huntingPractice },
  pixieSerenade: { title: '🪕 Pixie Serenade', intro: PS_INTRO, lives: 3, create: pixieSerenade },
  graveRobbing: { title: '🦹 Grave Robbing', intro: GR_INTRO, lives: 3, create: graveRobbing },
  puppetShow: { title: '🎎 Puppet Show', intro: PU_INTRO, lives: 3, create: puppetShow },
  shootingGallery: { title: '🎯 Shooting Gallery', intro: SG_INTRO, lives: 3, create: shootingGallery },
  forgeStrike: { title: '⚒️ Forge Strike', intro: FS_INTRO, lives: 3, create: forgeStrike },
  runeMatch: { title: '✨ Rune Match', intro: RM_INTRO, lives: 6, create: runeMatch },
  icebreaker: { title: '🔨 Icebreaker', intro: IB_INTRO, lives: 3, create: icebreaker },
};
