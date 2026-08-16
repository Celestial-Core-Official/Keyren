import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { applications } from "./applications";

/** A license is in exactly one of these two states. Revoking is reversible and
 *  never destroys the record. */
export const licenseStatus = pgEnum("license_status", ["active", "revoked"]);

export const licenses = pgTable(
  "licenses",
  {
    id: text("id").primaryKey(),

    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),

    /** HMAC-SHA256(server_secret, "license:" + normalized_key), hex.
     *  The plaintext key is never stored anywhere. */
    keyHash: text("key_hash").notNull(),

    /** Final four characters, captured at creation so the dashboard has a
     *  stable non-secret way to refer to a key it can never redisplay. */
    keyLast4: text("key_last4").notNull(),

    /** Optional human-recognisable reference — a customer, an order, a
     *  seat. Purely a dashboard affordance: it is never returned by the
     *  public verification API, so it can hold whatever the developer finds
     *  useful without becoming part of any integration contract. */
    label: text("label"),

    /** Internal dashboard-only notes. Same reasoning as `label`, with room
     *  for a sentence rather than a name. */
    notes: text("notes"),

    status: licenseStatus("status").notNull().default("active"),

    /** All three developer-facing expiration modes normalize to this single
     *  nullable UTC timestamp. NULL means permanent. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    hwidLocked: boolean("hwid_locked").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    // Globally unique: a collision would let one application's key authenticate
    // against another. At 160 bits this will never fire, which is the point —
    // it is a tripwire, not a routine constraint.
    uniqueIndex("licenses_key_hash_unique").on(table.keyHash),

    // THE verification path index. The hot query is
    //   WHERE application_id = $1 AND key_hash = $2
    // and this covers it exactly, so verification stays an index lookup
    // rather than a scan as the table grows.
    index("licenses_application_key_hash_idx").on(table.applicationId, table.keyHash),

    // Dashboard listing: licenses for one application, newest first.
    index("licenses_application_created_idx").on(table.applicationId, table.createdAt),

    // Serves `ORDER BY label` within an application, which is one of the offered
    // sorts. Deliberately NOT an attempt to index the search: `q` matches with
    // a leading wildcard (ILIKE '%term%'), which no btree can satisfy, and
    // making it indexable would mean installing pg_trgm — a database extension
    // is far too much apparatus for filtering one developer's own licenses.
    index("licenses_application_label_idx").on(table.applicationId, table.label),
  ],
);

export type LicenseRow = typeof licenses.$inferSelect;
export type NewLicenseRow = typeof licenses.$inferInsert;
export type LicenseStatus = (typeof licenseStatus.enumValues)[number];
