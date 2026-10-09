import type { AreaId } from '../core/balance';

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
  /** Drawn beneath the islands (clouds below the steps). */
  under?: boolean;
  /** Placed only on the islands' grass. */
  onIslands?: boolean;
}
interface Scene {
  base: string;
  /** Texture specks: [colour, how many per 10,000 pixels]. */
  specks: Array<[string, number]>;
  bands: Band[];
  /** A flagstone floor instead of plain ground: slab size, slab colours (picked at random) and the grout between. */
  slabs?: { size: number; colors: string[]; grout: string; light: string };
  /**
   * Pools (lava, acid, water, the void): pixel blobs placed like a band, with a rim, a fill and, optionally,
   * detail pieces (lava streaks, glints) scattered inside them.
   */
  pools?: { density: number; from: number; size: [number, number]; rim: string; crust?: string; fill: string; inner?: string; details?: string[] };
  /** A vertical gradient (top, bottom) instead of the flat base colour: open sky. */
  sky?: [string, string];
  /**
   * Floating islands built from a 3×5-tile island (`file`: grass top over a rocky underside), stretched to any
   * size: each step is [centre x, centre y, grass width, grass height] as fractions of the view.
   */
  islands?: { file: string; steps: Array<[number, number, number, number]> };
  /** Darkens toward the edges (a colour at full strength in the corners). */
  vignette?: string;
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
      // Small details anywhere: flowers, grass tufts, pebbles.
      { pieces: [...p('Flower1 Flower2 Flower3 Flower4 Flower5 Flower6 Flower7 Flower8 Flower9 Flower10 Flower11'), ...p('grass_element1 grass_element2 grass_element3', 3), ...p('Bush9 Bush16 Bush19 Rock_grass_element11 Rock_grass_element12 Rock_grass_element14 Stone5_grass_shadow ground_element22 ground_element23')], density: 4, from: 0 },
      // Bushes, stones and broken trunks outside the middle.
      { pieces: [...p('Bush7 Bush8 Bush10 Bush11 Bush12 Bush13 Bush15 Bush18', 2), ...p('Rock_grass_element13 Rpck_grass5 Stone3_grass_shadow Stone4_grass_shadow Broken_tree1 Broken_tree2 Broken_tree4 Broken_tree5')], density: 0.9, from: 0.45 },
      // Big bushes, boulders, a small tree and ruins nearer the edges.
      { pieces: [...p('Bush1 Bush2 Bush3 Bush4 Bush5 Bush6 Bush14 Bush17', 2), ...p('Rpck_grass1 Rpck_grass2 Rpck_grass3 Rpck_grass4 Stone1_grass_shadow Stone2_grass_shadow Tree5 Ruin3_grass_shadow Ruin4_grass_shadow')], density: 0.35, from: 0.7 },
      // Great trees and the old ruins right on the border, partly off the field.
      { pieces: [...p('Tree1 Tree2 Tree3 Tree4', 4), ...p('Ruin1_grass_shadow Ruin2_grass_shadow')], density: 0.12, from: 0.92 },
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
      // Small details anywhere: reeds, little bushes, pebbles and mushrooms.
      { pieces: [...p('reeds1 reeds2 reeds3', 3), ...p('Bush6 Bush8 Bush10 Beige_stone_grass6 Beige_stone_grass9 Beige_stone_ground5 Beige_stone_ground7 Brown_stone_grass5 Light_stone_ground4 Red_mushroom3 Brown_mushroom')], density: 3, from: 0 },
      // Bushes, mushroom clumps, stones and stumps outside the middle.
      { pieces: [...p('Bush2 Bush3 Bush4 Bush5 Bush7 Bush9 Bush12 Bush13', 2), ...p('Red_mushroom1 Red_mushroom2 Brown_mushroom1 Brown_mushroom2', 2), ...p('Beige_stone_grass1 Beige_stone_grass5 Brown_stone_grass2 Brown_stone_grass4 Light_stone_grass4 Broken_tree4 Broken_tree5 Broken_tree6')], density: 0.9, from: 0.45 },
      // Big bushes, small trees, boulders and statues nearer the edges.
      { pieces: [...p('Bush1 Bush11 Tree4 Tree7 Tree8 Tree9 Tree10 Tree12 Tree14', 2), ...p('Light_stone_grass2 Light_stone_grass3 Brown_stone_grass1 Ruin_grass4 Ruin_grass5 Ruin_orange3 Ruin_orange4 Broken_tree2 Broken_tree3')], density: 0.35, from: 0.7 },
      // Great trees and overgrown ruins on the border, partly off the field.
      { pieces: [...p('Tree1 Tree2 Tree3 Tree5 Tree6 Tree11 Tree13', 4), ...p('Ruin_grass1 Ruin_grass2 Ruin_grass3 Ruin_orange1 Ruin_orange2 Broken_tree1')], density: 0.12, from: 0.92 },
    ],
  },
  // CraftPix's undead land: grey-green earth, cracks, pebbles and dead weeds, rows of headstones, open graves,
  // coffins and dead arms reaching out, and gnarled trees, ruins and the bones of great beasts at the edges.
  graveyard: {
    base: '#6f736a',
    specks: [
      ['#777665', 26],
      ['#666a5f', 22],
      ['#5d6157', 10],
    ],
    bands: [
      { pieces: [...p('det7 det8 det9 det10 det11 det12 det13 det14 det15 det16 det17 det18 det19 det20 det21 det22 det23 det24', 2), ...p('det26 det28'), ...p('det31 det33 det35 det37 det39 det41 det43 det47 det49 det51 det53 det55 det57 det59 det61 det62'), ...p('det107 det109 det112 det116'), ...p('Bones_1 Bones_2 Bones_3 Bones_5 Bones_15 Bones_16 Bones_17 Bones_18 Plant_4 Plant_5 mushroom2_1 undead_plant2')], density: 5, from: 0 },
      { pieces: [...p('Grave_1 Grave_2 Grave_3 Grave_4 Grave_5 Grave_6 Grave_7 Grave_8 Grave_9 Grave_10 Grave_11 Grave_12 Grave_13 Grave_14 Grave_15 Grave_16 Grave_17', 3), ...p('grave1 grave2 grave3 grave4 grave5 grave6', 3), ...p('Broken_tree_2 Broken_tree_3 Broken_tree_6 Rock_2 Rock_3 Rock_4 Bones_4 Bones_6 Bones_13 Dead_arm_1 Dead_arm_2 Dead_arm_3 Dead_arm_4 Plant_3 mushroom2_2 mushroom2_3 undead_plant1 undead_plant3 Thorn_plant_3 Thorn_plant_6')], density: 1.1, from: 0.4 },
      { pieces: [...p('excavated_grave1 excavated_grave2 excavated_grave3 excavated_grave4 excavated_grave5 excavated_grave6', 2), ...p('coffin1 coffin2 coffin3 Dead_tree_3 Tree_2 Tree_3 Ruin_3 Ruin_4 Rock_1 skull_pile bone_chest bone_pelvis Scull_door web_rock1 web_rock2 web_rock3 monster_tree2 monster_tree3 web_tree3 mushroom1_2 mushroom1_3 Thorn_plant_4 Thorn_plant_5 Broken_tree_4 Broken_tree_5 Plant_2')], density: 0.4, from: 0.7 },
      { pieces: [...p('Dead_tree_1 Dead_tree_2 Tree_1 monster_tree1 web_tree1 web_tree2', 3), ...p('Ruin_1 Ruin_2 Pile_sculls bone_monster1 bone_claws bone_monster_head Broken_tree_1 Thorn_plant_1 Thorn_plant_2 mushroom1_1 skull_chasm')], density: 0.13, from: 0.92 },
    ],
    vignette: 'rgba(20,24,30,0.45)',
  },
  // CraftPix's dungeon on a flagstone floor: cracks and scattered bones, ghost-flame candles, coffins and
  // sarcophagi, chained skeletons and rubble, and blue-fire torches and the flaming statue in the dark corners.
  crypt: {
    base: '#3f3d42',
    specks: [],
    slabs: { size: 22, colors: ['#3f3d42', '#3c3a3f', '#434046', '#3a383c', '#413e44'], grout: '#2b292d', light: '#47444a' },
    bands: [
      { pieces: [...p('det25 det26 det27 det28 det29 det30', 2), ...p('Bones_1 Bones_2 Bones_3 Bones_5 Bones_15 Bones_16 Bones_17 Bones_18 obj_42 obj_46 obj_47 obj_48 obj_49 obj_50 obj_51 obj_52 obj_53 obj_12 obj_13 obj_14 obj_17 obj_19', 2)], density: 1.6, from: 0 },
      { pieces: [...p('candle_1 candle_2 candle_3 candle_4 candle_5 candle_6 candle_7 candle_8 candle_9', 2), ...p('obj_10 obj_11 obj_15 obj_16 obj_18 obj_27 obj_28 obj_29 obj_30 obj_31 obj_32 obj_33 obj_34 obj_35 obj_36 obj_37 obj_38 obj_39 obj_40 obj_41 Bones_4 Bones_6 Bones_13 coffin_34 coffin_35 coffin_36 coffin_37')], density: 0.9, from: 0.4 },
      { pieces: [...p('coffin_1 coffin_2 coffin_3 coffin_4 coffin_5 coffin_6 coffin_7 coffin_8 coffin_9 coffin_10 coffin_11 coffin_12 coffin_13 coffin_14 coffin_15 coffin_16 coffin_17 coffin_18 coffin_19 coffin_20 coffin_21 coffin_22 coffin_23 coffin_24 coffin_25 coffin_26 coffin_27 coffin_28 coffin_29 coffin_30 coffin_31 coffin_32 coffin_33'), ...p('obj_1 obj_2 obj_3 obj_4 obj_5 obj_6 obj_7 obj_8 obj_9 obj_20 obj_21 obj_22 obj_23 obj_24 obj_25 obj_26 skull_pile bone_chest bone_pelvis web_rock2 web_rock3', 1.5), ...p('torch_2 torch_3 torch_4 torch_6', 2)], density: 0.5, from: 0.68 },
      { pieces: [...p('statue_fire torch_1 torch_11 torch_16 torch_21', 2), ...p('Pile_sculls skull_chasm bone_arm_sword bone_monster_head web_rock1 coffin_21 coffin_26 coffin_1')], density: 0.14, from: 0.9 },
    ],
    vignette: 'rgba(8,6,12,0.7)',
  },
  // CraftPix's cursed land, darkened almost to black and mixed with cave stone: eyes and pustules in the dark,
  // stalagmites, webs and pale glowing mushrooms, and claws, veins and things with teeth around the edges.
  depths: {
    base: '#1d1a20',
    specks: [
      ['#252029', 24],
      ['#15131a', 20],
      ['#2c2531', 8],
    ],
    bands: [
      { pieces: [...p('small_mushrooms_white1 small_mushrooms_white2 small_mushrooms_white3 small_mushrooms_gray1 small_mushrooms_gray2 small_mushrooms_gray3 small_mushrooms1 small_mushrooms2 small_mushrooms3', 2), ...p('c_Bones_7 c_Bones_8 c_Bones_9 c_Bones_10 c_Bones_11 c_Rock1_4 c_Rock1_5 c_Rock_eyes_4 c_Rock_eyes_5 c_Eyes_2 c_Tubular_plant_2 c_Tubular_plant_3 c_Fetus_3 c_Pustules_3 c_Webbed_1 c_Webbed_2 c_Mushrooms_3 Black_stone4 Blue_stone4 black_stalagmites5 gray_stalagmites5 Black_crystal4 Violet_crystal4')], density: 2.6, from: 0 },
      { pieces: [...p('c_Rock1_3 c_Rock3_4 c_Rock3_5 c_Rock3_6 c_Rock_eyes_2 c_Rock_eyes_3 c_Eye_plant_1 c_Eye_plant_2 c_Eye_plant_3 c_Many_eyes_plant_2 c_Many_eyes_plant_3 c_Tentacles_1 c_Tentacles_2 c_Tentacles_3 c_Bones_2 c_Bones_3 c_Bones_4 c_Bones_5 c_Bones_6 c_Tubular_plant_1 c_Spike_plant_4 c_Tentacle_plant_3 c_Pustules_2 c_Fetus_2 c_Meat_flower_3 c_Jaws_plant_3 c_Rune_stone_4'), ...p('Black_stone2 Black_stone3 Blue_stone2 Blue_stone3 Long_mushrooms2 Long_mushrooms3 gray_stalagmites2 gray_stalagmites4 black_stalagmites2 black_stalagmites3 Slime_musroom2 Slime_musroom3 Black_crystal3 Violet_crystal3 Blue_crystal3', 1.5)], density: 1, from: 0.4 },
      { pieces: [...p('c_Rock1_1 c_Rock1_2 c_Rock3_2 c_Rock3_3 c_Rock_eyes_1 c_Claw_eggs_2 c_Claw_eggs_3 c_Claw_eggs_4 c_Eggs_1 c_Eggs_2 c_Eggs_3 c_Tentacle_plant_1 c_Tentacle_plant_2 c_Spike_plant_2 c_Spike_plant_3 c_Neuro_monster_1 c_Neuro_monster_2 c_Tooth_mouth_3 c_Tooth_mouth_5 c_Ruins_3 c_Ruins_4 c_Ruins_5 c_Tentacles_4 c_Jaws_plant_2 c_Star_monster_3 c_Rune_stone_3 c_Meat_flower_2 c_Pustules_1'), ...p('gray_stalagmites3 gray_stalagmites1 Long_mushrooms1 Black_stone1 Blue_stone1 black_stalagmites1 Slime_musroom1 spider_element2 spider_element3 web1 web2 Black_crystal1 Black_crystal2 Violet_crystal1 Violet_crystal2', 1.5)], density: 0.4, from: 0.7 },
      { pieces: [...p('c_Claw_monster_1 c_Claw_monster_2 c_Claw_monster_3 c_Spike_plant_1 c_Veins_1 c_Veins_2 c_Veins_3 c_Veins_4 c_Tentacle_monster_1 c_Tentacle_monster_2 c_Rune_stone_1 c_Rune_stone_2 c_Tooth_monster_1 c_Tooth_monster_2 c_Wing_monster c_Bones_1 c_Rock3_1 c_Tooth_mouth_1 c_Jaws_plant_1'), ...p('the_spider spider_element1 gray_stalagmites3 web2')], density: 0.13, from: 0.9 },
    ],
    vignette: 'rgba(0,0,0,0.75)',
  },
  // CraftPix's cave with lava: brown rock floor and pebbles, pools of molten lava, orange, red and yellow stone,
  // fire crystals and smoking vents, rock walls and stalagmites, and the great demon skull and its gates at the edges.
  caves: {
    base: '#4a3934',
    specks: [
      ['#5a4640', 26],
      ['#3e302c', 22],
      ['#685243', 8],
    ],
    pools: { density: 0.06, from: 0.35, size: [40, 80], rim: '#140e11', crust: '#5c2316', fill: '#c9562a', inner: '#d98d37', details: run('lava', 1, 89).split(' ') },
    bands: [
      { pieces: [...p(run('spot', 1, 72), 1), ...p('Orange_stone4 Yellow_stone4 Black_stone4 Yellow_crystal4 black_stalagmites5 gray_stalagmites5', 0.6)], density: 3, from: 0 },
      { pieces: [...p(run('spot', 73, 107)), ...p('Orange_stone2 Orange_stone3 Red_stone2 Red_stone3 Yellow_stone2 Yellow_stone3 Black_stone2 Black_stone3 Red_crystal3 Yellow_crystal3 Dark_red_crystal3 Volcano3 Volcano4 Volcano5 gray_stalagmites4 black_stalagmites3 black_stalagmites4', 1.5)], density: 1.1, from: 0.4 },
      { pieces: [...p('Orange_stone1 Red_stone1 Yellow_stone1 Black_stone1 Red_crystal1 Red_crystal2 Yellow_crystal1 Yellow_crystal2 Dark_red_crystal1 Dark_red_crystal2 Volcano1 Volcano2 Water_rocks1 Water_rocks2 Water_rocks3 gray_stalagmites2 gray_stalagmites1 black_stalagmites1 black_stalagmites2', 1.5), ...p(run('Walls_elements', 1, 20))], density: 0.45, from: 0.7 },
      { pieces: [...p('Demon_head Demon_hand Demon_tail gates1 gates2 gray_stalagmites3'), ...p(run('Walls_elements', 1, 20), 0.5)], density: 0.13, from: 0.92 },
    ],
    vignette: 'rgba(30,8,0,0.5)',
  },
  // CraftPix's glowing cave, cave objects and desert worms, recoloured to toxic greens: glowing fungi and
  // crystals, curling roots and great worms, pools of bubbling acid, and totems and the bones of old beasts.
  mines: {
    base: '#33432f',
    specks: [
      ['#2a3826', 26],
      ['#3d5038', 20],
      ['#9ad43a', 1.2],
    ],
    pools: { density: 0.05, from: 0.35, size: [34, 70], rim: '#0f1a0c', crust: '#24451a', fill: '#4a8424', inner: '#5f9e26', details: run('gd', 35, 57).split(' ') },
    bands: [
      { pieces: [...p(run('gd', 58, 75), 2), ...p('gd76 gd77 gd78 gd79 gd80 gd81 gd12 gd13 gd18 gd22 gd25 gd27 gd28 gd30 gd31 gd32 gd33'), ...p('g_Crystal1_4 g_Crystal2_4 g_Crystal3_4 g_Crystal4_4 g_Mushroom1_4 g_Mushroom3_4 g_Mushroom5_4 g_Plant1_2 g_Plant1_3 g_Plant3_4 o_Blue_green_crystal4 o_crystal_blue_green_vertical4 o_Human_skeleton d_Roots6 d_Roots7')], density: 3, from: 0 },
      { pieces: [...p('g_Crystal1_3 g_Crystal2_3 g_Crystal3_3 g_Crystal4_3 g_Mushroom1_3 g_Mushroom2_3 g_Mushroom3_3 g_Mushroom4_3 g_Mushroom5_3 g_Mushroom6_3 g_Plant2_3 g_Plant3_3 g_Plant4_1 g_Plant5_3 g_shell_3 gd10 gd11 gd14 gd15 gd16 gd19 gd20 gd23 gd24 gd26 gd29 gd34', 1.5), ...p('o_Blue_green_crystal3 o_crystal_blue_green_vertical2 o_mushroom13 o_mushroom23 o_mushroom33 o_mushroom42 o_mushroom43 o_Beige_rpck3 o_Bonefire d_Roots5 d_The_beast5 d_The_beast7 d_Plant2')], density: 1.1, from: 0.4 },
      { pieces: [...p('g_Crystal1_1 g_Crystal1_2 g_Crystal2_1 g_Crystal2_2 g_Crystal3_1 g_Crystal3_2 g_Crystal4_1 g_Crystal4_2 g_Mushroom1_1 g_Mushroom1_2 g_Mushroom2_1 g_Mushroom2_2 g_Mushroom3_2 g_Mushroom4_1 g_Mushroom4_2 g_Mushroom5_1 g_Mushroom5_2 g_Mushroom6_2 g_Plant2_1 g_Plant3_1 g_Plant4_3 g_Plant5_2 g_Rock_crystal_1 g_shell_2 g_lizard_2 gd17 gd21', 1.5), ...p('o_Blue_green_crystal1 o_Blue_green_crystal2 o_crystal_blue_green_vertical1 o_crystal_blue_green_vertical3 o_mushroom11 o_mushroom12 o_mushroom21 o_mushroom22 o_mushroom31 o_mushroom32 o_mushroom41 o_caveman_statue1 o_caveman_statue2 o_Beige_rpck1 o_Beige_rpck2 o_white_crystal4 o_white_crystal5 o_Dinosaur_skeleton_part1 d_Arthropods2 d_Bones2 d_Bones3 d_Plant1 d_Roots3 d_Roots4 d_Roots8 d_The_beast4 d_The_beast6')], density: 0.45, from: 0.7 },
      { pieces: [...p('g_Mushroom3_1 g_Mushroom6_1 g_Plant5_1 g_Rock_crystal_2 g_shell_1 g_lizard_1 gd1 gd2 gd3 gd4 gd5 gd6 gd7 gd8 gd9', 1.5), ...p('o_centipede1 o_centipede2 o_cocoon_web o_white_crystal1 o_white_crystal2 o_white_crystal3 o_Dark_totem1 o_Demon_scull o_Dinosaur_skeleton_full o_Dinosaur_skeleton_part2 o_magic_circle o_Gates1 d_Arthropods1 d_Bones1 d_Roots1 d_Roots2 d_The_beast1 d_The_beast2 d_The_beast3')], density: 0.14, from: 0.9 },
    ],
    vignette: 'rgba(4,12,2,0.6)',
  },
  // CraftPix's winter and rocky tilesets: wind-packed snow with patches of bare rock, drifts and pebbles,
  // frosted stones, ice crystals and snowy pines, and frozen beasts, rune stones, ruins and peaks at the edges.
  peaks: {
    base: '#c5dadd',
    specks: [
      ['#d4e6e8', 30],
      ['#b9cfd3', 22],
      ['#e8f4f5', 10],
    ],
    pools: { density: 0.06, from: 0.3, size: [24, 56], rim: '#70665e', crust: '#8a7e71', fill: '#958978', inner: '#aa9e85', details: run('wd', 26, 41).split(' ') },
    bands: [
      { pieces: [...p(run('wd', 1, 41), 0.4), ...p('w_Ice_flowers2 w_Ice_flowers3 w_Crystal_square1 w_Crystal_square2 w_Stones4 w_Stones5 w_Crystal_flower3 w_Mushroom13 r_Rock13 r_Rock23 r_Rock33 r_Conifer_tree_small2_3 o_Mushrooms3')], density: 3, from: 0 },
      { pieces: [...p('w_Stones2 w_Stones3 w_Crystal_square3 w_Crystal_square4 w_Crystal_sharp2 w_Crystal_sharp3 w_Crystal_flower2 w_Ice_flowers1 w_Mushroom12 w_Mushroom22 w_Trees13 w_Trees23 w_Trees33 w_Ice_trees4 w_Ruins13 w_Ruins14 w_Ruins15 w_Ruins24', 1.5), ...p('r_Rock11 r_Rock12 r_Rock22 r_Rock24 r_Rock32 r_Rock34 r_Conifer_tree_small2_1 r_Conifer_tree_small2_2 r_Conifer_tree5_6 o_Ice_spikes2 o_Ice_spikes3 o_Mushrooms1 o_Mushrooms2 o_Crystals5 o_Rune_rocks3 o_Rune_rocks4 o_Mountains4 o_Mountains5 o_Helmet_rocks2 o_Bear_in_ice o_Boar_in_ice')], density: 1, from: 0.4 },
      { pieces: [...p('w_Stones1 w_Trees11 w_Trees12 w_Trees21 w_Trees22 w_Trees31 w_Trees32 w_Ice_trees2 w_Ice_trees3 w_Crystal_sharp1 w_Crystal_flower1 w_Mushroom11 w_Mushroom21 w_Ruins11 w_Ruins12 w_Ruins21 w_Ruins22 w_Ruins23 w_Idols1 w_Idols2', 1.5), ...p('r_Rock14 r_Rock15 r_Rock25 r_Rock35 r_Rock2 r_Conifer_tree1_2 r_Conifer_tree1_3 r_Conifer_tree3_2 r_Conifer_tree3_3 r_Ruins2 r_Ruins3 r_Ruins4 o_Ice_spikes1 o_Ice_trees2 o_Ice_trees3 o_Crystals3 o_Crystals4 o_Rune_rocks2 o_Rune_rocks5 o_Mountains3 o_Helmet_rocks1 o_Statue_rocks1 o_Statue_rocks2 o_Ruins3')], density: 0.4, from: 0.7 },
      { pieces: [...p('o_Mountains1 o_Mountains2 o_Mountains3', 3), ...p('w_Ice_trees1 o_Ice_trees1 o_Mammoth_in_ice o_Giant_in_ice o_Ice_palace o_Rune_rocks1 o_Crystals1 o_Crystals2 o_Ruins1 o_Ruins2 o_Ruins4 o_Octopus_head r_Conifer_tree1_1 r_Conifer_tree3_1 r_Ruins1')], density: 0.14, from: 0.9 },
    ],
    vignette: 'rgba(60,90,120,0.3)',
  },
  // CraftPix's flying islands: a staircase of grassy islands climbing out of the clouds from the bottom-left
  // to the top-right, the fight on the broad step in the middle, with crystals, trees and ruins on the steps
  // and clouds, drifting rocks and a far-off dragon in the open sky around them.
  cliffs: {
    base: '#7fb0d8',
    sky: ['#b7dcf2', '#6fa5d6'],
    specks: [],
    islands: {
      file: 'island',
      steps: [
        [0.95, 0.05, 0.16, 0.07],
        [0.84, 0.14, 0.2, 0.08],
        [0.7, 0.25, 0.24, 0.09],
        [0.5, 0.5, 0.7, 0.36],
        [0.26, 0.79, 0.26, 0.09],
        [0.12, 0.92, 0.22, 0.08],
        [0.02, 1.04, 0.2, 0.08],
      ],
    },
    bands: [
      { pieces: [...p('Cloud_color1_1 Cloud_color1_2 Cloud_color1_3 Cloud_color1_4 Cloud_color2_1 Cloud_color2_2 Cloud_color2_3 Cloud_color2_4 Cloud_color3_1 Cloud_color3_2 Cloud_color3_3 Cloud_color3_4', 2), ...p(run('fr', 7, 62), 0.3), ...p('fr1 fr2 fr3 fr4 fr5 fr6')], density: 0.6, from: 0, under: true },
      { pieces: [...p(run('id', 1, 52), 1)], density: 22, from: 0, onIslands: true },
      { pieces: [...p('Bush1_1 Bush1_2 Bush1_3 Bush2_1 Bush2_2 Bush2_3 Plant1_2 Plant1_3 Plant2_1 Plant2_2 Plant2_3 Plant3_2 Plant3_3 Crystael3 Crystael4 Crystael7 Crystael8 Crystael9 Small_rock1 Small_rock2 Small_rock3 Rock3 Rock4 Ruins5')], density: 4, from: 0.35, onIslands: true },
      { pieces: [...p('Tree1_1 Tree1_2 Tree1_3 Tree2_1 Tree2_2 Tree2_3 Trees3_1 Trees3_2 Trees3_3 Trees3_4 Plant1_1 Plant3_1 Crystael1 Crystael2 Crystael5 Crystael6 Rock1 Rock2 Ruins1 Ruins2 Ruins3 Ruins4')], density: 1.2, from: 0.55, onIslands: true },
      { pieces: [...p('Cloud_color2_2 Cloud_color2_3 Cloud_color3_1 Cloud_color3_2 Cloud_color3_3', 3), ...p('Dragon_small')], density: 0.06, from: 0.92 },
    ],
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
  const files = [...new Set([...scene.bands.flatMap((b) => b.pieces.map((x) => x.file)), ...(scene.pools?.details ?? []), ...(scene.islands ? [scene.islands.file] : [])])];
  void Promise.all(
    files.map((f) => {
      const img = new Image();
      img.src = `${import.meta.env.BASE_URL}backgrounds/${area}/${f}.png`;
      images.set(`${area}/${f}`, img);
      return img.decode().catch(() => undefined);
    }),
  ).then(() => ready.add(area));
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

/** How far out a point is: 0 at the centre, 1 at the nearest edge. */
const outness = (x: number, y: number, w: number, h: number): number => Math.max(Math.abs(x - w / 2) / (w / 2), Math.abs(y - h / 2) / (h / 2));

/** Pixel blobs (a few overlapping ellipses each), drawn as rim, fill and an inner shade, with details inside. */
function drawPools(g: CanvasRenderingContext2D, pools: NonNullable<Scene['pools']>, area: AreaId, w: number, h: number, r: () => number): void {
  const want = Math.round((pools.density * w * h) / 10_000);
  for (let i = 0, tries = 0; i < want && tries < want * 30; tries++) {
    const cx = r() * w;
    const cy = r() * h;
    if (outness(cx, cy, w, h) < pools.from) continue;
    i++;
    const size = pools.size[0] + r() * (pools.size[1] - pools.size[0]);
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
    for (const [color, grow] of layers) {
      g.fillStyle = color;
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
export function areaBackground(area: AreaId, w: number, h: number): HTMLCanvasElement | null {
  const scene = SCENES[area];
  if (!scene) return null;
  load(area, scene);
  if (!ready.has(area)) return null;
  const key = `${area}:${w}x${h}`;
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
  const r = rng(w * 7919 + h * 104729);
  const area10k = (w * h) / 10_000;
  if (scene.slabs) {
    // Staggered rows of stone slabs, each a little different, with a lit top edge and dark grout.
    const { size, colors, grout, light } = scene.slabs;
    for (let row = 0, y = 0; y < h; row++, y += size) {
      const off = row % 2 ? Math.floor(size / 2) : 0;
      for (let x = -off; x < w; x += size) {
        g.fillStyle = colors[Math.floor(r() * colors.length)];
        g.fillRect(x, y, size, size);
        g.fillStyle = light;
        g.fillRect(x + 1, y + 1, size - 2, 1);
        g.fillStyle = grout;
        g.fillRect(x, y, 1, size);
        g.fillRect(x, y + size - 1, size, 1);
      }
    }
  }
  for (const [color, per] of scene.specks) {
    g.fillStyle = color;
    for (let i = 0; i < per * area10k; i++) g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 2), 1 + Math.floor(r() * 2));
  }

  // Place every band's pieces, then draw them top to bottom so nearer ones overlap farther ones.
  const tops: Array<[number, number, number, number]> = [];
  const scatter = (bands: Band[]): void => {
    const placed: Array<{ img: HTMLImageElement; x: number; y: number }> = [];
    for (const band of bands) {
      const total = band.pieces.reduce((s, x) => s + x.weight, 0);
      const want = Math.round(band.density * (band.onIslands ? tops.reduce((s, t) => s + t[2] * t[3], 0) / 10_000 : area10k));
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
        if (outness(x, y, w, h) < band.from) continue;
        let pick = r() * total;
        const piece = band.pieces.find((x) => (pick -= x.weight) <= 0) ?? band.pieces[0];
        const img = images.get(`${area}/${piece.file}`);
        if (!img || !img.naturalWidth) continue;
        // Island decor stands on its spot; everything else is centred on it.
        placed.push({ img, x: Math.round(x - img.naturalWidth / 2), y: Math.round(band.onIslands ? y - img.naturalHeight : y - img.naturalHeight / 2) });
        i++;
      }
    }
    placed.sort((a, b) => a.y + a.img.naturalHeight - (b.y + b.img.naturalHeight));
    for (const it of placed) g.drawImage(it.img, it.x, it.y);
  };
  scatter(scene.bands.filter((b) => b.under));
  if (scene.islands) {
    const img = images.get(`${area}/${scene.islands.file}`);
    if (img && img.naturalWidth) for (const step of scene.islands.steps) tops.push(drawIsland(g, img, step, w, h));
  }
  if (scene.pools) drawPools(g, scene.pools, area, w, h, r);
  scatter(scene.bands.filter((b) => !b.under));
  if (scene.vignette) {
    const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) / 2);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, scene.vignette);
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  }
  cache.set(key, c);
  return c;
}
