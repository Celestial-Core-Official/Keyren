# Keyren Alpha_v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Keyren Alpha_v1 — a developer SaaS where a developer signs up with Clerk, creates a product, generates a cryptographically secure license key shown exactly once, and their customer software authenticates that key (with HWID binding) against a public, rate-limited verification API.

**Architecture:** A single Next.js App Router application with a hard split between UI and business logic. All licensing behavior lives in `src/lib/**` as plain TypeScript functions that take an explicit `ownerId` and a database handle; React components and route handlers are thin adapters over those functions. Ownership is enforced *inside the SQL* (every dashboard query joins `products.owner_id`), so it is structurally impossible to mutate another developer's resource by guessing an ID. Plaintext license keys never touch the database — only `HMAC-SHA256(server_secret, normalized_key)` is stored, under a unique index, which doubles as the O(1) verification lookup. The public API lives at `/api/v1/licenses/verify` and is versioned independently of the `Alpha_v1` marketing release name.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5 (strict), Tailwind CSS 4, shadcn/ui, Clerk 7, PostgreSQL, Drizzle ORM 0.45 + drizzle-kit 0.31, Zod 4, Vitest 4 with PGlite 0.5 (in-memory real Postgres) for tests, Vercel as deploy target.

---

## Assumptions (stated, not guessed silently)

1. **Database**: the app connects to any Postgres via a single `DATABASE_URL` using the `postgres` (postgres.js) driver. This works unchanged against Neon, Supabase, Vercel Postgres, or a local server. No provider-specific driver is used, so the host can be chosen later without a code change.
2. **Tests need no external services.** The whole test suite runs against PGlite — a real Postgres compiled to WASM, in-memory, created fresh per test file. No Docker, no local Postgres install, no network. This matters because neither `psql` nor `docker` is available on this machine.
3. **Rate limiting uses Postgres**, not Redis. The spec forbids Redis unless clearly necessary; a fixed-window counter table is adequate for Alpha_v1 and sits behind a `RateLimiter` interface so it can be swapped without touching the verification path.
4. **Clerk keys and a `DATABASE_URL` are required to run the app**, but not to run the test suite or the typecheck. Verification of the live dashboard is gated on the user supplying those.
5. **This machine's npm enforces `min-release-age=3`** (a supply-chain safeguard: no package published in the last 3 days may be installed). Exact version pins in this plan may 404 with "no matching version with a date before ...". When that happens, install the newest version that predates the cutoff rather than disabling the policy. Check with `npm view <pkg> time --json` against `npm config get before`. Actual installed versions are recorded in `PROGRESS.md`.

---

## Security decisions locked in by this plan

These are the decisions a reviewer should check the code against.

| Concern | Decision |
|---|---|
| License key entropy | 32 chars from a 32-symbol alphabet = **160 bits**, from `crypto.randomBytes`. Exceeds the 128-bit floor. |
| Modulo bias | Alphabet is exactly 32 symbols and 256 % 32 === 0, so `byte % 32` is **provably unbiased**. No rejection sampling needed. A unit test asserts the alphabet length stays 32 so this property cannot silently break. |
| Alphabet | Crockford Base32 (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`) — excludes I, L, O, U, so no ambiguous glyphs and no accidental profanity. |
| Key at rest | `HMAC-SHA256(KEYREN_LICENSE_HMAC_SECRET, "license:" + normalizedKey)` hex, stored in `licenses.key_hash` with a UNIQUE index. Plaintext is never written to the DB, logs, or any response after creation. |
| Why HMAC not bcrypt/argon2 | Verification must be an indexed equality lookup, so the stored value must be deterministic. A *keyed* construction is used precisely because a plain unsalted SHA-256 would be offline-brute-forceable from a DB dump; HMAC is not, without the server secret. The key's own 160 bits of entropy already defeat brute force. |
| Domain separation | Device fingerprints hash as `HMAC-SHA256(secret, "device:" + deviceId)`. The `"license:"` / `"device:"` prefixes prevent a value from ever being valid in both contexts. |
| Constant-time | `crypto.timingSafeEqual` re-checks the fetched row's `key_hash` against the computed one as defense-in-depth, after the indexed lookup. |
| Enumeration | Any license that is absent, or present but belonging to a different product, returns the identical `LICENSE_INVALID` / 403 response. Product IDs *are* shipped inside customer software, so `PRODUCT_INVALID` is safe to distinguish and helps developers debug integrations. |
| Ownership | Every dashboard read and mutation is a single SQL statement scoped by `products.owner_id = $ownerId`. There is no fetch-then-compare-in-JS path. A miss returns "not found", never "forbidden", so IDs cannot be probed for existence. |
| Client trust | `ownerId` is only ever read from Clerk's server-side `auth()`. It is never accepted from a form field, URL, or request body. |
| Log safety | `src/lib/log.ts` exposes `maskLicenseKey()`; raw keys are never passed to `console.*`. |

---

## File Structure

Files that change together live together. Business logic is grouped by domain (`products`, `licenses`), not by technical layer.

**Config / root**
- `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `components.json`, `.gitignore`, `.env.example`
- `drizzle.config.ts` — drizzle-kit config, reads `DATABASE_URL`
- `vitest.config.ts` — node environment, path alias `@/`
- `middleware.ts` — Clerk middleware; protects `/dashboard`, leaves `/api/v1/**` public

**Environment**
- `src/env.ts` — Zod-validated, fail-fast env access. The single place `process.env` is read.

**Persistence** (`src/db/`)
- `src/db/schema/products.ts`, `licenses.ts`, `activations.ts`, `rate-limits.ts`, `index.ts`
- `src/db/index.ts` — postgres.js connection + `db` singleton
- `src/db/types.ts` — the `Database` type both the real client and PGlite satisfy

**Business logic** (`src/lib/`)
- `src/lib/crypto/ids.ts` — `generateProductId()`, `generateLicenseId()`
- `src/lib/crypto/random.ts` — unbiased Crockford Base32 generator
- `src/lib/crypto/license-key.ts` — generate / normalize / hash / constant-time compare
- `src/lib/crypto/device.ts` — `hashDeviceId()`
- `src/lib/errors.ts` — `VerificationErrorCode`, `KeyrenError`, HTTP status map
- `src/lib/log.ts` — `maskLicenseKey()`
- `src/lib/products/slug.ts` — `slugify()`
- `src/lib/products/service.ts` — ownership-scoped product CRUD
- `src/lib/licenses/expiration.ts` — the three developer-facing modes → `expiresAt: Date | null`
- `src/lib/licenses/service.ts` — ownership-scoped license CRUD + activation reset
- `src/lib/licenses/verify.ts` — **the verification engine**; the security core
- `src/lib/rate-limit/types.ts` — `RateLimiter` interface + dimension types
- `src/lib/rate-limit/postgres.ts` — fixed-window Postgres limiter
- `src/lib/rate-limit/index.ts` — composite limiter wiring the dimensions
- `src/lib/validation/verify-request.ts` — Zod schema for the public API body
- `src/lib/validation/dashboard.ts` — Zod schemas for server action inputs
- `src/lib/auth/require-developer.ts` — wraps Clerk `auth()`, returns `ownerId`

**Route handling**
- `src/app/api/v1/licenses/verify/route.ts` — thin adapter: parse → rate-limit → `verifyLicense()` → serialize
- `src/app/dashboard/**/actions.ts` — server actions; auth + Zod + delegate to services

**UI** — `src/app/**` pages, `src/components/ui/**` (shadcn), `src/components/dashboard/**`, `src/components/products/**`, `src/components/licenses/**`

**Tests** (`tests/`)
- `tests/helpers/db.ts` — PGlite harness: fresh migrated DB per suite
- `tests/helpers/factories.ts` — `makeDeveloper()`, `makeProduct()`, `makeLicense()`
- `tests/crypto/*.test.ts`, `tests/products/*.test.ts`, `tests/licenses/*.test.ts`, `tests/verify/*.test.ts`, `tests/rate-limit/*.test.ts`, `tests/api/*.test.ts`

---

## Test coverage map

The spec lists 17 mandatory scenarios. Each is bound to a task here so none can be lost:

| # | Scenario | Task | Test file |
|---|---|---|---|
| 1 | valid active license | 17 | `tests/verify/lookup.test.ts` |
| 2 | invalid license | 17 | `tests/verify/lookup.test.ts` |
| 3 | wrong product | 17 | `tests/verify/lookup.test.ts` |
| 4 | revoked license | 18 | `tests/verify/state.test.ts` |
| 5 | restored license | 18 | `tests/verify/state.test.ts` |
| 6 | expired license | 18 | `tests/verify/state.test.ts` |
| 7 | permanent license | 18 | `tests/verify/state.test.ts` |
| 8 | first HWID activation | 19 | `tests/verify/hwid.test.ts` |
| 9 | same HWID authenticates again | 19 | `tests/verify/hwid.test.ts` |
| 10 | different HWID fails | 19 | `tests/verify/hwid.test.ts` |
| 11 | activation reset | 19 | `tests/verify/hwid.test.ts` |
| 12 | new HWID succeeds after reset | 19 | `tests/verify/hwid.test.ts` |
| 13 | developer cannot access another's product | 13 | `tests/products/service.test.ts` |
| 14 | developer cannot mutate another's license | 16 | `tests/licenses/lifecycle.test.ts` |
| 15 | deleted license cannot authenticate | 19 | `tests/verify/hwid.test.ts` |
| 16 | malformed request | 23 | `tests/api/verify-route.test.ts` |
| 17 | rate-limited request | 20, 23 | `tests/rate-limit/postgres.test.ts`, `tests/api/verify-route.test.ts` |

---
## Phase 0 — Scaffold

### Task 1: Create the Next.js project

**Files:**
- Create: whole scaffold at repo root

- [x] **Step 1: Scaffold into the existing empty directory**

The repo root is empty. `create-next-app` refuses a non-empty dir only if it has conflicting files, so scaffold into a temp dir and move it in, which avoids surprises with the `docs/` folder.

```bash
cd /Users/marcin_alan/Documents/Github/Keyren
npx --yes create-next-app@16.3.0 "$TMPDIR/keyren-scaffold" \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --no-turbopack --use-npm --yes
rsync -a --exclude node_modules --exclude .git "$TMPDIR/keyren-scaffold/" ./
rm -rf "$TMPDIR/keyren-scaffold"
npm install
```

> **Corrected during execution.** The scaffold directory must NOT start with a dot — npm rejects `.keyren-scaffold` as an invalid package name before create-next-app runs. Also set `"name": "keyren"` in the generated `package.json`, since create-next-app names the project after the directory.

Expected: `src/app/layout.tsx`, `src/app/page.tsx`, `package.json`, `tsconfig.json` exist at root.

- [x] **Step 2: Initialise git and make the first commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js 16 + TypeScript + Tailwind 4"
```

- [x] **Step 3: Install runtime and dev dependencies**

```bash
npm install @clerk/nextjs@7.7.5 drizzle-orm@0.45.2 postgres@3.4.9 zod@4.4.3
npm install -D drizzle-kit@0.31.10 vitest@4.1.10 @electric-sql/pglite@0.5.5 dotenv@17.2.3 tsx@4.20.6
```

- [x] **Step 4: Verify the toolchain builds**

```bash
npx tsc --noEmit
```
Expected: exits 0, no output.

- [x] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: add Clerk, Drizzle, Zod, Vitest, PGlite"
```

---

### Task 2: Strict TypeScript and Vitest config

**Files:**
- Modify: `tsconfig.json`
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts)

- [x] **Step 1: Tighten `tsconfig.json` compilerOptions**

Merge these into the existing `compilerOptions` (keep the Next.js-generated keys such as `plugins`, `jsx`, `paths`):

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true,
  "exactOptionalPropertyTypes": false,
  "forceConsistentCasingInFileNames": true
}
```

`noUncheckedIndexedAccess` is the one that matters most here: it forces explicit handling of `array[i]` being possibly `undefined`, which is exactly the class of bug that turns into a silent auth bypass.

- [x] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // PGlite instances are per-file; running files in parallel is safe
    // but each file must create its own database.
    pool: "forks",
    testTimeout: 30_000,
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
```

- [x] **Step 3: Add scripts to `package.json`**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

- [x] **Step 4: Verify**

```bash
npm run typecheck && npx vitest run --passWithNoTests
```
Expected: typecheck exits 0; vitest reports "No test files found" and exits 0.

- [x] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: strict TypeScript and Vitest config"
```

---

### Task 3: Fail-fast environment validation

**Files:**
- Create: `src/env.ts`
- Create: `.env.example`
- Create: `tests/env.test.ts`
- Modify: `.gitignore`

- [x] **Step 1: Write the failing test**

`tests/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/env";

const valid = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/keyren",
  KEYREN_LICENSE_HMAC_SECRET: "a".repeat(64),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x",
  CLERK_SECRET_KEY: "sk_test_x",
};

