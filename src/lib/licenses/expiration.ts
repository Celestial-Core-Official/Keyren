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

      // Alpha_v1 counts duration from creation, not from first activation.
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
