--> An application can be switched off.
--> Nullable, so every existing row is live by default and no backfill is
--> needed. NULL means live; a timestamp means off, and records when.
ALTER TABLE "applications" ADD COLUMN "disabled_at" timestamp with time zone;