describe("parseEnv", () => {
  it("accepts a complete valid environment", () => {
    const env = parseEnv(valid);
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.RATE_LIMIT_VERIFY_PER_MINUTE).toBe(60);
  });

  it("rejects a missing database url", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("rejects an HMAC secret that is too short to be safe", () => {
    expect(() =>
      parseEnv({ ...valid, KEYREN_LICENSE_HMAC_SECRET: "short" }),
    ).toThrow(/KEYREN_LICENSE_HMAC_SECRET/);
  });

  it("never includes the secret in the thrown message", () => {
    try {
      parseEnv({ ...valid, KEYREN_LICENSE_HMAC_SECRET: "leakme" });
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain("leakme");
    }
  });

  it("coerces numeric rate limit overrides", () => {
    const env = parseEnv({ ...valid, RATE_LIMIT_VERIFY_PER_MINUTE: "10" });
    expect(env.RATE_LIMIT_VERIFY_PER_MINUTE).toBe(10);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/env.test.ts
```
Expected: FAIL — cannot resolve module `@/env`.

- [x] **Step 3: Implement `src/env.ts`**

```ts
import { z } from "zod";

/**
 * The only place in Keyren that reads `process.env`.
 *
 * Parsing happens once at module load so a misconfigured deployment fails
 * immediately and loudly rather than at the first verification request.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // 32 bytes hex = 64 chars. Anything shorter is rejected outright rather
  // than quietly weakening every license hash in the database.
  KEYREN_LICENSE_HMAC_SECRET: z
    .string()
    .min(32, "KEYREN_LICENSE_HMAC_SECRET must be at least 32 characters"),

  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),

  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  RATE_LIMIT_VERIFY_PER_MINUTE: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_VERIFY_PER_PRODUCT_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(600),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    // Report which variables are wrong, never their values — this message
    // reaches logs and, during `next build`, the terminal.
    const names = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter((name, index, all) => all.indexOf(name) === index)
      .join(", ");
    throw new Error(`Invalid environment configuration. Check: ${names}`);
  }

  return result.data;
}

export const env: Env = parseEnv(process.env);
```

Note `parseEnv` is exported separately from `env` so tests can exercise validation without needing a valid ambient environment.

- [x] **Step 4: Run the tests**

```bash
npx vitest run tests/env.test.ts
```
Expected: 5 passed.

> If importing `@/env` in the test triggers the module-level `parseEnv(process.env)` and throws, add a `tests/setup.ts` that sets the four required vars and register it via `test.setupFiles` in `vitest.config.ts`. Do not weaken the schema to make the test pass.

- [x] **Step 5: Create `.env.example`**

```bash
# --- Database -------------------------------------------------------------
# Any Postgres connection string (Neon, Supabase, Vercel Postgres, local).
DATABASE_URL="postgres://user:password@host:5432/keyren"

# --- Keyren secrets -------------------------------------------------------
# Used to derive license lookup hashes and device fingerprint hashes.
# Generate with: openssl rand -hex 32
# NEVER ship this to a client. Rotating it invalidates every existing license.
KEYREN_LICENSE_HMAC_SECRET=""

# --- Clerk (developer dashboard authentication) ---------------------------
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
CLERK_SECRET_KEY=""

# --- Deployment -----------------------------------------------------------
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# --- Rate limiting --------------------------------------------------------
RATE_LIMIT_VERIFY_PER_MINUTE="60"
RATE_LIMIT_VERIFY_PER_PRODUCT_PER_MINUTE="600"
```

- [x] **Step 6: Confirm `.gitignore` covers secrets**

The create-next-app template ships a blanket `.env*` rule, which also matches `.env.example` and would silently drop it from the commit. Add a negation immediately after it:

```
.env*
!.env.example
```

Verify both halves actually behave:

```bash
git check-ignore -v .env .env.local   # must report both as ignored
git ls-files | grep '^\.env\.example' # must print .env.example
```

- [x] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: fail-fast environment validation"
```

---

## Phase 1 — Cryptographic core (TDD)

This phase has no database and no framework. It is pure functions, so the tests are fast and total.

### Task 4: Unbiased random string generation

**Files:**
- Create: `src/lib/crypto/random.ts`
- Create: `tests/crypto/random.test.ts`

- [x] **Step 1: Write the failing test**

`tests/crypto/random.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CROCKFORD_ALPHABET, randomAlphabetString } from "@/lib/crypto/random";

describe("CROCKFORD_ALPHABET", () => {
  // This is a security invariant, not a style preference. 256 % 32 === 0,
  // so `byte % 32` is uniform. Any other length introduces modulo bias.
  it("is exactly 32 symbols so byte %% 32 is unbiased", () => {
    expect(CROCKFORD_ALPHABET).toHaveLength(32);
    expect(256 % CROCKFORD_ALPHABET.length).toBe(0);
  });

  it("excludes the ambiguous glyphs I, L, O and U", () => {
    for (const ambiguous of ["I", "L", "O", "U"]) {
      expect(CROCKFORD_ALPHABET).not.toContain(ambiguous);
    }
  });

  it("has no duplicate symbols", () => {
    expect(new Set(CROCKFORD_ALPHABET).size).toBe(CROCKFORD_ALPHABET.length);
  });
});

describe("randomAlphabetString", () => {
  it("returns the requested length", () => {
    expect(randomAlphabetString(32)).toHaveLength(32);
  });

  it("only emits symbols from the alphabet", () => {
    for (const char of randomAlphabetString(512)) {
      expect(CROCKFORD_ALPHABET).toContain(char);
    }
  });

  it("does not repeat across calls", () => {
    const seen = new Set(Array.from({ length: 500 }, () => randomAlphabetString(32)));
    expect(seen.size).toBe(500);
  });

  it("distributes symbols roughly uniformly", () => {
    // 32k samples over 32 symbols => ~1000 each. A biased implementation
    // (for example one using `%` over a 36-symbol alphabet) fails this.
    const counts = new Map<string, number>();
    for (const char of randomAlphabetString(32_000)) {
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    expect(counts.size).toBe(32);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(800);
      expect(count).toBeLessThan(1200);
    }
  });

  it("rejects a non-positive length", () => {
    expect(() => randomAlphabetString(0)).toThrow();
    expect(() => randomAlphabetString(-1)).toThrow();
  });
});
```

- [x] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/crypto/random.test.ts
```
Expected: FAIL — cannot resolve `@/lib/crypto/random`.

- [x] **Step 3: Implement `src/lib/crypto/random.ts`**

```ts
import { randomBytes } from "node:crypto";

/**
 * Crockford Base32. Deliberately 32 symbols long, and deliberately without
 * I, L, O or U — the first three are visually ambiguous when a human reads a
 * license key off a screen, and excluding U avoids accidental profanity.
 *
 * The length is load-bearing: 256 is an exact multiple of 32, so reducing a
 * uniform random byte with `% 32` stays uniform. Changing this string's
 * length would silently introduce modulo bias, which is why a test asserts it.
 */
export const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function randomAlphabetString(length: number): string {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error("randomAlphabetString: length must be a positive integer");
  }

  const bytes = randomBytes(length);
  let out = "";

  for (let i = 0; i < length; i += 1) {
    // Non-null assertion is unnecessary: randomBytes(length) guarantees
    // `length` bytes, and we index strictly below it.
    const byte = bytes[i] as number;
    out += CROCKFORD_ALPHABET[byte % CROCKFORD_ALPHABET.length];
  }

  return out;
}
```

- [x] **Step 4: Run the tests**

```bash
npx vitest run tests/crypto/random.test.ts
```
Expected: 8 passed.

- [x] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: unbiased Crockford Base32 random generator"
```

---

### Task 5: Immutable resource IDs

**Files:**
- Create: `src/lib/crypto/ids.ts`
- Create: `tests/crypto/ids.test.ts`

- [x] **Step 1: Write the failing test**

`tests/crypto/ids.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateLicenseId, generateProductId } from "@/lib/crypto/ids";

describe("generateProductId", () => {
  it("is prefixed and 26 random symbols long", () => {
    const id = generateProductId();
    expect(id).toMatch(/^prod_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("carries at least 128 bits of entropy", () => {
    // 26 symbols from a 32-symbol alphabet = 26 * 5 = 130 bits.
    const random = generateProductId().slice("prod_".length);
    expect(random.length * 5).toBeGreaterThanOrEqual(128);
  });

  it("is not sequential or guessable across calls", () => {
    const ids = Array.from({ length: 1000 }, generateProductId);
    expect(new Set(ids).size).toBe(1000);
  });
});

describe("generateLicenseId", () => {
  it("is prefixed and 26 random symbols long", () => {
    expect(generateLicenseId()).toMatch(/^lic_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("is distinct from product ids", () => {
    expect(generateLicenseId().startsWith("lic_")).toBe(true);
    expect(generateProductId().startsWith("prod_")).toBe(true);
  });
});
```

- [x] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/crypto/ids.test.ts
```
Expected: FAIL — cannot resolve `@/lib/crypto/ids`.

- [x] **Step 3: Implement `src/lib/crypto/ids.ts`**

```ts
import { randomAlphabetString } from "./random";

/**
 * 26 Crockford symbols = 130 bits of entropy, comfortably above the 128-bit
 * floor. These IDs are immutable for the lifetime of the resource: renaming a
 * product must never change its ID, because customer software has it compiled
 * in. Nothing here derives from the name, the slug, a timestamp, or a counter.
 */
const ID_RANDOM_LENGTH = 26;

export function generateProductId(): string {
  return `prod_${randomAlphabetString(ID_RANDOM_LENGTH)}`;
}

export function generateLicenseId(): string {
  return `lic_${randomAlphabetString(ID_RANDOM_LENGTH)}`;
}
```

- [x] **Step 4: Run the tests**

```bash
npx vitest run tests/crypto/ids.test.ts
```
Expected: 5 passed.

- [x] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: immutable prod_/lic_ resource identifiers"
```

---
### Task 6: License key generation, normalization and hashing

This is the security centre of the product. Take the time.

**Files:**
- Create: `src/lib/crypto/license-key.ts`
- Create: `tests/crypto/license-key.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/crypto/license-key.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  LICENSE_KEY_PATTERN,
  generateLicenseKey,
  hashLicenseKey,
  keyHashesEqual,
  licenseKeyLast4,
  maskedLicenseKey,
  normalizeLicenseKey,
} from "@/lib/crypto/license-key";

const SECRET = "test-secret-that-is-long-enough-for-the-schema";

describe("generateLicenseKey", () => {
  it("matches the KEYREN-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX format", () => {
    expect(generateLicenseKey()).toMatch(LICENSE_KEY_PATTERN);
  });

  it("carries 160 bits of entropy across four 8-character groups", () => {
    const groups = generateLicenseKey().split("-").slice(1);
    expect(groups).toHaveLength(4);
    for (const group of groups) expect(group).toHaveLength(8);
    expect(groups.join("").length * 5).toBe(160);
  });

  it("never repeats", () => {
    const keys = Array.from({ length: 2000 }, generateLicenseKey);
    expect(new Set(keys).size).toBe(2000);
  });
});

describe("normalizeLicenseKey", () => {
  it("uppercases and strips surrounding whitespace", () => {
    const key = generateLicenseKey();
    expect(normalizeLicenseKey(`  ${key.toLowerCase()}  `)).toBe(key);
  });

  it("strips internal whitespace introduced by copy and paste", () => {
    const key = generateLicenseKey();
    const mangled = key.replace(/-/g, " - ");
    expect(normalizeLicenseKey(mangled)).toBe(key);
  });

  it("maps Crockford-ambiguous glyphs onto their canonical digits", () => {
    // A user reading a key off a screen may type O for 0 or I/L for 1.
    // Those glyphs are not in the alphabet, so folding them is unambiguous.
    expect(normalizeLicenseKey("KEYREN-OOOOOOOO-IIIIIIII-LLLLLLLL-00000000")).toBe(
      "KEYREN-00000000-11111111-11111111-00000000",
    );
  });

  it("leaves an already-canonical key untouched", () => {
    const key = generateLicenseKey();
    expect(normalizeLicenseKey(normalizeLicenseKey(key))).toBe(key);
  });
});

describe("hashLicenseKey", () => {
  it("returns a 64-character hex digest", () => {
    expect(hashLicenseKey(generateLicenseKey(), SECRET)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same key and secret", () => {
    const key = generateLicenseKey();
    expect(hashLicenseKey(key, SECRET)).toBe(hashLicenseKey(key, SECRET));
  });

  it("normalizes before hashing, so casing does not change the hash", () => {
    const key = generateLicenseKey();
    expect(hashLicenseKey(key.toLowerCase(), SECRET)).toBe(
      hashLicenseKey(key, SECRET),
    );
  });

  it("produces different digests under different secrets", () => {
    const key = generateLicenseKey();
    expect(hashLicenseKey(key, SECRET)).not.toBe(hashLicenseKey(key, "other-secret"));
  });

  it("produces different digests for different keys", () => {
    expect(hashLicenseKey(generateLicenseKey(), SECRET)).not.toBe(
      hashLicenseKey(generateLicenseKey(), SECRET),
    );
  });

  it("is domain-separated from device hashing", async () => {
    // A value must never be simultaneously valid as a license and a device.
    const { hashDeviceId } = await import("@/lib/crypto/device");
    const shared = "SOME-SHARED-VALUE";
    expect(hashLicenseKey(shared, SECRET)).not.toBe(hashDeviceId(shared, SECRET));
  });
});

describe("keyHashesEqual", () => {
  it("accepts identical digests", () => {
    const hash = hashLicenseKey(generateLicenseKey(), SECRET);
    expect(keyHashesEqual(hash, hash)).toBe(true);
  });

  it("rejects different digests", () => {
    expect(
      keyHashesEqual(
        hashLicenseKey(generateLicenseKey(), SECRET),
        hashLicenseKey(generateLicenseKey(), SECRET),
      ),
    ).toBe(false);
  });

  it("rejects mismatched lengths without throwing", () => {
    // timingSafeEqual throws on length mismatch; the wrapper must not.
    expect(keyHashesEqual("abc", "abcdef")).toBe(false);
  });
});

describe("licenseKeyLast4 and maskedLicenseKey", () => {
  it("captures the final four characters", () => {
    expect(licenseKeyLast4("KEYREN-ABCDEFGH-ABCDEFGH-ABCDEFGH-ABCDWXYZ")).toBe("WXYZ");
  });

  it("renders a masked reference that reveals only the suffix", () => {
    const masked = maskedLicenseKey("WXYZ");
    expect(masked).toContain("WXYZ");
    expect(masked).toContain("KEYREN");
    expect(masked).not.toMatch(/[A-HJ-NP-TV-Z0-9]{8}/);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/crypto/license-key.test.ts
```
Expected: FAIL — cannot resolve `@/lib/crypto/license-key`.

- [ ] **Step 3: Implement `src/lib/crypto/license-key.ts`**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { randomAlphabetString } from "./random";

const PREFIX = "KEYREN";
const GROUP_COUNT = 4;
const GROUP_LENGTH = 8;

/** 4 groups x 8 symbols x 5 bits per Crockford symbol = 160 bits. */
export const LICENSE_KEY_ENTROPY_BITS = GROUP_COUNT * GROUP_LENGTH * 5;

export const LICENSE_KEY_PATTERN =
  /^KEYREN-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{8}$/;

/**
 * Generates a license key with 160 bits of entropy from the OS CSPRNG.
 *
 * Explicitly NOT derived from Math.random, a timestamp, a counter, or a
 * truncated UUID — a truncated UUIDv4 would give only 122 bits before
 * truncation and fewer after.
 */
export function generateLicenseKey(): string {
  const groups = Array.from({ length: GROUP_COUNT }, () =>
    randomAlphabetString(GROUP_LENGTH),
  );
  return [PREFIX, ...groups].join("-");
}

/**
 * Canonicalises a key the way a human might mistype it.
 *
 * Crockford Base32 excludes I, L, O and U from the alphabet, which means
 * folding I and L to 1 and O to 0 can never collide with a real symbol.
 * Whitespace anywhere is dropped so pasted keys with stray spaces or
 * newlines still verify.
 */
export function normalizeLicenseKey(input: string): string {
  return input
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
}

/**
 * Derives the value stored in `licenses.key_hash`.
 *
 * A keyed construction (HMAC) rather than a bare SHA-256: the key space is
 * large enough that brute force is infeasible either way, but a bare digest
 * would let anyone holding a database dump verify guesses offline. Without
 * the server secret, an HMAC dump is inert.
 *
 * The "license:" prefix domain-separates this from device fingerprint
 * hashing, which uses the same secret.
 */
export function hashLicenseKey(licenseKey: string, secret: string): string {
  const normalized = normalizeLicenseKey(licenseKey);
  return createHmac("sha256", secret).update(`license:${normalized}`).digest("hex");
}

/**
 * Constant-time digest comparison. The primary lookup is an indexed equality
 * match in Postgres; this is a defense-in-depth re-check on the row that came
 * back, so a future refactor that loosens the query cannot turn into a
 * timing-observable comparison.
 */
export function keyHashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * The last four characters, captured at creation time so the dashboard has a
 * stable non-secret reference for a key it can never show again. Four symbols
 * of a 160-bit key leak 20 bits, which does not meaningfully assist guessing.
 */
export function licenseKeyLast4(licenseKey: string): string {
  return normalizeLicenseKey(licenseKey).slice(-4);
}

export function maskedLicenseKey(last4: string): string {
  return `${PREFIX}-••••-••••-••••-••••${last4}`;
}
```

- [ ] **Step 4: Run the tests**

They will still fail on the domain-separation case until Task 7 exists. Run the rest:

```bash
npx vitest run tests/crypto/license-key.test.ts -t "generateLicenseKey"
npx vitest run tests/crypto/license-key.test.ts -t "normalizeLicenseKey"
npx vitest run tests/crypto/license-key.test.ts -t "keyHashesEqual"
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: license key generation, normalization and HMAC hashing"
```

---

### Task 7: Device fingerprint hashing

**Files:**
- Create: `src/lib/crypto/device.ts`
- Create: `tests/crypto/device.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/crypto/device.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashDeviceId } from "@/lib/crypto/device";

const SECRET = "test-secret-that-is-long-enough-for-the-schema";

describe("hashDeviceId", () => {
  it("returns a 64-character hex digest", () => {
    expect(hashDeviceId("device-abc", SECRET)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(hashDeviceId("device-abc", SECRET)).toBe(hashDeviceId("device-abc", SECRET));
  });

  it("distinguishes different devices", () => {
    expect(hashDeviceId("device-a", SECRET)).not.toBe(hashDeviceId("device-b", SECRET));
  });

  it("trims incidental whitespace but preserves case", () => {
    // Fingerprints are opaque client-supplied tokens; case can be meaningful,
    // so unlike license keys they are not uppercased.
    expect(hashDeviceId("  Device-A  ", SECRET)).toBe(hashDeviceId("Device-A", SECRET));
    expect(hashDeviceId("device-a", SECRET)).not.toBe(hashDeviceId("DEVICE-A", SECRET));
  });

  it("depends on the secret", () => {
    expect(hashDeviceId("device-abc", SECRET)).not.toBe(hashDeviceId("device-abc", "other"));
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/crypto/device.test.ts
```
Expected: FAIL — cannot resolve `@/lib/crypto/device`.

- [ ] **Step 3: Implement `src/lib/crypto/device.ts`**

```ts
import { createHmac } from "node:crypto";

/**
 * Hashes a client-supplied device fingerprint for storage.
 *
 * Two things this deliberately does NOT claim:
 *
 * 1. That the fingerprint is unspoofable. It arrives from an untrusted client
 *    and can be forged by anyone willing to reverse engineer the integration.
 *    It is an identifier that raises the cost of casual key sharing — not a
 *    hardware security primitive.
 * 2. That hashing here protects a low-entropy input from brute force. It does
 *    not; an attacker who can guess the fingerprint can compute nothing
 *    without the secret, but the point of hashing is that Keyren never needs
 *    to hold the raw value at rest.
 *
 * Domain-separated from license key hashing via the "device:" prefix.
 */
export function hashDeviceId(deviceId: string, secret: string): string {
  return createHmac("sha256", secret).update(`device:${deviceId.trim()}`).digest("hex");
}
```

- [ ] **Step 4: Run the full crypto suite**

```bash
npx vitest run tests/crypto
```
Expected: all crypto tests pass, including the domain-separation case in `license-key.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: domain-separated device fingerprint hashing"
```

---

### Task 8: Error taxonomy and log masking

**Files:**
- Create: `src/lib/errors.ts`
- Create: `src/lib/log.ts`
- Create: `tests/errors.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  VERIFICATION_ERROR_STATUS,
  VERIFICATION_ERROR_MESSAGE,
  type VerificationErrorCode,
} from "@/lib/errors";
import { maskLicenseKey } from "@/lib/log";

const ALL_CODES: VerificationErrorCode[] = [
  "BAD_REQUEST",
  "PRODUCT_INVALID",
  "LICENSE_INVALID",
  "LICENSE_REVOKED",
  "LICENSE_EXPIRED",
  "DEVICE_MISMATCH",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
];

describe("verification error taxonomy", () => {
  it("maps every code to an HTTP status", () => {
    for (const code of ALL_CODES) {
      expect(VERIFICATION_ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });

  it("uses conventional statuses", () => {
    expect(VERIFICATION_ERROR_STATUS.BAD_REQUEST).toBe(400);
    expect(VERIFICATION_ERROR_STATUS.PRODUCT_INVALID).toBe(404);
    expect(VERIFICATION_ERROR_STATUS.LICENSE_INVALID).toBe(403);
    expect(VERIFICATION_ERROR_STATUS.LICENSE_REVOKED).toBe(403);
    expect(VERIFICATION_ERROR_STATUS.LICENSE_EXPIRED).toBe(403);
    expect(VERIFICATION_ERROR_STATUS.DEVICE_MISMATCH).toBe(403);
    expect(VERIFICATION_ERROR_STATUS.RATE_LIMITED).toBe(429);
    expect(VERIFICATION_ERROR_STATUS.INTERNAL_ERROR).toBe(500);
  });

  it("gives every code a message free of internal detail", () => {
    for (const code of ALL_CODES) {
      const message = VERIFICATION_ERROR_MESSAGE[code];
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toMatch(/select |from |table|column|postgres|stack/i);
    }
  });
});

describe("maskLicenseKey", () => {
  it("hides everything but the final four characters", () => {
    const masked = maskLicenseKey("KEYREN-ABCDEFGH-ABCDEFGH-ABCDEFGH-ABCDWXYZ");
    expect(masked).toBe("KEYREN-****-****-****-****WXYZ");
    expect(masked).not.toContain("ABCDEFGH");
  });

  it("fully redacts a value too short to mask safely", () => {
    expect(maskLicenseKey("abc")).toBe("[redacted]");
  });

  it("fully redacts an empty value", () => {
    expect(maskLicenseKey("")).toBe("[redacted]");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/errors.test.ts
```
Expected: FAIL — cannot resolve `@/lib/errors`.

- [ ] **Step 3: Implement `src/lib/errors.ts`**

```ts
/**
 * The complete set of codes the public verification API may return.
 *
 * `BAD_REQUEST` extends the set named in the specification, which lists a
 * minimum ("including"); a malformed body needs a distinct code so an
 * integrating developer can tell a client bug from a rejected license.
 */
export type VerificationErrorCode =
  | "BAD_REQUEST"
  | "PRODUCT_INVALID"
  | "LICENSE_INVALID"
  | "LICENSE_REVOKED"
  | "LICENSE_EXPIRED"
  | "DEVICE_MISMATCH"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

/**
 * 400 the request was malformed, 404 the product does not exist, 403 the
 * request was well-formed but the license was rejected, 429 throttled,
 * 500 Keyren failed.
 */
export const VERIFICATION_ERROR_STATUS: Record<VerificationErrorCode, number> = {
  BAD_REQUEST: 400,
  PRODUCT_INVALID: 404,
  LICENSE_INVALID: 403,
  LICENSE_REVOKED: 403,
  LICENSE_EXPIRED: 403,
  DEVICE_MISMATCH: 403,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/**
 * Fixed, public-safe messages. These are the only prose that ever leaves the
 * verification endpoint — no exception text, no SQL, no column names, no IDs.
 */
export const VERIFICATION_ERROR_MESSAGE: Record<VerificationErrorCode, string> = {
  BAD_REQUEST: "The request body was malformed.",
  PRODUCT_INVALID: "The provided product is invalid.",
  LICENSE_INVALID: "The provided license is invalid.",
  LICENSE_REVOKED: "This license has been revoked.",
  LICENSE_EXPIRED: "This license has expired.",
  DEVICE_MISMATCH: "This license is already active on another device.",
  RATE_LIMITED: "Too many requests. Try again shortly.",
  INTERNAL_ERROR: "An unexpected error occurred.",
};

/** Errors raised by dashboard services, distinct from the public API codes. */
export type DashboardErrorCode = "NOT_FOUND" | "INVALID_INPUT" | "CONFLICT";

export class KeyrenError extends Error {
  constructor(
    readonly code: DashboardErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "KeyrenError";
  }
}

/**
 * Returned when a resource is absent OR owned by someone else. Collapsing
 * those two cases into one is intentional: distinguishing them would let a
 * developer probe for the existence of another developer's resources.
 */
export function notFound(resource: string): KeyrenError {
  return new KeyrenError("NOT_FOUND", `${resource} not found.`);
}
```

- [ ] **Step 4: Implement `src/lib/log.ts`**

```ts
/**
 * Masks a license key for logging. Raw keys must never reach logs, analytics,
 * error traces, or audit records — a log aggregator is a far softer target
 * than the database, and the database does not hold plaintext at all.
 */
export function maskLicenseKey(licenseKey: string): string {
  if (licenseKey.length < 8) return "[redacted]";
  return `KEYREN-****-****-****-****${licenseKey.slice(-4)}`;
}
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run tests/errors.test.ts
```
Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: verification error taxonomy and log masking"
```

---
## Phase 2 — Persistence

### Task 9: Database schema

**Files:**
- Create: `src/db/schema/products.ts`, `src/db/schema/licenses.ts`, `src/db/schema/activations.ts`, `src/db/schema/rate-limits.ts`, `src/db/schema/index.ts`
- Modify: `src/lib/crypto/ids.ts` (add `generateActivationId`)
- Modify: `tests/crypto/ids.test.ts` (cover it)

- [ ] **Step 1: Add `generateActivationId` to `src/lib/crypto/ids.ts`**

Append to the existing file:

```ts
export function generateActivationId(): string {
  return `act_${randomAlphabetString(ID_RANDOM_LENGTH)}`;
}
```

And append this block to `tests/crypto/ids.test.ts`:

```ts
describe("generateActivationId", () => {
  it("is prefixed and 26 random symbols long", () => {
    expect(generateActivationId()).toMatch(/^act_[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
```

Update that file's import to `import { generateActivationId, generateLicenseId, generateProductId } from "@/lib/crypto/ids";` and confirm:

```bash
npx vitest run tests/crypto/ids.test.ts
```
Expected: 6 passed.

- [ ] **Step 2: Create `src/db/schema/products.ts`**

```ts
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const products = pgTable(
  "products",
  {
    /** Immutable `prod_...` identifier. Never derived from name or slug, and
     *  never changed by a rename — customer software has it compiled in. */
    id: text("id").primaryKey(),

    /** Clerk user ID. Always read from a server-side `auth()` call, never
     *  from the browser. Every ownership check keys off this column. */
    ownerId: text("owner_id").notNull(),

    name: text("name").notNull(),

    /** Human readability only. Not unique, not an identifier. */
    slug: text("slug").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Every dashboard product query filters by owner and orders by creation.
    index("products_owner_created_idx").on(table.ownerId, table.createdAt),
  ],
);

export type ProductRow = typeof products.$inferSelect;
export type NewProductRow = typeof products.$inferInsert;
```

- [ ] **Step 3: Create `src/db/schema/licenses.ts`**

```ts
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { products } from "./products";

/** Alpha_v1 supports exactly these two states. Revoking is reversible and
 *  never destroys the record. */
export const licenseStatus = pgEnum("license_status", ["active", "revoked"]);

export const licenses = pgTable(
  "licenses",
  {
    id: text("id").primaryKey(),

    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),

    /** HMAC-SHA256(server_secret, "license:" + normalized_key), hex.
     *  The plaintext key is never stored anywhere. */
    keyHash: text("key_hash").notNull(),

    /** Final four characters, captured at creation so the dashboard has a
     *  stable non-secret way to refer to a key it can never redisplay. */
    keyLast4: text("key_last4").notNull(),

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
    // Globally unique: a collision would let one product's key authenticate
    // against another. At 160 bits this will never fire, which is the point —
    // it is a tripwire, not a routine constraint.
    uniqueIndex("licenses_key_hash_unique").on(table.keyHash),

    // THE verification path index. The hot query is
    //   WHERE product_id = $1 AND key_hash = $2
    // and this covers it exactly, so verification stays an index lookup
    // rather than a scan as the table grows.
    index("licenses_product_key_hash_idx").on(table.productId, table.keyHash),

    // Dashboard listing: licenses for one product, newest first.
    index("licenses_product_created_idx").on(table.productId, table.createdAt),
  ],
);

export type LicenseRow = typeof licenses.$inferSelect;
export type NewLicenseRow = typeof licenses.$inferInsert;
export type LicenseStatus = (typeof licenseStatus.enumValues)[number];
```

- [ ] **Step 4: Create `src/db/schema/activations.ts`**

```ts
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
    // Alpha_v1 allows at most one device binding per license, and this
    // constraint — not application code — is what enforces it. A future
    // release supporting multiple devices drops this index; nothing else in
    // the schema has to change.
    uniqueIndex("activations_license_unique").on(table.licenseId),
  ],
);

export type ActivationRow = typeof activations.$inferSelect;
```

- [ ] **Step 5: Create `src/db/schema/rate-limits.ts`**

```ts
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Fixed-window counters for the public verification endpoint.
 *
 * Postgres rather than Redis: Alpha_v1 does not justify another piece of
 * infrastructure, and a serverless deployment cannot rely on in-process
 * memory because each instance would keep its own counter. This table is
 * hidden behind the RateLimiter interface so it can be replaced without the
 * verification path noticing.
 */
export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    /** "<dimension>:<value>:<window_epoch_minute>" */
    bucketKey: text("bucket_key").primaryKey(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    // Supports cheap deletion of expired windows.
    index("rate_limit_window_idx").on(table.windowStart),
  ],
);
```

- [ ] **Step 6: Create `src/db/schema/index.ts`**

```ts
export * from "./products";
export * from "./licenses";
export * from "./activations";
export * from "./rate-limits";
```

- [ ] **Step 7: Create `drizzle.config.ts` and generate the migration**

```ts
import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/keyren",
  },
  strict: true,
  verbose: true,
});
```

```bash
npm run db:generate
```
Expected: a `drizzle/0000_*.sql` file plus `drizzle/meta/`. Open the SQL and confirm it contains `CREATE TABLE "products"`, `"licenses"`, `"activations"`, `"rate_limit_counters"`, the `license_status` enum, both foreign keys, and the three unique indexes.

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck && git add -A && git commit -m "feat: database schema for products, licenses, activations, rate limits"
```

---

### Task 10: Database client and the portable `Database` type

**Files:**
- Create: `src/db/types.ts`, `src/db/index.ts`

- [ ] **Step 1: Create `src/db/types.ts`**

Services must accept both the production postgres.js client and the PGlite client used in tests, so they are written against a driver-agnostic type.

```ts
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
```

> If `npm run typecheck` rejects assigning the concrete drizzle instances to this type, the fallback is `export type Database = PgliteDatabase<typeof schema>` (both drivers are structurally compatible across the select/insert/update/delete/transaction surface this codebase uses) with a single `as unknown as Database` cast at each client construction site. Take the fallback only if the base-class form genuinely does not compile — do not scatter casts through the services.

- [ ] **Step 2: Create `src/db/index.ts`**

```ts
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
```

- [ ] **Step 3: Typecheck and commit**

```bash
npm run typecheck && git add -A && git commit -m "feat: driver-agnostic database client"
```

---

### Task 11: PGlite test harness

**Files:**
- Create: `tests/helpers/db.ts`, `tests/helpers/factories.ts`
- Create: `tests/helpers/db.test.ts`

- [ ] **Step 1: Create `tests/helpers/db.ts`**

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Database } from "@/db/types";

/**
 * A real Postgres, compiled to WASM, held in memory.
 *
 * This runs the actual migrations against the actual engine, so foreign keys,
 * unique indexes and enum constraints are all genuinely exercised — a mocked
 * repository would let a broken constraint pass silently. It needs no Docker,
 * no local Postgres, and no network.
 */
export async function createTestDatabase(): Promise<{
  db: Database;
  close: () => Promise<void>;
}> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Database;

  await migrate(db as never, { migrationsFolder: "./drizzle" });

  return {
    db,
    close: async () => {
      await client.close();
    },
  };
}

/** Wipes all rows between tests without paying to rebuild the schema. */
export async function truncateAll(db: Database): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE activations, licenses, products, rate_limit_counters RESTART IDENTITY CASCADE`,
  );
}

/** The secret used by every test. Never a real one. */
export const TEST_HMAC_SECRET = "test-hmac-secret-value-at-least-32-chars-long";
```

- [ ] **Step 2: Write a test proving the harness works**

`tests/helpers/db.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDatabase } from "./db";
import type { Database } from "@/db/types";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});
afterAll(async () => {
  await close();
});

describe("PGlite harness", () => {
  it("creates every table from the real migrations", async () => {
    const result = await db.execute<{ table_name: string }>(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = [...result].map((row) => row.table_name);
    for (const table of ["products", "licenses", "activations", "rate_limit_counters"]) {
      expect(names).toContain(table);
    }
  });

  it("enforces the foreign key from licenses to products", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO licenses (id, product_id, key_hash, key_last4)
            VALUES ('lic_x', 'prod_does_not_exist', 'hash', 'WXYZ')`,
      ),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run it**

```bash
npx vitest run tests/helpers/db.test.ts
```
Expected: 2 passed.

> `db.execute` returns a driver-shaped result. If `[...result]` does not iterate under PGlite, use `result.rows` instead and adjust. Confirm against the actual returned shape rather than guessing.

- [ ] **Step 4: Create `tests/helpers/factories.ts`**

```ts
import { generateLicenseId, generateProductId } from "@/lib/crypto/ids";
import {
  generateLicenseKey,
  hashLicenseKey,
  licenseKeyLast4,
} from "@/lib/crypto/license-key";
import { licenses, products } from "@/db/schema";
import type { Database } from "@/db/types";
import { TEST_HMAC_SECRET } from "./db";

export const DEVELOPER_A = "user_developer_a";
export const DEVELOPER_B = "user_developer_b";

export async function makeProduct(
  db: Database,
  options: { ownerId?: string; name?: string } = {},
): Promise<{ id: string; ownerId: string; name: string }> {
  const id = generateProductId();
  const ownerId = options.ownerId ?? DEVELOPER_A;
  const name = options.name ?? "Test Product";

  await db.insert(products).values({ id, ownerId, name, slug: "test_product" });

  return { id, ownerId, name };
}

export async function makeLicense(
  db: Database,
  options: {
    productId: string;
    hwidLocked?: boolean;
    expiresAt?: Date | null;
    status?: "active" | "revoked";
  },
): Promise<{ id: string; plaintextKey: string }> {
  const id = generateLicenseId();
  const plaintextKey = generateLicenseKey();

  await db.insert(licenses).values({
    id,
    productId: options.productId,
    keyHash: hashLicenseKey(plaintextKey, TEST_HMAC_SECRET),
    keyLast4: licenseKeyLast4(plaintextKey),
    hwidLocked: options.hwidLocked ?? true,
    expiresAt: options.expiresAt ?? null,
    status: options.status ?? "active",
    ...(options.status === "revoked" ? { revokedAt: new Date() } : {}),
  });

  return { id, plaintextKey };
}
```

- [ ] **Step 5: Commit**

```bash
npx vitest run && git add -A && git commit -m "test: PGlite harness and fixtures"
```

---
## Phase 3 — Products

### Task 12: Slug generation

**Files:**
- Create: `src/lib/products/slug.ts`
- Create: `tests/products/slug.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/products/slug.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/products/slug";

describe("slugify", () => {
  it("lowercases and underscore-joins words", () => {
    expect(slugify("Seliware Key")).toBe("seliware_key");
  });

  it("collapses runs of whitespace", () => {
    expect(slugify("My   Cool    App")).toBe("my_cool_app");
  });

  it("drops punctuation", () => {
    expect(slugify("Acme's App (v2)!")).toBe("acmes_app_v2");
  });

  it("strips leading and trailing separators", () => {
    expect(slugify("  --Hello--  ")).toBe("hello");
  });

  it("keeps digits", () => {
    expect(slugify("Product 42")).toBe("product_42");
  });

  it("transliterates accented characters", () => {
    expect(slugify("Café Ünïcode")).toBe("cafe_unicode");
  });

  it("falls back when the name has no usable characters", () => {
    // Slugs are cosmetic, so an unusable name must not block product
    // creation. The immutable prod_ ID is the real identifier.
    expect(slugify("日本語")).toBe("product");
    expect(slugify("!!!")).toBe("product");
    expect(slugify("")).toBe("product");
  });

  it("truncates very long names without a trailing separator", () => {
    const slug = slugify("a".repeat(200));
    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug.endsWith("_")).toBe(false);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/products/slug.test.ts
```
Expected: FAIL — cannot resolve `@/lib/products/slug`.

- [ ] **Step 3: Implement `src/lib/products/slug.ts`**

```ts
const MAX_SLUG_LENGTH = 64;

/**
 * Derives a human-readable slug from a product name.
 *
 * Purely cosmetic. Slugs are not unique, are not used for lookup, and are not
 * an identity — duplicate product names are explicitly allowed. The immutable
 * `prod_` ID is the only authoritative identifier, which is why this function
 * can afford to be lossy and can always fall back to "product".
 */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    // Strip combining marks left behind by NFKD, so "é" becomes "e".
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/_+$/g, "");

  return slug.length > 0 ? slug : "product";
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/products/slug.test.ts
```
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: product slug generation"
```

---

### Task 13: Product service with ownership enforced in SQL

**Files:**
- Create: `src/lib/products/service.ts`
- Create: `tests/products/service.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/products/service.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, truncateAll } from "../helpers/db";
import { DEVELOPER_A, DEVELOPER_B, makeLicense, makeProduct } from "../helpers/factories";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  renameProduct,
} from "@/lib/products/service";
import type { Database } from "@/db/types";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  await truncateAll(db);
});

describe("createProduct", () => {
  it("assigns an immutable prod_ id and a derived slug", async () => {
    const product = await createProduct(db, DEVELOPER_A, { name: "Seliware Key" });
    expect(product.id).toMatch(/^prod_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(product.slug).toBe("seliware_key");
    expect(product.name).toBe("Seliware Key");
  });

  it("allows duplicate names for the same developer", async () => {
    const first = await createProduct(db, DEVELOPER_A, { name: "Same Name" });
    const second = await createProduct(db, DEVELOPER_A, { name: "Same Name" });
    expect(first.id).not.toBe(second.id);
    expect(first.slug).toBe(second.slug);
  });
});

describe("listProducts", () => {
  it("returns only the calling developer's products", async () => {
    await makeProduct(db, { ownerId: DEVELOPER_A, name: "A one" });
    await makeProduct(db, { ownerId: DEVELOPER_A, name: "A two" });
    await makeProduct(db, { ownerId: DEVELOPER_B, name: "B one" });

    const listed = await listProducts(db, DEVELOPER_A);
    expect(listed).toHaveLength(2);
    expect(listed.map((p) => p.name).sort()).toEqual(["A one", "A two"]);
  });

  it("includes a license count per product", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, { productId: product.id });
    await makeLicense(db, { productId: product.id });

    const [listed] = await listProducts(db, DEVELOPER_A);
    expect(listed?.licenseCount).toBe(2);
  });

  it("reports zero licenses for an empty product", async () => {
    await makeProduct(db, { ownerId: DEVELOPER_A });
    const [listed] = await listProducts(db, DEVELOPER_A);
    expect(listed?.licenseCount).toBe(0);
  });
});

describe("getProduct", () => {
  it("returns the developer's own product", async () => {
    const created = await makeProduct(db, { ownerId: DEVELOPER_A });
    const found = await getProduct(db, DEVELOPER_A, created.id);
    expect(found?.id).toBe(created.id);
  });

  // Spec test #13: a developer cannot access another developer's product.
  it("returns null for another developer's product", async () => {
    const created = await makeProduct(db, { ownerId: DEVELOPER_B });
    expect(await getProduct(db, DEVELOPER_A, created.id)).toBeNull();
  });

  it("returns null for an id that does not exist", async () => {
    expect(await getProduct(db, DEVELOPER_A, "prod_NOPE")).toBeNull();
  });
});

describe("renameProduct", () => {
  it("updates name and slug but never the id", async () => {
    const created = await createProduct(db, DEVELOPER_A, { name: "Old Name" });
    const renamed = await renameProduct(db, DEVELOPER_A, created.id, "Brand New Name");
    expect(renamed.id).toBe(created.id);
    expect(renamed.name).toBe("Brand New Name");
    expect(renamed.slug).toBe("brand_new_name");
  });

  it("advances updatedAt", async () => {
    const created = await createProduct(db, DEVELOPER_A, { name: "Old" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const renamed = await renameProduct(db, DEVELOPER_A, created.id, "New");
    expect(renamed.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
  });

  it("refuses to rename another developer's product", async () => {
    const created = await makeProduct(db, { ownerId: DEVELOPER_B, name: "Theirs" });
    await expect(renameProduct(db, DEVELOPER_A, created.id, "Mine")).rejects.toThrow(
      /not found/i,
    );

    // And the row is genuinely untouched.
    const stillTheirs = await getProduct(db, DEVELOPER_B, created.id);
    expect(stillTheirs?.name).toBe("Theirs");
  });
});

describe("deleteProduct", () => {
  it("deletes the developer's own product", async () => {
    const created = await makeProduct(db, { ownerId: DEVELOPER_A });
    await deleteProduct(db, DEVELOPER_A, created.id);
    expect(await getProduct(db, DEVELOPER_A, created.id)).toBeNull();
  });

  it("cascades to the product's licenses", async () => {
    const created = await makeProduct(db, { ownerId: DEVELOPER_A });
    await makeLicense(db, { productId: created.id });
    await deleteProduct(db, DEVELOPER_A, created.id);

    const remaining = await db.query.licenses.findMany();
    expect(remaining).toHaveLength(0);
  });

  it("refuses to delete another developer's product", async () => {
    const created = await makeProduct(db, { ownerId: DEVELOPER_B });
    await expect(deleteProduct(db, DEVELOPER_A, created.id)).rejects.toThrow(/not found/i);
    expect(await getProduct(db, DEVELOPER_B, created.id)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/products/service.test.ts
```
Expected: FAIL — cannot resolve `@/lib/products/service`.

- [ ] **Step 3: Implement `src/lib/products/service.ts`**

```ts
import { and, count, desc, eq } from "drizzle-orm";
import { licenses, products } from "@/db/schema";
import type { Database } from "@/db/types";
import { generateProductId } from "@/lib/crypto/ids";
import { notFound } from "@/lib/errors";
import { slugify } from "./slug";

export type Product = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductListItem = Product & { licenseCount: number };

/**
 * Every function here takes `ownerId` as an explicit argument and folds it
 * into the WHERE clause. There is deliberately no "fetch then compare in
 * JavaScript" path: an ownership check that lives in the SQL cannot be
 * forgotten by a caller, and a mismatch returns "not found" rather than
 * "forbidden" so IDs cannot be probed for existence.
 *
 * `ownerId` always originates from a server-side Clerk `auth()` call. It is
 * never accepted from a request body, form field, or URL.
 */

export async function createProduct(
  db: Database,
  ownerId: string,
  input: { name: string },
): Promise<Product> {
  const now = new Date();
  const [row] = await db
    .insert(products)
    .values({
      id: generateProductId(),
      ownerId,
      name: input.name,
      slug: slugify(input.name),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) throw new Error("Failed to create product");
  return toProduct(row);
}

export async function listProducts(
  db: Database,
  ownerId: string,
): Promise<ProductListItem[]> {
  // A LEFT JOIN with GROUP BY rather than a query-per-product, so the
  // products page stays one round trip regardless of how many products exist.
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      licenseCount: count(licenses.id),
    })
    .from(products)
    .leftJoin(licenses, eq(licenses.productId, products.id))
    .where(eq(products.ownerId, ownerId))
    .groupBy(products.id)
    .orderBy(desc(products.createdAt));

  return rows.map((row) => ({ ...row, licenseCount: Number(row.licenseCount) }));
}

export async function getProduct(
  db: Database,
  ownerId: string,
  productId: string,
): Promise<Product | null> {
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.ownerId, ownerId)))
    .limit(1);

  return row ? toProduct(row) : null;
}

export async function renameProduct(
  db: Database,
  ownerId: string,
  productId: string,
  name: string,
): Promise<Product> {
  // Note that `id` is not in the SET clause. A rename must never change the
  // identifier customer software authenticates against.
  const [row] = await db
    .update(products)
    .set({ name, slug: slugify(name), updatedAt: new Date() })
    .where(and(eq(products.id, productId), eq(products.ownerId, ownerId)))
    .returning();

  if (!row) throw notFound("Product");
  return toProduct(row);
}

export async function deleteProduct(
  db: Database,
  ownerId: string,
  productId: string,
): Promise<void> {
  const deleted = await db
    .delete(products)
    .where(and(eq(products.id, productId), eq(products.ownerId, ownerId)))
    .returning({ id: products.id });

  // Zero rows means the product does not exist OR belongs to someone else.
  // Both produce the same error on purpose.
  if (deleted.length === 0) throw notFound("Product");
}

function toProduct(row: typeof products.$inferSelect): Product {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/products/service.test.ts
```
Expected: 13 passed.

> `db.query.licenses.findMany()` in the delete-cascade test requires the schema to be passed to `drizzle()`, which the harness does. If the relational API is unavailable, substitute `db.select().from(licenses)`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: product service with SQL-level ownership enforcement"
```

---
## Phase 4 — Licenses

### Task 14: Expiration normalization

**Files:**
- Create: `src/lib/licenses/expiration.ts`
- Create: `tests/licenses/expiration.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/licenses/expiration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DURATION_OPTIONS,
  isExpired,
  resolveExpiresAt,
  type ExpirationInput,
} from "@/lib/licenses/expiration";

const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("resolveExpiresAt", () => {
  it("normalizes permanent to null", () => {
    expect(resolveExpiresAt({ mode: "permanent" }, NOW)).toBeNull();
  });

  it("stores a fixed date as given", () => {
    const target = new Date("2027-06-15T12:30:00.000Z");
    expect(resolveExpiresAt({ mode: "date", expiresAt: target }, NOW)).toEqual(target);
  });

  it("converts a duration into an absolute timestamp from creation time", () => {
    const result = resolveExpiresAt({ mode: "duration", duration: "30d" }, NOW);
    expect(result?.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("supports every advertised duration option", () => {
    for (const option of DURATION_OPTIONS) {
      const result = resolveExpiresAt({ mode: "duration", duration: option.value }, NOW);
      expect(result).toBeInstanceOf(Date);
      expect(result!.getTime()).toBeGreaterThan(NOW.getTime());
    }
  });

  it("computes a year as 365 days from creation", () => {
    const result = resolveExpiresAt({ mode: "duration", duration: "365d" }, NOW);
    expect(result?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("rejects a fixed date in the past", () => {
    const past = new Date("2025-01-01T00:00:00.000Z");
    expect(() => resolveExpiresAt({ mode: "date", expiresAt: past }, NOW)).toThrow(
      /future/i,
    );
  });

  it("rejects an unknown duration", () => {
    const bad = { mode: "duration", duration: "99y" } as unknown as ExpirationInput;
    expect(() => resolveExpiresAt(bad, NOW)).toThrow(/duration/i);
  });
});

describe("isExpired", () => {
  it("treats null as permanent", () => {
    expect(isExpired(null, NOW)).toBe(false);
  });

  it("is false strictly before the deadline", () => {
    expect(isExpired(new Date("2026-01-01T00:00:01.000Z"), NOW)).toBe(false);
  });

  it("is true after the deadline", () => {
    expect(isExpired(new Date("2025-12-31T23:59:59.000Z"), NOW)).toBe(true);
  });

  it("treats the exact deadline instant as expired", () => {
    expect(isExpired(NOW, NOW)).toBe(true);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/licenses/expiration.test.ts
```
Expected: FAIL — cannot resolve `@/lib/licenses/expiration`.

- [ ] **Step 3: Implement `src/lib/licenses/expiration.ts`**

```ts
/**
 * Three developer-facing expiration modes collapse to one internal
 * representation: `expiresAt: Date | null`, always UTC.
 *
 * Keeping exactly one stored shape means the verification path has a single
 * comparison to make, with no mode-specific branching in the hot path.
 */

export const DURATION_OPTIONS = [
  { value: "1d", label: "1 day", days: 1 },
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "90d", label: "90 days", days: 90 },
  { value: "180d", label: "180 days", days: 180 },
  { value: "365d", label: "1 year", days: 365 },
] as const;

export type DurationValue = (typeof DURATION_OPTIONS)[number]["value"];

export type ExpirationInput =
  | { mode: "permanent" }
  | { mode: "date"; expiresAt: Date }
  | { mode: "duration"; duration: DurationValue };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function resolveExpiresAt(input: ExpirationInput, now: Date = new Date()): Date | null {
  switch (input.mode) {
    case "permanent":
      return null;

    case "date": {
      if (input.expiresAt.getTime() <= now.getTime()) {
        throw new Error("Expiration date must be in the future.");
      }
      return input.expiresAt;
    }

    case "duration": {
      const option = DURATION_OPTIONS.find((candidate) => candidate.value === input.duration);
      if (!option) throw new Error(`Unknown duration: ${String(input.duration)}`);

      // Alpha_v1 counts duration from creation, not from first activation.
      // Activation-anchored expiry needs a separate stored field and is
      // deliberately out of scope.
      return new Date(now.getTime() + option.days * MS_PER_DAY);
    }
  }
}

/** A license is expired at its deadline instant, not one millisecond after. */
export function isExpired(expiresAt: Date | null, now: Date = new Date()): boolean {
  if (expiresAt === null) return false;
  return expiresAt.getTime() <= now.getTime();
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/licenses/expiration.test.ts
```
Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: normalize three expiration modes to expiresAt"
```

---

### Task 15: License creation and listing

**Files:**
- Create: `src/lib/licenses/service.ts`
- Create: `tests/licenses/create.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/licenses/create.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { licenses } from "@/db/schema";
import { createTestDatabase, TEST_HMAC_SECRET, truncateAll } from "../helpers/db";
import { DEVELOPER_A, DEVELOPER_B, makeProduct } from "../helpers/factories";
import { createLicense, listLicenses } from "@/lib/licenses/service";
import { LICENSE_KEY_PATTERN, hashLicenseKey } from "@/lib/crypto/license-key";
import type { Database } from "@/db/types";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  await truncateAll(db);
});

describe("createLicense", () => {
  it("returns the plaintext key exactly once, in the creation response", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const created = await createLicense(db, DEVELOPER_A, {
      productId: product.id,
      expiration: { mode: "permanent" },
      hwidLocked: true,
      secret: TEST_HMAC_SECRET,
    });

    expect(created.plaintextKey).toMatch(LICENSE_KEY_PATTERN);
  });

  it("never persists the plaintext key", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const created = await createLicense(db, DEVELOPER_A, {
      productId: product.id,
      expiration: { mode: "permanent" },
      hwidLocked: true,
      secret: TEST_HMAC_SECRET,
    });

    // Scan every column of the stored row for the plaintext, in any casing.
    const [row] = await db.select().from(licenses).where(eq(licenses.id, created.license.id));
    const serialized = JSON.stringify(row).toUpperCase();
    expect(serialized).not.toContain(created.plaintextKey.toUpperCase());

    // What IS stored is the keyed digest.
    expect(row?.keyHash).toBe(hashLicenseKey(created.plaintextKey, TEST_HMAC_SECRET));
  });

  it("stores the last four characters for masked display", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const created = await createLicense(db, DEVELOPER_A, {
      productId: product.id,
      expiration: { mode: "permanent" },
      hwidLocked: true,
      secret: TEST_HMAC_SECRET,
    });

    expect(created.license.keyLast4).toBe(created.plaintextKey.slice(-4));
  });

  it("defaults to active, HWID-locked, never expiring", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const created = await createLicense(db, DEVELOPER_A, {
      productId: product.id,
      expiration: { mode: "permanent" },
      hwidLocked: true,
      secret: TEST_HMAC_SECRET,
    });

    expect(created.license.status).toBe("active");
    expect(created.license.hwidLocked).toBe(true);
    expect(created.license.expiresAt).toBeNull();
  });

  it("resolves a duration into an absolute expiry", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const created = await createLicense(db, DEVELOPER_A, {
      productId: product.id,
      expiration: { mode: "duration", duration: "30d" },
      hwidLocked: false,
      secret: TEST_HMAC_SECRET,
    });

    const expected = Date.now() + 30 * 24 * 60 * 60 * 1000;
    expect(created.license.expiresAt).not.toBeNull();
    expect(Math.abs(created.license.expiresAt!.getTime() - expected)).toBeLessThan(5000);
  });

  it("refuses to create a license under another developer's product", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_B });
    await expect(
      createLicense(db, DEVELOPER_A, {
        productId: product.id,
        expiration: { mode: "permanent" },
        hwidLocked: true,
        secret: TEST_HMAC_SECRET,
      }),
    ).rejects.toThrow(/not found/i);

    expect(await db.select().from(licenses)).toHaveLength(0);
  });
});

describe("listLicenses", () => {
  it("returns masked references and never a key hash", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const created = await createLicense(db, DEVELOPER_A, {
      productId: product.id,
      expiration: { mode: "permanent" },
      hwidLocked: true,
      secret: TEST_HMAC_SECRET,
    });

    const listed = await listLicenses(db, DEVELOPER_A, product.id);
    expect(listed).toHaveLength(1);

    const serialized = JSON.stringify(listed);
    expect(serialized).not.toContain(created.plaintextKey);
    // The lookup digest is a server-side secret derivative; it must not reach
    // the dashboard payload either.
    expect(serialized).not.toContain(hashLicenseKey(created.plaintextKey, TEST_HMAC_SECRET));
    expect(listed[0]?.keyLast4).toBe(created.plaintextKey.slice(-4));
  });

  it("reports activation state", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    await createLicense(db, DEVELOPER_A, {
      productId: product.id,
      expiration: { mode: "permanent" },
      hwidLocked: true,
      secret: TEST_HMAC_SECRET,
    });

    const [listed] = await listLicenses(db, DEVELOPER_A, product.id);
    expect(listed?.activation).toBeNull();
  });

  it("refuses to list another developer's licenses", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_B });
    await expect(listLicenses(db, DEVELOPER_A, product.id)).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/licenses/create.test.ts
```
Expected: FAIL — cannot resolve `@/lib/licenses/service`.

- [ ] **Step 3: Implement the creation and listing half of `src/lib/licenses/service.ts`**

```ts
import { and, desc, eq } from "drizzle-orm";
import { activations, licenses, products } from "@/db/schema";
import type { Database } from "@/db/types";
import { generateLicenseId } from "@/lib/crypto/ids";
import {
  generateLicenseKey,
  hashLicenseKey,
  licenseKeyLast4,
} from "@/lib/crypto/license-key";
import { notFound } from "@/lib/errors";
import { resolveExpiresAt, type ExpirationInput } from "./expiration";

/**
 * The shape the dashboard is allowed to see.
 *
 * Deliberately excludes `keyHash`: it is a server-side secret derivative and
 * has no business crossing into a React payload. Only `keyLast4` leaves the
 * server, and four characters of a 160-bit key are not sensitive.
 */
export type LicenseView = {
  id: string;
  productId: string;
  keyLast4: string;
  status: "active" | "revoked";
  expiresAt: Date | null;
  hwidLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
  revokedAt: Date | null;
  activation: { activatedAt: Date; lastSeenAt: Date } | null;
};

export type CreateLicenseInput = {
  productId: string;
  expiration: ExpirationInput;
  hwidLocked: boolean;
  secret: string;
};

/**
 * Confirms the product exists AND belongs to this developer, in one query.
 * Every license operation funnels through this, which is what makes the
 * `Clerk user -> owns product -> product owns license` chain unskippable.
 */
async function assertOwnsProduct(
  db: Database,
  ownerId: string,
  productId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.ownerId, ownerId)))
    .limit(1);

  if (!row) throw notFound("Product");
}

export async function createLicense(
  db: Database,
  ownerId: string,
  input: CreateLicenseInput,
): Promise<{ license: LicenseView; plaintextKey: string }> {
  await assertOwnsProduct(db, ownerId, input.productId);

  const now = new Date();
  const plaintextKey = generateLicenseKey();
  const expiresAt = resolveExpiresAt(input.expiration, now);

  const [row] = await db
    .insert(licenses)
    .values({
      id: generateLicenseId(),
      productId: input.productId,
      // The plaintext is hashed here and then only ever returned to the
      // caller. It is not logged, not cached, and not written anywhere.
      keyHash: hashLicenseKey(plaintextKey, input.secret),
      keyLast4: licenseKeyLast4(plaintextKey),
      status: "active",
      expiresAt,
      hwidLocked: input.hwidLocked,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) throw new Error("Failed to create license");

  return { license: toLicenseView(row, null), plaintextKey };
}

export async function listLicenses(
  db: Database,
  ownerId: string,
  productId: string,
): Promise<LicenseView[]> {
  await assertOwnsProduct(db, ownerId, productId);

  const rows = await db
    .select({ license: licenses, activation: activations })
    .from(licenses)
    .leftJoin(activations, eq(activations.licenseId, licenses.id))
    .where(eq(licenses.productId, productId))
    .orderBy(desc(licenses.createdAt));

  return rows.map((row) => toLicenseView(row.license, row.activation));
}

export function toLicenseView(
  row: typeof licenses.$inferSelect,
  activation: typeof activations.$inferSelect | null,
): LicenseView {
  return {
    id: row.id,
    productId: row.productId,
    keyLast4: row.keyLast4,
    status: row.status,
    expiresAt: row.expiresAt,
    hwidLocked: row.hwidLocked,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    revokedAt: row.revokedAt,
    activation: activation
      ? { activatedAt: activation.activatedAt, lastSeenAt: activation.lastSeenAt }
      : null,
  };
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/licenses/create.test.ts
```
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: license creation with show-once plaintext key"
```

---
### Task 16: License lifecycle — revoke, restore, reset activation, delete

**Files:**
- Modify: `src/lib/licenses/service.ts` (append)
- Create: `tests/licenses/lifecycle.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/licenses/lifecycle.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { activations, licenses } from "@/db/schema";
import { createTestDatabase, truncateAll } from "../helpers/db";
import { DEVELOPER_A, DEVELOPER_B, makeLicense, makeProduct } from "../helpers/factories";
import {
  deleteLicense,
  getLicense,
  resetActivation,
  restoreLicense,
  revokeLicense,
} from "@/lib/licenses/service";
import { generateActivationId } from "@/lib/crypto/ids";
import type { Database } from "@/db/types";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  await truncateAll(db);
});

async function seedActivation(licenseId: string): Promise<void> {
  await db.insert(activations).values({
    id: generateActivationId(),
    licenseId,
    deviceHash: "device-hash-value",
  });
}

describe("revokeLicense", () => {
  it("marks the license revoked and stamps revokedAt", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id });

    const revoked = await revokeLicense(db, DEVELOPER_A, license.id);
    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedAt).toBeInstanceOf(Date);
  });

  it("does not destroy the record or its activation", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id });
    await seedActivation(license.id);

    await revokeLicense(db, DEVELOPER_A, license.id);

    expect(await db.select().from(licenses).where(eq(licenses.id, license.id))).toHaveLength(1);
    expect(
      await db.select().from(activations).where(eq(activations.licenseId, license.id)),
    ).toHaveLength(1);
  });
});

describe("restoreLicense", () => {
  it("returns a revoked license to active and clears revokedAt", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, status: "revoked" });

    const restored = await restoreLicense(db, DEVELOPER_A, license.id);
    expect(restored.status).toBe("active");
    expect(restored.revokedAt).toBeNull();
  });

  it("is idempotent on an already-active license", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id });

    const restored = await restoreLicense(db, DEVELOPER_A, license.id);
    expect(restored.status).toBe("active");
  });
});

describe("resetActivation", () => {
  it("removes the existing device binding", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id });
    await seedActivation(license.id);

    await resetActivation(db, DEVELOPER_A, license.id);

    expect(
      await db.select().from(activations).where(eq(activations.licenseId, license.id)),
    ).toHaveLength(0);
  });

  it("leaves the license itself active and intact", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id });
    await seedActivation(license.id);

    await resetActivation(db, DEVELOPER_A, license.id);

    const view = await getLicense(db, DEVELOPER_A, license.id);
    expect(view?.status).toBe("active");
    expect(view?.activation).toBeNull();
  });

  it("succeeds on a license that was never activated", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id });
    await expect(resetActivation(db, DEVELOPER_A, license.id)).resolves.toBeUndefined();
  });
});

