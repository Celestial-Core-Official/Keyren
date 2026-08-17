/**
 * One place that decides how Keyren writes a date.
 *
 * Alpha_v1 had three: `toISOString().slice(0, 10)` in the licenses table, the
 * same expression again in the applications table, and a third variant in the
 * activation column. They agreed by coincidence rather than by construction.
 *
 * Two forms are used throughout: a compact relative label for scanning
 * ("3d ago"),
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

/**
 * The compact unit, or null when the value is outside the relative window.
 *
 * Alpha_v3 shortened these from "3 days ago" to "3d ago". A licence table is a
 * dense column of timestamps, and at that density the unit word is the part
 * carrying the least information per pixel — every reference console writes
 * `2m`, `5h`, `3d`.
 */
function magnitude(elapsed: number): string | null {
  if (elapsed < MINUTE) return null;
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d`;
  // Beyond a week a relative label stops being useful — "7 weeks ago" is
  // arithmetic the reader has to undo. Past that boundary the caller falls
  // back to the calendar date.
  return null;
}

/**
 * "3d ago" or "in 3d", falling back to a calendar date beyond a week.
 *
 * Future values read forwards rather than as a negative past, because expiry
 * dates are routinely ahead of now and "-3 days ago" is not English.
 */
export function formatRelative(value: Date | null, now: Date = new Date()): string {
  if (!value) return ABSENT;

  const difference = now.getTime() - value.getTime();
  const elapsed = Math.abs(difference);

  if (elapsed < MINUTE) return difference >= 0 ? "just now" : "in a moment";

  const size = magnitude(elapsed);
  // Outside the week-long relative window, the calendar date is the more
  // useful answer and does not go stale on the next render.
  if (size === null) return formatDayUtc(value);

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

/**
 * The same instant in whatever timezone the reader is sitting in.
 *
 * Strictly secondary. UTC stays the primary reading everywhere, because the
 * verification API answers in UTC and an expiry of Dec 31 must not read as
 * Jan 1 to a developer in Sydney — a full UTC/local toggle would reintroduce
 * exactly that confusion. This only ever appears *alongside* the UTC value,
 * for a developer working out what a deadline means to them.
 *
 * No locale and no timezone are pinned, which is the whole point: both come
 * from the runtime. That makes the output non-deterministic by construction,
 * so it must never be rendered on the server — every caller reaches it through
 * the display preference, whose server snapshot is off.
 *
 * The zone name is included because a bare local time with nothing to
 * distinguish it from the UTC line above would be the worst of both.
 */
const localFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZoneName: "short",
});

export function formatExactLocal(value: Date | null): string {
  if (!value) return ABSENT;
  return localFormatter.format(value);
}
