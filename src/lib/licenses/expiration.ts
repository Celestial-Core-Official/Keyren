/**
 * Three developer-facing expiration modes collapse to one internal
 * representation: `expiresAt: Date | null`, always UTC.
 *
 * Keeping exactly one stored shape means the verification path has a single
 * comparison to make, with no mode-specific branching in the hot path.
 */

export const DURATION_OPTIONS = [
  { value: "1d", label: "1 day", days: 1 },
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "90d", label: "90 days", days: 90 },
  { value: "180d", label: "180 days", days: 180 },
  { value: "365d", label: "1 year", days: 365 },
] as const;

export type DurationValue = (typeof DURATION_OPTIONS)[number]["value"];

export type ExpirationInput =
  | { mode: "permanent" }
  | { mode: "date"; expiresAt: Date }
  | { mode: "duration"; duration: DurationValue };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function resolveExpiresAt(input: ExpirationInput, now: Date = new Date()): Date | null {
  switch (input.mode) {
    case "permanent":
      return null;

    case "date": {
      if (input.expiresAt.getTime() <= now.getTime()) {
        throw new Error("Expiration date must be in the future.");
      }
      return input.expiresAt;
    }

    case "duration": {
      const option = DURATION_OPTIONS.find((candidate) => candidate.value === input.duration);
      if (!option) throw new Error(`Unknown duration: ${String(input.duration)}`);

      // Duration counts from creation, not from first activation.
      // Activation-anchored expiry needs a separate stored field and is
      // deliberately out of scope.
      return new Date(now.getTime() + option.days * MS_PER_DAY);
    }
  }
}

/** A license is expired at its deadline instant, not one millisecond after. */
export function isExpired(expiresAt: Date | null, now: Date = new Date()): boolean {
  if (expiresAt === null) return false;
  return expiresAt.getTime() <= now.getTime();
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Turns a date picker's `YYYY-MM-DD` into the last instant of that day in UTC.
 *
 * A developer choosing 31 August means the license works for all of the 31st.
 * Alpha_v1 coerced the same string to midnight, which cut the customer off a
 * full day earlier than the developer had chosen — and quietly, because
 * nothing in the UI said which end of the day it meant.
 *
 * Parsed field by field rather than handed to `new Date(...)`: the Date
 * constructor's local-time path turns "2026-08-31" into the 30th for anyone
 * west of UTC, so the same choice would mean different things depending on
 * where the developer happened to be sitting.
 */
export function endOfUtcDay(dateOnly: string): Date {
  const match = DATE_ONLY.exec(dateOnly);
  if (!match) throw new Error("Expiration date must be a calendar date.");

  const [, year, month, day] = match;
  const parsed = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999),
  );

  // Date.UTC rolls 2026-02-30 forward into March rather than failing, so the
  // result is checked against the input it was built from.
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw new Error("Expiration date must be a real calendar date.");
  }

  return parsed;
}

/** Today in UTC, in the format a `<input type="date">` expects for `min`. */
export function todayInUtc(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

/**
 * The sentence shown under the date picker before submitting.
 *
 * Stating the timezone and the time of day removes the only genuinely
 * ambiguous thing about picking a date: whether the customer keeps the day
 * they chose, and whose midnight it is.
 */
export function formatExpiryPreview(dateOnly: string): string | null {
  let resolved: Date;
  try {
    resolved = endOfUtcDay(dateOnly);
  } catch {
    return null;
  }

  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(resolved);

  return `Expires ${formatted} at 23:59 UTC`;
}
