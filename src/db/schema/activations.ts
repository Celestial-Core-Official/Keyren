import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { licenses } from "./licenses";

export const activations = pgTable(
  "activations",
  {
    id: text("id").primaryKey(),

    licenseId: text("license_id")
      .notNull()
      .references(() => licenses.id, { onDelete: "cascade" }),

    /** HMAC-SHA256(server_secret, "device:" + deviceId), hex. The raw
     *  fingerprint supplied by the client is never stored. */
    deviceHash: text("device_hash").notNull(),

    activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Keyren allows at most one device binding per license, and this
    // constraint — not application code — is what enforces it. A future
    // release supporting multiple devices drops this index; nothing else in
    // the schema has to change.
    uniqueIndex("activations_license_unique").on(table.licenseId),
  ],
);

export type ActivationRow = typeof activations.$inferSelect;