describe("deleteLicense", () => {
  it("permanently removes the license and cascades to its activation", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id });
    await seedActivation(license.id);

    await deleteLicense(db, DEVELOPER_A, license.id);

    expect(await db.select().from(licenses).where(eq(licenses.id, license.id))).toHaveLength(0);
    expect(
      await db.select().from(activations).where(eq(activations.licenseId, license.id)),
    ).toHaveLength(0);
  });
});

// Spec test #14: a developer cannot mutate another developer's license.
// This runs the full mutation surface against a foreign license and asserts
// that every single one refuses AND leaves the row untouched.
describe("cross-developer isolation", () => {
  async function foreignLicense(): Promise<string> {
    const product = await makeProduct(db, { ownerId: DEVELOPER_B });
    const license = await makeLicense(db, { productId: product.id });
    return license.id;
  }

  it("refuses to read another developer's license", async () => {
    expect(await getLicense(db, DEVELOPER_A, await foreignLicense())).toBeNull();
  });

  it("refuses to revoke another developer's license", async () => {
    const id = await foreignLicense();
    await expect(revokeLicense(db, DEVELOPER_A, id)).rejects.toThrow(/not found/i);
    expect((await getLicense(db, DEVELOPER_B, id))?.status).toBe("active");
  });

  it("refuses to restore another developer's license", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_B });
    const license = await makeLicense(db, { productId: product.id, status: "revoked" });
    await expect(restoreLicense(db, DEVELOPER_A, license.id)).rejects.toThrow(/not found/i);
    expect((await getLicense(db, DEVELOPER_B, license.id))?.status).toBe("revoked");
  });

  it("refuses to reset another developer's activation", async () => {
    const id = await foreignLicense();
    await seedActivation(id);
    await expect(resetActivation(db, DEVELOPER_A, id)).rejects.toThrow(/not found/i);
    expect(await db.select().from(activations).where(eq(activations.licenseId, id))).toHaveLength(1);
  });

  it("refuses to delete another developer's license", async () => {
    const id = await foreignLicense();
    await expect(deleteLicense(db, DEVELOPER_A, id)).rejects.toThrow(/not found/i);
    expect(await getLicense(db, DEVELOPER_B, id)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/licenses/lifecycle.test.ts
```
Expected: FAIL — `revokeLicense` is not exported.

- [ ] **Step 3: Append to `src/lib/licenses/service.ts`**

The appended code uses only `and` and `eq` from `drizzle-orm` and the `activations` / `licenses` / `products` tables, all of which Task 15 already imported at the top of this file. No new imports are needed. Append:

```ts
/**
 * Resolves a license ID to its row only if the calling developer owns the
 * product that owns it. This is the `Clerk user -> owns product -> product
 * owns license` chain expressed as a single join, so no caller can perform a
 * mutation without it having been proven.
 */
async function findOwnedLicense(
  db: Database,
  ownerId: string,
  licenseId: string,
): Promise<typeof licenses.$inferSelect | null> {
  const [row] = await db
    .select({ license: licenses })
    .from(licenses)
    .innerJoin(products, eq(products.id, licenses.productId))
    .where(and(eq(licenses.id, licenseId), eq(products.ownerId, ownerId)))
    .limit(1);

  return row?.license ?? null;
}

export async function getLicense(
  db: Database,
  ownerId: string,
  licenseId: string,
): Promise<LicenseView | null> {
  const [row] = await db
    .select({ license: licenses, activation: activations })
    .from(licenses)
    .innerJoin(products, eq(products.id, licenses.productId))
    .leftJoin(activations, eq(activations.licenseId, licenses.id))
    .where(and(eq(licenses.id, licenseId), eq(products.ownerId, ownerId)))
    .limit(1);

  return row ? toLicenseView(row.license, row.activation) : null;
}

export async function revokeLicense(
  db: Database,
  ownerId: string,
  licenseId: string,
): Promise<LicenseView> {
  const owned = await findOwnedLicense(db, ownerId, licenseId);
  if (!owned) throw notFound("License");

  const now = new Date();
  // Revoking is a state change, never a delete. The record, its creation
  // time, and its activation history all survive so it can be restored.
  const [row] = await db
    .update(licenses)
    .set({ status: "revoked", revokedAt: now, updatedAt: now })
    .where(eq(licenses.id, licenseId))
    .returning();

  if (!row) throw notFound("License");
  return toLicenseView(row, null);
}

export async function restoreLicense(
  db: Database,
  ownerId: string,
  licenseId: string,
): Promise<LicenseView> {
  const owned = await findOwnedLicense(db, ownerId, licenseId);
  if (!owned) throw notFound("License");

  const [row] = await db
    .update(licenses)
    .set({ status: "active", revokedAt: null, updatedAt: new Date() })
    .where(eq(licenses.id, licenseId))
    .returning();

  if (!row) throw notFound("License");
  return toLicenseView(row, null);
}

/**
 * Clears the device binding so the next valid device can claim the license.
 * Succeeds silently when there is nothing bound — the developer's intent is
 * "this license should be claimable", and it already is.
 */
export async function resetActivation(
  db: Database,
  ownerId: string,
  licenseId: string,
): Promise<void> {
  const owned = await findOwnedLicense(db, ownerId, licenseId);
  if (!owned) throw notFound("License");

  await db.delete(activations).where(eq(activations.licenseId, licenseId));
}

/**
 * Permanent and irreversible. The activation row cascades away with it.
 * A deleted license can never authenticate again — there is no tombstone and
 * no recovery, which is exactly why the UI gates this behind a typed
 * confirmation.
 */
export async function deleteLicense(
  db: Database,
  ownerId: string,
  licenseId: string,
): Promise<void> {
  const owned = await findOwnedLicense(db, ownerId, licenseId);
  if (!owned) throw notFound("License");

  await db.delete(licenses).where(eq(licenses.id, licenseId));
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/licenses/lifecycle.test.ts
```
Expected: 13 passed.

- [ ] **Step 5: Run everything so far**

```bash
npm run typecheck && npx vitest run
```
Expected: typecheck clean, all suites green.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: license revoke, restore, activation reset and delete"
```

---

## Phase 5 — The verification engine

This is the code that decides whether paid software runs. It is worth reading twice.

### Task 17: Verification core — product, key lookup, enumeration resistance

**Files:**
- Create: `src/lib/licenses/verify.ts`
- Create: `tests/verify/lookup.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/verify/lookup.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, TEST_HMAC_SECRET, truncateAll } from "../helpers/db";
import { DEVELOPER_A, makeLicense, makeProduct } from "../helpers/factories";
import { verifyLicense } from "@/lib/licenses/verify";
import { generateLicenseKey } from "@/lib/crypto/license-key";
import type { Database } from "@/db/types";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  await truncateAll(db);
});

const DEVICE = "device-fingerprint-one";

// Spec test #1
describe("valid active license", () => {
  it("succeeds and reports active status with a null expiry", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    const result = await verifyLicense(db, {
      productId: product.id,
      licenseKey: license.plaintextKey,
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.license.status).toBe("active");
    expect(result.license.expiresAt).toBeNull();
  });

  it("accepts a lowercase or whitespace-mangled key", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id });

    const result = await verifyLicense(db, {
      productId: product.id,
      licenseKey: `  ${license.plaintextKey.toLowerCase()} `,
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });

    expect(result.success).toBe(true);
  });
});

// Spec test #2
describe("invalid license", () => {
  it("rejects a well-formed key that was never issued", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    const result = await verifyLicense(db, {
      productId: product.id,
      licenseKey: generateLicenseKey(),
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error.code).toBe("LICENSE_INVALID");
  });

  it("rejects a key hashed under a different server secret", async () => {
    // Simulates a stolen database being replayed against a rotated secret.
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id });

    const result = await verifyLicense(db, {
      productId: product.id,
      licenseKey: license.plaintextKey,
      deviceId: DEVICE,
      secret: "a-completely-different-server-secret-value",
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error.code).toBe("LICENSE_INVALID");
  });
});

// Spec test #3
describe("wrong product", () => {
  it("rejects a real key presented against another product", async () => {
    const productOne = await makeProduct(db, { ownerId: DEVELOPER_A, name: "One" });
    const productTwo = await makeProduct(db, { ownerId: DEVELOPER_A, name: "Two" });
    const license = await makeLicense(db, { productId: productOne.id });

    const result = await verifyLicense(db, {
      productId: productTwo.id,
      licenseKey: license.plaintextKey,
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    // Not a distinct "wrong product for this key" code — that would confirm
    // the key exists somewhere, which is exactly what an enumerator wants.
    expect(result.error.code).toBe("LICENSE_INVALID");
  });

  it("returns PRODUCT_INVALID for an unknown product id", async () => {
    const result = await verifyLicense(db, {
      productId: "prod_DOESNOTEXIST0000000000000",
      licenseKey: generateLicenseKey(),
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    // Product IDs ship inside customer software, so distinguishing this case
    // helps an integrating developer without helping an attacker.
    expect(result.error.code).toBe("PRODUCT_INVALID");
  });
});

describe("enumeration resistance", () => {
  it("returns byte-identical responses for absent and foreign licenses", async () => {
    const productOne = await makeProduct(db, { ownerId: DEVELOPER_A, name: "One" });
    const productTwo = await makeProduct(db, { ownerId: DEVELOPER_A, name: "Two" });
    const realKeyOfAnotherProduct = await makeLicense(db, { productId: productOne.id });

    const absent = await verifyLicense(db, {
      productId: productTwo.id,
      licenseKey: generateLicenseKey(),
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });
    const foreign = await verifyLicense(db, {
      productId: productTwo.id,
      licenseKey: realKeyOfAnotherProduct.plaintextKey,
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });

    expect(JSON.stringify(absent)).toBe(JSON.stringify(foreign));
  });

  it("never echoes internal identifiers in a failure", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, status: "revoked" });

    const result = await verifyLicense(db, {
      productId: product.id,
      licenseKey: license.plaintextKey,
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(license.id);
    expect(serialized).not.toContain(DEVELOPER_A);
    expect(serialized).not.toContain(license.plaintextKey);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/verify/lookup.test.ts
```
Expected: FAIL — cannot resolve `@/lib/licenses/verify`.

- [ ] **Step 3: Implement `src/lib/licenses/verify.ts`**

```ts
import { and, eq } from "drizzle-orm";
import { activations, licenses, products } from "@/db/schema";
import type { Database } from "@/db/types";
import { generateActivationId } from "@/lib/crypto/ids";
import { hashDeviceId } from "@/lib/crypto/device";
import { hashLicenseKey, keyHashesEqual } from "@/lib/crypto/license-key";
import {
  VERIFICATION_ERROR_MESSAGE,
  type VerificationErrorCode,
} from "@/lib/errors";
import { isExpired } from "./expiration";

export type VerifyInput = {
  productId: string;
  licenseKey: string;
  deviceId: string;
  secret: string;
  /** Injectable for deterministic expiry tests. */
  now?: Date;
};

export type VerifyResult =
  | { success: true; license: { status: "active"; expiresAt: string | null } }
  | { success: false; error: { code: VerificationErrorCode; message: string } };

function failure(code: VerificationErrorCode): VerifyResult {
  return { success: false, error: { code, message: VERIFICATION_ERROR_MESSAGE[code] } };
}

/**
 * Decides whether a running instance of a customer's software is licensed.
 *
 * Order of operations matters and follows the specification exactly:
 * locate product, derive lookup value, locate license, check state, check
 * expiration, check device rules, then bind or refresh the activation.
 *
 * Rate limiting happens upstream in the route handler, before this function
 * is called, so a flood of invalid keys never reaches the database.
 *
 * Every rejection returns a fixed, non-descriptive message. Nothing about
 * internal IDs, ownership, or which check failed beyond the normalized code
 * ever crosses the boundary.
 */
export async function verifyLicense(db: Database, input: VerifyInput): Promise<VerifyResult> {
  const now = input.now ?? new Date();

  // 1. Locate the product. Product IDs are shipped inside customer software
  //    and are not secret, so distinguishing this case is safe and helps a
  //    developer debug a bad integration.
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);

  if (!product) return failure("PRODUCT_INVALID");

  // 2. Derive the lookup value. The plaintext key never touches the database
  //    and is never logged.
  const keyHash = hashLicenseKey(input.licenseKey, input.secret);

  // 3. Locate the license *within this product*. Scoping the lookup by
  //    product_id in the WHERE clause is what makes a key issued for one
  //    product useless against another. Index: licenses_product_key_hash_idx.
  const [license] = await db
    .select()
    .from(licenses)
    .where(and(eq(licenses.productId, product.id), eq(licenses.keyHash, keyHash)))
    .limit(1);

  // A missing license and a license belonging to a different product are
  // indistinguishable from out here, by design.
  if (!license) return failure("LICENSE_INVALID");

  // Defense in depth: re-check the digest in constant time. The indexed
  // equality above already matched, so this only matters if a future change
  // loosens that query.
  if (!keyHashesEqual(license.keyHash, keyHash)) return failure("LICENSE_INVALID");

  // 4. State before expiry: a revoked license reports as revoked even if it
  //    also happens to have lapsed, because revocation is the developer's
  //    deliberate act and is the more useful signal.
  if (license.status === "revoked") return failure("LICENSE_REVOKED");

  // 5. Expiration, compared in UTC against the server clock. The client's
  //    clock is untrusted and is never consulted.
  if (isExpired(license.expiresAt, now)) return failure("LICENSE_EXPIRED");

  // 6. Device rules and activation bookkeeping.
  const deviceHash = hashDeviceId(input.deviceId, input.secret);
  const bound = await bindOrRefreshActivation(db, license.id, deviceHash, license.hwidLocked, now);
  if (!bound) return failure("DEVICE_MISMATCH");

  return {
    success: true,
    license: {
      status: "active",
      expiresAt: license.expiresAt ? license.expiresAt.toISOString() : null,
    },
  };
}

/**
 * Returns false only when an HWID-locked license is already bound to a
 * different device.
 *
 * For a license that is NOT HWID-locked, the activation row still exists and
 * still tracks the most recently seen device — it records last-seen activity
 * rather than an exclusive claim, and never causes a rejection.
 */
async function bindOrRefreshActivation(
  db: Database,
  licenseId: string,
  deviceHash: string,
  hwidLocked: boolean,
  now: Date,
): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(activations)
    .where(eq(activations.licenseId, licenseId))
    .limit(1);

  if (!existing) {
    // First successful authentication claims the license for this device.
    // The unique index on license_id makes a concurrent double-claim fail at
    // the database rather than silently creating two bindings; treat that
    // conflict as a mismatch, since the other request won the race.
    try {
      await db.insert(activations).values({
        id: generateActivationId(),
        licenseId,
        deviceHash,
        activatedAt: now,
        lastSeenAt: now,
      });
      return true;
    } catch {
      return !hwidLocked;
    }
  }

  const sameDevice = existing.deviceHash === deviceHash;

  if (hwidLocked && !sameDevice) return false;

  await db
    .update(activations)
    .set({
      lastSeenAt: now,
      // An unlocked license simply follows whichever device checked in last.
      ...(sameDevice ? {} : { deviceHash, activatedAt: now }),
    })
    .where(eq(activations.licenseId, licenseId));

  return true;
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/verify/lookup.test.ts
```
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: license verification engine"
```

---
### Task 18: Verification — license state and expiration

The engine from Task 17 already claims these behaviours. This task proves them. If any test fails, the engine is wrong and gets fixed — do not adjust the test to match the code.

**Files:**
- Create: `tests/verify/state.test.ts`

- [ ] **Step 1: Write the tests**

`tests/verify/state.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, TEST_HMAC_SECRET, truncateAll } from "../helpers/db";
import { DEVELOPER_A, makeLicense, makeProduct } from "../helpers/factories";
import { verifyLicense } from "@/lib/licenses/verify";
import { restoreLicense, revokeLicense } from "@/lib/licenses/service";
import type { Database } from "@/db/types";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  await truncateAll(db);
});

const DEVICE = "device-fingerprint-one";

async function verify(productId: string, key: string, now?: Date) {
  return verifyLicense(db, {
    productId,
    licenseKey: key,
    deviceId: DEVICE,
    secret: TEST_HMAC_SECRET,
    ...(now ? { now } : {}),
  });
}

// Spec test #4
describe("revoked license", () => {
  it("returns LICENSE_REVOKED", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id });
    await revokeLicense(db, DEVELOPER_A, license.id);

    const result = await verify(product.id, license.plaintextKey);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error.code).toBe("LICENSE_REVOKED");
  });

  it("reports revoked rather than expired when both are true", async () => {
    // Revocation is the developer's deliberate act, so it is the more useful
    // signal to surface.
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, {
      productId: product.id,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    await revokeLicense(db, DEVELOPER_A, license.id);

    const result = await verify(product.id, license.plaintextKey);
    if (result.success) throw new Error("expected failure");
    expect(result.error.code).toBe("LICENSE_REVOKED");
  });
});

