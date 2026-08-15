import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";
import type { Database } from "./types";

/**
 * Reuse the client across hot reloads in development. Without this, every
 * edit opens a new pool and Postgres runs out of connections.
 */
const globalForDb = globalThis as unknown as {
  keyrenClient: ReturnType<typeof postgres> | undefined;
};

const client =
  globalForDb.keyrenClient ??
  postgres(env.DATABASE_URL, {
    // Serverless functions are short-lived; a large pool per instance is
    // wasted and exhausts the server's connection limit.
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.keyrenClient = client;
}

export const db = drizzle(client, { schema }) as unknown as Database;
export { schema };
