import type { AreaId } from '../core/balance';
import { GATED, gateWalls, onGatePath, WALL_FACE, WALL_ROOF, WALL_SIDE } from '../core/gates';

/**
 * Painted battlefield backgrounds, built from tileset decor (public/backgrounds/<area>/, CraftPix tilesets):
 * a grass base with texture, small details scattered everywhere, bushes and stones outside the middle, and
 * trees, boulders and ruins only around the edges, so the fight in the centre stays easy to read. Drawn at
 * one tileset pixel per screen pixel (crisp), composed once per view size and reused every frame.
 */
interface Piece {
  file: string;
  /** How often it's picked within its band. */
  weight: number;
}
interface Band {
  pieces: Piece[];
  /** Pieces per 10,000 screen pixels. */
  density: number;
  /** Where they may go, as a fraction of the way from the centre to the nearest edge (0 centre, 1 edge). */
  from: number;
  /** And no further out than this (a ring round the clearing); anywhere beyond `from` if unset. */
  to?: number;
  /** Stands among the monsters, who walk around it, however close in (otherwise only the outer bands do). */
  solid?: boolean;
  /** Drawn beneath the islands (clouds below the steps). */
  under?: boolean;
  /** Placed only on the islands' grass. */
  onIslands?: boolean;
  /** May overlap other pieces (drifting clouds); everything else is placed only where there's room. */
  overlap?: boolean;
  /**
   * A wall of these along all four edges (trees crowding round the clearing), half off the view: they overlap
   * one another, other pieces keep clear of them, and monsters walk through them (in front or behind).
   */
  edge?: boolean;
  /**
   * Lined up along one wall, side by side (a gap of `gap` pixels, never overlapping anything), from `from` to `to`
   * of the way along it (left to right, or top to bottom). They stand among the monsters like the wall.
   */
  line?: { side: 'top' | 'bottom' | 'left' | 'right'; from: number; to: number; gap?: number; /** Stood this many pixels in from the edge (in front of a wall). */ inset?: number; /** Instead, down the left or right edge of a gated area's top or bottom gate, beside its wall's end. */ jamb?: 'top' | 'bottom' };
}
interface Scene {
  base: string;
  /** Texture specks: [colour, how many per 10,000 pixels]. */
  specks: Array<[string, number]>;
  bands: Band[];
  /** A flagstone floor instead of plain ground: slab size, slab colours (picked at random) and the grout between. */
  slabs?: {
    size: number;
    colors: string[];
    grout: string;
    light: string;
    /** Only a platform this far in from the edges (a fraction of the view) is paved, with `side` below it. */
    inset?: number;
    side?: string;
  };
  /**
   * Pools (lava, acid, water, the void): pixel blobs placed like a band, with a rim, a fill and, optionally,
   * detail pieces (lava streaks, glints) scattered inside them.
   */
  pools?: { density: number; from: number; size: [number, number]; rim: string; crust?: string; fill: string; inner?: string; details?: string[]; /** Filled with this picture instead (holes into the void). */ pattern?: string };
  /** A full picture (960×540 space art) behind everything, scaled by whole pixels to cover the view. */
  backdrop?: string;
  /** A vertical gradient (top, bottom) instead of the flat base colour: open sky. */
  sky?: [string, string];
  /**
   * Floating islands built from a 3×5-tile island (`file`: grass top over a rocky underside), stretched to any
   * size: each step is [centre x, centre y, grass width, grass height] as fractions of the view.
   */
  islands?: { file: string; steps: Array<[number, number, number, number]> };
  /** Darkens toward the edges (a colour at full strength in the corners). */
  vignette?: string;
  /**
   * Set pieces at fixed spots, each standing (bottom middle) at `at` pixels from the top-left corner (negative:
   * from the right or bottom). They stand among the monsters like the wall, and the wall makes room for them.
   */
  landmarks?: Array<{ file: string; at: [number, number]; /** Monsters walk around it rather than through it. */ solid?: boolean }>;
  /** How big the empty clearing round the Hunters is, as a fraction of the way to the edge (CLEAR if unset). */
  clear?: number;
  /** The edge wall stands this many pixels further out (more of it off the view), for a bigger clearing. */
  edgeOut?: number;
  /** A gated area's corner walls (gates.ts): the wall face tile (32 wide, tiled along every face). */
  wallFace?: string;
}

