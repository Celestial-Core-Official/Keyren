// Vitest setup file: provides ambient environment variables so that modules
// which read `env` from "@/env" at import time (module-level `parseEnv`)
// don't throw during test collection. Individual tests that exercise
// `parseEnv` directly still pass their own fixtures and are unaffected.
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/keyren_test";
process.env.KEYREN_LICENSE_HMAC_SECRET ??= "a".repeat(64);
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??= "pk_test_placeholder";
process.env.CLERK_SECRET_KEY ??= "sk_test_placeholder";