// Spec test #5
describe("restored license", () => {
  it("authenticates again after being restored", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id });

    await revokeLicense(db, DEVELOPER_A, license.id);
    const whileRevoked = await verify(product.id, license.plaintextKey);
    expect(whileRevoked.success).toBe(false);

    await restoreLicense(db, DEVELOPER_A, license.id);
    const afterRestore = await verify(product.id, license.plaintextKey);
    expect(afterRestore.success).toBe(true);
  });
});

// Spec test #6
describe("expired license", () => {
  it("returns LICENSE_EXPIRED once the deadline has passed", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, {
      productId: product.id,
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await verify(
      product.id,
      license.plaintextKey,
      new Date("2026-01-02T00:00:00.000Z"),
    );
    if (result.success) throw new Error("expected failure");
    expect(result.error.code).toBe("LICENSE_EXPIRED");
  });

  it("still authenticates one second before the deadline", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, {
      productId: product.id,
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await verify(
      product.id,
      license.plaintextKey,
      new Date("2025-12-31T23:59:59.000Z"),
    );
    expect(result.success).toBe(true);
  });

  it("returns the expiry as an ISO-8601 UTC string on success", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, {
      productId: product.id,
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    });

    const result = await verify(
      product.id,
      license.plaintextKey,
      new Date("2026-01-01T00:00:00.000Z"),
    );
    if (!result.success) throw new Error("expected success");
    expect(result.license.expiresAt).toBe("2027-01-01T00:00:00.000Z");
  });

  it("ignores the client clock entirely", async () => {
    // The `now` parameter is server-side only; nothing in the request body
    // can influence expiry evaluation.
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, {
      productId: product.id,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });

    const result = await verifyLicense(db, {
      productId: product.id,
      licenseKey: license.plaintextKey,
      deviceId: DEVICE,
      secret: TEST_HMAC_SECRET,
    });
    if (result.success) throw new Error("expected failure");
    expect(result.error.code).toBe("LICENSE_EXPIRED");
  });
});

