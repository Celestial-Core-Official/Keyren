# Keyren — Build Progress & Handoff

**Last updated:** 2026-08-15
**Release being built:** `Alpha_v1` (private/testing release — never call it "v1" in product UI)

> **If you are a new assistant picking this up (ChatGPT, a fresh Claude session, a human):**
> read this whole file first, then start at **Task 20** in the plan. Everything you need is here.

---

## Status at a glance

| | |
|---|---|
| **Tasks complete** | **1–19 of 35** |
| **Next task** | **Task 20 — Rate limiter interface and Postgres store** |
| **Test suite** | 133 tests, 15 files, all passing |
| **Typecheck** | clean (exit 0) |
| **Working tree** | clean, all work committed |

Progress is also tracked as `- [x]` checkboxes inside the plan file itself. Tasks 1–19 are checked off there.

---

## The two documents that matter

1. **The plan** — `docs/superpowers/plans/2026-08-15-keyren-alpha-v1.md`
   35 tasks in 9 phases. Every task contains the complete final source code, the exact commands to run, and the expected output. **Do not improvise alternative implementations** — later tasks import exact export names from earlier ones.

2. **This file** — what's actually been done, plus environment gotchas the plan couldn't know in advance.

The original product specification lives in the conversation that produced the plan. The plan's header section (Assumptions, Security decisions, File Structure, Test coverage map) faithfully summarizes it — treat the plan as the spec of record.

---

## What Keyren is

A developer SaaS for software licensing and license-key authentication, for developers who don't want to build a backend just to authenticate license keys. Core promise: **add secure license authentication in 5 minutes.**

Two completely separate authentication systems, which must never be conflated:

- **Developer authentication** — developers log into the Keyren dashboard via Clerk. Controls products, licenses, activation resets, revocation, deletion.
- **License authentication** — customer software POSTs `{productId, licenseKey, deviceId}` to a public API. No Clerk involvement whatsoever.

---

## Non-negotiable rules

Breaking any of these is a defect, not a style preference. They're the reason the architecture looks the way it does.

1. **Assume every client is compromised.** Browsers, customer applications, JS integrations, future C++ SDKs, HWIDs, network traffic — all untrusted. Only the Keyren backend and backend-held secrets are trusted.
2. **Never store plaintext license keys.** Only `HMAC-SHA256(server_secret, "license:" + normalized_key)`. Plaintext is shown to the developer exactly once, at creation, and is unrecoverable afterwards.
3. **Never put secrets in client-side code.** `KEYREN_LICENSE_HMAC_SECRET` and `CLERK_SECRET_KEY` are server-only, forever.
4. **Ownership is enforced in SQL, not JavaScript.** Every dashboard read/mutation is one statement scoped by `products.owner_id`. A miss returns "not found", never "forbidden" — so IDs cannot be probed for existence. There is deliberately no fetch-then-compare-in-JS path.
5. **`ownerId` comes only from Clerk's server-side `auth()`.** Never from a form field, URL, header, or request body.
6. **Never log a raw license key or raw device fingerprint.** Use `maskLicenseKey()`.
7. **No `any`.** Strict TypeScript is enabled and passing — keep it that way.
8. **Never hide an error.** No `@ts-expect-error`, no `eslint-disable`, no skipped tests to make a run go green. Fix root causes.
9. **Do not implement future features.** The plan lists them explicitly (SDKs, offline licenses, grace tokens, end-user HWID resets, multi-device, orgs/teams/roles, billing, webhooks, analytics, audit UI, Redis, queues). Alpha_v1 scope is intentionally small.

---

## Environment facts (discovered during execution — the plan could not know these)

### npm enforces `min-release-age=3`

This machine's `~/.npmrc` refuses any package version published within the last 3 days — a supply-chain safeguard. Several of the plan's exact version pins 404 with *"no matching version ... with a date before ..."*.

**Do not disable this policy.** Install the newest version that predates the cutoff:

```bash
npm view <pkg> time --json   # compare against: npm config get before
```

### Versions actually installed (differ slightly from the plan's pins)

| Package | Plan pinned | **Actually installed** |
|---|---|---|
| `next` | 16.3.1 | **16.3.0** |
| `@clerk/nextjs` | 7.7.5 | **7.7.4** |
| `@electric-sql/pglite` | 0.5.5 | **0.5.4** |

