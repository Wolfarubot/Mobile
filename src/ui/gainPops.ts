import { RARE_MATERIALS, type MaterialId } from '../core/balance';

/** How long a pop-up row stays up after its material was last picked up, and how many rows show at once. */
export const GAIN_POP_MS = 2000;
export const GAIN_POP_ROWS = 4;

interface Row {
  m: MaterialId;
  n: number;
  el: HTMLElement;
  count: HTMLElement;
  timer: number;
}

/**
 * The battlefield's pick-up pop-ups (bottom left): a row per material, its icon and how many came in. More of
 * the same material while its row is up adds to the count and keeps it up another 2s. At most four rows; the
 * ores and gems push out the common drops' rows, and a common drop doesn't push out an ore's or gem's.
 */
export class GainPops {
  private rows: Row[] = [];

  constructor(
    readonly el: HTMLElement,
    private icon: (m: MaterialId) => string,
    private fmt: (n: number) => string,
  ) {}

  add(m: MaterialId, n: number): void {
    if (n <= 0) return;
    const row = this.rows.find((r) => r.m === m);
    if (row) {
      row.n += n;
      row.count.textContent = `+${this.fmt(row.n)}`;
      this.bump(row);
      this.arm(row);
      return;
    }
    if (this.rows.length >= GAIN_POP_ROWS) {
      const rare = RARE_MATERIALS.has(m);
      const out = this.rows.find((r) => !RARE_MATERIALS.has(r.m)) ?? (rare ? this.rows[0] : undefined);
      if (!out) return; // all ores and gems: a common drop waits its turn
      this.remove(out);
    }
    const el = document.createElement('div');
    el.className = `gain-pop${RARE_MATERIALS.has(m) ? ' rare' : ''}`;
    el.innerHTML = `${this.icon(m)}<b>+${this.fmt(n)}</b>`;
    const r: Row = { m, n, el, count: el.querySelector('b')!, timer: 0 };
    this.rows.push(r);
    this.el.append(el);
    this.arm(r);
  }

  /** Drops every row at once (e.g. on travelling to another area). */
  clear(): void {
    for (const r of [...this.rows]) this.remove(r);
  }

  private arm(r: Row): void {
    clearTimeout(r.timer);
    r.timer = window.setTimeout(() => this.remove(r), GAIN_POP_MS);
  }

  /** Restarts the count's little pulse. */
  private bump(r: Row): void {
    r.count.classList.remove('bump');
    void r.count.offsetWidth;
    r.count.classList.add('bump');
  }

  private remove(r: Row): void {
    clearTimeout(r.timer);
    r.el.remove();
    this.rows = this.rows.filter((x) => x !== r);
  }
}
