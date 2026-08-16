import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, truncateAll } from "../helpers/db";
import { DEVELOPER_A, DEVELOPER_B, makeApplication } from "../helpers/factories";
import { getCachedApplication } from "@/lib/applications/cached";
import { getApplication } from "@/lib/applications/service";
import type { Database } from "@/db/types";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  await truncateAll(db);
});

/**
 * The layout and the page both call this, each making its own ownership
 * check. The caching is a performance detail; the security properties below
 * are what must hold whether a call is served from cache or not.
 */
describe("getCachedApplication", () => {
  it("returns what the uncached loader returns", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A, name: "Zephyr Suite" });

    expect(await getCachedApplication(db, DEVELOPER_A, application.id)).toEqual(
      await getApplication(db, DEVELOPER_A, application.id),
    );
  });

  it("still refuses another developer's application", async () => {
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });

    expect(await getCachedApplication(db, DEVELOPER_B, application.id)).toBeNull();
  });

  it("keys on the owner, so one developer's result cannot serve another", async () => {
    // The same application id asked about by two developers must give two
    // different answers, cached or not.
    const application = await makeApplication(db, { ownerId: DEVELOPER_A });

    const mine = await getCachedApplication(db, DEVELOPER_A, application.id);
    const theirs = await getCachedApplication(db, DEVELOPER_B, application.id);

    expect(mine?.id).toBe(application.id);
    expect(theirs).toBeNull();

    // And in the other order, in case a first call could poison a second.
    const theirsFirst = await getCachedApplication(db, DEVELOPER_B, "app_nothing");
    const mineSecond = await getCachedApplication(db, DEVELOPER_A, application.id);
    expect(theirsFirst).toBeNull();
    expect(mineSecond?.id).toBe(application.id);
  });

  it("returns null for an application that does not exist", async () => {
    expect(await getCachedApplication(db, DEVELOPER_A, "app_nothing")).toBeNull();
  });
});
