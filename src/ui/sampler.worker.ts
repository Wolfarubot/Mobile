/// <reference lib="webworker" />
import { runSample, type SampleJob } from '../core/sampler';

// Runs background battlefield samples off the main thread, so the game never stutters for them.
self.onmessage = (e: MessageEvent<SampleJob>) => {
  self.postMessage(runSample(e.data));
};
