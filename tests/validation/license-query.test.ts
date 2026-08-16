import { describe, expect, it } from "vitest";
import { parseLicenseQuery } from "@/lib/validation/dashboard";
import { DEFAULT_LICENSE_QUERY } from "@/lib/licenses/types";

/**
 * These values arrive from the address bar, so every one of them is attacker-
 * controlled and none of them may throw. A nonsense parameter falls back to
 * its default; the page still renders.
 */
describe("parseLicenseQuery", () => {
  it("returns defaults for an empty query string", () => {
    expect(parseLicenseQuery({})).toEqual(DEFAULT_LICENSE_QUERY);
  });

  it("reads every supported parameter", () => {
    expect(
      parseLicenseQuery({
        q: "acme",
        status: "revoked",
        activation: "activated",
        lock: "unlocked",
        sort: "expiresSoon",
        page: "3",
        pageSize: "50",
      }),
    ).toEqual({
      q: "acme",
      status: "revoked",
      activation: "activated",
      lock: "unlocked",
      sort: "expiresSoon",
      page: 3,
      pageSize: 50,
    });
  });

  it("trims the search term", () => {
    expect(parseLicenseQuery({ q: "  acme  " }).q).toBe("acme");
  });

  it("falls back to defaults for unknown enum values", () => {
    const parsed = parseLicenseQuery({
      status: "deleted",
      activation: "maybe",
      lock: "sideways",
      sort: "byVibes",
    });

    expect(parsed.status).toBe("all");
    expect(parsed.activation).toBe("all");
    expect(parsed.lock).toBe("all");
    expect(parsed.sort).toBe("newest");
  });

  it("falls back for a non-numeric, zero, negative or fractional page", () => {
    expect(parseLicenseQuery({ page: "abc" }).page).toBe(1);
    expect(parseLicenseQuery({ page: "0" }).page).toBe(1);
    expect(parseLicenseQuery({ page: "-4" }).page).toBe(1);
    expect(parseLicenseQuery({ page: "2.5" }).page).toBe(1);
    expect(parseLicenseQuery({ page: "" }).page).toBe(1);
  });

  it("rejects a page size that is not one of the offered options", () => {
    // Otherwise ?pageSize=100000 is a one-parameter denial of service against
    // the developer's own dashboard.
    expect(parseLicenseQuery({ pageSize: "1000" }).pageSize).toBe(25);
    expect(parseLicenseQuery({ pageSize: "30" }).pageSize).toBe(25);
    expect(parseLicenseQuery({ pageSize: "-25" }).pageSize).toBe(25);
  });

  it("accepts each offered page size", () => {
    expect(parseLicenseQuery({ pageSize: "25" }).pageSize).toBe(25);
    expect(parseLicenseQuery({ pageSize: "50" }).pageSize).toBe(50);
    expect(parseLicenseQuery({ pageSize: "100" }).pageSize).toBe(100);
  });

  it("caps an absurdly large page number instead of overflowing", () => {
    expect(parseLicenseQuery({ page: "999999999999999999999" }).page).toBe(1);
  });

  it("truncates an oversized search term rather than rejecting the page", () => {
    const parsed = parseLicenseQuery({ q: "x".repeat(500) });
    expect(parsed.q.length).toBeLessThanOrEqual(120);
  });

  it("takes the first value when a parameter repeats", () => {
    // Next.js hands repeated parameters over as an array.
    expect(parseLicenseQuery({ status: ["revoked", "active"] }).status).toBe("revoked");
    expect(parseLicenseQuery({ q: ["first", "second"] }).q).toBe("first");
  });

  it("ignores parameters it does not know about", () => {
    const parsed = parseLicenseQuery({ ownerId: "user_someone_else", evil: "1" });
    expect(parsed).toEqual(DEFAULT_LICENSE_QUERY);
  });
});
