/**
 * One place that decides how Keyren writes a date.
 *
 * Alpha_v1 had three: `toISOString().slice(0, 10)` in the licenses table, the
 * same expression again in the products table, and a third variant in the
 * activation column. They agreed by coincidence rather than by construction.
 *
 * Two forms are used throughout: a relative label for scanning ("3 days ago"),
 * and an exact UTC timestamp behind it for when the answer actually matters.
 * Everything is formatted in UTC, never the viewer's timezone — a license
 * expiring "Dec 31" must not read as Jan 1 to a developer in Sydney, because
 * the API's answer will not have moved.
 */

const ABSENT = "—";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

function magnitude(elapsed: number): string | null {
  if (elapsed < MINUTE) return null;
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), "hour");
  if (elapsed < WEEK) return plural(Math.floor(elapsed / DAY), "day");
  if (elapsed < MONTH) return plural(Math.floor(elapsed / WEEK), "week");
  if (elapsed < YEAR) return plural(Math.floor(elapsed / MONTH), "month");
  return plural(Math.floor(elapsed / YEAR), "year");
}

/**
 * "3 days ago" or "in 3 days".
 *
 * Future values read forwards rather than as a negative past, because expiry
 * dates are routinely ahead of now and "-3 days ago" is not English.
 */
export function formatRelative(value: Date | null, now: Date = new Date()): string {
  if (!value) return ABSENT;

  const difference = now.getTime() - value.getTime();
  const size = magnitude(Math.abs(difference));

  if (size === null) return difference >= 0 ? "just now" : "in a moment";
  return difference >= 0 ? `${size} ago` : `in ${size}`;
}

const exactFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** The precise form, shown in a tooltip behind every relative label. */
export function formatExactUtc(value: Date | null): string {
  if (!value) return ABSENT;

  // Intl joins date and time with a comma; the explicit "at" reads better and
  // leaves room to append the zone, which a bare timestamp must always carry.
  const [date, time] = exactFormatter.format(value).split(", ").slice(-2);
  return `${dayFormatter.format(value)} at ${time ?? date} UTC`;
}

/** A calendar day with no time, for expiry columns. */
export function formatDayUtc(value: Date | null): string {
  if (!value) return ABSENT;
  return dayFormatter.format(value);
}
