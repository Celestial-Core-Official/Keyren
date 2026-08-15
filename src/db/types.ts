import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/**
 * The database handle every service function accepts.
 *
 * Written against Drizzle's driver-agnostic base class rather than a concrete
 * driver so the same business logic runs against postgres.js in production
 * and PGlite in tests. No service imports a driver directly.
 */
export type Database = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
