import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const applications = pgTable(
  "applications",
  {
    /** Immutable `app_...` identifier. Never derived from name or slug, and
     *  never changed by a rename — customer software has it compiled in. */
    id: text("id").primaryKey(),

    /** Clerk user ID. Always read from a server-side `auth()` call, never
     *  from the browser. Every ownership check keys off this column. */
    ownerId: text("owner_id").notNull(),

    name: text("name").notNull(),

    /** Human readability only. Not unique, not an identifier. */
    slug: text("slug").notNull(),

    /**
     * When the developer switched this application off. NULL means live.
     *
     * A timestamp rather than a boolean: "off since Tuesday" is worth knowing
     * and costs the same to store. While set, every verification for this
     * application is rejected regardless of how healthy the individual license
     * is — it is the kill switch for a whole application, so it is checked
     * before the key is even hashed.
     */
    disabledAt: timestamp("disabled_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Every dashboard application query filters by owner and orders by creation.
    index("applications_owner_created_idx").on(table.ownerId, table.createdAt),
  ],
);

export type ApplicationRow = typeof applications.$inferSelect;
export type NewApplicationRow = typeof applications.$inferInsert;
