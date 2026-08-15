CREATE TYPE "public"."license_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "licenses" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_last4" text NOT NULL,
	"status" "license_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"hwid_locked" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "activations" (
	"id" text PRIMARY KEY NOT NULL,
	"license_id" text NOT NULL,
	"device_hash" text NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_counters" (
	"bucket_key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activations" ADD CONSTRAINT "activations_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_owner_created_idx" ON "products" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "licenses_key_hash_unique" ON "licenses" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "licenses_product_key_hash_idx" ON "licenses" USING btree ("product_id","key_hash");--> statement-breakpoint
CREATE INDEX "licenses_product_created_idx" ON "licenses" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activations_license_unique" ON "activations" USING btree ("license_id");--> statement-breakpoint
CREATE INDEX "rate_limit_window_idx" ON "rate_limit_counters" USING btree ("window_start");