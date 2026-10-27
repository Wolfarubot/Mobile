import { RARE_MATERIALS, type MaterialId } from '../core/balance';

/** How long a pop-up row stays up after its material was last picked up, and how many rows show at once. */
export const GAIN_POP_MS = 2000;
export const GAIN_POP_ROWS = 4;

interface Row {
  /** A material, or 'loot' for the gear row. */
  m: MaterialId | 'loot';
  n: number;
  el: HTMLElement;
  count: HTMLElement;
  timer: number;
}

/**
 * The battlefield's pick-up pop-ups (bottom left): a row per material, its icon and how many came in. More of
 * the same material while its row is up adds to the count and keeps it up another 2s. At most four rows; the
 * ores and gems push out the common drops' rows, and a common drop doesn't push out an ore's or gem's. Loot that
 * comes quickly gets a row too (addLoot).
 */
export class GainPops {
  private rows: Row[] = [];

  constructor(
    readonly el: HTMLElement,
    private icon: (m: MaterialId) => string,
    private fmt: (n: number) => string,
  ) {}

  add(m: MaterialId, n: number): void {
    if (n > 0) this.row(m, n, this.icon(m), RARE_MATERIALS.has(m));
  }

  /**
   * A piece of loot, when they come too quickly for a pop-up each: one row, the inventory's icon then the newest
   * piece's, counting the pieces. It ranks with the ores and gems.
   */
  addLoot(icon: string): void {
    const row = this.row('loot', 1, '', true);
    if (row) row.el.querySelector('.gp-icons')!.innerHTML = icon;
  }

  private row(m: Row['m'], n: number, icon: string, rare: boolean): Row | null {
    const isRare = (r: Row) => r.m === 'loot' || RARE_MATERIALS.has(r.m);
    const row = this.rows.find((r) => r.m === m);
    if (row) {
      row.n += n;
      row.count.textContent = `+${this.fmt(row.n)}`;
      this.bump(row);
      this.arm(row);
      return row;
    }
    if (this.rows.length >= GAIN_POP_ROWS) {
      const out = this.rows.find((r) => !isRare(r)) ?? (rare ? this.rows[0] : undefined);
      if (!out) return null; // all ores, gems and loot: a common drop waits its turn
      this.remove(out);
    }
    const el = document.createElement('div');
    el.className = `gain-pop${rare ? ' rare' : ''}`;
    el.innerHTML = `<span class="gp-icons">${icon}</span><b>+${this.fmt(n)}</b>`;
    const r: Row = { m, n, el, count: el.querySelector('b')!, timer: 0 };
    this.rows.push(r);
    this.el.append(el);
    this.arm(r);
    return r;
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
