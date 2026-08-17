import { describe, expect, it } from "vitest";
import { middleTruncate } from "@/lib/design/truncate";

describe("middleTruncate", () => {
  it("returns short values untouched", () => {
    expect(middleTruncate("app_9k2m", 20)).toBe("app_9k2m");
    expect(middleTruncate("", 20)).toBe("");
  });

  it("keeps the head and the tail", () => {
    const result = middleTruncate("KEYREN-ABCD-EFGH-IJKL-MNOP", 16);

    expect(result).toHaveLength(16);
    expect(result.startsWith("KEYREN")).toBe(true);
    expect(result.endsWith("MNOP")).toBe(true);
  });

  it("joins with exactly one ellipsis glyph, not three periods", () => {
    // Three periods would reserve three character cells in a monospace column
    // for what is one piece of information.
    const result = middleTruncate("KEYREN-ABCD-EFGH-IJKL-MNOP", 16);

    expect(result.split("…")).toHaveLength(2);
    expect(result).not.toContain("...");
  });

  it("favours the head when the budget is odd", () => {
    // The head identifies the resource; the tail only distinguishes it. Given
    // an odd character to spend, spend it on identification.
    expect(middleTruncate("abcdefghijklmno", 8)).toBe("abcd…mno");
  });

  it("never returns more characters than the budget", () => {
    for (const max of [1, 2, 4, 5, 8, 13, 21]) {
      expect(middleTruncate("x".repeat(80), max).length).toBeLessThanOrEqual(max);
    }
  });

  it("degrades to a bare ellipsis rather than throwing on a nonsense budget", () => {
    expect(middleTruncate("KEYREN-ABCD", 1)).toBe("…");
    expect(middleTruncate("KEYREN-ABCD", 0)).toBe("…");
    expect(middleTruncate("KEYREN-ABCD", -5)).toBe("…");
  });
});