const p = (files: string, weight = 1): Piece[] => files.split(' ').map((file) => ({ file, weight }));
/** Numbered files: run('spot', 1, 3) is 'spot1 spot2 spot3'. */
const run = (prefix: string, from: number, to: number): string => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`).join(' ');

const SCENES: Partial<Record<AreaId, Scene>> = {
  forest: {
    base: '#a0b35a',
    specks: [
      ['#8fa752', 30],
      ['#b2c25f', 22],
      ['#839f53', 10],
    ],
    bands: [
      // Small details around the clearing: flowers, grass tufts, pebbles (sparse, so the middle stays open).
      { pieces: [...p('Flower1 Flower2 Flower3 Flower4 Flower5 Flower6 Flower7 Flower8 Flower9 Flower10 Flower11'), ...p('grass_element1 grass_element2 grass_element3', 3), ...p('Bush9 Bush16 Bush19 Rock_grass_element11 Rock_grass_element12 Rock_grass_element14 Stone5_grass_shadow ground_element20 ground_element21 ground_element22 ground_element23 ground_element24')], density: 2.6, from: 0 },
      // A few small bushes, stones and broken trunks further out.
      { pieces: [...p('Bush7 Bush8 Bush10 Bush15 Bush18', 2), ...p('Rock_grass_element13 Rpck_grass5 Stone3_grass_shadow Stone4_grass_shadow Broken_tree4 Broken_tree5')], density: 0.45, from: 0.5 },
      // Trees, flowering bushes, boulders, stumps and the odd ruin toward the edges (monsters walk around them).
      { pieces: [...p('Tree1 Tree2 Tree3 Tree4 Tree5', 2), ...p('Bush1 Bush2 Bush3 Bush4 Bush5 Bush6 Bush11 Bush12 Bush13 Bush14 Bush17', 2), ...p('Rpck_grass1 Rpck_grass2 Rpck_grass3 Rpck_grass4 Stone1_grass_shadow Stone2_grass_shadow Broken_tree1 Broken_tree2'), ...p('Ruin3_grass_shadow Ruin4_grass_shadow Ruin5_grass_shadow', 0.5)], density: 0.3, from: 0.68 },
      // A wall of trees all round the border, crowding together (monsters walk through it, behind or in front).
      { pieces: [...p('Tree1 Tree2 Tree3 Tree4', 3), ...p('Tree5')], density: 0, from: 0.95, edge: true },
    ],
  },
  // The forest tileset with its greens turned to fey pinks and purples (trunks, stones and ruins unchanged).
  glade: {
    base: '#a8789a',
    specks: [
      ['#9d6d90', 30],
      ['#b6849f', 22],
      ['#94698a', 10],
    ],
    bands: [
      // Small details around the clearing: reeds, pebbles, little bushes and mushrooms (sparse, so the middle stays open).
      { pieces: [...p('reeds1 reeds2 reeds3', 3), ...p('Bush6 Bush8 Bush10 Beige_stone_grass6 Beige_stone_grass9 Beige_stone_ground5 Beige_stone_ground7 Brown_stone_grass5 Light_stone_ground4 Red_mushroom3 Brown_mushroom')], density: 2.2, from: 0 },
      // A few small bushes, mushroom clumps, stones and stumps further out.
      { pieces: [...p('Bush5 Bush6 Bush7 Bush10 Bush12', 2), ...p('Red_mushroom1 Brown_mushroom2 Beige_stone_grass5 Brown_stone_grass4 Broken_tree5 Broken_tree6')], density: 0.45, from: 0.5 },
      // Small trees, round bushes, boulders and fallen trunks toward the edges (monsters walk around them).
      { pieces: [...p('Tree4 Tree10 Tree12 Tree14', 2), ...p('Bush1 Bush2 Bush3 Bush4 Bush9 Bush11 Bush13', 2), ...p('Light_stone_grass2 Light_stone_grass3 Brown_stone_grass1 Brown_stone_grass2 Broken_tree2 Broken_tree3 Broken_tree4')], density: 0.3, from: 0.68 },
      // A wall of great pink and purple trees all round the border (monsters walk through it, behind or in front).
      { pieces: p('Tree1 Tree2 Tree3 Tree5 Tree6 Tree7 Tree8 Tree9 Tree11 Tree13'), density: 0, from: 0.95, edge: true },
    ],
    // One overgrown ruin in the top-left corner, half off the view, in place of the wall there.
    landmarks: [{ file: 'Ruin_grass1', at: [50, 106] }],
  },
  // CraftPix's undead land: grey-green earth, cracks, pebbles and dead weeds, headstones scattered round the
  // clearing, the odd coffin or open grave, and a wall of dead and gnarled trees round the border.
  graveyard: {
    base: '#6f736a',
    specks: [
      ['#777665', 26],
      ['#666a5f', 22],
      ['#5d6157', 10],
    ],
    bands: [
      // Small details round the clearing: weeds, cracks, pebbles and little bones.
      { pieces: [...p('det7 det8 det9 det10 det11 det12 det13 det14 det15 det16 det17 det18 det19 det20 det21 det22 det23 det24', 2), ...p('det26 det28'), ...p('det31 det33 det35 det37 det39 det41 det43 det47 det49 det51 det53 det55 det57 det59 det61 det62'), ...p('Bones_1 Bones_2 Bones_3 Bones_5 Bones_16 Bones_18 Plant_4 Plant_5')], density: 2.6, from: 0 },
      // Headstones scattered all around the clearing (the big pale and dark ones, with a few small ones): monsters walk around them.
      { pieces: [...p('grave1 grave2 grave3 grave4 grave5 grave6', 3), ...p('Grave_2 Grave_4 Grave_7 Grave_12 Grave_16')], density: 1.05, from: 0.42, solid: true },
      // A few rocks, bones, weeds and a dead arm between them.
      { pieces: p('Rock_3 Rock_4 Bones_4 Plant_3 undead_plant2 Thorn_plant_6 Dead_arm_4'), density: 0.3, from: 0.5 },
      // The odd small dead tree, coffin, open grave or skull pile toward the edges.
      { pieces: [...p('Tree_3 Dead_tree_3', 2), ...p('coffin1 coffin2 excavated_grave1 excavated_grave3 Rock_2 skull_pile mushroom1_3')], density: 0.12, from: 0.72 },
      // A wall of dead and gnarled trees all round the border (monsters walk through it, behind or in front).
      { pieces: [...p('Dead_tree_1 Dead_tree_2 Tree_1 Tree_2', 2), ...p('web_tree1 web_tree2')], density: 0, from: 0.95, edge: true },
    ],
    // A few more headstones in the top corners, just inside the trees.
    landmarks: [
      { file: 'grave3', at: [54, 100], solid: true },
      { file: 'grave2', at: [-88, 92], solid: true },
      { file: 'grave5', at: [-72, 128], solid: true },
    ],
    vignette: 'rgba(20,24,30,0.45)',
  },
  // CraftPix's dungeon on a flagstone floor, walled: the corners are closed off by the dungeon's stone walls, and
  // monsters come in only through the gates in the middle of each side (gates.ts). Coffins stand side by side
  // against the top-left walls and bones line the bottom-right ones, with a great skull heap in that corner; little
  // bones and candles edge the top and bottom gates, small bones and ghost-flame candles fill the corners, and the
  // paths from the gates in to the Hunters stay clear.
  crypt: {
    base: '#3f3d42',
    specks: [],
    slabs: { size: 22, colors: ['#3f3d42', '#3c3a3f', '#434046', '#3a383c', '#413e44'], grout: '#2b292d', light: '#47444a' },
    wallFace: 'wall_face',
    bands: [
      // Coffins stood side by side against the top-left walls...
      { pieces: p('coffin_1 coffin_16 coffin_17 coffin_18 coffin_19 coffin_2 coffin_20 coffin_22 coffin_23 coffin_24 coffin_25 coffin_27 coffin_28 coffin_29 coffin_3 coffin_30 coffin_31 coffin_32 coffin_33'), density: 0, from: 1, line: { side: 'top', from: 0, to: 0.33, gap: 1, inset: WALL_ROOF + WALL_FACE + 1 } },
      { pieces: p('coffin_1 coffin_16 coffin_17 coffin_18 coffin_19 coffin_2 coffin_20 coffin_22 coffin_23 coffin_24 coffin_25 coffin_27 coffin_28 coffin_29 coffin_3 coffin_30 coffin_31 coffin_32 coffin_33'), density: 0, from: 1, line: { side: 'left', from: 0, to: 0.31, gap: 1, inset: WALL_SIDE + 1 } },
      // ...statues, blue-fire torches and chests against the top-right ones and the bottom-left...
      { pieces: [...p('obj_1 obj_2 obj_3 obj_4 obj_5 obj_6', 2), ...p('torch_1 torch_2 torch_3 torch_4 torch_6 torch_11 torch_16 torch_21', 1.5), ...p('obj_7 obj_8 obj_9 obj_21 obj_22 web_rock2 web_rock3')], density: 0, from: 1, line: { side: 'top', from: 0.67, to: 1, gap: 4, inset: WALL_ROOF + WALL_FACE + 1 } },
      { pieces: [...p('obj_1 obj_2 obj_3 obj_4 obj_5 obj_6', 2), ...p('torch_1 torch_2 torch_3 torch_4 torch_6 torch_11 torch_16 torch_21', 1.5), ...p('obj_7 obj_8 obj_9 obj_21 obj_22 web_rock2 web_rock3')], density: 0, from: 1, line: { side: 'bottom', from: 0, to: 0.33, gap: 4, inset: WALL_ROOF + 1 } },
      // ...and bones lining the bottom-right ones.
      { pieces: [...p('Bones_1 Bones_2 Bones_3 Bones_4 Bones_5 Bones_13 Bones_15 Bones_16 Bones_17 Bones_18', 2), ...p('obj_27 obj_28 obj_29 obj_30 obj_31 obj_32 obj_33 obj_34 obj_35 obj_36 obj_37 obj_38 obj_39', 1.5), ...p('obj_46 obj_47 obj_48 obj_49 obj_50 obj_51 obj_52 obj_53 Bones_6 skull_pile bone_pelvis')], density: 0, from: 1, line: { side: 'bottom', from: 0.67, to: 1, gap: 1, inset: WALL_ROOF + 1 } },
      { pieces: [...p('Bones_1 Bones_2 Bones_3 Bones_4 Bones_5 Bones_13 Bones_15 Bones_16 Bones_17 Bones_18', 2), ...p('obj_27 obj_28 obj_29 obj_30 obj_31 obj_32 obj_33 obj_34 obj_35 obj_36 obj_37 obj_38 obj_39', 1.5), ...p('obj_46 obj_47 obj_48 obj_49 obj_50 obj_51 obj_52 obj_53 Bones_6 skull_pile bone_pelvis')], density: 0, from: 1, line: { side: 'right', from: 0.66, to: 1, gap: 1, inset: WALL_SIDE + 1 } },
      // Little bones, skulls and candles down both edges of the top and bottom gates, beside the walls' ends.
      ...(['top', 'bottom'] as const).flatMap((jamb) => (['left', 'right'] as const).map((side): Band => ({ pieces: [...p('obj_12 obj_13 obj_14 obj_17 obj_42 obj_46 obj_47 obj_48 obj_49 obj_50 obj_51 obj_52 obj_53', 2), ...p('candle_9 Bones_2', 1)], density: 0, from: 1, line: { side, from: 0, to: 1, gap: 2, jamb } }))),
      // Small bones, skulls and cracks scattered everywhere.
      { pieces: [...p('det25 det26 det27 det28 det29 det30', 1.5), ...p('Bones_1 Bones_2 Bones_3 Bones_5 Bones_15 Bones_16 Bones_17 Bones_18 obj_42 obj_46 obj_47 obj_48 obj_49 obj_50 obj_51 obj_52 obj_53 obj_12 obj_13 obj_14 obj_17 obj_19', 2)], density: 3, from: 0 },
      // A ring of ghost-flame candles round the clearing.
      { pieces: p('candle_1 candle_2 candle_3 candle_4 candle_5 candle_6 candle_7 candle_8 candle_9'), density: 3, from: 0.38, to: 0.5 },
      // The odd coffin laid flat, bone heap or chest further out.
      { pieces: [...p('coffin_4 coffin_5 coffin_6 coffin_7 coffin_8 coffin_9 coffin_10 coffin_11 coffin_12 coffin_13 coffin_14 coffin_15 coffin_34 coffin_35 coffin_36 coffin_37'), ...p('Bones_4 Bones_6 Bones_13 obj_30 obj_33 obj_37 obj_38 skull_pile obj_7 obj_8')], density: 0.18, from: 0.62 },
    ],
    // A great heap of skulls in the bottom-right corner.
    landmarks: [{ file: 'Pile_sculls', at: [-WALL_SIDE - 42, -WALL_ROOF - 6] }],
    vignette: 'rgba(8,6,12,0.5)',
  },
  // CraftPix's cursed land on dark cave rock, as an eldritch nest: veins crawling over the floor, eyes and pustules
  // watching from the dark, tentacles, eggs and eye-plants further out, and a wall of clawed and toothed things
  // closing in round the edge. The view is zoomed out further here (DEEP_ZOOM_OUT), and the pieces keep well out of
  // a wide clearing, for the monsters that stop at a distance and shoot.
  depths: {
    base: '#1e1a20',
    specks: [
      ['#2a2026', 24],
      ['#15121a', 20],
      ['#33242c', 8],
    ],
    clear: 0.62,
    edgeOut: 14,
    bands: [
      { pieces: [...p('c_Veins_1 c_Veins_2 c_Veins_3 c_Veins_4', 1.5), ...p('c_Eyes_2 c_Pustules_3 c_Fetus_3 c_Rock_eyes_4 c_Rock_eyes_5 c_Bones_7 c_Bones_8 c_Bones_9 c_Webbed_1 small_mushrooms1 small_mushrooms2', 1.5)], density: 0.8, from: 0 },
      { pieces: p('c_Eye_plant_1 c_Eye_plant_2 c_Eye_plant_3 c_Many_eyes_plant_2 c_Many_eyes_plant_3 c_Tentacles_1 c_Tentacles_2 c_Tentacles_3 c_Pustules_2 c_Fetus_2 c_Meat_flower_3 c_Jaws_plant_3 c_Eggs_1 c_Eggs_2 c_Eggs_3 c_Claw_eggs_2 c_Claw_eggs_3'), density: 0.55, from: 0.68 },
      { pieces: p('c_Tentacle_plant_1 c_Tentacle_plant_2 c_Spike_plant_2 c_Spike_plant_3 c_Neuro_monster_1 c_Neuro_monster_2 c_Tooth_mouth_3 c_Tooth_mouth_5 c_Jaws_plant_2 c_Meat_flower_2 c_Claw_eggs_4 c_Tentacles_4 c_Star_monster_3'), density: 0.3, from: 0.84 },
      // A wall of clawed and toothed things and spiked plants all round the border (monsters walk through it).
      { pieces: p('c_Claw_monster_1 c_Claw_monster_2 c_Claw_monster_3 c_Tentacle_monster_1 c_Tentacle_monster_2 c_Tooth_monster_1 c_Tooth_monster_2 c_Tooth_mouth_1 c_Jaws_plant_1 c_Spike_plant_1'), density: 0, from: 0.95, edge: true },
    ],
    vignette: 'rgba(10,0,6,0.75)',
  },

  // The Ember Mines: brown rock floor and pebbles, thick ore veins of gold and red crystal with the odd blue or green
  // gem among brown boulders and tan slabs, a few smoking vents and small lava pools, and rock walls and great
  // boulders crowding the edge. Kept well back from a wide clearing (the view is zoomed out from the Depths on).
  caves: {
    base: '#4a3934',
    specks: [['#5a4640', 26], ['#3e302c', 22], ['#685243', 8]],
    clear: 0.55,
    edgeOut: 10,
    pools: { density: 0.025, from: 0.62, size: [36, 60], rim: '#140e11', crust: '#5c2316', fill: '#c9562a', inner: '#d98d37', details: run('lava', 1, 89).split(' ') },
    bands: [
      { pieces: [...p(run('spot', 1, 72), 1), ...p('r_Rock2_5 r_Rock6_5 r_Rock7_5 Yellow_crystal4 Yellow_stone4 Red_crystal3 Orange_stone4 g_Blue_crystal4 Water_rocks3', 0.5)], density: 2.2, from: 0 },
      { pieces: [...p('Yellow_crystal3 Yellow_stone3 Yellow_crystal2 Red_crystal3 Red_crystal2 Dark_red_crystal3', 2), ...p('r_Rock2_3 r_Rock2_4 r_Rock7_3 r_Rock7_4 r_Rock6_3 r_Rock6_4', 1.5), ...p('g_Blue_crystal3 g_Green_crystal3 Volcano4 Volcano5')], density: 0.9, from: 0.6 },
      { pieces: [...p('Yellow_crystal1 Yellow_stone1 Yellow_stone2 Red_crystal1 Dark_red_crystal1 Dark_red_crystal2', 2), ...p('r_Rock2_1 r_Rock2_2 r_Rock7_1 r_Rock7_2 r_Rock6_1 r_Rock6_2', 1.5), ...p('g_Blue_crystal2 g_Green_crystal2 Volcano3')], density: 0.45, from: 0.78 },
      { pieces: [...p(run('Walls_elements', 1, 20), 3), ...p('r_Rock2_1 r_Rock7_1 r_Rock6_1', 2), ...p('gray_stalagmites1 black_stalagmites1')], density: 0, from: 0.95, edge: true },
    ],
    vignette: 'rgba(30,8,0,0.5)',
  },

  // CraftPix's glowing cave, cave objects and desert worms, recoloured to toxic greens: a poisoned fungal nest.
  // Glowing toadstools, spore mushrooms and mushroom houses grow among bubbling pools of acid, insects and great
  // worms coil through roots, bones and webbed cocoons, and fungi, worms and centipedes crowd the edge. Kept back
  // from a wide clearing (the view is zoomed out from the Depths on).
  mines: {
    base: '#33432f',
    specks: [
      ['#2a3826', 26],
      ['#3d5038', 20],
      ['#9ad43a', 1.2],
    ],
    clear: 0.55,
    edgeOut: 10,
    pools: { density: 0.06, from: 0.6, size: [40, 80], rim: '#0f1a0c', crust: '#24451a', fill: '#4a8424', inner: '#5f9e26', details: run('gd', 35, 57).split(' ') },
    bands: [
      // Moss, spores and little mushrooms, roots and bones.
      { pieces: [...p(run('gd', 58, 75), 2), ...p('gd76 gd77 gd78 gd79 gd80 gd81 gd12 gd13 gd18 gd22 gd25 gd27 gd28 gd30 gd31 gd32 gd33'), ...p('g_Mushroom1_4 g_Mushroom3_4 g_Mushroom5_4 o_mushroom13 o_mushroom42 o_mushroom43 d_Roots6 d_Roots7 d_The_beast7 o_Human_skeleton g_Plant1_3', 1)], density: 2.2, from: 0 },
      // Mushroom clumps, small worms, beetles and shells.
      { pieces: [...p('g_Mushroom1_3 g_Mushroom2_3 g_Mushroom3_3 g_Mushroom4_3 g_Mushroom5_3 g_Mushroom6_3 o_mushroom12 o_mushroom22 o_mushroom41', 2), ...p('d_The_beast5 d_The_beast7 d_Arthropods2 g_shell_2 g_shell_3 d_Roots5 d_Bones2 g_Plant3_3', 1.5)], density: 0.8, from: 0.6 },
      // Big toadstools and mushroom houses, worms, arthropods and webbed cocoons.
      { pieces: [...p('g_Mushroom1_1 g_Mushroom1_2 g_Mushroom2_1 g_Mushroom2_2 g_Mushroom3_2 g_Mushroom4_1 g_Mushroom5_1 g_Mushroom6_2 o_mushroom11 o_mushroom21 o_mushroom31', 2), ...p('d_The_beast4 d_The_beast6 d_Arthropods1 o_cocoon_web g_shell_1 g_lizard_1 d_Roots3 d_Roots4 d_Bones3', 1.5)], density: 0.42, from: 0.78 },
      // Giant fungi, great worms and centipedes crowding the border (monsters walk through them).
      { pieces: [...p('g_Mushroom1_1 g_Mushroom2_1 g_Mushroom3_1 g_Mushroom6_1 o_mushroom21 o_mushroom31', 2), ...p('d_The_beast1 d_The_beast2 d_The_beast3 o_centipede1 o_centipede2', 1.5), ...p('d_Roots1 d_Roots2 o_cocoon_web'), ...p('d_Bones1', 0.25)], density: 0, from: 0.95, edge: true },
    ],
    vignette: 'rgba(4,12,2,0.6)',
  },

  // CraftPix's winter and rocky tilesets: a snowy mountain pass. Patches of bare rock, boulders, rune stones and
  // horned helmet rocks, a great horned statue, and snow-capped mountains and pines crowding the edge.
  peaks: {
    base: '#c5dadd',
    specks: [['#d4e6e8', 30], ['#b9cfd3', 22], ['#e8f4f5', 10]],
    clear: 0.55,
    edgeOut: 10,
    pools: { density: 0.08, from: 0.45, size: [30, 70], rim: '#70665e', crust: '#8a7e71', fill: '#958978', inner: '#aa9e85', details: run('wd', 26, 41).split(' ') },
    bands: [
      { pieces: [...p(run('wd', 1, 41), 1), ...p('w_Stones4 w_Stones5 r_Rock13 r_Rock23 r_Rock33', 0.8)], density: 2.2, from: 0 },
      { pieces: [...p('w_Stones2 w_Stones3 r_Rock11 r_Rock12 r_Rock22 r_Rock32 o_Rune_rocks4 o_Helmet_rocks2 o_Mountains5', 2), ...p('r_Conifer_tree_small2_1 r_Conifer_tree_small2_2')], density: 0.8, from: 0.6 },
      { pieces: [...p('w_Stones1 r_Rock14 r_Rock15 r_Rock24 r_Rock25 r_Rock34 r_Rock35 o_Mountains4 o_Rune_rocks3 o_Helmet_rocks1', 2), ...p('r_Conifer_tree1_3 r_Conifer_tree3_3')], density: 0.42, from: 0.78 },
      { pieces: [...p('o_Mountains1 o_Mountains2 o_Mountains3', 3), ...p('r_Rock14 r_Rock34 r_Rock35 o_Helmet_rocks1 r_Conifer_tree1_1')], density: 0, from: 0.95, edge: true },
    ],
    landmarks: [{ file: 'o_Statue_rocks2', at: [-62, 140] }],
    vignette: 'rgba(60,90,120,0.3)',
  },

  // CraftPix's flying islands: a staircase of grassy islands climbing out of the clouds from the bottom-left
  // to the top-right, the fight on the broad island in the middle, big trees, crystals and ruins on the steps,
  // and clouds and drifting rocks in the open sky below them.
  cliffs: {
    base: '#6fa5d6',
    sky: ['#b7dcf2', '#6fa5d6'],
    specks: [],
    clear: 0.5,
    islands: { file: 'island', steps: [[1.0, -0.06, 0.24, 0.1], [0.84, 0.15, 0.26, 0.11], [0.5, 0.5, 0.6, 0.4], [0.16, 0.85, 0.26, 0.11], [0.0, 1.06, 0.24, 0.1]] },
    bands: [
      { pieces: [...p('Cloud_color1_1 Cloud_color1_2 Cloud_color2_1 Cloud_color2_2 Cloud_color3_1 Cloud_color3_2', 3), ...p('fr1 fr2 fr3 fr4 fr5 fr6', 1.5), ...p(run('fr', 7, 62), 0.3)], density: 0.6, from: 0, under: true, overlap: true },
      { pieces: [...p(run('id', 1, 52), 1)], density: 22, from: 0, onIslands: true },
      { pieces: [...p('Bush1_2 Bush1_3 Bush2_2 Bush2_3 Plant1_3 Plant2_3 Plant3_3 Crystael3 Crystael4 Crystael9 Small_rock1 Small_rock2')], density: 4, from: 0.5, onIslands: true },
      { pieces: [...p('Tree1_1 Tree1_2 Tree2_1 Tree2_2 Trees3_1 Trees3_2 Trees3_3 Plant1_1 Plant3_1', 2), ...p('Crystael1 Crystael5 Rock1 Rock2 Ruins2 Ruins3')], density: 4, from: 0.6, onIslands: true },
    ],
  },

  // CraftPix's dungeon set in the sky: a paved marble court on a cloud bank, fire-crowned statues, ghost-flame
  // candles, praying statues and treasure, columns, tombs and blue-fire braziers toward its rim (every piece kept
  // on the paving), and clouds and a dragon below.
  fortress: {
    base: '#8ab4dc',
    sky: ['#d3e6f4', '#8ab4dc'],
    specks: [],
    clear: 0.48,
    slabs: { size: 20, colors: ['#b9c0cf', '#b3bac9', '#bfc6d4', '#adb4c4', '#b6bdcc'], grout: '#7d8496', light: '#d0d6e1', inset: 0.06, side: '#6b7284' },
    bands: [
      { pieces: [...p('Cloud_color1_1 Cloud_color1_2 Cloud_color1_3 Cloud_color2_1 Cloud_color2_2 Cloud_color3_1 Cloud_color3_2', 3), ...p('Dragon_big Dragon_small', 0.3)], density: 0.6, from: 0.88, under: true, overlap: true },
      { pieces: [...p('puff1 puff2 puff3 puff4 puff5 puff6 puff7 puff8 puff9 puff11 puff13', 2), ...p('candle3 candle6 candle9 medal1 medal2')], density: 1.6, from: 0, to: 0.8 },
      { pieces: [...p('candle1 candle2 candle4 candle5 candle7 candle8', 2), ...p('statue1 statue2 statue3 statue4 statue5 statue6 chest7 chest8 chest9', 1.5)], density: 0.9, from: 0.55, to: 0.72 },
      { pieces: [...p('colA colB colC', 3), ...p('torch2 torch3 torch4 torch6 tomb4 tomb10 tomb16 tomb25', 1.5)], density: 0.6, from: 0.66, to: 0.74 },
    ],
    landmarks: [{ file: 'statue_fire', at: [80, 118] }, { file: 'statue_fire', at: [-80, 118] }],
  },

  // On a meteor: its cratered surface, broken open at the edge onto space (the nebula band and starfield, with
  // meteors and moons drifting in the gaps), shooting stars streaking over, and grey and red rocks crowding the edge.
  meteors: {
    base: '#3d3742',
    specks: [['#47404d', 26], ['#332e38', 22], ['#57505e', 8], ['#e0573a', 0.4]],
    clear: 0.55,
    edgeOut: 34,
    pools: { density: 0.24, from: 0.66, size: [70, 130], rim: '#1f1b23', crust: '#6a6273', fill: '#141a20', pattern: 'space', details: ['moonb2', 'moonb5', 'red2', 'red8', 'red12', 'red20', 'shoot8', 'shoot10'] },
    bands: [
      { pieces: [...p('rock15 rock8 rock5 red2 red8 red12 red20 red26 red37', 1)], density: 1, from: 0 },
      { pieces: [...p(run('shoot', 1, 18), 1)], density: 0.6, from: 0.3, overlap: true },
      { pieces: [...p('rock3 rock7 rock11 rock12 rock13', 2), ...p('red4 red7 red13 red16 red22')], density: 0.7, from: 0.6 },
      { pieces: [...p('rock4 rock9 rock10', 2), ...p('red9 red11 red15 red17 red33')], density: 0.35, from: 0.78 },
      { pieces: [...p('rock2 rock6 rock14', 2), ...p('red5 red19 red29 red31')], density: 0, from: 0.95, edge: true },
    ],
    vignette: 'rgba(0,0,0,0.55)',
  },

  // Where the world comes apart, an eldritch maw: veins, eyes, tooth-mouths and tentacles, a vast winged thing
  // looming over the top, the ground torn open onto the violet void (moons showing through), and tentacled,
  // clawed and toothed monsters crowding the edge.
  rift: {
    base: '#221c26',
    specks: [['#2a2030', 24], ['#18131c', 20], ['#3a2638', 8], ['#b48cff', 0.6]],
    clear: 0.55,
    edgeOut: 18,
    pools: { density: 0.12, from: 0.72, size: [70, 130], rim: '#0f0c10', crust: '#9a6bff', fill: '#1a1030', pattern: 'void', details: ['moon2', 'moon5', 'moon1'] },
    bands: [
      { pieces: [...p('c_Veins_1 c_Veins_2 c_Veins_3', 1.5), ...p('c_Eyes_2 c_Pustules_3 c_Fetus_3 c_Bones_7 c_Bones_8 c_Bones_9 c_Bones_10 c_Bones_11 c_Mushrooms_3 c_Tooth_mouth_3 c_Rock1_4 c_Rock1_5')], density: 0.9, from: 0 },
      { pieces: [...p('c_Eye_plant_1 c_Eye_plant_2 c_Many_eyes_plant_2 c_Tentacles_1 c_Tentacles_2 c_Tentacles_3 c_Tooth_mouth_3 c_Tooth_mouth_4 c_Rock_eyes_2 c_Rock_eyes_3 c_Fetus_2 c_Pustules_2', 2), ...p('c_Rock3_4 c_Rock3_5 Violet_crystal3 Black_crystal3')], density: 0.6, from: 0.6 },
      { pieces: [...p('c_Tooth_mouth_1 c_Rock_eyes_1 c_Tentacles_4 c_Star_monster_1 c_Neuro_monster_1 c_Neuro_monster_2 c_Eggs_1 c_Claw_eggs_1 c_Claw_eggs_2 c_Meat_flower_1 c_Bones_1', 1), ...p('Violet_crystal1 Black_crystal1 c_Rune_stone_2')], density: 0.35, from: 0.78 },
      { pieces: [...p('c_Tentacle_monster_1 c_Tentacle_monster_2 c_Tooth_monster_1 c_Claw_monster_1 c_Claw_monster_2', 2), ...p('c_Jaws_plant_1 c_Spike_plant_1 c_Tentacle_plant_1')], density: 0, from: 0.95, edge: true },
    ],
    landmarks: [{ file: 'c_Wing_monster', at: [234, 104] }],
    vignette: 'rgba(15,0,10,0.75)',
  },

};

const images = new Map<string, HTMLImageElement>();
const cache = new Map<string, HTMLCanvasElement>();
const loading = new Set<AreaId>();
const ready = new Set<AreaId>();

/** Loads a scene's pieces once; the background appears when they're in. */
function load(area: AreaId, scene: Scene): void {
  if (loading.has(area)) return;
  loading.add(area);
  const files = [...new Set([...scene.bands.flatMap((b) => b.pieces.map((x) => x.file)), ...(scene.pools?.details ?? []), ...(scene.islands ? [scene.islands.file] : []), ...(scene.backdrop ? [scene.backdrop] : []), ...(scene.pools?.pattern ? [scene.pools.pattern] : []), ...(scene.landmarks ?? []).map((m) => m.file), ...(scene.wallFace ? [scene.wallFace] : [])])];
  void Promise.all(
    files.map((f) => {
      const img = new Image();
      img.src = `${import.meta.env.BASE_URL}backgrounds/${area}/${f}.png`;
      images.set(`${area}/${f}`, img);
      return img.decode().catch(() => undefined);
    }),
  ).then(() => ready.add(area));
}

/** The roof's colours, from its rim inward (the dungeon tileset's wall tops): a dark outline, a lit edge, then darker. */
const ROOF = ['#1c191d', '#342c32', '#292429', '#292429', '#252125', '#252125', '#1f1c20', '#1f1c20', '#1c191d'];
const ROOF_IN = '#181619';

/**
 * A gated area's corner walls (gates.ts): dark wall tops shaded in from their edges, and the cobbled face (`face`,
 * tiled) hanging below every edge of a top that faces down into the room. Returns the rects they cover.
 */
function drawGateWalls(g: CanvasRenderingContext2D, face: HTMLImageElement, w: number, h: number): Rect[] {
  const rects = gateWalls(w, h);
  // The tops: each wall less the face below it (a top wall, or a side wall's end in a top corner).
  const roof = new Uint8Array(w * h);
  for (const [x, y, rw, rh] of rects) {
    const bottom = y + rh < h ? y + rh - WALL_FACE : y + rh;
    for (let py = Math.max(0, y); py < Math.min(h, bottom); py++) roof.fill(1, py * w + Math.max(0, x), py * w + Math.min(w, x + rw));
  }
  // How far each top pixel is from the floor (off the view counts as more wall), up to the rim's width.
  const R = ROOF.length;
  const dist = new Uint8Array(w * h);
  const isRoof = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || roof[y * w + x] === 1;
  const img = g.getImageData(0, 0, w, h);
  const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const cols = ROOF.map(hex);
  const inner = hex(ROOF_IN);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!roof[i]) continue;
      let d = R + 1;
      for (let k = 1; k <= R && d > R; k++)
        for (let j = -k; j <= k && d > R; j++) if (!isRoof(x + j, y - k) || !isRoof(x + j, y + k) || !isRoof(x - k, y + j) || !isRoof(x + k, y + j)) d = k;
      dist[i] = d;
      // A little unevenness in the shading, as in the tiles.
      const c = d <= R ? cols[Math.min(R - 1, Math.max(0, d - 1 + (d > 2 && (x * 7 + y * 13) % 11 === 0 ? 1 : 0)))] : inner;
      img.data.set(c, i * 4);
    }
  g.putImageData(img, 0, 0);
  // The faces: below every bottom edge of a top, down to the floor (or the next top).
  const fw = face.naturalWidth;
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h - 1; y++) {
      if (!roof[y * w + x] || roof[(y + 1) * w + x]) continue;
      let fh = 0;
      while (fh < WALL_FACE && y + 1 + fh < h && !roof[(y + 1 + fh) * w + x]) fh++;
      g.drawImage(face, x % fw, 0, 1, fh, x, y + 1, 1, fh);
      // Its ends, where the wall meets a gate: outlined like the tiles.
      const end = (x > 0 && !roof[(y + 1) * w + x - 1] && !roof[y * w + x - 1]) || (x < w - 1 && !roof[(y + 1) * w + x + 1] && !roof[y * w + x + 1]);
      if (end) {
        g.fillStyle = ROOF[0];
        g.fillRect(x, y + 1, 1, fh - 2);
      }
    }
  return rects;
}

/** A seeded random number generator (the same layout every time for a view size). */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

type Rect = [number, number, number, number];
/** Whether two rectangles [x, y, w, h] overlap, each shrunk by `inset` of its size (shadows and soft edges may touch). */
function overlaps(a: Rect, b: Rect, inset = 0.12): boolean {
  const ax = a[2] * inset, ay = a[3] * inset, bx = b[2] * inset, by = b[3] * inset;
  return a[0] + ax < b[0] + b[2] - bx && b[0] + bx < a[0] + a[2] - ax && a[1] + ay < b[1] + b[3] - by && b[1] + by < a[1] + a[3] - ay;
}

/** How far out a point is: 0 at the centre, 1 at the nearest edge. */
const outness = (x: number, y: number, w: number, h: number): number => Math.max(Math.abs(x - w / 2) / (w / 2), Math.abs(y - h / 2) / (h / 2));

/** Pixel blobs (a few overlapping ellipses each), drawn as rim, fill and an inner shade, with details inside. */
function drawPools(g: CanvasRenderingContext2D, pools: NonNullable<Scene['pools']>, area: AreaId, w: number, h: number, r: () => number, taken: Rect[]): void {
  const want = Math.round((pools.density * w * h) / 10_000);
  for (let i = 0, tries = 0; i < want && tries < want * 30; tries++) {
    const cx = r() * w;
    const cy = r() * h;
    if (outness(cx, cy, w, h) < pools.from) continue;
    const size = pools.size[0] + r() * (pools.size[1] - pools.size[0]);
    // Its footprint (blobs reach about this far, rim included); pools keep apart from each other.
    const foot: Rect = [cx - size * 1.1, cy - size * 0.8, size * 2.2, size * 1.6];
    if (taken.some((t) => overlaps(foot, t, 0))) continue;
    taken.push(foot);
    i++;
    const blobs = Array.from({ length: 3 + Math.floor(r() * 3) }, (_, k) => ({
      x: cx + (k ? (r() - 0.5) * size : 0),
      y: cy + (k ? (r() - 0.5) * size * 0.6 : 0),
      rx: size * (0.35 + r() * 0.3),
      ry: size * (0.2 + r() * 0.18),
    }));
    const inside = (x: number, y: number, grow: number): boolean => blobs.some((b) => ((x - b.x) / (b.rx + grow)) ** 2 + ((y - b.y) / (b.ry + grow)) ** 2 <= 1);
    const x0 = Math.floor(cx - size * 1.3);
    const y0 = Math.floor(cy - size);
    const x1 = Math.ceil(cx + size * 1.3);
    const y1 = Math.ceil(cy + size);
    // Two-pixel cells keep the edge chunky, like the tilesets.
    const layers: Array<[string, number]> = [[pools.rim, 4], ...(pools.crust ? [[pools.crust, 2] as [string, number]] : []), [pools.fill, 0], ...(pools.inner ? [[pools.inner, -size * 0.1] as [string, number]] : [])];
    const pat = pools.pattern && images.get(`${area}/${pools.pattern}`);
    for (const [color, grow] of layers) {
      g.fillStyle = color === pools.fill && pat && pat.naturalWidth ? g.createPattern(pat, 'repeat')! : color;
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) if (inside(x + 1, y + 1, grow)) g.fillRect(x, y, 2, 2);
    }
    if (pools.details) {
      for (let k = 0; k < size / 3; k++) {
        const img = images.get(`${area}/${pools.details[Math.floor(r() * pools.details.length)]}`);
        if (!img || !img.naturalWidth) continue;
        const px = x0 + r() * (x1 - x0);
        const py = y0 + r() * (y1 - y0);
        const half = img.naturalWidth / 2;
        if (!inside(px - half, py, -2) || !inside(px + half, py, -2) || !inside(px, py - img.naturalHeight / 2, -2) || !inside(px, py + img.naturalHeight / 2, -2)) continue;
        g.drawImage(img, Math.round(px - img.naturalWidth / 2), Math.round(py - img.naturalHeight / 2));
      }
    }
  }
}

/**
 * One floating island, stretched from a 3×5-tile island (16px tiles: left, middle and right columns; a top
 * row, a middle row repeated for depth, and a bottom row that runs into the rocky underside). Returns its
 * grass top as [x, y, w, h].
 */
function drawIsland(g: CanvasRenderingContext2D, img: HTMLImageElement, [fx, fy, fw, fh]: [number, number, number, number], w: number, h: number): [number, number, number, number] {
  const T = 16;
  const cols = Math.max(2, Math.round((fw * w) / T));
  const rows = Math.max(2, Math.round((fh * h) / T));
  const x0 = Math.round(fx * w - (cols * T) / 2);
  const y0 = Math.round(fy * h - (rows * T) / 2);
  for (let i = 0; i < cols; i++) {
    const sx = i === 0 ? 0 : i === cols - 1 ? 2 * T : T;
    for (let j = 0; j < rows - 1; j++) g.drawImage(img, sx, j === 0 ? 0 : T, T, T, x0 + i * T, y0 + j * T, T, T);
    g.drawImage(img, sx, 2 * T, T, 3 * T, x0 + i * T, y0 + (rows - 1) * T, T, 3 * T);
  }
  return [x0, y0, cols * T, rows * T];
}

/** The painted background for an area at a view size, or null if it has none (or it's still loading). */
/**
 * Only the area's first `bands` decor bands, at `density` times as many pieces (a minigame that places its own
 * big objects, so they can be layered and collide).
 */
export interface DecorOpts {
  bands: number;
  density: number;
  /** Keep a column down the middle clear of every piece (trees included): its width as a fraction of the view's. */
  clear?: number;
  /** Drawn this much smaller (laid out over a view 1 / scale as big, then shrunk to fit): a scene seen from far off. */
  scale?: number;
}

/** A piece of an area's decor, once its scene has loaded (null before then or if it isn't one of the area's). */
export function scenePiece(area: AreaId, file: string): HTMLImageElement | null {
  const scene = SCENES[area];
  if (!scene) return null;
  load(area, scene);
  const img = images.get(`${area}/${file}`);
  return ready.has(area) && img && img.naturalWidth ? img : null;
}

/** Nothing is placed this close to the middle (a fraction of the way to the nearest edge): the Hunters' clearing. */
const CLEAR = 0.35;
/** Bands this far out hold the big objects: on the battlefield they're props, drawn among the monsters. */
const PROP_FROM = 0.7;
/** Pieces that lie flat on the ground (craters, holes, veins, circles), baked in even out among the props. */
/**
 * Rocks, stones and stumps big enough to trip over: wherever they lie, they stand among the monsters as solid props
 * (walked around). Smaller ones (pebbles), and flowers, grass and the like, stay part of the ground and are walked over.
 */
const SOLIDISH = /(Rock|Rpck|rock|Stone|stone|Broken_tree|[Ss]tump|[Bb]oulder)/;
const SOLIDISH_MIN = 24;
const FLAT = /^(c_Veins|o_magic_circle|moon\d|skull_chasm|excavated_grave|gd\d|d_Roots|Cloud)/;

/**
 * A big object standing on the battlefield: its picture's top-left corner and where it stands (`foot`, its
 * lowest solid row), in view pixels, and the circle its base fills (monsters walk around it), if it has one.
 */
export interface SceneProp {
  img: HTMLImageElement;
  x: number;
  y: number;
  foot: number;
  base: { x: number; y: number; r: number } | null;
}

/** Where a piece's solid pixels end, and how wide they are near the bottom (its base): once per picture. */
const bases = new Map<HTMLImageElement, { foot: number; left: number; right: number } | null>();
function baseOf(img: HTMLImageElement): { foot: number; left: number; right: number } | null {
  if (bases.has(img)) return bases.get(img)!;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, w, h).data;
  const solid = (px: number, py: number) => d[(py * w + px) * 4 + 3] > 200;
  let foot = -1;
  for (let py = h - 1; py >= 0 && foot < 0; py--) for (let px = 0; px < w; px++) if (solid(px, py)) foot = py;
  let out: { foot: number; left: number; right: number } | null = null;
  if (foot >= 0) {
    // The base: the bottom fifth of it (at least 4 rows), so a tree's trunk rather than its canopy.
    let left = w;
    let right = -1;
    for (let py = Math.max(0, foot - Math.max(4, Math.round(h * 0.2))); py <= foot; py++)
      for (let px = 0; px < w; px++)
        if (solid(px, py)) {
          left = Math.min(left, px);
          right = Math.max(right, px);
        }
    out = { foot: foot + 1, left, right: right + 1 };
  }
  bases.set(img, out);
  return out;
}

function sceneProp(img: HTMLImageElement, x: number, y: number): SceneProp {
  const b = baseOf(img);
  if (!b) return { img, x, y, foot: y + img.naturalHeight, base: null };
  const r = ((b.right - b.left) / 2) * 0.85;
  return { img, x, y, foot: y + b.foot, base: r >= 3 ? { x: x + (b.left + b.right) / 2, y: y + b.foot - r * 0.6, r } : null };
}

const sceneProps = new Map<string, SceneProp[]>();

/**
 * The battlefield's scene: the painted ground (the clearing, small details and anything flat) and the big
 * objects of the outer ring as props, to draw among the monsters (who go behind them) and to walk around.
 */
export function areaScene(area: AreaId, w: number, h: number): { ground: HTMLCanvasElement; props: SceneProp[]; vignette?: string } | null {
  const ground = areaBackground(area, w, h, undefined, true);
  return ground ? { ground, props: sceneProps.get(`${area}:${w}x${h}:split`) ?? [], vignette: SCENES[area]?.vignette } : null;
}

/** Darkens the view toward its edges (drawn over the props and monsters, as it was over the painted ground). */
export function drawVignette(g: CanvasRenderingContext2D, w: number, h: number, color: string): void {
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) / 2);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, color);
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
}

/** The area's painted background, everything baked in; `split` leaves the outer ring's big objects out (see areaScene). */
export function areaBackground(area: AreaId, w: number, h: number, decor?: DecorOpts, split = false): HTMLCanvasElement | null {
  const scene = SCENES[area];
  if (!scene) return null;
  load(area, scene);
  if (!ready.has(area)) return null;
  const key = `${area}:${w}x${h}${decor ? `:${decor.bands}:${decor.density}:${decor.clear ?? 0}` : ''}${split ? ':split' : ''}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  if (scene.sky) {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, scene.sky[0]);
    sky.addColorStop(1, scene.sky[1]);
    g.fillStyle = sky;
  } else g.fillStyle = scene.base;
  g.fillRect(0, 0, w, h);
  const back = scene.backdrop && images.get(`${area}/${scene.backdrop}`);
  if (back && back.naturalWidth) {
    const k = Math.max(1, Math.ceil(Math.max(w / back.naturalWidth, h / back.naturalHeight)));
    g.drawImage(back, Math.round((w - back.naturalWidth * k) / 2), Math.round((h - back.naturalHeight * k) / 2), back.naturalWidth * k, back.naturalHeight * k);
  }
  const r = rng(w * 7919 + h * 104729);
  const area10k = (w * h) / 10_000;
  if (scene.slabs) {
    // Staggered rows of stone slabs, each a little different, with a lit top edge and dark grout.
    const { size, colors, grout, light, inset = 0, side } = scene.slabs;
    // A paved platform: whole slabs only, centred, with its underside showing below.
    const cols = Math.floor((w * (1 - 2 * inset)) / size);
    const rows = Math.floor((h * (1 - 2 * inset)) / size);
    const px = inset ? Math.round((w - cols * size) / 2) : 0;
    const py = inset ? Math.round((h - rows * size) / 2) : 0;
    const pw = inset ? cols * size : w;
    const ph = inset ? rows * size : h;
    if (side) {
      g.fillStyle = side;
      g.fillRect(px, py + ph, pw, Math.round(size * 0.75));
      g.fillStyle = grout;
      g.fillRect(px, py + ph + Math.round(size * 0.75), pw, 2);
    }
    g.save();
    g.beginPath();
    g.rect(px, py, pw, ph);
    g.clip();
    for (let row = 0, y = py; y < py + ph; row++, y += size) {
      const off = row % 2 ? Math.floor(size / 2) : 0;
      for (let x = px - off; x < px + pw; x += size) {
        g.fillStyle = colors[Math.floor(r() * colors.length)];
        g.fillRect(x, y, size, size);
        g.fillStyle = light;
        g.fillRect(x + 1, y + 1, size - 2, 1);
        g.fillStyle = grout;
        g.fillRect(x, y, 1, size);
        g.fillRect(x, y + size - 1, size, 1);
      }
    }
    g.restore();
    if (inset) {
      g.strokeStyle = grout;
      g.lineWidth = 2;
      g.strokeRect(px - 1, py - 1, pw + 2, ph + 2);
    }
  }
  for (const [color, per] of scene.specks) {
    g.fillStyle = color;
    for (let i = 0; i < per * area10k; i++) g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 2), 1 + Math.floor(r() * 2));
  }

  const props: SceneProp[] = [];
  // Place every band's pieces, then draw them top to bottom so nearer ones overlap farther ones.
  const tops: Array<[number, number, number, number]> = [];
  // Everything placed so far (pools and pieces), so nothing lands on top of anything else.
  const taken: Rect[] = [];
  // A gated area's walls, in the corners (everything else keeps clear of them).
  const gated = GATED.has(area);
  const face = scene.wallFace && gated ? images.get(`${area}/${scene.wallFace}`) : undefined;
  const walls = face && face.naturalWidth ? drawGateWalls(g, face, w, h) : [];
  taken.push(...walls);
  // A clear column down the middle (minigames that play there): nothing may reach into it.
  const clearHalf = ((decor?.clear ?? 0) * w) / 2;
  const inClear = (x: number, width: number): boolean => clearHalf > 0 && x < w / 2 + clearHalf && x + width > w / 2 - clearHalf;
  const scatter = (bands: Band[], marks: Scene['landmarks'] = []): void => {
    const placed: Array<{ img: HTMLImageElement; x: number; y: number; prop: boolean; wall?: boolean; file: string }> = [];
    // Landmarks first: everything else keeps clear of them (the wall included).
    const markRects: Rect[] = [];
    for (const m of marks) {
      const img = images.get(`${area}/${m.file}`);
      if (!img || !img.naturalWidth) continue;
      const px = Math.round((m.at[0] < 0 ? w + m.at[0] : m.at[0]) - img.naturalWidth / 2);
      const py = Math.round((m.at[1] < 0 ? h + m.at[1] : m.at[1]) - img.naturalHeight);
      const rect: Rect = [px, py, img.naturalWidth, img.naturalHeight];
      markRects.push(rect);
      taken.push(rect);
      placed.push({ img, x: px, y: py, prop: split, wall: !m.solid, file: m.file });
    }
    // Biggest pieces first (the outer bands), then smaller ones fill the room that's left.
    for (const band of [...bands].sort((a, b) => b.from - a.from)) {
      const total = band.pieces.reduce((s, x) => s + x.weight, 0);
      if (band.line) {
        // Side by side along a wall: each piece against it, the next one just past it (skipping any that would
        // overlap something already there, such as the line along the neighbouring wall).
        const { side, gap = 2, inset = 2, jamb } = band.line;
        const across = side === 'top' || side === 'bottom';
        const len = across ? w : h;
        // A gate's edge runs the depth of the wall beside it.
        const jambY = jamb === 'top' ? [1, WALL_ROOF + WALL_FACE] : jamb === 'bottom' ? [h - WALL_ROOF + 1, h - 1] : null;
        const from = jambY ? jambY[0] / len : band.line.from;
        const to = jambY ? jambY[1] / len : band.line.to;
        for (let at = from * len, tries = 0; at < to * len && tries < 200; tries++) {
          let pick = r() * total;
          const piece = band.pieces.find((x) => (pick -= x.weight) <= 0) ?? band.pieces[0];
          const img = images.get(`${area}/${piece.file}`);
          if (!img || !img.naturalWidth) continue;
          const iw = img.naturalWidth;
          const ih = img.naturalHeight;
          if (at + (across ? iw : ih) > to * len) break;
          const px = Math.round(jamb ? (side === 'left' ? Math.round(w / 3) + 1 : Math.round((w * 2) / 3) - 1 - iw) : across ? at : side === 'left' ? inset : w - inset - iw);
          const py = Math.round(across ? (side === 'top' ? inset : h - inset - ih) : at);
          const rect: Rect = [px, py, iw, ih];
          if (taken.some((t) => overlaps(rect, t, 0)) || inClear(px, iw)) {
            at += 4;
            continue;
          }
          taken.push(rect);
          placed.push({ img, x: px, y: py, prop: split, wall: true, file: piece.file });
          at += (across ? iw : ih) + gap + Math.floor(r() * 3);
        }
        continue;
      }
      if (band.edge) {
        // Spots along the edges (each is where a piece's trunk stands): along the top, trunks just inside with
        // the crowns half off the view; along the bottom, trunks well below so only the crowns show; down the
        // sides, half off. Then a few more just inside, so the wall looks deep rather than a single row.
        const spots: Array<[number, number]> = [];
        const step = () => 30 + r() * 20;
        const out = scene.edgeOut ?? 0;
        for (let x = -30; x < w + 30; x += step()) {
          spots.push([x, 44 - out + r() * 26]);
          spots.push([x, h + 62 + out + r() * 26]);
        }
        for (let y = 30; y < h + 70; y += step()) {
          spots.push([-14 - out + r() * 22, y]);
          spots.push([w + 14 + out - r() * 22, y]);
        }
        for (let n = Math.round(spots.length * 0.25); n > 0; n--) {
          const [sx, sy] = spots[Math.floor(r() * spots.length)];
          spots.push([sx + (sx < 40 - out ? 22 : sx > w - 40 + out ? -22 : (r() - 0.5) * 30), sy + (sy < 60 - out ? 18 : sy > h + out ? -16 : 0)]);
        }
        for (const [sx, sy] of spots) {
          // Not where a landmark stands (a trunk inside it, or a crown over its middle).
          if (markRects.some(([mx, my, mw, mh]) => sx > mx - 6 && sx < mx + mw + 6 && sy - 40 < my + mh && sy > my)) continue;
          let pick = r() * total;
          const piece = band.pieces.find((x) => (pick -= x.weight) <= 0) ?? band.pieces[0];
          const img = images.get(`${area}/${piece.file}`);
          if (!img || !img.naturalWidth) continue;
          const px = Math.round(sx - img.naturalWidth / 2);
          const py = Math.round(sy - img.naturalHeight);
          if (inClear(px, img.naturalWidth)) continue;
          // Other pieces keep clear of the wall (most of each crown counts).
          taken.push([px + img.naturalWidth * 0.12, py + img.naturalHeight * 0.1, img.naturalWidth * 0.76, img.naturalHeight * 0.85]);
          placed.push({ img, x: px, y: py, prop: split, wall: true, file: piece.file });
        }
        continue;
      }
      const want = Math.round((decor?.density ?? 1) * band.density * (band.onIslands ? tops.reduce((s, t) => s + t[2] * t[3], 0) / 10_000 : area10k));
      for (let i = 0, tries = 0; i < want && tries < want * 30; tries++) {
        let x = r() * w;
        let y = r() * h;
        if (band.onIslands) {
          // A random spot on a random island's grass (weighted by size), clear of its edges.
          let at = r() * tops.reduce((s, t) => s + t[2] * t[3], 0);
          const t = tops.find((t) => (at -= t[2] * t[3]) <= 0) ?? tops[0];
          x = t[0] + 10 + r() * Math.max(0, t[2] - 20);
          y = t[1] + 10 + r() * Math.max(0, t[3] - 20);
        }
        // The Hunters' clearing stays empty (clouds drifting under the islands aside).
        const out = outness(x, y, w, h);
        if (out < (band.under ? band.from : Math.max(band.from, scene.clear ?? CLEAR)) || (band.to !== undefined && out > band.to)) continue;
        let pick = r() * total;
        const piece = band.pieces.find((x) => (pick -= x.weight) <= 0) ?? band.pieces[0];
        const img = images.get(`${area}/${piece.file}`);
        if (!img || !img.naturalWidth) continue;
        // Island decor stands on its spot; everything else is centred on it.
        const px = Math.round(x - img.naturalWidth / 2);
        const py = Math.round(band.onIslands ? y - img.naturalHeight : y - img.naturalHeight / 2);
        const rect: Rect = [px, py, img.naturalWidth, img.naturalHeight];
        if (inClear(px, img.naturalWidth)) continue;
        // A gated area's paths from the gates in to the Hunters stay clear.
        if (gated && onGatePath(px, py, img.naturalWidth, img.naturalHeight, w, h)) continue;
        // Nothing on top of the walls, not even a little way.
        if (walls.some((t) => overlaps(rect, t, 0))) continue;
        if (!band.overlap) {
          if (taken.some((t) => overlaps(rect, t))) continue;
          taken.push(rect);
        }
        const solidish = SOLIDISH.test(piece.file) && Math.max(img.naturalWidth, img.naturalHeight) >= SOLIDISH_MIN;
        const prop = split && (band.from >= PROP_FROM || !!band.solid || solidish) && !band.under && !band.overlap && !band.onIslands && !FLAT.test(piece.file);
        placed.push({ img, x: px, y: py, prop, file: piece.file });
        i++;
      }
    }
    // Nearer (lower) pieces in front of further ones, by where each stands (its lowest solid row, not the bottom of
    // its picture, which may be empty).
    const foot = (it: (typeof placed)[number]) => it.y + (baseOf(it.img)?.foot ?? it.img.naturalHeight);
    placed.sort((a, b) => foot(a) - foot(b));
    if (split) {
      // A piece baked into the ground would be drawn under every prop, even one standing behind it: one that
      // overlaps a prop stands among them too (walked through, like the wall), so it's layered with them.
      const rect = (it: (typeof placed)[number]): Rect => [it.x, it.y, it.img.naturalWidth, it.img.naturalHeight];
      for (let changed = true; changed; ) {
        changed = false;
        for (const it of placed)
          if (!it.prop && !FLAT.test(it.file) && placed.some((o) => o.prop && o !== it && overlaps(rect(it), rect(o), 0))) {
            it.prop = true;
            it.wall = true;
            changed = true;
          }
      }
    }
    for (const it of placed) {
      // The wall stands among the monsters but doesn't stop them.
      if (it.prop) props.push(it.wall ? { ...sceneProp(it.img, it.x, it.y), base: null } : sceneProp(it.img, it.x, it.y));
      else g.drawImage(it.img, it.x, it.y);
    }
  };
  const bands = decor ? scene.bands.slice(0, decor.bands) : scene.bands;
  scatter(bands.filter((b) => b.under));
  if (scene.islands) {
    const img = images.get(`${area}/${scene.islands.file}`);
    if (img && img.naturalWidth) for (const step of scene.islands.steps) tops.push(drawIsland(g, img, step, w, h));
  }
  if (scene.pools) drawPools(g, scene.pools, area, w, h, r, taken);
  scatter(bands.filter((b) => !b.under), decor ? [] : scene.landmarks);
  if (scene.vignette && !split) {
    const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) / 2);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, scene.vignette);
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  }
  cache.set(key, c);
  if (split) sceneProps.set(key, props);
  return c;
}
