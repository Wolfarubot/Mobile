# Time Eater rig

`source.png` is the Time Eater sheet its author drew. `rig.py` cuts it into parts (head, torso, arms, hands, legs,
staff), adds the Void Rift's wings, and poses them at the joints. `anims.py` keys the walk, thrust and swing;
`export.py` writes the game's five sheets.

    cd tools/time-eater
    python3 export.py ../../public/monsters

Then copy the printed `box` into `'time-eater'` in `src/render/monsterSheets.ts` if it changed.
