import { describe, expect, it } from "vitest";
import {
  DURATION_OPTIONS,
  isExpired,
  resolveExpiresAt,
  type ExpirationInput,
} from "@/lib/licenses/expiration";

const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("resolveExpiresAt", () => {
  it("normalizes permanent to null", () => {
    expect(resolveExpiresAt({ mode: "permanent" }, NOW)).toBeNull();
  });

  it("stores a fixed date as given", () => {
    const target = new Date("2027-06-15T12:30:00.000Z");
    expect(resolveExpiresAt({ mode: "date", expiresAt: target }, NOW)).toEqual(target);
  });

  it("converts a duration into an absolute timestamp from creation time", () => {
    const result = resolveExpiresAt({ mode: "duration", duration: "30d" }, NOW);
    expect(result?.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("supports every advertised duration option", () => {
    for (const option of DURATION_OPTIONS) {
      const result = resolveExpiresAt({ mode: "duration", duration: option.value }, NOW);
      expect(result).toBeInstanceOf(Date);
      expect(result!.getTime()).toBeGreaterThan(NOW.getTime());
    }
  });

  it("computes a year as 365 days from creation", () => {
    const result = resolveExpiresAt({ mode: "duration", duration: "365d" }, NOW);
    expect(result?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("rejects a fixed date in the past", () => {
    const past = new Date("2025-01-01T00:00:00.000Z");
    expect(() => resolveExpiresAt({ mode: "date", expiresAt: past }, NOW)).toThrow(
      /future/i,
    );
  });

  it("rejects an unknown duration", () => {
    const bad = { mode: "duration", duration: "99y" } as unknown as ExpirationInput;
    expect(() => resolveExpiresAt(bad, NOW)).toThrow(/duration/i);
  });
});

describe("isExpired", () => {
  it("treats null as permanent", () => {
    expect(isExpired(null, NOW)).toBe(false);
  });

  it("is false strictly before the deadline", () => {
    expect(isExpired(new Date("2026-01-01T00:00:01.000Z"), NOW)).toBe(false);
  });

  it("is true after the deadline", () => {
    expect(isExpired(new Date("2025-12-31T23:59:59.000Z"), NOW)).toBe(true);
  });

  it("treats the exact deadline instant as expired", () => {
    expect(isExpired(NOW, NOW)).toBe(true);
  });
});
