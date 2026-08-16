import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RELEASE, VERIFY_PATH, verifyUrl } from "@/lib/release";

/**
 * The release name and the package version drift apart the moment they are
 * written down twice. These tests are the single tripwire that keeps the
 * dashboard badge, the settings page, the landing page and package.json
 * agreeing with each other.
 */
describe("RELEASE", () => {
  it("names the current release Alpha_v2", () => {
    expect(RELEASE.name).toBe("Alpha_v2");
  });

  it("pins the package version to 0.1.2", () => {
    expect(RELEASE.version).toBe("0.1.2");
  });

  it("matches the version in package.json", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"),
    ) as { version: string };

    expect(pkg.version).toBe(RELEASE.version);
  });

  it("keeps the public API path independent of the release name", () => {
    // /api/v1 is semver on the URL, not the marketing release. Alpha_v2 must
    // not have dragged the API to v2.
    expect(RELEASE.apiVersion).toBe("v1");
    expect(VERIFY_PATH).toBe("/api/v1/licenses/verify");
  });
});

describe("verifyUrl", () => {
  it("joins an origin to the verification path", () => {
    expect(verifyUrl("https://keys.example.com")).toBe(
      "https://keys.example.com/api/v1/licenses/verify",
    );
  });

  it("does not produce a double slash when the origin has a trailing slash", () => {
    // NEXT_PUBLIC_APP_URL is developer-supplied and routinely ends in "/".
    // A doubled slash would ship inside every copied integration snippet.
    expect(verifyUrl("https://keys.example.com/")).toBe(
      "https://keys.example.com/api/v1/licenses/verify",
    );
    expect(verifyUrl("http://localhost:3000///")).toBe(
      "http://localhost:3000/api/v1/licenses/verify",
    );
  });
});
