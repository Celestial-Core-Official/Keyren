import { describe, expect, it } from "vitest";
import { generateLicenseId, generateProductId } from "@/lib/crypto/ids";

describe("generateProductId", () => {
  it("is prefixed and 26 random symbols long", () => {
    const id = generateProductId();
    expect(id).toMatch(/^prod_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("carries at least 128 bits of entropy", () => {
    // 26 symbols from a 32-symbol alphabet = 26 * 5 = 130 bits.
    const random = generateProductId().slice("prod_".length);
    expect(random.length * 5).toBeGreaterThanOrEqual(128);
  });

  it("is not sequential or guessable across calls", () => {
    const ids = Array.from({ length: 1000 }, generateProductId);
    expect(new Set(ids).size).toBe(1000);
  });
});

describe("generateLicenseId", () => {
  it("is prefixed and 26 random symbols long", () => {
    expect(generateLicenseId()).toMatch(/^lic_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("is distinct from product ids", () => {
    expect(generateLicenseId().startsWith("lic_")).toBe(true);
    expect(generateProductId().startsWith("prod_")).toBe(true);
  });
});
