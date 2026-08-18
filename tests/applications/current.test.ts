import { describe, expect, it } from "vitest";
import {
  CURRENT_APPLICATION_COOKIE,
  applicationIdFromPath,
  resolveCurrentApplication,
} from "@/lib/applications/current";

/** The two fields resolution actually depends on. */
function application(id: string, createdAt: string) {
  return { id, createdAt: new Date(createdAt) };
}

const NEWEST = application("app_NEWEST", "2026-08-17T00:00:00.000Z");
const MIDDLE = application("app_MIDDLE", "2026-08-16T00:00:00.000Z");
const OLDEST = application("app_OLDEST", "2026-08-15T00:00:00.000Z");

const OWNED = [NEWEST, MIDDLE, OLDEST];

describe("applicationIdFromPath", () => {
  it("finds the application in an application path", () => {
    expect(applicationIdFromPath("/dashboard/applications/app_abc123")).toBe("app_abc123");
  });

  it("finds it under a deeper section", () => {
    expect(applicationIdFromPath("/dashboard/applications/app_abc123/licenses")).toBe(
      "app_abc123",
    );
  });

  it("returns null on the list itself", () => {
    expect(applicationIdFromPath("/dashboard/applications")).toBeNull();
  });

  it("returns null on the workspace pages", () => {
    expect(applicationIdFromPath("/dashboard")).toBeNull();
    expect(applicationIdFromPath("/dashboard/settings")).toBeNull();
  });

  it("ignores a segment that is not an application id", () => {
    // A hand-typed path must not be echoed back as though it named something.
    expect(applicationIdFromPath("/dashboard/applications/not-an-application")).toBeNull();
  });
});

describe("resolveCurrentApplication", () => {
  it("uses the cookie when it names an owned application", () => {
    expect(resolveCurrentApplication(MIDDLE.id, OWNED)).toBe(MIDDLE);
  });

  it("falls back to the newest when there is no cookie", () => {
    expect(resolveCurrentApplication(undefined, OWNED)).toBe(NEWEST);
  });

  it("falls back to the newest when the cookie is an empty string", () => {
    expect(resolveCurrentApplication("", OWNED)).toBe(NEWEST);
  });

  it("falls back to the newest when the cookie names a deleted application", () => {
    expect(resolveCurrentApplication("app_DELETED", OWNED)).toBe(NEWEST);
  });

  it("ignores a cookie naming an application the developer does not own", () => {
    // The list is already owner-scoped in SQL, which is what makes reading an
    // untrusted cookie safe: a value outside the list matches nothing.
    expect(resolveCurrentApplication("app_SOMEONEELSES", OWNED)).toBe(NEWEST);
  });

  it("does not depend on the order it is handed", () => {
    // The applications page sorts by name, or by licence count. The answer has
    // to be the same one the header reached, or the two disagree on screen.
    expect(resolveCurrentApplication(undefined, [OLDEST, NEWEST, MIDDLE])).toBe(NEWEST);
  });

  it("breaks a createdAt tie on id, the way the list query does", () => {
    const a = application("app_AAA", "2026-08-17T00:00:00.000Z");
    const b = application("app_BBB", "2026-08-17T00:00:00.000Z");
    // Both orderings, so the win goes to the lower id and not to whichever
    // element the caller happened to list last.
    expect(resolveCurrentApplication(undefined, [b, a])).toBe(a);
    expect(resolveCurrentApplication(undefined, [a, b])).toBe(a);
  });

  it("returns null only when there is nothing to pick", () => {
    expect(resolveCurrentApplication(undefined, [])).toBeNull();
    expect(resolveCurrentApplication("app_ANY", [])).toBeNull();
  });

  it("names the cookie once, for middleware and the layout to share", () => {
    expect(CURRENT_APPLICATION_COOKIE).toBe("keyren_app");
  });
});
