import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/applications/slug";

describe("slugify", () => {
  it("lowercases and underscore-joins words", () => {
    expect(slugify("Seliware Key")).toBe("seliware_key");
  });

  it("collapses runs of whitespace", () => {
    expect(slugify("My   Cool    App")).toBe("my_cool_app");
  });

  it("drops punctuation", () => {
    expect(slugify("Acme's App (v2)!")).toBe("acmes_app_v2");
  });

  it("strips leading and trailing separators", () => {
    expect(slugify("  --Hello--  ")).toBe("hello");
  });

  it("keeps digits", () => {
    expect(slugify("Application 42")).toBe("application_42");
  });

  it("transliterates accented characters", () => {
    expect(slugify("Café Ünïcode")).toBe("cafe_unicode");
  });

  it("falls back when the name has no usable characters", () => {
    // Slugs are cosmetic, so an unusable name must not block application
    // creation. The immutable app_ ID is the real identifier.
    expect(slugify("日本語")).toBe("application");
    expect(slugify("!!!")).toBe("application");
    expect(slugify("")).toBe("application");
  });

  it("truncates very long names without a trailing separator", () => {
    const slug = slugify("a".repeat(200));
    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug.endsWith("_")).toBe(false);
  });
});
