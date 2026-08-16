ALTER TABLE "licenses" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "notes" text;--> statement-breakpoint
CREATE INDEX "licenses_product_label_idx" ON "licenses" USING btree ("product_id","label");