// Spec test #7
describe("permanent license", () => {
  it("authenticates with a null expiry, far into the future", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, expiresAt: null });

    const result = await verify(
      product.id,
      license.plaintextKey,
      new Date("2099-12-31T00:00:00.000Z"),
    );
    if (!result.success) throw new Error("expected success");
    expect(result.license.expiresAt).toBeNull();
    expect(result.license.status).toBe("active");
  });
});
```

- [ ] **Step 2: Run**

```bash
npx vitest run tests/verify/state.test.ts
```
Expected: 8 passed.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: verification state and expiration behaviour"
```

---

### Task 19: Verification — HWID binding, reset, and deletion

**Files:**
- Create: `tests/verify/hwid.test.ts`

- [ ] **Step 1: Write the tests**

`tests/verify/hwid.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { activations } from "@/db/schema";
import { createTestDatabase, TEST_HMAC_SECRET, truncateAll } from "../helpers/db";
import { DEVELOPER_A, makeLicense, makeProduct } from "../helpers/factories";
import { verifyLicense } from "@/lib/licenses/verify";
import { deleteLicense, resetActivation } from "@/lib/licenses/service";
import { hashDeviceId } from "@/lib/crypto/device";
import type { Database } from "@/db/types";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  await truncateAll(db);
});

const DEVICE_ONE = "device-fingerprint-one";
const DEVICE_TWO = "device-fingerprint-two";

async function verify(productId: string, key: string, deviceId: string) {
  return verifyLicense(db, {
    productId,
    licenseKey: key,
    deviceId,
    secret: TEST_HMAC_SECRET,
  });
}

// Spec test #8
describe("first HWID activation", () => {
  it("binds the first device and creates an activation record", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    const result = await verify(product.id, license.plaintextKey, DEVICE_ONE);
    expect(result.success).toBe(true);

    const rows = await db.select().from(activations).where(eq(activations.licenseId, license.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deviceHash).toBe(hashDeviceId(DEVICE_ONE, TEST_HMAC_SECRET));
  });

  it("stores only the hashed fingerprint, never the raw value", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });
    await verify(product.id, license.plaintextKey, DEVICE_ONE);

    const rows = await db.select().from(activations);
    expect(JSON.stringify(rows)).not.toContain(DEVICE_ONE);
  });
});

// Spec test #9
describe("same HWID authenticates again", () => {
  it("accepts repeat authentication and advances lastSeenAt", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    await verify(product.id, license.plaintextKey, DEVICE_ONE);
    const [first] = await db.select().from(activations).where(eq(activations.licenseId, license.id));

    await new Promise((resolve) => setTimeout(resolve, 15));

    const second = await verify(product.id, license.plaintextKey, DEVICE_ONE);
    expect(second.success).toBe(true);

    const [after] = await db.select().from(activations).where(eq(activations.licenseId, license.id));
    expect(after?.lastSeenAt.getTime()).toBeGreaterThan(first!.lastSeenAt.getTime());
    // The original claim time is preserved across check-ins.
    expect(after?.activatedAt.getTime()).toBe(first!.activatedAt.getTime());
  });

  it("does not create a second activation row", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    await verify(product.id, license.plaintextKey, DEVICE_ONE);
    await verify(product.id, license.plaintextKey, DEVICE_ONE);
    await verify(product.id, license.plaintextKey, DEVICE_ONE);

    expect(await db.select().from(activations)).toHaveLength(1);
  });
});

// Spec test #10
describe("different HWID fails", () => {
  it("returns DEVICE_MISMATCH for a second device", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    await verify(product.id, license.plaintextKey, DEVICE_ONE);
    const result = await verify(product.id, license.plaintextKey, DEVICE_TWO);

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error.code).toBe("DEVICE_MISMATCH");
  });

  it("leaves the original binding untouched after a rejected attempt", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    await verify(product.id, license.plaintextKey, DEVICE_ONE);
    await verify(product.id, license.plaintextKey, DEVICE_TWO);

    const [row] = await db.select().from(activations).where(eq(activations.licenseId, license.id));
    expect(row?.deviceHash).toBe(hashDeviceId(DEVICE_ONE, TEST_HMAC_SECRET));
  });

  it("still admits the original device afterwards", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    await verify(product.id, license.plaintextKey, DEVICE_ONE);
    await verify(product.id, license.plaintextKey, DEVICE_TWO);
    const again = await verify(product.id, license.plaintextKey, DEVICE_ONE);

    expect(again.success).toBe(true);
  });
});

describe("licenses without HWID locking", () => {
  it("accepts any device", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: false });

    expect((await verify(product.id, license.plaintextKey, DEVICE_ONE)).success).toBe(true);
    expect((await verify(product.id, license.plaintextKey, DEVICE_TWO)).success).toBe(true);
  });

  it("tracks the most recently seen device in a single row", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: false });

    await verify(product.id, license.plaintextKey, DEVICE_ONE);
    await verify(product.id, license.plaintextKey, DEVICE_TWO);

    const rows = await db.select().from(activations).where(eq(activations.licenseId, license.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deviceHash).toBe(hashDeviceId(DEVICE_TWO, TEST_HMAC_SECRET));
  });
});

// Spec tests #11 and #12
describe("activation reset", () => {
  it("clears the binding and lets a new device claim the license", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    await verify(product.id, license.plaintextKey, DEVICE_ONE);
    expect((await verify(product.id, license.plaintextKey, DEVICE_TWO)).success).toBe(false);

    await resetActivation(db, DEVELOPER_A, license.id);

    const afterReset = await verify(product.id, license.plaintextKey, DEVICE_TWO);
    expect(afterReset.success).toBe(true);

    const [row] = await db.select().from(activations).where(eq(activations.licenseId, license.id));
    expect(row?.deviceHash).toBe(hashDeviceId(DEVICE_TWO, TEST_HMAC_SECRET));
  });

  it("locks out the previously bound device once a new one claims it", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    await verify(product.id, license.plaintextKey, DEVICE_ONE);
    await resetActivation(db, DEVELOPER_A, license.id);
    await verify(product.id, license.plaintextKey, DEVICE_TWO);

    const result = await verify(product.id, license.plaintextKey, DEVICE_ONE);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error.code).toBe("DEVICE_MISMATCH");
  });
});

// Spec test #15
describe("deleted license", () => {
  it("can no longer authenticate", async () => {
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    expect((await verify(product.id, license.plaintextKey, DEVICE_ONE)).success).toBe(true);

    await deleteLicense(db, DEVELOPER_A, license.id);

    const result = await verify(product.id, license.plaintextKey, DEVICE_ONE);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    // Indistinguishable from a key that never existed.
    expect(result.error.code).toBe("LICENSE_INVALID");
  });
});
```

- [ ] **Step 2: Run**

```bash
npx vitest run tests/verify/hwid.test.ts
```
Expected: 11 passed.

- [ ] **Step 3: Run the whole suite and typecheck**

```bash
npm run typecheck && npx vitest run
```
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test: HWID binding, activation reset and deletion behaviour"
```

---

## Phase 6 — Rate limiting

### Task 20: Rate limiter interface and Postgres store

**Files:**
- Create: `src/lib/rate-limit/types.ts`, `src/lib/rate-limit/postgres.ts`
- Create: `tests/rate-limit/postgres.test.ts`

- [ ] **Step 1: Create `src/lib/rate-limit/types.ts`**

```ts
/**
 * A single axis a request can be limited on.
 *
 * Alpha_v1 checks IP and product. The shape allows more axes — a license
 * lookup fingerprint, a request-pattern signature — to be added later
 * without changing the interface or the call site in the route handler.
 *
 * The spec is explicit that a single naive IP limit is not enough: shared
 * networks put many legitimate users behind one address, and an attacker can
 * rotate addresses. Combining axes is the point of this shape.
 */
export type RateLimitDimension = {
  /** Axis name, e.g. "ip" or "product". Namespaces the bucket key. */
  name: string;
  /** The value on that axis, e.g. the address or the product ID. */
  value: string;
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export interface RateLimiter {
  /**
   * Consumes one unit against every dimension. Denies if ANY dimension is
   * over its limit.
   */
  consume(dimensions: RateLimitDimension[]): Promise<RateLimitResult>;
}
```

- [ ] **Step 2: Write the failing test**

`tests/rate-limit/postgres.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, truncateAll } from "../helpers/db";
import { PostgresRateLimiter } from "@/lib/rate-limit/postgres";
import type { RateLimitDimension } from "@/lib/rate-limit/types";
import type { Database } from "@/db/types";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  await truncateAll(db);
});

const ip = (value: string, limit = 3): RateLimitDimension => ({
  name: "ip",
  value,
  limit,
  windowSeconds: 60,
});

describe("PostgresRateLimiter", () => {
  it("allows requests up to the limit", async () => {
    const limiter = new PostgresRateLimiter(db);
    for (let i = 0; i < 3; i += 1) {
      expect((await limiter.consume([ip("1.1.1.1")])).allowed).toBe(true);
    }
  });

  it("denies the request past the limit", async () => {
    const limiter = new PostgresRateLimiter(db);
    for (let i = 0; i < 3; i += 1) await limiter.consume([ip("1.1.1.1")]);

    const result = await limiter.consume([ip("1.1.1.1")]);
    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error("expected denial");
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("keeps separate counters per value", async () => {
    const limiter = new PostgresRateLimiter(db);
    for (let i = 0; i < 3; i += 1) await limiter.consume([ip("1.1.1.1")]);

    expect((await limiter.consume([ip("2.2.2.2")])).allowed).toBe(true);
  });

  it("keeps separate counters per axis", async () => {
    const limiter = new PostgresRateLimiter(db);
    const product: RateLimitDimension = {
      name: "product",
      value: "1.1.1.1",
      limit: 3,
      windowSeconds: 60,
    };
    for (let i = 0; i < 3; i += 1) await limiter.consume([ip("1.1.1.1")]);

    // Same value, different axis — must not share a bucket.
    expect((await limiter.consume([product])).allowed).toBe(true);
  });

  it("denies when any one dimension is exhausted", async () => {
    const limiter = new PostgresRateLimiter(db);
    const dims = [ip("1.1.1.1", 2), { name: "product", value: "prod_x", limit: 100, windowSeconds: 60 }];

    expect((await limiter.consume(dims)).allowed).toBe(true);
    expect((await limiter.consume(dims)).allowed).toBe(true);
    expect((await limiter.consume(dims)).allowed).toBe(false);
  });

  it("starts a fresh window once the old one lapses", async () => {
    const limiter = new PostgresRateLimiter(db);
    const short = { name: "ip", value: "1.1.1.1", limit: 1, windowSeconds: 1 };

    expect((await limiter.consume([short])).allowed).toBe(true);
    expect((await limiter.consume([short])).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect((await limiter.consume([short])).allowed).toBe(true);
  });

  it("fails open when the store errors", async () => {
    // A licensing check must not become unavailable because the limiter's
    // table is unreachable. Failing closed here would take every customer's
    // software offline over a rate-limit outage, which is a worse outcome
    // than briefly unmetered traffic.
    const broken = {
      execute: () => Promise.reject(new Error("store down")),
    } as unknown as Database;

    const limiter = new PostgresRateLimiter(broken);
    expect((await limiter.consume([ip("1.1.1.1")])).allowed).toBe(true);
  });

  it("allows an empty dimension list", async () => {
    const limiter = new PostgresRateLimiter(db);
    expect((await limiter.consume([])).allowed).toBe(true);
  });
});
```

- [ ] **Step 3: Run and watch it fail**

```bash
npx vitest run tests/rate-limit/postgres.test.ts
```
Expected: FAIL — cannot resolve `@/lib/rate-limit/postgres`.

- [ ] **Step 4: Implement `src/lib/rate-limit/postgres.ts`**

```ts
import { sql } from "drizzle-orm";
import type { Database } from "@/db/types";
import type { RateLimitDimension, RateLimitResult, RateLimiter } from "./types";

/**
 * Fixed-window counters held in Postgres.
 *
 * Chosen over Redis because Alpha_v1 does not justify another dependency, and
 * over in-memory counters because a serverless deployment spreads requests
 * across instances that would each keep their own count — an attacker would
 * simply get N times the intended limit.
 *
 * Fixed windows admit up to 2x the limit across a window boundary. That is an
 * accepted trade for Alpha_v1: this class sits behind the RateLimiter
 * interface, so a sliding window or a token bucket can replace it without the
 * verification path changing.
 */
export class PostgresRateLimiter implements RateLimiter {
  constructor(private readonly db: Database) {}

  async consume(dimensions: RateLimitDimension[]): Promise<RateLimitResult> {
    if (dimensions.length === 0) return { allowed: true };

    const now = Date.now();

    for (const dimension of dimensions) {
      const windowMs = dimension.windowSeconds * 1000;
      const windowStartMs = Math.floor(now / windowMs) * windowMs;
      const bucketKey = `${dimension.name}:${dimension.value}:${windowStartMs}`;

      let count: number;
      try {
        // A single atomic upsert-and-increment. Doing this as SELECT then
        // UPDATE would let concurrent requests read the same count and each
        // decide they were under the limit.
        const result = await this.db.execute<{ count: number }>(sql`
          INSERT INTO rate_limit_counters (bucket_key, window_start, count)
          VALUES (${bucketKey}, ${new Date(windowStartMs)}, 1)
          ON CONFLICT (bucket_key)
          DO UPDATE SET count = rate_limit_counters.count + 1
          RETURNING count
        `);

        const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];
        const first = rows[0] as { count: number | string } | undefined;
        count = Number(first?.count ?? 0);
      } catch {
        // Fail open. An unavailable limiter must not take licensing offline.
        // Deliberately does not log the bucket key, which contains an IP.
        return { allowed: true };
      }

      if (count > dimension.limit) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((windowStartMs + windowMs - now) / 1000),
        );
        return { allowed: false, retryAfterSeconds };
      }
    }

    return { allowed: true };
  }
}
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run tests/rate-limit/postgres.test.ts
```
Expected: 8 passed.

> The `db.execute` return shape differs between drivers. The implementation handles both an array and a `{ rows }` object; confirm which PGlite returns and keep both branches, since production uses postgres.js.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Postgres-backed multi-dimension rate limiter"
```

---
### Task 21: Verification rate-limit policy and client IP extraction

**Files:**
- Create: `src/lib/rate-limit/index.ts`
- Create: `tests/rate-limit/policy.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/rate-limit/policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clientIpFrom, verifyDimensions } from "@/lib/rate-limit";

describe("clientIpFrom", () => {
  it("takes the first entry of x-forwarded-for", async () => {
    // Vercel appends proxy hops; the leftmost entry is the original client.
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 70.41.3.18" });
    expect(clientIpFrom(headers)).toBe("203.0.113.5");
  });

  it("trims whitespace", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "  203.0.113.5  " }))).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("returns a stable placeholder when no address is present", () => {
    // Everything unattributable shares one bucket rather than bypassing the
    // limiter entirely.
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
});

describe("verifyDimensions", () => {
  it("limits on both IP and product", () => {
    const dims = verifyDimensions({ ip: "203.0.113.5", productId: "prod_abc" });
    expect(dims.map((d) => d.name).sort()).toEqual(["ip", "product"]);
  });

  it("gives the product axis a higher ceiling than a single IP", () => {
    // One product legitimately serves many customers; one IP does not.
    const dims = verifyDimensions({ ip: "203.0.113.5", productId: "prod_abc" });
    const ip = dims.find((d) => d.name === "ip");
    const product = dims.find((d) => d.name === "product");
    expect(product!.limit).toBeGreaterThan(ip!.limit);
  });

  it("uses one-minute windows", () => {
    for (const dimension of verifyDimensions({ ip: "1.1.1.1", productId: "prod_abc" })) {
      expect(dimension.windowSeconds).toBe(60);
    }
  });

  it("honours configured overrides", () => {
    const dims = verifyDimensions(
      { ip: "1.1.1.1", productId: "prod_abc" },
      { perIpPerMinute: 5, perProductPerMinute: 50 },
    );
    expect(dims.find((d) => d.name === "ip")?.limit).toBe(5);
    expect(dims.find((d) => d.name === "product")?.limit).toBe(50);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/rate-limit/policy.test.ts
```
Expected: FAIL — cannot resolve `@/lib/rate-limit`.

