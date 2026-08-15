import { describe, expect, it } from "vitest";
import {
  endOfUtcDay,
  formatExpiryPreview,
  todayInUtc,
} from "@/lib/licenses/expiration";
import { createLicenseSchema } from "@/lib/validation/dashboard";

describe("endOfUtcDay", () => {
  it("resolves a date-only value to the last instant of that day in UTC", () => {
    // A developer picking 31 August means the license works all of the 31st.
    // Midnight would silently cut the customer off a day early.
    expect(endOfUtcDay("2026-08-31").toISOString()).toBe("2026-08-31T23:59:59.999Z");
  });

  it("does not shift the day for a developer in a negative offset", () => {
    // Parsing "2026-08-31" with the Date constructor's local-time path is what
    // turns this into the 30th for anyone west of UTC.
    expect(endOfUtcDay("2026-01-01").toISOString()).toBe("2026-01-01T23:59:59.999Z");
  });

  it("handles a leap day", () => {
    expect(endOfUtcDay("2028-02-29").toISOString()).toBe("2028-02-29T23:59:59.999Z");
  });

  it("rejects a value that is not a plain date", () => {
    expect(() => endOfUtcDay("31/08/2026")).toThrow();
    expect(() => endOfUtcDay("2026-13-01")).toThrow();
    expect(() => endOfUtcDay("2026-02-30")).toThrow();
    expect(() => endOfUtcDay("")).toThrow();
  });
});

describe("todayInUtc", () => {
  it("formats as the value a date input expects", () => {
    expect(todayInUtc(new Date("2026-08-15T23:30:00.000Z"))).toBe("2026-08-15");
  });

  it("zero-pads single-digit months and days", () => {
    expect(todayInUtc(new Date("2026-02-03T00:00:00.000Z"))).toBe("2026-02-03");
  });
});

describe("formatExpiryPreview", () => {
  it("states the exact instant the license stops working", () => {
    expect(formatExpiryPreview("2026-08-31")).toBe("Expires Aug 31, 2026 at 23:59 UTC");
  });

  it("says nothing useful for an unparseable value", () => {
    expect(formatExpiryPreview("")).toBeNull();
    expect(formatExpiryPreview("not-a-date")).toBeNull();
  });
});

describe("createLicenseSchema — date normalization", () => {
  const base = {
    productId: "prod_abc",
    mode: "date" as const,
    hwidLocked: true,
    quantity: 1,
  };

  it("normalizes a date-only submission to end of day UTC", () => {
    // The browser's date input submits exactly this shape, and the server is
    // the authority on what it means.
    const parsed = createLicenseSchema.safeParse({ ...base, expiresAt: "2026-08-31" });
    expect(parsed.success).toBe(true);
    expect(
      parsed.data && "expiresAt" in parsed.data && parsed.data.expiresAt.toISOString(),
    ).toBe("2026-08-31T23:59:59.999Z");
  });

  it("still accepts a full ISO timestamp unchanged", () => {
    const parsed = createLicenseSchema.safeParse({
      ...base,
      expiresAt: "2026-08-31T12:00:00.000Z",
    });
    expect(
      parsed.data && "expiresAt" in parsed.data && parsed.data.expiresAt.toISOString(),
    ).toBe("2026-08-31T12:00:00.000Z");
  });

  it("rejects a malformed date", () => {
    expect(createLicenseSchema.safeParse({ ...base, expiresAt: "soon" }).success).toBe(
      false,
    );
  });
});