All others match the plan exactly: `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `postgres@3.4.9`, `zod@4.4.3`, `vitest@4.1.10`, `dotenv@17.2.3`, `tsx@4.20.6`, React 19.2.8, Tailwind 4.

The PGlite version matters for **Task 11** (the test harness).

### `tests/setup.ts` exists and is load-bearing

`src/env.ts` validates the environment at *module load*, so any test that imports `@/env` — directly or transitively (e.g. a future `src/db/index.ts`) — would throw during test collection. `tests/setup.ts` seeds dummy values using `??=` (so real env vars still win) and is registered via `setupFiles` in `vitest.config.ts`.

**This does not weaken validation.** The env tests call `parseEnv(fixture)` directly with their own inputs, so the schema is still genuinely tested.

⚠️ The dummy `DATABASE_URL` is a placeholder string, not a reachable database. PGlite tests don't use it — but if a later task's DB client eagerly opens a connection at import time, that dummy will not connect.

### `.gitignore` has a load-bearing negation

```
.env*
!.env.example
```

Do not remove `!.env.example` and do not rename the file, or it silently stops being tracked. Verified: real `.env` / `.env.local` are ignored; `.env.example` is committed.

### Known cosmetic noise

- Vitest prints an *"ESM syntax in a file loaded as CommonJS"* warning on every run. Cosmetic — `package.json` has no `"type": "module"`. Not worth fixing mid-build; it could ripple into the `.mjs` configs.
- `npm audit` reports **4 moderate** esbuild advisories, transitive via `drizzle-kit@0.31.10`'s bundled dev-server tooling. **Dev-only, not exploitable in production.** `npm audit fix --force` downgrades drizzle-kit to 0.18.1, which would break the schema/migration tasks. Left as-is deliberately.

### Not available on this machine

`psql` and `docker` are **not installed**. This is why the entire test suite runs on **PGlite** (real Postgres compiled to WASM, in-memory) — no Docker, no local Postgres, no network required. Tasks 1–23 need nothing external.

### `db.execute()`'s return shape and typing (resolved in Task 11 — read this before touching raw SQL)

Two separate findings, both load-bearing for any future raw `db.execute(sql\`...\`)` call:

1. **Runtime shape.** Under PGlite 0.5.4 / drizzle-orm 0.45.2, `await db.execute(sql\`...\`)` resolves to a plain object `{ rows: T[], fields: [...], affectedRows: number }` — **not** an iterable. `[...result]` throws `TypeError: result is not iterable`. Confirmed empirically by logging the actual value (see `tests/helpers/db.test.ts` git history — the debug log was added, the shape captured, then removed before commit). Use `result.rows`.
2. **Compile-time type.** This is the more surprising one: `result` above types as `unknown`, **not** `{ rows: T[]; ... }`, even with `db.execute<T>(...)`. Root cause: `src/db/types.ts`'s `Database` type is deliberately written against the *abstract* `PgQueryResultHKT` base interface (for driver portability between postgres.js and PGlite), and that base interface hard-codes `type: unknown`. Only a *concrete* HKT (e.g. PGlite's own `PgliteQueryResultHKT`, which redefines `type` as `Results<Row>`) would let the `<TRow>` generic flow through. Because `Database` never uses the concrete HKT, `db.execute()`'s resolved value is `unknown` for **every** driver, always, by construction — this is not something a future task can fix by passing a different generic.
   **Consequence:** any code that needs to read structured data back from a raw `db.execute()` call (as opposed to the fluent `.select()/.insert()/.update()/.delete()` query builders, which are unaffected and stay fully typed via `$inferSelect`) must add an explicit `as { rows: SomeShape[] }` assertion on the awaited result. This is a normal, narrow `as` cast documenting an empirically-confirmed shape — not `as any` — and does not violate the no-`any` rule. See `tests/helpers/db.test.ts` for the pattern.

Also confirmed in Task 11: `migrate(db as never, { migrationsFolder: "./drizzle" })` (the cast the plan's own code uses to bridge the portable `Database` type to the PGlite migrator's concrete `PgliteDatabase<TSchema>` parameter type) works with zero runtime or type errors. No alternative form was needed.

### Drizzle's relational query API (`db.query.<table>.findMany()`) works under the PGlite harness