- [ ] **Step 3: Implement `src/lib/rate-limit/index.ts`**

```ts
import type { RateLimitDimension } from "./types";

export * from "./types";
export { PostgresRateLimiter } from "./postgres";

/**
 * Extracts the client address behind Vercel's proxy.
 *
 * `x-forwarded-for` is client-controllable in general, which is why an IP
 * limit alone is never the whole policy — the product axis covers the case of
 * an attacker rotating or forging addresses.
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  // One shared bucket rather than an exemption.
  return "unknown";
}

export type VerifyLimitConfig = {
  perIpPerMinute: number;
  perProductPerMinute: number;
};

/**
 * The dimensions every verification request is metered against.
 *
 * Two axes deliberately, not one: a per-IP limit alone punishes offices and
 * campuses behind a single NAT while doing nothing about a distributed
 * attacker, and a per-product limit alone lets one abusive client exhaust a
 * developer's entire budget. Neither is sufficient; together they bound both
 * shapes of abuse.
 */
export function verifyDimensions(
  request: { ip: string; productId: string },
  config: VerifyLimitConfig = { perIpPerMinute: 60, perProductPerMinute: 600 },
): RateLimitDimension[] {
  return [
    { name: "ip", value: request.ip, limit: config.perIpPerMinute, windowSeconds: 60 },
    {
      name: "product",
      value: request.productId,
      limit: config.perProductPerMinute,
      windowSeconds: 60,
    },
  ];
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/rate-limit/policy.test.ts
```
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: verification rate-limit policy across IP and product axes"
```

---

### Task 22: Request validation

**Files:**
- Create: `src/lib/validation/verify-request.ts`
- Create: `tests/validation/verify-request.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/validation/verify-request.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { verifyRequestSchema } from "@/lib/validation/verify-request";

const valid = {
  productId: "prod_ABCDEFGHJKMNPQRSTVWXYZ012",
  licenseKey: "KEYREN-ABCDEFGH-ABCDEFGH-ABCDEFGH-ABCDEFGH",
  deviceId: "device-fingerprint",
};

describe("verifyRequestSchema", () => {
  it("accepts a well-formed body", () => {
    expect(verifyRequestSchema.safeParse(valid).success).toBe(true);
  });

  it.each(["productId", "licenseKey", "deviceId"] as const)(
    "rejects a body missing %s",
    (field) => {
      const body: Record<string, unknown> = { ...valid };
      delete body[field];
      expect(verifyRequestSchema.safeParse(body).success).toBe(false);
    },
  );

  it.each(["productId", "licenseKey", "deviceId"] as const)(
    "rejects a non-string %s",
    (field) => {
      expect(verifyRequestSchema.safeParse({ ...valid, [field]: 12345 }).success).toBe(false);
    },
  );

  it("rejects a product id without the prod_ prefix", () => {
    expect(verifyRequestSchema.safeParse({ ...valid, productId: "abc123" }).success).toBe(false);
  });

  it("rejects an empty device id", () => {
    expect(verifyRequestSchema.safeParse({ ...valid, deviceId: "" }).success).toBe(false);
  });

  it("rejects an oversized device id", () => {
    // Bounded so a client cannot push megabytes through the HMAC.
    expect(
      verifyRequestSchema.safeParse({ ...valid, deviceId: "x".repeat(1025) }).success,
    ).toBe(false);
  });

  it("rejects an oversized license key", () => {
    expect(
      verifyRequestSchema.safeParse({ ...valid, licenseKey: "x".repeat(500) }).success,
    ).toBe(false);
  });

  it("strips unknown fields rather than trusting them", () => {
    const parsed = verifyRequestSchema.parse({ ...valid, isAdmin: true, ownerId: "user_x" });
    expect(parsed).not.toHaveProperty("isAdmin");
    expect(parsed).not.toHaveProperty("ownerId");
  });

  it("accepts a lowercase license key for normalization downstream", () => {
    expect(
      verifyRequestSchema.safeParse({ ...valid, licenseKey: valid.licenseKey.toLowerCase() })
        .success,
    ).toBe(true);
  });

  it("rejects null and array bodies", () => {
    expect(verifyRequestSchema.safeParse(null).success).toBe(false);
    expect(verifyRequestSchema.safeParse([]).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/validation/verify-request.test.ts
```
Expected: FAIL — cannot resolve `@/lib/validation/verify-request`.

- [ ] **Step 3: Implement `src/lib/validation/verify-request.ts`**

```ts
import { z } from "zod";

/**
 * The public verification request body.
 *
 * Bounded on every field: the endpoint is unauthenticated and reachable by
 * anyone, so an unbounded string is free CPU for an attacker to burn through
 * the HMAC. Unknown keys are stripped rather than passed through, so a client
 * cannot smuggle a field that some later refactor starts reading.
 *
 * Note what is NOT accepted: no owner ID, no product secret, no status
 * override, no expiry. The client supplies identifiers only; every decision
 * is made from server-held state.
 */
export const verifyRequestSchema = z
  .object({
    productId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^prod_[0-9A-Za-z]+$/, "Invalid product id"),

    // Format is not enforced strictly here — normalization happens in the
    // crypto layer, and a wrong-format key must fail as LICENSE_INVALID
    // rather than as a validation error, so the two are indistinguishable
    // from outside.
    licenseKey: z.string().min(1).max(128),

    // An opaque client-computed fingerprint. Keyren never asks for raw
    // hardware details, and never interprets this value.
    deviceId: z.string().min(1).max(1024),
  })
  .strip();

export type VerifyRequestBody = z.infer<typeof verifyRequestSchema>;
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/validation/verify-request.test.ts
```
Expected: 15 passed.

> Zod 4 strips unknown keys by default for object schemas; `.strip()` makes that explicit. If `.strip()` is not chainable in this version, remove the call — the default behaviour already satisfies the test.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Zod validation for the public verify request"
```

---

### Task 23: The public verification endpoint

**Files:**
- Create: `src/app/api/v1/licenses/verify/route.ts`
- Create: `tests/api/verify-route.test.ts`

- [ ] **Step 1: Write the failing test**

The route reads `env` and `db` at module scope, so the test mocks those two modules and drives the handler directly.

`tests/api/verify-route.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, TEST_HMAC_SECRET, truncateAll } from "../helpers/db";
import { DEVELOPER_A, makeLicense, makeProduct } from "../helpers/factories";
import type { Database } from "@/db/types";

let db: Database;
let close: () => Promise<void>;

vi.mock("@/db", () => ({
  get db() {
    return db;
  },
}));

vi.mock("@/env", () => ({
  env: {
    KEYREN_LICENSE_HMAC_SECRET: "test-hmac-secret-value-at-least-32-chars-long",
    RATE_LIMIT_VERIFY_PER_MINUTE: 5,
    RATE_LIMIT_VERIFY_PER_PRODUCT_PER_MINUTE: 100,
  },
}));

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  await truncateAll(db);
});

function request(body: unknown, ip = "203.0.113.5"): Request {
  return new Request("https://keyren.dev/api/v1/licenses/verify", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/v1/licenses/verify", () => {
  it("returns 200 and the documented success envelope", async () => {
    const { POST } = await import("@/app/api/v1/licenses/verify/route");
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id });

    const response = await POST(
      request({
        productId: product.id,
        licenseKey: license.plaintextKey,
        deviceId: "device-one",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      license: { status: "active", expiresAt: null },
    });
  });

  it("returns 403 LICENSE_INVALID for an unissued key", async () => {
    const { POST } = await import("@/app/api/v1/licenses/verify/route");
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });

    const response = await POST(
      request({
        productId: product.id,
        licenseKey: "KEYREN-ABCDEFGH-ABCDEFGH-ABCDEFGH-ABCDEFGH",
        deviceId: "device-one",
      }),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("LICENSE_INVALID");
  });

  it("returns 404 PRODUCT_INVALID for an unknown product", async () => {
    const { POST } = await import("@/app/api/v1/licenses/verify/route");
    const response = await POST(
      request({
        productId: "prod_UNKNOWN0000000000000000",
        licenseKey: "KEYREN-ABCDEFGH-ABCDEFGH-ABCDEFGH-ABCDEFGH",
        deviceId: "device-one",
      }),
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("PRODUCT_INVALID");
  });

  it("returns 403 DEVICE_MISMATCH for a second device", async () => {
    const { POST } = await import("@/app/api/v1/licenses/verify/route");
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, hwidLocked: true });

    const body = { productId: product.id, licenseKey: license.plaintextKey };
    await POST(request({ ...body, deviceId: "device-one" }));
    const response = await POST(request({ ...body, deviceId: "device-two" }));

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("DEVICE_MISMATCH");
  });

  // Spec test #16
  describe("malformed request", () => {
    it("returns 400 for a body that is not JSON", async () => {
      const { POST } = await import("@/app/api/v1/licenses/verify/route");
      const response = await POST(request("this is not json"));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("BAD_REQUEST");
    });

    it("returns 400 for a body missing required fields", async () => {
      const { POST } = await import("@/app/api/v1/licenses/verify/route");
      const response = await POST(request({ productId: "prod_ABC" }));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("BAD_REQUEST");
    });

    it("does not leak validation internals in the message", async () => {
      const { POST } = await import("@/app/api/v1/licenses/verify/route");
      const response = await POST(request({}));
      const body = await response.json();
      expect(body.error.message).toBe("The request body was malformed.");
      expect(JSON.stringify(body)).not.toMatch(/zod|expected|received|path/i);
    });

    it("rejects a non-POST method", async () => {
      const routeModule = await import("@/app/api/v1/licenses/verify/route");
      // GET is exported explicitly so the framework returns a clean 405
      // rather than an unhandled 404 for a wrong-method integration bug.
      const response = await routeModule.GET();
      expect(response.status).toBe(405);
    });
  });

  // Spec test #17
  describe("rate limiting", () => {
    it("returns 429 RATE_LIMITED once the per-IP limit is exceeded", async () => {
      const { POST } = await import("@/app/api/v1/licenses/verify/route");
      const product = await makeProduct(db, { ownerId: DEVELOPER_A });
      const license = await makeLicense(db, { productId: product.id, hwidLocked: false });

      const body = {
        productId: product.id,
        licenseKey: license.plaintextKey,
        deviceId: "device-one",
      };

      // The mocked config allows 5 per minute per IP.
      for (let i = 0; i < 5; i += 1) {
        expect((await POST(request(body, "198.51.100.7"))).status).toBe(200);
      }

      const limited = await POST(request(body, "198.51.100.7"));
      expect(limited.status).toBe(429);
      expect((await limited.json()).error.code).toBe("RATE_LIMITED");
    });

    it("sets a Retry-After header", async () => {
      const { POST } = await import("@/app/api/v1/licenses/verify/route");
      const product = await makeProduct(db, { ownerId: DEVELOPER_A });
      const license = await makeLicense(db, { productId: product.id, hwidLocked: false });
      const body = {
        productId: product.id,
        licenseKey: license.plaintextKey,
        deviceId: "device-one",
      };

      for (let i = 0; i < 6; i += 1) await POST(request(body, "198.51.100.8"));
      const limited = await POST(request(body, "198.51.100.8"));

      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    });

    it("does not limit a different IP", async () => {
      const { POST } = await import("@/app/api/v1/licenses/verify/route");
      const product = await makeProduct(db, { ownerId: DEVELOPER_A });
      const license = await makeLicense(db, { productId: product.id, hwidLocked: false });
      const body = {
        productId: product.id,
        licenseKey: license.plaintextKey,
        deviceId: "device-one",
      };

      for (let i = 0; i < 6; i += 1) await POST(request(body, "198.51.100.9"));
      expect((await POST(request(body, "198.51.100.10"))).status).toBe(200);
    });

    it("limits before touching the license lookup", async () => {
      // Proves the limiter runs ahead of any database work, so a flood of
      // guesses cannot be used to probe the licenses table.
      const { POST } = await import("@/app/api/v1/licenses/verify/route");
      const junk = {
        productId: "prod_UNKNOWN0000000000000000",
        licenseKey: "KEYREN-ABCDEFGH-ABCDEFGH-ABCDEFGH-ABCDEFGH",
        deviceId: "device-one",
      };

      for (let i = 0; i < 5; i += 1) await POST(request(junk, "198.51.100.11"));
      const limited = await POST(request(junk, "198.51.100.11"));

      // 429 rather than the 404 an unlimited request would have produced.
      expect(limited.status).toBe(429);
    });
  });

  it("never echoes the submitted license key", async () => {
    const { POST } = await import("@/app/api/v1/licenses/verify/route");
    const product = await makeProduct(db, { ownerId: DEVELOPER_A });
    const license = await makeLicense(db, { productId: product.id, status: "revoked" });

    const response = await POST(
      request({
        productId: product.id,
        licenseKey: license.plaintextKey,
        deviceId: "device-one",
      }),
    );

    expect(await response.text()).not.toContain(license.plaintextKey);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/api/verify-route.test.ts
```
Expected: FAIL — the route module does not exist.

- [ ] **Step 3: Implement `src/app/api/v1/licenses/verify/route.ts`**

```ts
import { NextResponse } from "next/server";
import { db } from "@/db";
import { env } from "@/env";
import {
  VERIFICATION_ERROR_MESSAGE,
  VERIFICATION_ERROR_STATUS,
  type VerificationErrorCode,
} from "@/lib/errors";
import { verifyLicense } from "@/lib/licenses/verify";
import { PostgresRateLimiter, clientIpFrom, verifyDimensions } from "@/lib/rate-limit";
import { verifyRequestSchema } from "@/lib/validation/verify-request";

/**
 * POST /api/v1/licenses/verify
 *
 * The only public, unauthenticated endpoint in Keyren. It is a thin adapter:
 * parse, meter, delegate to the verification engine, serialize. No licensing
 * decision is made in this file.
 *
 * The URL is versioned `/v1/` on normal semantic-versioning grounds. That is
 * intentionally decoupled from the `Alpha_v1` release name — the marketing
 * name can advance to Alpha_v2 or Beta_v1 without breaking a single deployed
 * client.
 *
 * Alpha_v1 is online-only. There is no offline grant, no cached token, and no
 * grace period: if Keyren is unreachable, integrating software cannot obtain
 * a positive answer. A future release can add server-signed grace tokens by
 * extending this response, which is why the success envelope is an object
 * rather than a bare boolean.
 */

// Node runtime: the verification path uses node:crypto for HMAC.
export const runtime = "nodejs";
// Never cache a licensing decision.
export const dynamic = "force-dynamic";

function errorResponse(code: VerificationErrorCode, headers?: HeadersInit): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message: VERIFICATION_ERROR_MESSAGE[code] } },
    { status: VERIFICATION_ERROR_STATUS[code], headers },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    // 1. Structure. A malformed body is rejected before any work is done.
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return errorResponse("BAD_REQUEST");
    }

    const parsed = verifyRequestSchema.safeParse(raw);
    if (!parsed.success) {
      // Zod's issue list is deliberately discarded: it would describe the
      // expected shape of the request to anyone probing the endpoint.
      return errorResponse("BAD_REQUEST");
    }

    const { productId, licenseKey, deviceId } = parsed.data;

    // 2. Rate limit BEFORE any license lookup, so a flood of guesses never
    //    reaches the database.
    const limiter = new PostgresRateLimiter(db);
    const limit = await limiter.consume(
      verifyDimensions(
        { ip: clientIpFrom(request.headers), productId },
        {
          perIpPerMinute: env.RATE_LIMIT_VERIFY_PER_MINUTE,
          perProductPerMinute: env.RATE_LIMIT_VERIFY_PER_PRODUCT_PER_MINUTE,
        },
      ),
    );

    if (!limit.allowed) {
      // Retry-After is the only detail exposed. Nothing about which axis
      // tripped, what the limits are, or how the limiter is implemented.
      return errorResponse("RATE_LIMITED", {
        "retry-after": String(limit.retryAfterSeconds),
      });
    }

    // 3. Delegate every licensing decision to the engine.
    const result = await verifyLicense(db, {
      productId,
      licenseKey,
      deviceId,
      secret: env.KEYREN_LICENSE_HMAC_SECRET,
    });

    if (!result.success) {
      return errorResponse(result.error.code);
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    // Server-side detail for debugging; nothing here reaches the client. The
    // caught value is never interpolated into the response, so a database
    // error message cannot leak schema details.
    console.error("[verify] unexpected failure", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse("INTERNAL_ERROR");
  }
}

/** Explicit 405 so a wrong-method integration bug is obvious, not a 404. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: false,
      error: { code: "BAD_REQUEST", message: "Use POST for license verification." },
    },
    { status: 405, headers: { allow: "POST" } },
  );
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/api/verify-route.test.ts
```
Expected: 14 passed.

> If `vi.mock` with a getter does not resolve `db` in time, the fallback is to extract the handler body into `src/lib/licenses/verify-handler.ts` taking `(db, env, request)` and have the route be a three-line adapter. That is a better shape anyway if the mock proves brittle — take it rather than fighting the mock.

- [ ] **Step 5: Full suite and typecheck**

```bash
npm run typecheck && npx vitest run
```
Expected: all green. Every one of the 17 mandated scenarios is now covered.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: public POST /api/v1/licenses/verify endpoint"
```

---
## Phase 7 — Developer authentication and server actions

### Task 24: Clerk wiring

**Files:**
- Create: `middleware.ts`, `src/lib/auth/require-developer.ts`
- Create: `src/app/sign-in/[[...sign-in]]/page.tsx`, `src/app/sign-up/[[...sign-up]]/page.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create `middleware.ts` at the repo root**

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Everything under /dashboard requires an authenticated developer.
 *
 * The public verification API is deliberately NOT matched: customer software
 * authenticates with a license key, not a Clerk session, and must never be
 * redirected to a sign-in page. The two authentication systems are entirely
 * separate and share no state.
 *
 * Middleware is a convenience, not the security boundary. Every server action
 * and query independently re-derives the owner from `auth()` and scopes its
 * SQL — a middleware misconfiguration alone cannot expose another
 * developer's data.
 */
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip static files and Next internals, run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

- [ ] **Step 2: Create `src/lib/auth/require-developer.ts`**

```ts
import { auth } from "@clerk/nextjs/server";

/**
 * The single source of the authenticated developer's ID.
 *
 * Every service call takes `ownerId` explicitly, and this is the only
 * function permitted to produce one. `ownerId` is never read from a form
 * field, a URL parameter, a header, or a request body — a browser can claim
 * anything, and Clerk's server-side session is the only thing that can prove
 * it.
 */
export async function requireDeveloperId(): Promise<string> {
  const { userId } = await auth();

  if (!userId) {
    // Middleware should already have redirected. Reaching here means a route
    // was not covered, so fail closed rather than continuing without an owner.
    throw new Error("Unauthorized");
  }

  return userId;
}
```

- [ ] **Step 3: Wrap the app in `ClerkProvider`**

Modify `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keyren — Software licensing for developers",
  description: "Add secure license authentication in 5 minutes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorBackground: "#0a0a0b",
          colorPrimary: "#6366f1",
          colorText: "#fafafa",
          borderRadius: "0.5rem",
        },
      }}
    >
      <html lang="en" className="dark">
        <body className="min-h-screen bg-[#0a0a0b] text-neutral-100 antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 4: Create the auth pages**

`src/app/sign-in/[[...sign-in]]/page.tsx`:

```tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignIn />
    </main>
  );
}
```

`src/app/sign-up/[[...sign-up]]/page.tsx`:

```tsx
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignUp />
    </main>
  );
}
```

- [ ] **Step 5: Verify**

```bash
npm run typecheck
```
Expected: exits 0.

A running check needs real Clerk keys in `.env.local`. If they are not available yet, note it and continue — the test suite does not depend on Clerk.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Clerk developer authentication and route protection"
```

---

### Task 25: Server actions

**Files:**
- Create: `src/lib/validation/dashboard.ts`
- Create: `src/app/dashboard/products/actions.ts`
- Create: `src/app/dashboard/products/[productId]/licenses/actions.ts`
- Create: `tests/validation/dashboard.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/validation/dashboard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createLicenseSchema,
  createProductSchema,
  licenseIdSchema,
  productIdSchema,
  renameProductSchema,
} from "@/lib/validation/dashboard";

describe("createProductSchema", () => {
  it("accepts a reasonable name", () => {
    expect(createProductSchema.safeParse({ name: "Seliware Key" }).success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(createProductSchema.parse({ name: "  Spaced  " }).name).toBe("Spaced");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(createProductSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createProductSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects an oversized name", () => {
    expect(createProductSchema.safeParse({ name: "x".repeat(201) }).success).toBe(false);
  });

  it("ignores an ownerId supplied by the client", () => {
    // Ownership comes from Clerk, never from the browser. Even if a crafted
    // request carries one, it must not survive parsing.
    const parsed = createProductSchema.parse({ name: "Ok", ownerId: "user_attacker" });
    expect(parsed).not.toHaveProperty("ownerId");
  });
});

describe("renameProductSchema", () => {
  it("requires both a product id and a name", () => {
    expect(
      renameProductSchema.safeParse({ productId: "prod_ABC", name: "New" }).success,
    ).toBe(true);
    expect(renameProductSchema.safeParse({ name: "New" }).success).toBe(false);
  });
});

describe("id schemas", () => {
  it("requires the prod_ prefix", () => {
    expect(productIdSchema.safeParse("prod_ABC123").success).toBe(true);
    expect(productIdSchema.safeParse("lic_ABC123").success).toBe(false);
  });

  it("requires the lic_ prefix", () => {
    expect(licenseIdSchema.safeParse("lic_ABC123").success).toBe(true);
    expect(licenseIdSchema.safeParse("prod_ABC123").success).toBe(false);
  });
});

describe("createLicenseSchema", () => {
  const base = { productId: "prod_ABC123", hwidLocked: true };

  it("accepts permanent", () => {
    expect(createLicenseSchema.safeParse({ ...base, mode: "permanent" }).success).toBe(true);
  });

  it("accepts a duration from the allowed set", () => {
    expect(
      createLicenseSchema.safeParse({ ...base, mode: "duration", duration: "30d" }).success,
    ).toBe(true);
  });

  it("rejects a duration outside the allowed set", () => {
    expect(
      createLicenseSchema.safeParse({ ...base, mode: "duration", duration: "1000y" }).success,
    ).toBe(false);
  });

  it("requires a duration when the mode is duration", () => {
    expect(createLicenseSchema.safeParse({ ...base, mode: "duration" }).success).toBe(false);
  });

  it("requires a date when the mode is date", () => {
    expect(createLicenseSchema.safeParse({ ...base, mode: "date" }).success).toBe(false);
  });

  it("coerces an ISO date string", () => {
    const parsed = createLicenseSchema.parse({
      ...base,
      mode: "date",
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    expect(parsed.mode).toBe("date");
    if (parsed.mode === "date") {
      expect(parsed.expiresAt).toBeInstanceOf(Date);
    }
  });

  it("defaults hwidLocked to true when omitted", () => {
    // HWID locking is on by default; an omitted checkbox must not silently
    // produce an unlocked license.
    const parsed = createLicenseSchema.parse({ productId: "prod_ABC123", mode: "permanent" });
    expect(parsed.hwidLocked).toBe(true);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run tests/validation/dashboard.test.ts
```
Expected: FAIL — cannot resolve `@/lib/validation/dashboard`.

