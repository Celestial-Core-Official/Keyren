import { describe, expect, it } from "vitest";
import { mergeSearchParams, toQueryString } from "@/lib/url-params";

describe("mergeSearchParams", () => {
  it("keeps parameters it was not asked to change", () => {
    // Typing in the search box must not silently discard the developer's
    // status filter and sort order.
    expect(mergeSearchParams("status=revoked&sort=label", { q: "acme" })).toBe(
      "q=acme&sort=label&status=revoked",
    );
  });

  it("overwrites an existing value", () => {
    expect(mergeSearchParams("page=3", { page: 1 })).toBe("page=1");
  });

  it("removes a parameter set to null", () => {
    expect(mergeSearchParams("q=acme&status=active", { q: null })).toBe("status=active");
  });

  it("removes a parameter set to an empty string", () => {
    // A cleared search box should leave a clean URL, not `?q=`.
    expect(mergeSearchParams("q=acme", { q: "" })).toBe("");
  });

  it("accepts a URLSearchParams as well as a string", () => {
    const params = new URLSearchParams("sort=oldest");
    expect(mergeSearchParams(params, { page: 2 })).toBe("page=2&sort=oldest");
  });

  it("does not mutate the params it was given", () => {
    const params = new URLSearchParams("sort=oldest");
    mergeSearchParams(params, { sort: "label" });
    expect(params.get("sort")).toBe("oldest");
  });

  it("produces the same string for the same choices regardless of order", () => {
    // So a bookmarked view and a shared link are byte-identical.
    expect(mergeSearchParams("", { status: "active", q: "a" })).toBe(
      mergeSearchParams("", { q: "a", status: "active" }),
    );
  });

  it("encodes values that need it", () => {
    expect(mergeSearchParams("", { q: "50% off & more" })).toBe(
      "q=50%25+off+%26+more",
    );
  });

  it("handles several updates at once", () => {
    expect(mergeSearchParams("q=old&page=5", { q: "new", page: null, sort: "label" })).toBe(
      "q=new&sort=label",
    );
  });
});

describe("toQueryString", () => {
  it("prefixes a question mark when there is anything to send", () => {
    expect(toQueryString("", { q: "acme" })).toBe("?q=acme");
  });

  it("returns an empty string rather than a bare question mark", () => {
    expect(toQueryString("q=acme", { q: null })).toBe("");
  });
});