Confirmed in Task 13: `db.query.licenses.findMany()` works with no special setup beyond what `createTestDatabase()` already does (passing `schema` to `drizzle(client, { schema })`). The plan's documented fallback (`db.select().from(licenses)`) was **not** needed. Both forms are available; later tasks can use either.

---

## What exists right now

```
src/
├── env.ts                    # Zod-validated env; the ONLY place process.env is read
├── lib/
│   ├── crypto/
│   │   ├── random.ts         # CROCKFORD_ALPHABET, randomAlphabetString()
│   │   ├── ids.ts            # generateProductId(), generateLicenseId(), generateActivationId()
│   │   ├── license-key.ts    # generateLicenseKey, normalizeLicenseKey, hashLicenseKey,
│   │   │                     #   keyHashesEqual, licenseKeyLast4, maskedLicenseKey
│   │   └── device.ts         # hashDeviceId()
│   ├── errors.ts              # VerificationErrorCode, VERIFICATION_ERROR_STATUS/MESSAGE,
│   │                          #   KeyrenError, notFound()
│   ├── log.ts                  # maskLicenseKey()
│   ├── products/
│   │   ├── slug.ts             # slugify()
│   │   └── service.ts          # createProduct/listProducts/getProduct/renameProduct/deleteProduct
│   └── licenses/
│       ├── expiration.ts       # DURATION_OPTIONS, resolveExpiresAt(), isExpired()
│       ├── service.ts          # createLicense/listLicenses/getLicense/revokeLicense/
│       │                       #   restoreLicense/resetActivation/deleteLicense — full lifecycle
│       └── verify.ts           # verifyLicense() — the verification engine; security core
└── db/
    ├── schema/
    │   ├── products.ts       # products table
    │   ├── licenses.ts       # licenses table, licenseStatus enum ("active"|"revoked")
    │   ├── activations.ts    # activations table
    │   ├── rate-limits.ts    # rateLimitCounters table
    │   └── index.ts          # re-exports all of the above
    ├── types.ts               # Database — the driver-agnostic PgDatabase type
    └── index.ts                # db singleton (postgres.js) + schema re-export
tests/
├── setup.ts                  # seeds dummy env vars (see above)
├── env.test.ts               # 5 passing
├── errors.test.ts            # 6 passing
├── crypto/
│   ├── random.test.ts        # 8 passing
│   ├── ids.test.ts           # 6 passing
│   ├── license-key.test.ts   # 18 passing
│   └── device.test.ts        # 5 passing
├── helpers/
│   ├── db.ts                  # createTestDatabase(), truncateAll(), TEST_HMAC_SECRET — not a test file
│   ├── db.test.ts             # 2 passing — proves the PGlite harness itself works
│   └── factories.ts           # makeProduct(), makeLicense(), DEVELOPER_A/DEVELOPER_B — not a test file
├── products/
│   ├── slug.test.ts           # 8 passing
│   └── service.test.ts        # 14 passing
├── licenses/
│   ├── expiration.test.ts     # 11 passing
│   ├── create.test.ts         # 9 passing
│   └── lifecycle.test.ts      # 13 passing
└── verify/
    ├── lookup.test.ts         # 8 passing
    ├── state.test.ts          # 8 passing
    └── hwid.test.ts           # 12 passing
.env.example                  # documents every required variable
drizzle.config.ts             # drizzle-kit config; reads DATABASE_URL, falls back to a placeholder
drizzle/0000_glorious_purple_man.sql  # first migration: 4 tables, 1 enum, 2 FKs, 6 indexes
```

### Exports later tasks depend on (do not rename)

