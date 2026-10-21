// Copies each MIDI with a silent controller event 4s past its loop end (so FluidSynth renders the reverb tail)
// and writes loops.json: each track's loop length in seconds, from its last note to the nearest half beat.
const { Midi } = require('@tonejs/midi');
const fs = require('fs');
const [dir, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const loops = {};
for (const f of fs.readdirSync(dir).sort()) {
  const m = new Midi(fs.readFileSync(`${dir}/${f}`));
  const ppq = m.header.ppq;
  const lastOff = Math.max(...m.tracks.flatMap((t) => t.notes.map((n) => n.ticks + n.durationTicks)));
  const loopTicks = (Math.round((lastOff / ppq) * 2) / 2) * ppq;
  const L = m.header.ticksToSeconds(loopTicks);
  const id = f.slice(0, 2);
  loops[id] = { file: f, loop: L };
  const t = m.addTrack();
  t.channel = 15;
  t.addCC({ number: 110, value: 0, time: L + 4 });
  fs.writeFileSync(`${outDir}/${id}.mid`, Buffer.from(m.toArray()));
}
fs.writeFileSync(`${outDir}/loops.json`, JSON.stringify(loops, null, 1));
