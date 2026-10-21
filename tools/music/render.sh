#!/usr/bin/env bash
# Renders the MIDI pack (tools/music/midi) to seamless looping MP3s in tools/music/out, one per track ("01.mp3"...).
# Needs fluidsynth, the FluidR3 GM soundfont (apt: fluidsynth fluid-soundfont-gm), ffmpeg, python3 with numpy,
# and the @tonejs/midi dev dependency. Copy the tracks the game uses into public/music under their names, and
# put each one's loop length (printed, and in out/loops.json) into TRACKS in src/ui/music.ts.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/out"
SF2="${SF2:-/usr/share/sounds/sf2/FluidR3_GM.sf2}"
node "$here/pad.cjs" "$here/midi" "$out"
cd "$out"
for m in [0-9][0-9].mid; do
  id="${m%.mid}"
  loop=$(node -e "console.log(require('./loops.json')['$id'].loop)")
  fluidsynth -ni -q -g 0.5 -r 44100 -F "raw$id.wav" "$SF2" "$m" 2>/dev/null
  python3 "$here/fold.py" "raw$id.wav" "$loop" "loop$id.wav"
  ffmpeg -loglevel error -y -i "loop$id.wav" -c:a libmp3lame -b:a 96k "$id.mp3"
  rm "raw$id.wav" "loop$id.wav"
done