```ts
// src/lib/crypto/random.ts
export const CROCKFORD_ALPHABET: string          // exactly 32 symbols — see below
export function randomAlphabetString(length: number): string

// src/lib/crypto/ids.ts
export function generateProductId(): string      // "prod_" + 26 symbols = 130 bits
export function generateLicenseId(): string      // "lic_"  + 26 symbols
export function generateActivationId(): string   // "act_"  + 26 symbols

// src/lib/crypto/license-key.ts
export const LICENSE_KEY_ENTROPY_BITS: number    // 160
export const LICENSE_KEY_PATTERN: RegExp         // KEYREN-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX
export function generateLicenseKey(): string
export function normalizeLicenseKey(input: string): string
export function hashLicenseKey(licenseKey: string, secret: string): string
export function keyHashesEqual(a: string, b: string): boolean
export function licenseKeyLast4(licenseKey: string): string
export function maskedLicenseKey(last4: string): string

// src/lib/crypto/device.ts
export function hashDeviceId(deviceId: string, secret: string): string

// src/lib/errors.ts
export type VerificationErrorCode =
  | "BAD_REQUEST" | "PRODUCT_INVALID" | "LICENSE_INVALID" | "LICENSE_REVOKED"
  | "LICENSE_EXPIRED" | "DEVICE_MISMATCH" | "RATE_LIMITED" | "INTERNAL_ERROR";
export const VERIFICATION_ERROR_STATUS: Record<VerificationErrorCode, number>
export const VERIFICATION_ERROR_MESSAGE: Record<VerificationErrorCode, string>
export type DashboardErrorCode = "NOT_FOUND" | "INVALID_INPUT" | "CONFLICT"
export class KeyrenError extends Error { code: DashboardErrorCode }
export function notFound(resource: string): KeyrenError

// src/lib/log.ts
export function maskLicenseKey(licenseKey: string): string

// src/db/schema/index.ts (re-exports products.ts, licenses.ts, activations.ts, rate-limits.ts)
export const products, licenses, activations, rateLimitCounters   // pgTable instances
export const licenseStatus                       // pgEnum("license_status", ["active","revoked"])
export type ProductRow, NewProductRow, LicenseRow, NewLicenseRow, ActivationRow, LicenseStatus

// src/db/types.ts
export type Database = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>
// Compiled clean as written — the plan's PGlite-type fallback was NOT needed.

// src/db/index.ts
export const db: Database                        // postgres.js singleton, reused across hot reloads
export { schema }

// src/env.ts
export function parseEnv(source): Env            // exported separately so tests
export const env: Env                            // can validate without ambient env

// src/lib/products/slug.ts
export function slugify(name: string): string     // falls back to "product" if unusable

// src/lib/products/service.ts
export type Product = { id, name, slug, createdAt, updatedAt }
export type ProductListItem = Product & { licenseCount: number }
export function createProduct(db, ownerId, input: { name }): Promise<Product>
export function listProducts(db, ownerId): Promise<ProductListItem[]>
export function getProduct(db, ownerId, productId): Promise<Product | null>
export function renameProduct(db, ownerId, productId, name): Promise<Product>   // throws notFound()
export function deleteProduct(db, ownerId, productId): Promise<void>            // throws notFound()

// src/lib/licenses/expiration.ts
export const DURATION_OPTIONS: readonly { value, label, days }[]   // "1d".."365d", 6 options
export type DurationValue = (typeof DURATION_OPTIONS)[number]["value"]
export type ExpirationInput =
  | { mode: "permanent" } | { mode: "date"; expiresAt: Date } | { mode: "duration"; duration: DurationValue }
export function resolveExpiresAt(input: ExpirationInput, now?: Date): Date | null
export function isExpired(expiresAt: Date | null, now?: Date): boolean   // deadline instant IS expired

// src/lib/licenses/service.ts (full CRUD + lifecycle — complete as of Task 16)
export type LicenseView = { id, productId, keyLast4, status, expiresAt, hwidLocked, createdAt,
                             updatedAt, revokedAt, activation: { activatedAt, lastSeenAt } | null }
export type CreateLicenseInput = { productId, expiration: ExpirationInput, hwidLocked, secret }
export function createLicense(db, ownerId, input): Promise<{ license: LicenseView; plaintextKey: string }>
export function listLicenses(db, ownerId, productId): Promise<LicenseView[]>
export function getLicense(db, ownerId, licenseId): Promise<LicenseView | null>
export function revokeLicense(db, ownerId, licenseId): Promise<LicenseView>    // throws notFound()
export function restoreLicense(db, ownerId, licenseId): Promise<LicenseView>   // throws notFound(); idempotent if already active
export function resetActivation(db, ownerId, licenseId): Promise<void>        // throws notFound(); no-op if never activated
export function deleteLicense(db, ownerId, licenseId): Promise<void>          // throws notFound(); permanent, cascades to activation
export function toLicenseView(row, activation): LicenseView

// src/lib/licenses/verify.ts — the verification engine; the security core of the product
export type VerifyInput = { productId: string; licenseKey: string; deviceId: string; secret: string; now?: Date }
export type VerifyResult =
  | { success: true; license: { status: "active"; expiresAt: string | null } }
  | { success: false; error: { code: VerificationErrorCode; message: string } }
export function verifyLicense(db: Database, input: VerifyInput): Promise<VerifyResult>
// Order inside verifyLicense is load-bearing and must not be reordered: locate
// product -> derive key hash -> locate license scoped by productId -> constant-time
// re-check -> revoked before expired -> expiration against the SERVER clock (input.now
// is a test-only injection point, never fed from the request) -> device rules ->
// activation bookkeeping. A license that is absent, deleted, or belongs to a different
// product all return the byte-identical LICENSE_INVALID failure — enumeration
// resistance is structural (one return line), not two implementations kept in sync.
```

