/// <reference lib="webworker" />
import { sampleSteps, type SampleJob } from '../core/sampler';

/**
 * Runs background battlefield samples off the main thread, a slice at a time with a rest after each: `pace` is the
 * rest per millisecond of work, which the host raises while the game's frame rate is suffering (on a phone with few
 * cores the worker and the game share them) and lowers again once it's smooth. The result is the same either way;
 * only how soon it's ready changes.
 */
let pace = 0.25;
/** Work done before a rest (ms): short, so the worker never holds a core for long; shorter still while resting more. */
const sliceMs = () => (pace > 1 ? 3 : 8);

self.onmessage = async (e: MessageEvent<SampleJob | { pace: number }>) => {
  if ('pace' in e.data) {
    pace = e.data.pace;
    return;
  }
  const run = sampleSteps(e.data);
  for (;;) {
    const t0 = performance.now();
    let r = run.next();
    while (!r.done && performance.now() - t0 < sliceMs()) r = run.next();
    if (r.done) {
      self.postMessage(r.value);
      return;
    }
    await new Promise((ok) => setTimeout(ok, Math.max(1, (performance.now() - t0) * pace)));
  }
};
