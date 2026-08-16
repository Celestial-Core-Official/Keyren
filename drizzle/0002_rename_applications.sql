--> Products became Applications.
--> Nominal only: no column types, constraints or ordering change, and every
--> existing row keeps its data and its primary key. Licenses stay valid because
--> KEYREN_LICENSE_HMAC_SECRET is not involved — nothing is re-derived.
--> Existing ids keep their `prod_` prefix; only newly minted ids read `app_`.

ALTER TABLE "products" RENAME TO "applications";--> statement-breakpoint
ALTER TABLE "licenses" RENAME COLUMN "product_id" TO "application_id";--> statement-breakpoint

--> Constraint and index names are renamed too. Postgres would happily keep
--> serving them under the old names, but a stale name in \d output is exactly
--> the sort of thing that sends someone looking for a table that no longer
--> exists.
ALTER TABLE "licenses" RENAME CONSTRAINT "licenses_product_id_products_id_fk" TO "licenses_application_id_applications_id_fk";--> statement-breakpoint

ALTER INDEX "products_owner_created_idx" RENAME TO "applications_owner_created_idx";--> statement-breakpoint
ALTER INDEX "licenses_product_key_hash_idx" RENAME TO "licenses_application_key_hash_idx";--> statement-breakpoint
ALTER INDEX "licenses_product_created_idx" RENAME TO "licenses_application_created_idx";--> statement-breakpoint
ALTER INDEX "licenses_product_label_idx" RENAME TO "licenses_application_label_idx";