- [ ] **Step 3: Implement `src/lib/validation/dashboard.ts`**

```ts
import { z } from "zod";
import { DURATION_OPTIONS } from "@/lib/licenses/expiration";

/**
 * Input schemas for dashboard server actions.
 *
 * None of these contain an `ownerId`. That is the point: the only trusted
 * source of ownership is Clerk's server-side session, so there is nowhere for
 * a crafted form submission to declare one.
 */

export const productIdSchema = z.string().regex(/^prod_[0-9A-Za-z]+$/, "Invalid product id");
export const licenseIdSchema = z.string().regex(/^lic_[0-9A-Za-z]+$/, "Invalid license id");

const productName = z.string().trim().min(1, "Name is required").max(200, "Name is too long");

export const createProductSchema = z.object({ name: productName });

export const renameProductSchema = z.object({
  productId: productIdSchema,
  name: productName,
});

const durationValues = DURATION_OPTIONS.map((option) => option.value) as [string, ...string[]];

export const createLicenseSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("permanent"),
    productId: productIdSchema,
    hwidLocked: z.boolean().default(true),
  }),
  z.object({
    mode: z.literal("date"),
    productId: productIdSchema,
    hwidLocked: z.boolean().default(true),
    expiresAt: z.coerce.date(),
  }),
  z.object({
    mode: z.literal("duration"),
    productId: productIdSchema,
    hwidLocked: z.boolean().default(true),
    duration: z.enum(durationValues),
  }),
]);

export const licenseActionSchema = z.object({ licenseId: licenseIdSchema });
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/validation/dashboard.test.ts
```
Expected: 15 passed.

> `z.discriminatedUnion` with `.default()` on a shared field: if Zod 4 rejects a default inside a discriminated union member, move `hwidLocked` to a `.transform()` that fills it, or preprocess the form data. Do not remove the default — an omitted checkbox producing an unlocked license is a real security regression.

- [ ] **Step 5: Create `src/app/dashboard/products/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { createProduct, deleteProduct, renameProduct } from "@/lib/products/service";
import { createProductSchema, productIdSchema, renameProductSchema } from "@/lib/validation/dashboard";

/**
 * Server actions are thin: authenticate, validate, delegate.
 *
 * Every one of them re-derives `ownerId` from Clerk. A server action is a
 * public HTTP endpoint with a generated name — it is not protected by the
 * fact that only the dashboard UI calls it, so it re-authorizes from scratch.
 */

export type ActionState = { error: string } | { error: null };

export async function createProductAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ownerId = await requireDeveloperId();

  const parsed = createProductSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const product = await createProduct(db, ownerId, { name: parsed.data.name });

  revalidatePath("/dashboard/products");
  redirect(`/dashboard/products/${product.id}`);
}

export async function renameProductAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ownerId = await requireDeveloperId();

  const parsed = renameProductSchema.safeParse({
    productId: formData.get("productId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await renameProduct(db, ownerId, parsed.data.productId, parsed.data.name);
  } catch {
    // Includes the "belongs to another developer" case, reported identically.
    return { error: "Product not found." };
  }

  revalidatePath("/dashboard/products");
  revalidatePath(`/dashboard/products/${parsed.data.productId}`);
  return { error: null };
}

export async function deleteProductAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ownerId = await requireDeveloperId();

  const parsed = productIdSchema.safeParse(formData.get("productId"));
  if (!parsed.success) return { error: "Invalid product." };

  try {
    await deleteProduct(db, ownerId, parsed.data);
  } catch {
    return { error: "Product not found." };
  }

  revalidatePath("/dashboard/products");
  redirect("/dashboard/products");
}
```

