import type { AreaId } from '../core/balance';
import type { Game, Shooter } from '../core/game';
import { mergeSample, sameGroup, SAMPLE_RUN, SAMPLE_SETTLED, type SampleRun } from '../core/sampler';
import { serialize } from '../core/state';

/** How often (ms) to look for a group whose sample needs another run. */
const CHECK_MS = 3000;

/**
 * Keeps every farming group's background battlefield sample (core/sampler.ts) up to date: yours in your area,
 * and each stationed group in theirs. One run at a time, in a worker; a group's sample settles after a few
 * minutes of measured battle and is only measured again when the group, its strength or the area's monsters change.
 */
export class SamplerHost {
  private worker: Worker | null = null;
  private busy: { area: AreaId; group: Shooter[]; sig: string } | null = null;

  constructor(
    private game: Game,
    private view: () => { w: number; h: number },
  ) {
    try {
      this.worker = new Worker(new URL('./sampler.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      return; // no workers here: the estimates stand in
    }
    this.worker.onmessage = (e: MessageEvent<SampleRun>) => this.done(e.data);
    this.worker.onerror = () => {
      this.busy = null;
    };
    setInterval(() => this.next(), CHECK_MS);
  }

  /** Who's farming where: you (with anyone stationed with you) here, and each stationed group elsewhere. */
  private groups(): Array<{ area: AreaId; group: Shooter[] }> {
    const g = this.game;
    const out: Array<{ area: AreaId; group: Shooter[] }> = [{ area: g.area, group: ['main', ...g.helpersHere] }];
    for (const area of g.unlockedAreas) {
      const group = g.stationedIn(area);
      if (area !== g.area && group.length) out.push({ area, group });
    }
    return out;
  }

  private next(): void {
    if (!this.worker || this.busy || document.hidden) return;
    const g = this.game;
    for (const { area, group } of this.groups()) {
      const sig = g.sampleSig(area, group);
      const smp = g.state.samples[area];
      if (smp && smp.sig === sig && sameGroup(smp.group, group) && smp.seconds >= SAMPLE_SETTLED) continue;
      this.busy = { area, group, sig };
      this.worker.postMessage({ save: serialize(g.state), area, group, seconds: SAMPLE_RUN, view: this.view() });
      return;
    }
  }

  private done(run: SampleRun): void {
    const b = this.busy;
    this.busy = null;
    if (!b) return;
    const s = this.game.state;
    s.samples[b.area] = mergeSample(s.samples[b.area], b.group, b.sig, run);
  }
}
