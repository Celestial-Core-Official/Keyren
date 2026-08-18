/**
 * Head-and-tail truncation, for values where both ends carry information —
 * licence keys, application IDs, device fingerprints, paths.
 *
 * End-truncation is wrong for all of them. A masked key's head is shared by
 * every key in the table (`KEYREN-`), so the tail is the only part that
 * distinguishes one row from another; cutting the tail off leaves a column of
 * values that all look identical.
 *
 * The joiner is the single character "…" rather than three periods, so a
 * monospace column does not lose three character cells to one piece of
 * information.
 *
 * This is presentation only. The full value is always what gets copied.
 */
export function middleTruncate(value: string, max: number): string {
  if (max <= 1) return "…";
  if (value.length <= max) return value;

  const budget = max - 1;
  // The head identifies the resource and the tail only distinguishes it, so an
  // odd character left over is spent on identification.
  const head = Math.ceil(budget / 2);
  const tail = budget - head;

  return `${value.slice(0, head)}…${tail > 0 ? value.slice(-tail) : ""}`;
}
