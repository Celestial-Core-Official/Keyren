# Keyren — Build Progress & Handoff

**Last updated:** 2026-08-15
**Release being built:** `Alpha_v1` (private/testing release — never call it "v1" in product UI)

> **If you are a new assistant picking this up (ChatGPT, a fresh Claude session, a human):**
> read this whole file first, then start at **Task 6** in the plan. Everything you need is here.

---

## Status at a glance

| | |
|---|---|
| **Tasks complete** | **1–5 of 35** |
| **Next task** | **Task 6 — License key generation, normalization and hashing** |
| **Test suite** | 18 tests, 3 files, all passing |
| **Typecheck** | clean (exit 0) |
| **Working tree** | clean, all work committed |

Progress is also tracked as `- [x]` checkboxes inside the plan file itself. Tasks 1–5 are checked off there.

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

---

## What exists right now

```
src/
├── env.ts                    # Zod-validated env; the ONLY place process.env is read
└── lib/crypto/
    ├── random.ts             # CROCKFORD_ALPHABET, randomAlphabetString()
    └── ids.ts                # generateProductId(), generateLicenseId()
tests/
├── setup.ts                  # seeds dummy env vars (see above)
├── env.test.ts               # 5 passing
└── crypto/
    ├── random.test.ts        # 8 passing
    └── ids.test.ts           # 5 passing
.env.example                  # documents every required variable
drizzle.config.ts             # NOT YET CREATED — arrives in Task 9
```

### Exports later tasks depend on (do not rename)

```ts
// src/lib/crypto/random.ts
export const CROCKFORD_ALPHABET: string          // exactly 32 symbols — see below
export function randomAlphabetString(length: number): string

// src/lib/crypto/ids.ts
export function generateProductId(): string      // "prod_" + 26 symbols = 130 bits
export function generateLicenseId(): string      // "lic_"  + 26 symbols
// Task 9 adds: generateActivationId()           // "act_"  + 26 symbols

// src/env.ts
export function parseEnv(source): Env            // exported separately so tests
export const env: Env                            // can validate without ambient env
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

The build is running in **batches of 5 tasks** to conserve usage limits. Tasks are sequential and share files, so **run them in order** — do not parallelize within a batch.

**Next up: Tasks 6–10.**

| Task | What it builds |
|---|---|
| 6 | License key generation, normalization, HMAC hashing (`src/lib/crypto/license-key.ts`) |
| 7 | Device fingerprint hashing (`src/lib/crypto/device.ts`) |
| 8 | Error taxonomy + log masking (`src/lib/errors.ts`, `src/lib/log.ts`) |
| 9 | Database schema, 4 tables (`src/db/schema/*`) + first migration |
| 10 | Driver-agnostic database client (`src/db/index.ts`, `src/db/types.ts`) |

Note: **Task 6's test file includes one case that cannot pass until Task 7 exists** (it asserts license hashing and device hashing are domain-separated). The plan says so explicitly and tells you to run the other describe-blocks first. That's expected, not a failure.

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

### Corrections already folded back into the plan

- **Task 1** — the scaffold directory cannot start with a dot (`.keyren-scaffold` is an invalid npm package name). Now scaffolds into `$TMPDIR/keyren-scaffold` and rsyncs in. Also sets `"name": "keyren"` in `package.json`.
- **Task 3** — create-next-app's blanket `.env*` gitignore rule also matches `.env.example`, which would have silently dropped it from the commit. Now adds `!.env.example` and verifies with `git check-ignore`.
- **Assumptions** — documented the `min-release-age=3` npm policy.

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
