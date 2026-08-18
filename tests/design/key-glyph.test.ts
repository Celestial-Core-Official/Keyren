import { describe, expect, it } from "vitest";
import { GLYPH_COLS, GLYPH_ROWS, keyGlyphBits } from "@/lib/design/key-glyph";

/**
 * The glyph is the one piece of Alpha_v3's visual identity that is generated
 * rather than drawn, so its contract is worth pinning down: it must be
 * deterministic (the same licence draws the same mark on every render, on the
 * server and on the client), it must never be blank, and it must never be
 * seeded with anything the developer cannot already see on the screen beside
 * it.
 */
describe("keyGlyphBits", () => {
  it("returns one cell per grid position", () => {
    expect(keyGlyphBits("KEYREN-7F2A-C1E9")).toHaveLength(GLYPH_COLS * GLYPH_ROWS);
  });

  it("is deterministic for the same seed", () => {
    expect(keyGlyphBits("KEYREN-7F2A-C1E9")).toEqual(keyGlyphBits("KEYREN-7F2A-C1E9"));
  });

  it("produces different grids for seeds differing in one character", () => {
    // Two masked keys in a table routinely share a prefix; if the glyph only
    // responded to the head it would be useless for exactly the comparison it
    // exists to make.
    expect(keyGlyphBits("KEYREN-7F2A-C1E9")).not.toEqual(keyGlyphBits("KEYREN-7F2A-C1EA"));
  });

  it("keeps every cell within the 0-3 intensity range", () => {
    for (const cell of keyGlyphBits("app_9k2mQ4vB")) {
      expect(cell).toBeGreaterThanOrEqual(0);
      expect(cell).toBeLessThanOrEqual(3);
    }
  });

  it("never returns an all-zero grid, even for a degenerate seed", () => {
    // A blank glyph reads as a rendering failure rather than as a mark.
    expect(keyGlyphBits("a").some((cell) => cell > 0)).toBe(true);
    expect(keyGlyphBits("").some((cell) => cell > 0)).toBe(true);
  });

  it("distributes ink across rows rather than clustering it in one", () => {
    for (const seed of ["KEYREN-QQQQ-QQQQ", "app_1", "KEYREN-0000-0000-0000"]) {
      const bits = keyGlyphBits(seed);
      const rowsWithInk = Array.from({ length: GLYPH_ROWS }, (_, row) =>
        bits.slice(row * GLYPH_COLS, (row + 1) * GLYPH_COLS).some((cell) => cell > 0),
      ).filter(Boolean).length;

      expect(rowsWithInk).toBeGreaterThanOrEqual(3);
    }
  });

  it("fills between a fifth and four fifths of the grid", () => {
    // Too sparse reads as dust, too dense reads as a solid block. Either way
    // it stops being a distinguishable mark.
    for (const seed of ["KEYREN-7F2A-C1E9", "app_9k2mQ4vB", "KEYREN-ZZZZ-1111"]) {
      const inked = keyGlyphBits(seed).filter((cell) => cell > 0).length;
      const total = GLYPH_COLS * GLYPH_ROWS;

      expect(inked).toBeGreaterThan(total * 0.2);
      expect(inked).toBeLessThan(total * 0.8);
    }
  });
});
