import { describe, expect, it } from "vitest";
import { formatExactUtc, formatRelative, formatDayUtc } from "@/lib/format/date";

const NOW = new Date("2026-08-15T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const ahead = (ms: number) => new Date(NOW.getTime() + ms);

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatRelative — the past", () => {
  it("calls the last minute 'just now'", () => {
    expect(formatRelative(ago(5 * SECOND), NOW)).toBe("just now");
    expect(formatRelative(ago(59 * SECOND), NOW)).toBe("just now");
  });

  it("counts minutes, singular and plural", () => {
    expect(formatRelative(ago(MINUTE), NOW)).toBe("1 minute ago");
    expect(formatRelative(ago(42 * MINUTE), NOW)).toBe("42 minutes ago");
  });

  it("counts hours", () => {
    expect(formatRelative(ago(HOUR), NOW)).toBe("1 hour ago");
    expect(formatRelative(ago(5 * HOUR), NOW)).toBe("5 hours ago");
  });

  it("counts days", () => {
    expect(formatRelative(ago(DAY), NOW)).toBe("1 day ago");
    expect(formatRelative(ago(6 * DAY), NOW)).toBe("6 days ago");
  });

  it("counts weeks, then months, then years", () => {
    expect(formatRelative(ago(8 * DAY), NOW)).toBe("1 week ago");
    expect(formatRelative(ago(40 * DAY), NOW)).toBe("1 month ago");
    expect(formatRelative(ago(400 * DAY), NOW)).toBe("1 year ago");
  });
});

describe("formatRelative — the future", () => {
  it("reads forwards rather than as a negative past", () => {
    // Expiry dates are routinely in the future; "in 3 days" is the only
    // sensible reading of one.
    expect(formatRelative(ahead(3 * DAY), NOW)).toBe("in 3 days");
    expect(formatRelative(ahead(2 * HOUR), NOW)).toBe("in 2 hours");
  });

  it("treats the next minute as 'in a moment'", () => {
    expect(formatRelative(ahead(20 * SECOND), NOW)).toBe("in a moment");
  });
});

describe("formatRelative — edges", () => {
  it("says nothing for a missing date", () => {
    expect(formatRelative(null, NOW)).toBe("—");
  });

  it("crosses each boundary exactly once", () => {
    expect(formatRelative(ago(60 * SECOND), NOW)).toBe("1 minute ago");
    expect(formatRelative(ago(60 * MINUTE), NOW)).toBe("1 hour ago");
    expect(formatRelative(ago(24 * HOUR), NOW)).toBe("1 day ago");
  });
});

describe("formatExactUtc", () => {
  it("renders an unambiguous timestamp with its zone", () => {
    // This is the tooltip behind every relative label, so it must state the
    // zone — a bare time is the thing relative labels exist to avoid.
    expect(formatExactUtc(new Date("2026-08-15T09:30:00.000Z"))).toBe(
      "Aug 15, 2026 at 09:30 UTC",
    );
  });

  it("uses a 24-hour clock so 12:00 is never ambiguous", () => {
    expect(formatExactUtc(new Date("2026-08-15T00:05:00.000Z"))).toBe(
      "Aug 15, 2026 at 00:05 UTC",
    );
    expect(formatExactUtc(new Date("2026-08-15T13:45:00.000Z"))).toBe(
      "Aug 15, 2026 at 13:45 UTC",
    );
  });

  it("says nothing for a missing date", () => {
    expect(formatExactUtc(null)).toBe("—");
  });
});

describe("formatDayUtc", () => {
  it("renders a calendar day in UTC", () => {
    expect(formatDayUtc(new Date("2026-08-15T23:59:59.999Z"))).toBe("Aug 15, 2026");
  });

  it("does not shift the day for a late-evening UTC timestamp", () => {
    // Formatting in the viewer's timezone would show the 16th to anyone east
    // of UTC, disagreeing with the expiry the developer actually chose.
    expect(formatDayUtc(new Date("2026-12-31T23:00:00.000Z"))).toBe("Dec 31, 2026");
  });

  it("says nothing for a missing date", () => {
    expect(formatDayUtc(null)).toBe("—");
  });
});