### Test helpers later tasks depend on (`tests/helpers/`, not exported from `src/`)

```ts
// tests/helpers/db.ts
export function createTestDatabase(): Promise<{ db: Database; close: () => Promise<void> }>
export function truncateAll(db: Database): Promise<void>
export const TEST_HMAC_SECRET: string

// tests/helpers/factories.ts
export const DEVELOPER_A: string   // "user_developer_a"
export const DEVELOPER_B: string   // "user_developer_b"
export function makeProduct(db, options?: { ownerId?; name? }): Promise<{ id; ownerId; name }>
export function makeLicense(db, options: { productId; hwidLocked?; expiresAt?; status? }):
  Promise<{ id; plaintextKey }>
```

### ⚠️ A security invariant you can silently break

`CROCKFORD_ALPHABET` is **exactly 32 symbols** (`0123456789ABCDEFGHJKMNPQRSTVWXYZ` — no I, L, O, U). This is load-bearing, not cosmetic: `256 % 32 === 0`, so reducing a random byte with `% 32` is provably **unbiased**. Changing the alphabet's length silently introduces modulo bias into every license key and product ID.

A test asserts the length so this can't break unnoticed. **Do not "fix" that test.**

---

## Commands

```bash
npm run typecheck    # tsc --noEmit — must stay clean
npm run test         # vitest run
npm run lint         # eslint
npm run dev          # needs real Clerk keys + DATABASE_URL in .env.local
npm run build        # will fail loudly without valid env — that's src/env.ts working
npm run db:generate  # drizzle-kit generate  (usable from Task 9 onward)
npm run db:migrate   # drizzle-kit migrate
```

---

## How to continue

The build is running in **batches of 5 tasks** to conserve usage limits. Batch 4 (this one) was an intentional exception at 4 tasks: Task 17 is the verification engine — the function that decides whether paid software runs — and it stayed in its own tightly-scoped batch with Tasks 18–19 (the tests proving it). Tasks are sequential and share files, so **run them in order** — do not parallelize within a batch.

**Next up: Tasks 20–24.**

| Task | What it builds |
|---|---|
| 20 | Rate limiter interface and Postgres store (`src/lib/rate-limit/`) |
| 21 | Verification rate-limit policy and client IP extraction |
| 22 | Request validation (`src/lib/validation/verify-request.ts`) |
| 23 | The public verification endpoint (`src/app/api/v1/licenses/verify/route.ts`) |
| 24 | Clerk wiring (`middleware.ts`, `src/lib/auth/require-developer.ts`) |

Notes for Task 20 onward, now that the verification engine exists:
- `verifyLicense(db, input)` (`src/lib/licenses/verify.ts`, Task 17) is a plain function with no HTTP concerns — signature `(db: Database, input: VerifyInput) => Promise<VerifyResult>`. Task 23's route handler is where parsing, rate limiting, and status-code mapping (via `VERIFICATION_ERROR_STATUS`) belong; none of that lives in `verify.ts` and it shouldn't move there.
- `VerifyInput.now?: Date` exists solely so tests can inject a fixed clock (see `tests/verify/state.test.ts`). Task 23's route handler must never pass it — omitting it defaults to `new Date()`, the real server clock. Wiring a client-supplied timestamp into it would defeat the "ignores the client clock entirely" guarantee Task 18 tests.
- `RATE_LIMITED` and `BAD_REQUEST` already exist in `VerificationErrorCode` / `VERIFICATION_ERROR_STATUS` / `VERIFICATION_ERROR_MESSAGE` (`src/lib/errors.ts`, Task 8) but nothing produces them yet — `verifyLicense` never returns either. Tasks 20–22 are what will actually trigger them.
- The full license lifecycle (`revokeLicense`, `restoreLicense`, `resetActivation`, `deleteLicense` — all in `src/lib/licenses/service.ts` as of Task 16) has no caller yet outside tests. No dashboard UI or server action invokes them until Task 25's `actions.ts`.