- [ ] **Step 6: Create `src/app/dashboard/products/[productId]/licenses/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { env } from "@/env";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import {
  createLicense,
  deleteLicense,
  resetActivation,
  restoreLicense,
  revokeLicense,
} from "@/lib/licenses/service";
import type { ExpirationInput } from "@/lib/licenses/expiration";
import { createLicenseSchema, licenseActionSchema } from "@/lib/validation/dashboard";

export type LicenseActionState = { error: string | null };

/**
 * The ONLY code path in Keyren that returns a plaintext license key.
 *
 * The key travels: generator -> this response -> the creation dialog. It is
 * never written to the database, never logged, and never returned by any
 * list or detail endpoint. Once the dialog is dismissed it is unrecoverable,
 * which is why the dialog demands an explicit acknowledgement.
 */
export type CreateLicenseState =
  | { error: string; plaintextKey: null }
  | { error: null; plaintextKey: string };

export async function createLicenseAction(
  _previous: CreateLicenseState,
  formData: FormData,
): Promise<CreateLicenseState> {
  const ownerId = await requireDeveloperId();

  const parsed = createLicenseSchema.safeParse({
    productId: formData.get("productId"),
    mode: formData.get("mode"),
    duration: formData.get("duration") ?? undefined,
    expiresAt: formData.get("expiresAt") ?? undefined,
    // An unchecked box submits nothing at all, so absence must mean locked.
    hwidLocked: formData.get("hwidLocked") !== "off",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input", plaintextKey: null };
  }

  const expiration: ExpirationInput =
    parsed.data.mode === "permanent"
      ? { mode: "permanent" }
      : parsed.data.mode === "date"
        ? { mode: "date", expiresAt: parsed.data.expiresAt }
        : { mode: "duration", duration: parsed.data.duration };

  try {
    const { plaintextKey } = await createLicense(db, ownerId, {
      productId: parsed.data.productId,
      expiration,
      hwidLocked: parsed.data.hwidLocked,
      secret: env.KEYREN_LICENSE_HMAC_SECRET,
    });

    revalidatePath(`/dashboard/products/${parsed.data.productId}/licenses`);
    return { error: null, plaintextKey };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create license.";
    return { error: message, plaintextKey: null };
  }
}

/** Shared shape for the four single-license mutations. */
function licenseMutation(
  run: (ownerId: string, licenseId: string) => Promise<unknown>,
) {
  return async (
    _previous: LicenseActionState,
    formData: FormData,
  ): Promise<LicenseActionState> => {
    const ownerId = await requireDeveloperId();

    const parsed = licenseActionSchema.safeParse({ licenseId: formData.get("licenseId") });
    if (!parsed.success) return { error: "Invalid license." };

    const productId = formData.get("productId");

    try {
      await run(ownerId, parsed.data.licenseId);
    } catch {
      return { error: "License not found." };
    }

    if (typeof productId === "string") {
      revalidatePath(`/dashboard/products/${productId}/licenses`);
    }
    return { error: null };
  };
}

export const revokeLicenseAction = licenseMutation((ownerId, licenseId) =>
  revokeLicense(db, ownerId, licenseId),
);

export const restoreLicenseAction = licenseMutation((ownerId, licenseId) =>
  restoreLicense(db, ownerId, licenseId),
);

export const resetActivationAction = licenseMutation((ownerId, licenseId) =>
  resetActivation(db, ownerId, licenseId),
);

export const deleteLicenseAction = licenseMutation((ownerId, licenseId) =>
  deleteLicense(db, ownerId, licenseId),
);
```

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck && npx vitest run
git add -A && git commit -m "feat: dashboard server actions for products and licenses"
```

---
## Phase 8 — Dashboard UI

Visual direction: dark-first, minimal, spacious, subtle borders, restrained accents. Vercel/Linear/Stripe, not a decorative SaaS landing page. No hero sections inside the authenticated dashboard, no glassmorphism, no gratuitous animation.

### Task 26: shadcn/ui and the design tokens

**Files:**
- Modify: `src/app/globals.css`
- Create: `components.json`, `src/components/ui/**`, `src/lib/utils.ts`

- [ ] **Step 1: Initialise shadcn/ui**

```bash
npx --yes shadcn@latest init --defaults --base-color neutral --yes
```

Then add the components this build uses:

```bash
npx --yes shadcn@latest add button card dialog alert-dialog input label select switch table badge dropdown-menu sonner separator tabs --yes
```

Expected: `src/components/ui/*.tsx` created, `src/lib/utils.ts` with `cn()`, `components.json` written.

- [ ] **Step 2: Set the dark-first palette in `src/app/globals.css`**

Keep the `@import "tailwindcss";` line shadcn/Tailwind 4 generates, and set the dark theme values so the app is dark by default (the root `<html>` already carries `className="dark"`):

```css
:root {
  --background: oklch(0.145 0.005 285);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.175 0.005 285);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.175 0.005 285);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.62 0.19 275);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.23 0.005 285);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.23 0.005 285);
  --muted-foreground: oklch(0.68 0.008 285);
  --accent: oklch(0.25 0.006 285);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.58 0.21 25);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(0.26 0.005 285);
  --input: oklch(0.26 0.005 285);
  --ring: oklch(0.62 0.19 275);
  --radius: 0.625rem;
}
```

Apply the same values under `.dark` so both selectors resolve identically — Alpha_v1 ships dark only, and this avoids a flash of an unstyled light theme.

- [ ] **Step 3: Verify the build compiles**

```bash
npm run typecheck && npm run build
```
Expected: build succeeds. It will fail if `.env.local` lacks the required variables, because `src/env.ts` validates at import time — that is the intended behaviour. Populate `.env.local` from `.env.example` with a placeholder `DATABASE_URL`, a generated secret (`openssl rand -hex 32`), and Clerk test keys before building.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: shadcn/ui with dark-first design tokens"
```

---

### Task 27: Dashboard shell and navigation

**Files:**
- Create: `src/components/dashboard/sidebar.tsx`, `src/components/dashboard/copy-button.tsx`, `src/components/dashboard/page-header.tsx`
- Create: `src/app/dashboard/layout.tsx`, `src/app/dashboard/page.tsx`, `src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Create `src/components/dashboard/copy-button.tsx`**

Used in several places — product IDs, license keys, the integration snippet.

```tsx
"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied; the value is always selectable as
      // text, so failing quietly is better than an alarming error.
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={copy}
      aria-label={copied ? "Copied" : label}
      className={cn("h-7 gap-1.5 px-2 text-xs text-muted-foreground", className)}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
```

- [ ] **Step 2: Create `src/components/dashboard/page-header.tsx`**

```tsx
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/dashboard/sidebar.tsx`**

Exactly three items. No placeholders for features that do not exist.

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Package, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/dashboard/products", label: "Products", icon: Package, exact: false },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, exact: true },
] as const;

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Dashboard">
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Create `src/app/dashboard/layout.tsx`**

```tsx
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Toaster } from "@/components/ui/sonner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="font-semibold tracking-tight">Keyren</span>
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Alpha_v1
          </span>
        </Link>
        <UserButton />
      </header>

      <div className="mx-auto flex max-w-7xl">
        <aside className="hidden w-56 shrink-0 border-r border-border md:block">
          <div className="sticky top-14">
            <DashboardSidebar />
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-6 py-8">{children}</main>
      </div>

      <Toaster />
    </div>
  );
}
```

- [ ] **Step 5: Create `src/app/dashboard/page.tsx` (Overview)**

```tsx
import Link from "next/link";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { listProducts } from "@/lib/products/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function OverviewPage() {
  const ownerId = await requireDeveloperId();
  const products = await listProducts(db, ownerId);

  const totalLicenses = products.reduce((sum, product) => sum + product.licenseCount, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Your licensing footprint at a glance."
        action={
          <Button asChild size="sm">
            <Link href="/dashboard/products">Manage products</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{products.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Licenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{totalLicenses}</p>
          </CardContent>
        </Card>
      </div>

      {products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-8">
            <div className="space-y-1">
              <p className="text-sm font-medium">No products yet</p>
              <p className="text-sm text-muted-foreground">
                Create a product to get a product ID and start issuing licenses.
              </p>
            </div>
            <Button asChild size="sm">
              <Link href="/dashboard/products">Create a product</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Create `src/app/dashboard/settings/page.tsx`**

Alpha_v1 has no developer-configurable settings, so this page states the release's limitations honestly rather than showing fake toggles.

```tsx
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Account and release information."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Your account is managed through the avatar menu in the top-right corner.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Release: Alpha_v1</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>This is a private testing release. Known limitations:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Validation is online-only. If Keyren is unreachable, your software cannot
              obtain a positive licensing response. There are no offline licenses and no
              cached grace periods.
            </li>
            <li>HWID-locked licenses bind to exactly one device.</li>
            <li>
              Only a developer can reset an activation. End users cannot reset their own,
              so a reinstall consumes the binding until you reset it.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 7: Verify and commit**

```bash
npm run typecheck && git add -A && git commit -m "feat: dashboard shell, overview and settings"
```

---

### Task 28: Products page

**Files:**
- Create: `src/components/products/create-product-dialog.tsx`, `src/components/products/product-actions.tsx`
- Create: `src/app/dashboard/products/page.tsx`

- [ ] **Step 1: Create `src/components/products/create-product-dialog.tsx`**

```tsx
"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { createProductAction, type ActionState } from "@/app/dashboard/products/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: ActionState = { error: null };

export function CreateProductDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createProductAction, INITIAL);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" />
          New product
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form action={formAction}>
          <DialogHeader>
            <DialogTitle>Create product</DialogTitle>
            <DialogDescription>
              Keyren assigns a permanent product ID. Renaming the product later never
              changes it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-5">
            <Label htmlFor="name">Product name</Label>
            <Input id="name" name="name" placeholder="Seliware Key" autoFocus required maxLength={200} />
            {state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create `src/components/products/product-actions.tsx`**

Rename and delete, with delete requiring the product name to be typed.

```tsx
"use client";

import { useActionState, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  deleteProductAction,
  renameProductAction,
  type ActionState,
} from "@/app/dashboard/products/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: ActionState = { error: null };

export function ProductActions({ productId, name }: { productId: string; name: string }) {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const [renameState, renameAction, renamePending] = useActionState(renameProductAction, INITIAL);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteProductAction, INITIAL);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${name}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <form action={renameAction}>
            <input type="hidden" name="productId" value={productId} />
            <DialogHeader>
              <DialogTitle>Rename product</DialogTitle>
              <DialogDescription>
                The product ID stays the same, so deployed software keeps working.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-5">
              <Label htmlFor={`rename-${productId}`}>Product name</Label>
              <Input id={`rename-${productId}`} name="name" defaultValue={name} required maxLength={200} />
              {renameState.error ? (
                <p className="text-sm text-destructive">{renameState.error}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={renamePending}>
                {renamePending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          <form action={deleteAction}>
            <input type="hidden" name="productId" value={productId} />
            <DialogHeader>
              <DialogTitle>Delete {name}?</DialogTitle>
              <DialogDescription>
                This permanently deletes the product and every license under it. Software
                using those licenses will stop authenticating immediately. This cannot be
                undone.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-5">
              <Label htmlFor={`confirm-${productId}`}>
                Type <span className="font-mono text-foreground">{name}</span> to confirm
              </Label>
              <Input
                id={`confirm-${productId}`}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
              />
              {deleteState.error ? (
                <p className="text-sm text-destructive">{deleteState.error}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDeleting(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={deletePending || confirmation !== name}
              >
                {deletePending ? "Deleting…" : "Delete product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 3: Create `src/app/dashboard/products/page.tsx`**

```tsx
import Link from "next/link";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { listProducts } from "@/lib/products/service";
import { PageHeader } from "@/components/dashboard/page-header";
import { CopyButton } from "@/components/dashboard/copy-button";
import { CreateProductDialog } from "@/components/products/create-product-dialog";
import { ProductActions } from "@/components/products/product-actions";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ProductsPage() {
  const ownerId = await requireDeveloperId();
  const products = await listProducts(db, ownerId);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Products"
        description="Each product has a permanent ID that your software sends when verifying a license."
        action={<CreateProductDialog />}
      />

      {products.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium">No products yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first product to start issuing licenses.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Product ID</TableHead>
                <TableHead className="text-right">Licenses</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/products/${product.id}`}
                      className="font-medium hover:underline"
                    >
                      {product.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{product.slug}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {product.id}
                      </code>
                      <CopyButton value={product.id} label="" />
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {product.licenseCount}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {product.createdAt.toISOString().slice(0, 10)}
                  </TableCell>
                  <TableCell>
                    <ProductActions productId={product.id} name={product.name} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify and commit**

```bash
npm run typecheck && git add -A && git commit -m "feat: products page with create, rename and confirmed delete"
```

---
### Task 29: Product detail page and integration documentation

**Files:**
- Create: `src/app/dashboard/products/[productId]/layout.tsx`, `src/app/dashboard/products/[productId]/page.tsx`
- Create: `src/components/products/integration-snippet.tsx`

- [ ] **Step 1: Create `src/app/dashboard/products/[productId]/layout.tsx`**

Fetches the product once (ownership-scoped) and renders the two product-level tabs.

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { getProduct } from "@/lib/products/service";
import { CopyButton } from "@/components/dashboard/copy-button";

export default async function ProductLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const ownerId = await requireDeveloperId();

  // Scoped by owner. A product belonging to another developer resolves to
  // null and renders the same 404 as one that does not exist.
  const product = await getProduct(db, ownerId, productId);
  if (!product) notFound();

  return (
    <div className="space-y-8">
      <div className="space-y-4 border-b border-border pb-6">
        <Link
          href="/dashboard/products"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Products
        </Link>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">{product.name}</h1>
          <div className="flex items-center gap-1">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {product.id}
            </code>
            <CopyButton value={product.id} label="" />
          </div>
        </div>

        <nav className="flex gap-1" aria-label="Product sections">
          <Link
            href={`/dashboard/products/${product.id}`}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            Overview
          </Link>
          <Link
            href={`/dashboard/products/${product.id}/licenses`}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            Licenses
          </Link>
        </nav>
      </div>

      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/products/integration-snippet.tsx`**

The Alpha_v1 integration documentation, rendered with the developer's real product ID substituted in.

```tsx
import { CopyButton } from "@/components/dashboard/copy-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function IntegrationSnippet({
  productId,
  appUrl,
}: {
  productId: string;
  appUrl: string;
}) {
  const snippet = `const response = await fetch("${appUrl}/api/v1/licenses/verify", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    productId: "${productId}",
    licenseKey: "KEYREN-...",
    deviceId: "your-device-fingerprint",
  }),
});

const result = await response.json();

if (!result.success) {
  throw new Error(result.error.code);
}

// result.license.status   -> "active"
// result.license.expiresAt -> ISO string, or null for a permanent license`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Integration</CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="relative">
          <div className="absolute right-2 top-2">
            <CopyButton value={snippet} />
          </div>
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-xs leading-relaxed">
            <code>{snippet}</code>
          </pre>
        </div>

        <div className="space-y-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Before you ship this</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              The product ID above is not a secret and is safe to embed in software you
              distribute. It is an identifier, not a credential.
            </li>
            <li>
              Never ship any Keyren dashboard credential, session token, or the license
              HMAC secret inside end-user software. Anything in a distributed binary or a
              JavaScript bundle should be assumed readable by anyone who has it.
            </li>
            <li>
              Send a fingerprint you have already computed and hashed on the client.
              Do not send raw hardware serials.
            </li>
            <li>
              Treat a device fingerprint as an identifier, not as tamper-proof hardware
              identity. It raises the cost of casual key sharing; it does not make
              spoofing impossible.
            </li>
            <li>
              Verification is online-only in this release. If Keyren is unreachable your
              software cannot obtain a positive response — decide deliberately how your
              application should behave in that case.
            </li>
            <li>
              Handle every error code:{" "}
              <code className="font-mono text-xs">LICENSE_INVALID</code>,{" "}
              <code className="font-mono text-xs">LICENSE_REVOKED</code>,{" "}
              <code className="font-mono text-xs">LICENSE_EXPIRED</code>,{" "}
              <code className="font-mono text-xs">DEVICE_MISMATCH</code>,{" "}
              <code className="font-mono text-xs">PRODUCT_INVALID</code>,{" "}
              <code className="font-mono text-xs">RATE_LIMITED</code>,{" "}
              <code className="font-mono text-xs">INTERNAL_ERROR</code>,{" "}
              <code className="font-mono text-xs">BAD_REQUEST</code>.
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create `src/app/dashboard/products/[productId]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { env } from "@/env";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { getProduct } from "@/lib/products/service";
import { listLicenses } from "@/lib/licenses/service";
import { IntegrationSnippet } from "@/components/products/integration-snippet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ProductOverviewPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const ownerId = await requireDeveloperId();

  const product = await getProduct(db, ownerId, productId);
  if (!product) notFound();

  const licenses = await listLicenses(db, ownerId, productId);
  const active = licenses.filter((license) => license.status === "active").length;
  const activated = licenses.filter((license) => license.activation !== null).length;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Licenses", value: licenses.length },
          { label: "Active", value: active },
          { label: "Activated devices", value: activated },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button asChild size="sm" variant="outline">
          <Link href={`/dashboard/products/${product.id}/licenses`}>Manage licenses</Link>
        </Button>
      </div>

      <IntegrationSnippet productId={product.id} appUrl={env.NEXT_PUBLIC_APP_URL} />
    </div>
  );
}
```

- [ ] **Step 4: Verify and commit**

```bash
npm run typecheck && git add -A && git commit -m "feat: product overview with integration documentation"
```

---

### Task 30: License creation dialog with show-once key

The single most important piece of UX in the product. If the developer dismisses this without saving the key, it is gone.

**Files:**
- Create: `src/components/licenses/create-license-dialog.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import {
  createLicenseAction,
  type CreateLicenseState,
} from "@/app/dashboard/products/[productId]/licenses/actions";
import { DURATION_OPTIONS } from "@/lib/licenses/expiration";
import { CopyButton } from "@/components/dashboard/copy-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const INITIAL: CreateLicenseState = { error: null, plaintextKey: null };

type Mode = "permanent" | "date" | "duration";

export function CreateLicenseDialog({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("permanent");
  const [hwidLocked, setHwidLocked] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);

  const [state, formAction, pending] = useActionState(createLicenseAction, INITIAL);

  // Reset the acknowledgement whenever a new key arrives, so the developer
  // cannot carry a previous confirmation over to a key they have not saved.
  useEffect(() => {
    if (state.plaintextKey) setAcknowledged(false);
  }, [state.plaintextKey]);

  function closeAll() {
    setOpen(false);
    setMode("permanent");
    setHwidLocked(true);
    setAcknowledged(false);
  }

  // Once a key exists, the form is replaced by the reveal. There is no path
  // back to the form without dismissing the key, and no way to re-open it.
  if (state.plaintextKey) {
    return (
      <Dialog open onOpenChange={() => undefined}>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-500" />
              Save this key now
            </DialogTitle>
            <DialogDescription>
              This is the only time Keyren will ever show this license key. Only a secure
              derived value is stored in the database, so it cannot be recovered or
              displayed again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-5">
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <code className="block break-all font-mono text-sm">{state.plaintextKey}</code>
            </div>
            <CopyButton value={state.plaintextKey} label="Copy license key" />

            <label className="flex cursor-pointer items-start gap-2.5 pt-2 text-sm">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="text-muted-foreground">
                I have saved this key. I understand it cannot be shown again.
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button onClick={closeAll} disabled={!acknowledged}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" />
          Generate license
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form action={formAction}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="hwidLocked" value={hwidLocked ? "on" : "off"} />

          <DialogHeader>
            <DialogTitle>Generate license</DialogTitle>
            <DialogDescription>
              The key is shown once, immediately after creation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-5">
            <div className="space-y-2">
              <Label htmlFor="mode-select">Expiration</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as Mode)}>
                <SelectTrigger id="mode-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="permanent">Permanent — never expires</SelectItem>
                  <SelectItem value="duration">Expires after a duration</SelectItem>
                  <SelectItem value="date">Expires on a specific date</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === "duration" ? (
              <div className="space-y-2">
                <Label htmlFor="duration">Duration</Label>
                <select
                  id="duration"
                  name="duration"
                  defaultValue="30d"
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {DURATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Counted from now, not from first activation.
                </p>
              </div>
            ) : null}

            {mode === "date" ? (
              <div className="space-y-2">
                <Label htmlFor="expiresAt">Expires on</Label>
                <Input id="expiresAt" name="expiresAt" type="date" required />
                <p className="text-xs text-muted-foreground">Interpreted as UTC.</p>
              </div>
            ) : null}

            <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
              <div className="space-y-1">
                <Label htmlFor="hwid">Lock to one device</Label>
                <p className="text-xs text-muted-foreground">
                  The first device to authenticate claims the license. Others are refused
                  until you reset the activation.
                </p>
              </div>
              <Switch id="hwid" checked={hwidLocked} onCheckedChange={setHwidLocked} />
            </div>

            {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Generating…" : "Generate license"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

> `showCloseButton` exists on the current shadcn dialog. If this version's `DialogContent` does not accept it, hide the close affordance with a class instead. The requirement is that the key cannot be dismissed accidentally — do not drop the acknowledgement gate.

- [ ] **Step 2: Verify and commit**

```bash
npm run typecheck && git add -A && git commit -m "feat: license creation dialog with show-once key reveal"
```

---

### Task 31: Licenses table and row actions

**Files:**
- Create: `src/components/licenses/license-row-actions.tsx`, `src/components/licenses/license-status-badge.tsx`
- Create: `src/app/dashboard/products/[productId]/licenses/page.tsx`

- [ ] **Step 1: Create `src/components/licenses/license-status-badge.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";

export function LicenseStatusBadge({
  status,
  expiresAt,
}: {
  status: "active" | "revoked";
  expiresAt: Date | null;
}) {
  if (status === "revoked") return <Badge variant="destructive">Revoked</Badge>;

  // An active license past its expiry is shown as Expired: that is what the
  // verification API will actually tell the customer's software.
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    return <Badge variant="secondary">Expired</Badge>;
  }

  return (
    <Badge className="border-emerald-500/25 bg-emerald-500/15 text-emerald-400" variant="outline">
      Active
    </Badge>
  );
}
```

- [ ] **Step 2: Create `src/components/licenses/license-row-actions.tsx`**

```tsx
"use client";

import { useActionState, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  deleteLicenseAction,
  resetActivationAction,
  restoreLicenseAction,
  revokeLicenseAction,
  type LicenseActionState,
} from "@/app/dashboard/products/[productId]/licenses/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: LicenseActionState = { error: null };

export function LicenseRowActions({
  licenseId,
  productId,
  status,
  hasActivation,
  maskedKey,
}: {
  licenseId: string;
  productId: string;
  status: "active" | "revoked";
  hasActivation: boolean;
  maskedKey: string;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState("");

  const [, revoke, revokePending] = useActionState(revokeLicenseAction, INITIAL);
  const [, restore, restorePending] = useActionState(restoreLicenseAction, INITIAL);
  const [, reset, resetPending] = useActionState(resetActivationAction, INITIAL);
  const [deleteState, remove, deletePending] = useActionState(deleteLicenseAction, INITIAL);

  const busy = revokePending || restorePending || resetPending;

  function hidden() {
    return (
      <>
        <input type="hidden" name="licenseId" value={licenseId} />
        <input type="hidden" name="productId" value={productId} />
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={busy}
            aria-label={`Actions for license ending ${maskedKey.slice(-4)}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-52">
          {status === "active" ? (
            <DropdownMenuItem asChild>
              <form action={revoke}>
                {hidden()}
                <button type="submit" className="w-full cursor-pointer text-left">
                  Revoke
                </button>
              </form>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <form action={restore}>
                {hidden()}
                <button type="submit" className="w-full cursor-pointer text-left">
                  Restore
                </button>
              </form>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem asChild disabled={!hasActivation}>
            <form action={reset}>
              {hidden()}
              <button
                type="submit"
                disabled={!hasActivation}
                className="w-full cursor-pointer text-left disabled:cursor-not-allowed"
              >
                Reset activation
              </button>
            </form>
          </DropdownMenuItem>

          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            Delete permanently
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <form action={remove}>
            {hidden()}
            <DialogHeader>
              <DialogTitle>Delete this license permanently?</DialogTitle>
              <DialogDescription>
                <span className="font-mono text-xs">{maskedKey}</span> will be erased along
                with its device activation. Any software using it stops authenticating
                immediately and will receive LICENSE_INVALID. This cannot be undone — if
                you only want to disable it temporarily, revoke it instead.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-5">
              <Label htmlFor={`del-${licenseId}`}>
                Type <span className="font-mono text-foreground">DELETE</span> to confirm
              </Label>
              <Input
                id={`del-${licenseId}`}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
              />
              {deleteState.error ? (
                <p className="text-sm text-destructive">{deleteState.error}</p>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={deletePending || typed !== "DELETE"}
              >
                {deletePending ? "Deleting…" : "Delete permanently"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 3: Create `src/app/dashboard/products/[productId]/licenses/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { getProduct } from "@/lib/products/service";
import { listLicenses } from "@/lib/licenses/service";
import { maskedLicenseKey } from "@/lib/crypto/license-key";
import { CreateLicenseDialog } from "@/components/licenses/create-license-dialog";
import { LicenseRowActions } from "@/components/licenses/license-row-actions";
import { LicenseStatusBadge } from "@/components/licenses/license-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "—";
}

export default async function LicensesPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const ownerId = await requireDeveloperId();

  const product = await getProduct(db, ownerId, productId);
  if (!product) notFound();

  const licenses = await listLicenses(db, ownerId, productId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium">Licenses</h2>
          <p className="text-sm text-muted-foreground">
            Keys are shown once at creation and cannot be retrieved afterwards.
          </p>
        </div>
        <CreateLicenseDialog productId={product.id} />
      </div>

      {licenses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium">No licenses yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate one to start authenticating installations of {product.name}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>License</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Device lock</TableHead>
                <TableHead>Activation</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {licenses.map((license) => (
                <TableRow key={license.id}>
                  <TableCell>
                    <code className="font-mono text-xs text-muted-foreground">
                      {maskedLicenseKey(license.keyLast4)}
                    </code>
                  </TableCell>

                  <TableCell>
                    <LicenseStatusBadge
                      status={license.status}
                      expiresAt={license.expiresAt}
                    />
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {license.hwidLocked ? "Locked" : "Unlocked"}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {license.activation
                      ? `Last seen ${formatDate(license.activation.lastSeenAt)}`
                      : "Not activated"}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {license.expiresAt ? formatDate(license.expiresAt) : "Never"}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(license.createdAt)}
                  </TableCell>

                  <TableCell>
                    <LicenseRowActions
                      licenseId={license.id}
                      productId={product.id}
                      status={license.status}
                      hasActivation={license.activation !== null}
                      maskedKey={maskedLicenseKey(license.keyLast4)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify and commit**

```bash
npm run typecheck && npm run lint && git add -A && git commit -m "feat: licenses table with revoke, restore, reset and delete"
```

---
## Phase 9 — Landing, documentation, verification

### Task 32: Landing page

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace the create-next-app placeholder**

Restrained, developer-infrastructure tone. The one place a hero is acceptable — the spec forbids them *inside the authenticated dashboard*.

```tsx
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

const SNIPPET = `const response = await fetch("https://keyren.dev/api/v1/licenses/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    productId: "prod_...",
    licenseKey: "KEYREN-...",
    deviceId: "your-device-fingerprint",
  }),
});

const result = await response.json();

if (!result.success) {
  throw new Error(result.error.code);
}`;

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-2">
          <span className="font-semibold tracking-tight">Keyren</span>
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Alpha_v1
          </span>
        </div>

        <div className="flex items-center gap-2">
          <SignedOut>
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-up">Get started</Link>
            </Button>
          </SignedOut>
          <SignedIn>
            <Button asChild size="sm">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </SignedIn>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-24">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Add secure license authentication in 5 minutes.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          Keyren issues and verifies software license keys so you do not have to build and
          maintain a licensing backend. One HTTP request, no server of your own.
        </p>

        <div className="mt-8 flex gap-3">
          <SignedOut>
            <Button asChild>
              <Link href="/sign-up">Create an account</Link>
            </Button>
          </SignedOut>
          <SignedIn>
            <Button asChild>
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          </SignedIn>
        </div>

        <pre className="mt-14 overflow-x-auto rounded-lg border border-border bg-muted/40 p-5 text-xs leading-relaxed">
          <code>{SNIPPET}</code>
        </pre>

        <div className="mt-14 grid gap-8 border-t border-border pt-10 sm:grid-cols-3">
          {[
            {
              title: "Keys are never stored",
              body: "Only a keyed derivation of each license key is written to the database. Plaintext is shown once, at creation.",
            },
            {
              title: "Device binding",
              body: "Lock a license to one device. Reset the binding from the dashboard when a customer changes machines.",
            },
            {
              title: "Online validation",
              body: "Alpha_v1 verifies against Keyren on every check. There are no offline licenses or cached grace periods yet.",
            },
          ].map((feature) => (
            <div key={feature.title} className="space-y-1.5">
              <h2 className="text-sm font-medium">{feature.title}</h2>
              <p className="text-sm text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify and commit**

```bash
npm run typecheck && git add -A && git commit -m "feat: landing page"
```

---

### Task 33: Project and API documentation

**Files:**
- Create: `README.md`, `docs/api.md`

- [ ] **Step 1: Write `README.md`**

Cover: what Keyren is, the Alpha_v1 scope, local setup (env vars, `openssl rand -hex 32` for the secret, `npm run db:generate` / `db:migrate`), the commands (`dev`, `test`, `typecheck`, `lint`, `build`), the architecture layering (UI → route/action → service → persistence → crypto), and an explicit **Security notes** section stating: plaintext keys are never stored; the HMAC secret must never be shipped to a client; rotating the secret invalidates every existing license; device fingerprints are spoofable identifiers rather than hardware security primitives; validation is online-only in Alpha_v1.

- [ ] **Step 2: Write `docs/api.md`**

Document `POST /api/v1/licenses/verify` completely: the request body fields, the success envelope for both expiring and permanent licenses, and a table of every error code with its HTTP status and meaning:

| Code | Status | Meaning |
|---|---|---|
| `BAD_REQUEST` | 400 | The body was missing fields, malformed, or not JSON. |
| `PRODUCT_INVALID` | 404 | No product with that ID exists. |
| `LICENSE_INVALID` | 403 | The key is not valid for this product. Also returned for a deleted key. |
| `LICENSE_REVOKED` | 403 | The developer revoked this license. Restorable. |
| `LICENSE_EXPIRED` | 403 | Past its expiry. |
| `DEVICE_MISMATCH` | 403 | HWID-locked and already bound to a different device. |
| `RATE_LIMITED` | 429 | Too many requests. Honour `Retry-After`. |
| `INTERNAL_ERROR` | 500 | Keyren failed. Safe to retry with backoff. |

State plainly that `LICENSE_INVALID` deliberately does not distinguish "never existed" from "belongs to another product" from "was deleted", because doing so would help an attacker enumerate valid keys.

Include an "Integrating safely" section repeating: the product ID is not a credential and is safe to embed; never ship dashboard credentials or the HMAC secret in distributed software; assume anything in a shipped binary is readable; send a precomputed fingerprint rather than raw hardware identifiers; and Alpha_v1 is online-only, so decide deliberately what your application does when Keyren is unreachable.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "docs: README and public API reference"
```

---

### Task 34: Full verification

Nothing is claimed complete until these commands have actually been run and their output read.

- [ ] **Step 1: Run the whole gate**

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

Every one must pass. Do not suppress a failure with `eslint-disable`, `@ts-expect-error`, or a skipped test — fix the cause. If `npm run build` fails on missing environment variables, that is `src/env.ts` working correctly; populate `.env.local` rather than weakening the schema.

- [ ] **Step 2: Confirm the mandated scenarios are all covered**

```bash
npx vitest run --reporter=verbose
```

Read the output and check off all 17 scenarios from the coverage map in this plan's header. If any is missing, add it before continuing.

- [ ] **Step 3: Run the end-to-end success criteria against a real database**

This needs a real `DATABASE_URL` and real Clerk keys. Apply migrations first:

```bash
npm run db:migrate
npm run dev
```

Then walk the exact flow from the specification, confirming each step in the browser and with `curl`:

1. Sign up → land on `/dashboard`.
2. Create a product → an immutable `prod_...` ID appears.
3. Rename the product → the ID is unchanged.
4. Generate a license → the plaintext key is shown once, with the acknowledgement gate.
5. Copy the key, dismiss the dialog → the table shows only the masked reference.
6. Confirm the database holds no plaintext:

```bash
psql "$DATABASE_URL" -c "SELECT id, key_hash, key_last4 FROM licenses LIMIT 5;"
```

7. Verify from a "device":

```bash
curl -s -X POST http://localhost:3000/api/v1/licenses/verify \
  -H 'Content-Type: application/json' \
  -d '{"productId":"prod_...","licenseKey":"KEYREN-...","deviceId":"device-one"}' | jq
```
Expected: `{"success":true,"license":{"status":"active","expiresAt":null}}`.

8. Repeat the same call → still succeeds.
9. Same call with `"deviceId":"device-two"` → `DEVICE_MISMATCH`, HTTP 403.
10. Reset the activation in the dashboard → `device-two` now succeeds.
11. Revoke → `LICENSE_REVOKED`.
12. Restore → succeeds again.
13. Delete with the typed confirmation → `LICENSE_INVALID`.

- [ ] **Step 4: Record the result**

Note in the commit message which steps were executed against a live database and which were not. If Clerk keys or a database were unavailable, say so explicitly rather than implying the flow was verified.

```bash
git add -A && git commit -m "chore: verification pass"
```

---

### Task 35: Security review

A deliberate pass over the finished code, not a re-run of the tests.

- [ ] **Step 1: Confirm no secret can reach a client**

```bash
grep -rn "KEYREN_LICENSE_HMAC_SECRET\|CLERK_SECRET_KEY" src/ --include=*.ts --include=*.tsx
```
Expected: matches only in `src/env.ts` and in server-only modules (`src/app/api/**`, files marked `"use server"`, services called from them). Any match in a file carrying `"use client"` is a critical defect.

```bash
grep -rn "NEXT_PUBLIC_" src/ | grep -iv "clerk\|app_url"
```
Expected: no results. Only the Clerk publishable key and the app URL are public by design.

- [ ] **Step 2: Confirm no plaintext key or raw fingerprint is logged**

```bash
grep -rn "console\.\(log\|error\|warn\|info\)" src/
```
Review every hit. None may receive a license key, a `keyHash`, a raw `deviceId`, or a whole request body.

- [ ] **Step 3: Confirm every mutation is ownership-scoped**

Read `src/lib/products/service.ts` and `src/lib/licenses/service.ts` and check that every exported function either takes `ownerId` and folds it into the WHERE clause, or calls `assertOwnsProduct` / `findOwnedLicense` first. Then:

```bash
grep -rn "requireDeveloperId" src/app/
```
Expected: every server action file and every dashboard page appears.

```bash
grep -rn "ownerId" src/lib/validation/
```
Expected: no results — ownership must never be a validated input field.

- [ ] **Step 4: Confirm the public endpoint is not behind Clerk**

Re-read `middleware.ts` and confirm `createRouteMatcher` covers only `/dashboard(.*)`. A verification request must never receive a redirect.

- [ ] **Step 5: Re-read the verification engine end to end**

Read `src/lib/licenses/verify.ts` in full and check each claim: the product lookup precedes the key lookup; the license query is scoped by `productId`; revoked is checked before expired; expiry uses the server clock only; `DEVICE_MISMATCH` is returned only for HWID-locked licenses bound elsewhere; no branch returns an internal ID or a distinct code that reveals whether a key exists.

- [ ] **Step 6: Write up the findings**

Create `docs/security-review.md` recording what was checked, what passed, and any accepted residual risks with the reasoning. Known ones to state explicitly:

- Fixed-window rate limiting admits up to 2x the limit across a window boundary.
- The rate limiter fails open, so a limiter outage means unmetered traffic rather than unavailable licensing.
- `x-forwarded-for` is client-controllable; the product axis exists because the IP axis alone is not trustworthy.
- Device fingerprints are spoofable by a determined attacker who reverse engineers the integration.
- Alpha_v1 is online-only, so Keyren is a hard dependency for every customer application.

```bash
git add -A && git commit -m "docs: security review findings"
```

---

## Self-review of this plan

Checked against the specification before handing off.

**Spec coverage.** Every Alpha_v1 requirement maps to a task: developer accounts (24), product CRUD (13, 28), immutable product IDs (5), slugs (12), license generation and format (6, 15), show-once plaintext (15, 30), derived-value storage (6, 9), license states and restore (16), the three expiration modes (14), HWID locking and one-device-per-license (9, 17, 19), activation reset (16, 19), the verification API and its response envelopes (17, 23), all eight error codes (8), rate limiting across multiple dimensions (20, 21), the four-table schema with foreign keys and verification-path indexes (9), server-side ownership on every mutation (13, 16, 25), the dashboard structure with exactly three nav items (27), the products page with copyable IDs (28), the licenses table with masked references (31), integration documentation (29, 33), `.env.example` and startup validation (3), and all 17 mandated tests.

**Deliberate deviations, each stated in the task that makes them:**
- `activations.id` is a real column with a unique index on `license_id`, rather than relying on the license ID as the primary key. Same one-device invariant, smaller migration later.
- `BAD_REQUEST` is added to the error codes. The spec's list says "including", and a malformed body needs to be distinguishable from a rejected license.
- Integration docs live on the product overview page rather than a nav item, because the spec forbids nav entries that are not part of the three-item structure.
- The settings page states release limitations rather than offering configuration, because Alpha_v1 has none and fake toggles would be worse than an honest page.

**Not implemented, by instruction:** every item on the future-features list. No SDKs, no offline licenses, no grace tokens, no end-user resets, no multi-device, no orgs/teams/roles, no billing, no management API keys, no webhooks, no analytics, no audit UI, no Redis, no queues.

**Open items requiring the user.** Tasks 1–23, 25, and 32–33 need nothing external — the whole test suite runs on PGlite with no Docker, no Postgres install, and no network. Task 24 onward needs Clerk keys to *run* (not to typecheck or test), and Task 34 step 3 needs both Clerk keys and a real `DATABASE_URL`. Neither `psql` nor `docker` is present on this machine, so a hosted Postgres (Neon, Supabase, or Vercel Postgres) is the path of least resistance.
