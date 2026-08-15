import { describe, expect, it } from "vitest";
import { CROCKFORD_ALPHABET, randomAlphabetString } from "@/lib/crypto/random";

describe("CROCKFORD_ALPHABET", () => {
  // This is a security invariant, not a style preference. 256 % 32 === 0,
  // so `byte % 32` is uniform. Any other length introduces modulo bias.
  it("is exactly 32 symbols so byte %% 32 is unbiased", () => {
    expect(CROCKFORD_ALPHABET).toHaveLength(32);
    expect(256 % CROCKFORD_ALPHABET.length).toBe(0);
  });

  it("excludes the ambiguous glyphs I, L, O and U", () => {
    for (const ambiguous of ["I", "L", "O", "U"]) {
      expect(CROCKFORD_ALPHABET).not.toContain(ambiguous);
    }
  });

  it("has no duplicate symbols", () => {
    expect(new Set(CROCKFORD_ALPHABET).size).toBe(CROCKFORD_ALPHABET.length);
  });
});

describe("randomAlphabetString", () => {
  it("returns the requested length", () => {
    expect(randomAlphabetString(32)).toHaveLength(32);
  });

  it("only emits symbols from the alphabet", () => {
    for (const char of randomAlphabetString(512)) {
      expect(CROCKFORD_ALPHABET).toContain(char);
    }
  });

  it("does not repeat across calls", () => {
    const seen = new Set(Array.from({ length: 500 }, () => randomAlphabetString(32)));
    expect(seen.size).toBe(500);
  });

  it("distributes symbols roughly uniformly", () => {
    // 32k samples over 32 symbols => ~1000 each. A biased implementation
    // (for example one using `%` over a 36-symbol alphabet) fails this.
    const counts = new Map<string, number>();
    for (const char of randomAlphabetString(32_000)) {
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    expect(counts.size).toBe(32);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(800);
      expect(count).toBeLessThan(1200);
    }
  });

  it("rejects a non-positive length", () => {
    expect(() => randomAlphabetString(0)).toThrow();
    expect(() => randomAlphabetString(-1)).toThrow();
  });
});