See "Environment facts" above for two Task-11-discovered items every later task needs: (1) `db.execute()`'s runtime shape and typing under the portable `Database` type, and (2) that `db.query.<table>` relational queries work. Neither came up in Batch 4 — Tasks 16–19 only ever used the fluent query builder (`.select()/.insert()/.update()/.delete()/.returning()`), never raw `db.execute()`. Still load-bearing for anything in Tasks 20–23 that touches raw SQL (the Postgres rate limiter is the most likely candidate).

### Working method for each task

1. Read the task in the plan — it has the complete source code.
2. Where the plan specifies TDD (most tasks): write the test file, **run it and confirm it fails for the expected reason**, then implement, then confirm it passes.
3. Run `npm run typecheck` and `npx vitest run`.
4. Commit with the exact message in that task's final step.
5. Tick the task's `- [x]` checkboxes in the plan.
6. Update this file's status table.

### After finishing a batch

Update the **Status at a glance** table and the **Next up** table above, then append a line to the Batch log below. That's what makes the next handoff work.

---

## Batch log

| Batch | Tasks | Outcome |
|---|---|---|
| 1 | 1–5 | ✅ Complete. 18 tests passing, typecheck clean. Two plan bugs found and corrected (see below). |
| 2 | 6–10 | ✅ Complete. 48 tests passing (6 files), typecheck clean. Plan's code used verbatim, no bugs found. Task 10's `Database` type fallback was **not** needed — the base-class `PgDatabase<...>` form compiled cleanly. |
| 3 | 11–15 | ✅ Complete. 92 tests passing (11 files), typecheck clean. Database genuinely exercised for the first time. One plan bug found and corrected (see below); one plan-vs-actual test-count mismatch noted (harmless). |
| 4 | 16–19 | ✅ Complete. 133 tests passing (15 files), typecheck clean. The verification engine — the security core of the product — shipped with **zero** deviation from the plan's code. Two more harmless plan-prose test-count mismatches found and corrected in the plan (see below); no code impact. |

### Corrections already folded back into the plan

- **Task 1** — the scaffold directory cannot start with a dot (`.keyren-scaffold` is an invalid npm package name). Now scaffolds into `$TMPDIR/keyren-scaffold` and rsyncs in. Also sets `"name": "keyren"` in `package.json`.
- **Task 3** — create-next-app's blanket `.env*` gitignore rule also matches `.env.example`, which would have silently dropped it from the commit. Now adds `!.env.example` and verifies with `git check-ignore`.
- **Task 12** — the plan's `slugify()` contradicted the plan's own test: collapsing every non-alphanumeric run turned `"Acme's App (v2)!"` into `acme_s_app_v2`, but the test asserts `acmes_app_v2`. The plan now strips apostrophes with `.replace(/'/g, "")` **before** the general punctuation collapse. The implementation in `src/lib/products/slug.ts` already has this fix.
- **Task 13** — the plan's prose said "Expected: 13 passed"; the plan's own `it()` blocks total 14. Corrected to 14. No code impact.
- **Task 17** — the plan's prose said "Expected: 7 passed"; the plan's own `tests/verify/lookup.test.ts` (copied verbatim) contains 8 `it()` blocks. Corrected to 8. No code impact.
- **Task 19** — the plan's prose said "Expected: 11 passed"; the plan's own `tests/verify/hwid.test.ts` (copied verbatim) contains 12 `it()` blocks. Corrected to 12. No code impact.
- **Assumptions** — documented the `min-release-age=3` npm policy.

### Batch 2 notes (Tasks 6–10)

