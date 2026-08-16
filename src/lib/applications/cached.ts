import { cache } from "react";
import type { Database } from "@/db/types";
import { getApplication, type Application } from "./service";

/**
 * The application for the current request, fetched at most once.
 *
 * Both the application layout and the page beneath it need the application — the
 * layout for the heading and tabs, the page for its own work — and both must
 * check ownership rather than trusting the other to have done it. Alpha_v1
 * therefore ran the same `SELECT` twice on every application page load.
 *
 * React's `cache` deduplicates within a single request: the second call
 * returns the first call's promise. Nothing is shared between requests or
 * between developers, and the owner id is part of the key, so a cached result
 * cannot leak across sessions. The ownership check is still made — it is just
 * not repeated.
 */
export const getCachedApplication = cache(
  async (db: Database, ownerId: string, applicationId: string): Promise<Application | null> =>
    getApplication(db, ownerId, applicationId),
);
