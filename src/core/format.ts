const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Formats large numbers compactly: 1234 -> "1.23K", 5.6e15 -> "5.60Qa". */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) return n < 10 && n % 1 !== 0 ? n.toFixed(1) : Math.floor(n).toString();

  let tier = Math.floor(Math.log10(n) / 3);
  let scaled = n / 10 ** (tier * 3);
  // Rounding can push 999.99K up to "1000K"; roll over to the next tier.
  if (Number(scaled.toFixed(2)) >= 1000) {
    tier += 1;
    scaled /= 1000;
  }
  if (tier >= SUFFIXES.length) return n.toExponential(2).replace('+', '');
  const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  return scaled.toFixed(digits) + SUFFIXES[tier];
}

/**
 * The DPS meter's number: three digits, abbreviated (1.52M, 15.2B, 152T), so it stays the same
 * width as damage climbs.
 */
export function fmtDps(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 1000) return n < 100 ? n.toFixed(n < 10 ? 2 : 1) : Math.floor(n).toString();
  let tier = Math.floor(Math.log10(n) / 3);
  let scaled = n / 10 ** (tier * 3);
  const digits = (v: number) => 3 - (v < 10 ? 1 : v < 100 ? 2 : 3);
  if (Number(scaled.toFixed(digits(scaled))) >= 1000) {
    tier += 1;
    scaled /= 1000;
  }
  if (tier >= SUFFIXES.length) return n.toExponential(2).replace('+', '');
  return scaled.toFixed(digits(scaled)) + SUFFIXES[tier];
}

/** Formats a duration in seconds as e.g. "2h 05m", "4m 09s" or "12s". */
export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}