- No plan corrections needed — every file matched the plan's literal source exactly, and every named export exists under its specified name.
- `npm run db:generate` (Task 9) ran with **no** `.env.local` and **no** live Postgres, confirmed by PROGRESS.md's own prediction: it only reads `src/db/schema/*` and writes SQL. Output: `drizzle/0000_glorious_purple_man.sql` (4 `CREATE TABLE`, 1 `CREATE TYPE` enum, 2 `FOREIGN KEY` constraints, 2 `CREATE UNIQUE INDEX`, 4 `CREATE INDEX`).
- One thing worth flagging precisely: of the plan's three named indexes on `licenses`, only `licenses_key_hash_unique` and `activations_license_unique` are SQL `UNIQUE` indexes. `licenses_product_key_hash_idx` is a deliberately **non-unique** composite index (the plan uses `index(...)`, not `uniqueIndex(...)`) — it exists purely to make the verification hot path `WHERE product_id = $1 AND key_hash = $2` an index lookup; global uniqueness is already guaranteed by `licenses_key_hash_unique` alone. Don't "fix" this to `uniqueIndex` in a later task.
- `src/db/index.ts` (Task 10) imports `@/env` and constructs a `postgres()` client at module load using `env.DATABASE_URL`. This did **not** break the test suite because (a) `postgres()` from postgres.js is lazy — it does not open a TCP connection until a query actually runs — and (b) nothing in `tests/` currently imports `@/db`. Task 11 will presumably import it directly or provide a PGlite-backed alternative; watch for this if a future test ever imports the real `@/db/index.ts` module against the dummy `DATABASE_URL` in `tests/setup.ts`.

### Batch 3 notes (Tasks 11–15) — the database ran for the first time

- **Confirmed:** `tests/` still never imports `@/db/index.ts` (the real postgres.js singleton). Every service function takes `Database` as an explicit first parameter and imports only from `@/db/schema` / `@/db/types`, exactly as required. Tasks 12–15's services (`slug.ts`, `products/service.ts`, `licenses/expiration.ts`, `licenses/service.ts`) all follow this.
- **The two unknowns flagged for this batch are both resolved — see "Environment facts" above for the full detail:**
  1. `db.execute()` under PGlite resolves at runtime to `{ rows, fields, affectedRows }`, confirmed by an empirical log (added, observed, then removed before commit) — not the `[...result]`-iterable shape the plan's test code assumed. **Additionally** (not anticipated by the plan at all): the *type* of that resolved value is `unknown`, not just "iterate differently" — a structural consequence of `Database` being written against the abstract `PgQueryResultHKT` rather than a concrete driver HKT. `tests/helpers/db.test.ts` fixes this with `result.rows` plus a narrow `as { rows: T[] }` assertion on the awaited value (not `any` — see the code for the full reasoning in comments).
  2. `db.query.licenses.findMany()` (Drizzle's relational query API) **works** under the PGlite harness, no changes needed. Task 13's delete-cascade test uses it exactly as written in the plan.
- **One genuine plan bug found and fixed**, same category as Batch 1's two: in `src/lib/products/slug.ts` (Task 12), the plan's `slugify()` implementation collapses *all* non-alphanumeric runs (including a bare apostrophe) into a single `_`, which turns `"Acme's App (v2)!"` into `"acme_s_app_v2"` — but the plan's own test (`tests/products/slug.test.ts`, "drops punctuation") asserts `"acmes_app_v2"`. Fixed by adding `.replace(/'/g, "")` (drop apostrophes outright, before the general punctuation-to-underscore collapse) as its own step, right after `.toLowerCase()`. All 8 of the plan's slug tests pass with this change; nothing else in the pipeline was touched. If a later task edits `slugify()`, keep this step — removing it silently reintroduces the bug.
- **One harmless plan-documentation mismatch:** Task 13's plan text says "Expected: 13 passed" for `tests/products/service.test.ts`, but the plan's own test file (copied verbatim) contains 14 `it(...)` blocks (2 in `createProduct`, 3 each in `listProducts`/`getProduct`/`renameProduct`/`deleteProduct`), and all 14 genuinely pass. This is a miscount in the plan's prose, not a code defect — nothing was added, removed, or skipped to reach 14. Don't be alarmed if a future re-read of the plan still says 13.
- Every other file in this batch (`tests/helpers/db.ts`, `tests/helpers/factories.ts`, `src/lib/products/service.ts`, `src/lib/licenses/expiration.ts`, `src/lib/licenses/service.ts`, and all other test files) was used byte-for-byte as written in the plan, and all plan-stated test counts for those files were exact (Task 11: 2, Task 14: 11, Task 15: 9).
- The single most security-critical test in this batch — `tests/licenses/create.test.ts`'s "never persists the plaintext key" (JSON-serializes the full stored row, uppercases it, and asserts the plaintext key appears nowhere in any column) — passed against the plan's implementation with no changes needed. `licenses.keyHash` is the only derivative stored; the plaintext is generated, hashed, and returned, never written anywhere else.

### Batch 4 notes (Tasks 16–19) — the verification engine

- **Every file in this batch was used byte-for-byte as written in the plan.** `src/lib/licenses/service.ts`'s four appended lifecycle functions (`revokeLicense`, `restoreLicense`, `resetActivation`, `deleteLicense`) plus their shared `findOwnedLicense` helper, and the entirety of `src/lib/licenses/verify.ts` (`verifyLicense` + `bindOrRefreshActivation`), needed zero changes to pass their tests. No new imports were needed in `service.ts` — `and`, `eq`, and the `activations`/`licenses`/`products` tables were already imported from Task 15, exactly as the plan promised.
- **Tasks 18 and 19 are pure test files** (`tests/verify/state.test.ts`, `tests/verify/hwid.test.ts`) asserting behaviour Task 17's engine already claimed to have. Both suites passed on the very first run, with zero edits to `verify.ts` or `service.ts` required. That means the load-bearing ordering the plan calls out — locate product → derive key hash → locate license scoped by `productId` → constant-time re-check → **revoked before expired** → expiration against the server clock → device rules → activation bookkeeping — is genuinely correct as implemented, not just claimed in a comment. Specifically exercised and passing: a license that is both revoked and expired reports `LICENSE_REVOKED`, not `LICENSE_EXPIRED`; the expiry boundary is inclusive (`isExpired` uses `<=`, so the deadline instant itself already counts as expired, while one second before it still authenticates); the `now` parameter is server-only and nothing in the request path can influence it (`VerifyInput.now` is a test-only injection point that Task 23's route handler must never wire up to client input).
- **Enumeration resistance holds exactly as specified, structurally rather than by convention.** `tests/verify/lookup.test.ts`'s `JSON.stringify(absent) === JSON.stringify(foreign)` check (an absent key vs. a real key belonging to a different product, both queried against the same wrong product) passed unmodified — both cases fall through the identical `if (!license) return failure("LICENSE_INVALID")` line, so there is only one code path that can produce that response, not two independent implementations that happen to agree today.
- **Cross-developer isolation (spec test #14)** is enforced by one helper, `findOwnedLicense()`, that every one of the four mutating functions calls before doing anything else — there is no separate ownership check duplicated per function to drift out of sync. `tests/licenses/lifecycle.test.ts`'s "cross-developer isolation" block drives `getLicense` plus all four mutations against a license owned by `DEVELOPER_B` while authenticated as `DEVELOPER_A`, and asserts both the rejection (`/not found/i` — never a distinguishing "forbidden") and that the underlying row is provably untouched afterward (re-read as `DEVELOPER_B`). All 5 pass.
- **Two more instances of the same harmless plan-prose test-count mismatch Batch 3 first flagged** (Task 13 said "13 passed", the plan's own test file had 14): Task 17's plan prose said "Expected: 7 passed" against its own 8-`it()`-block `tests/verify/lookup.test.ts`; Task 19's said "Expected: 11 passed" against its own 12-`it()`-block `tests/verify/hwid.test.ts`. Both are miscounts in the plan's narration, not the code — nothing was added, removed, or skipped to reach the higher number. Both have now been corrected directly in the plan file (see "Corrections already folded back into the plan" above), matching how Task 13's was handled.
- **No new environment gotchas.** Tasks 16–19 never call raw `db.execute()` — every query goes through the fluent builder (`.select()/.insert()/.update()/.delete()/.returning()`), which stays fully typed per the Task 11 findings already on record. Nothing new to add to "Environment facts."

---

## The finish line

Alpha_v1 is done when this flow works end to end:

```
sign up → create product → immutable prod_ ID issued → generate license
→ plaintext key shown once → only derived value in DB → verify from device one: success
→ verify again from device one: success → verify from device two: DEVICE_MISMATCH
→ reset activation → device two: success → revoke: LICENSE_REVOKED
→ restore: success → delete with confirmation: LICENSE_INVALID
```

The plan's **Task 34** walks this exact sequence with `curl` commands. It requires real Clerk keys and a real `DATABASE_URL` — the only part of the build that does.
