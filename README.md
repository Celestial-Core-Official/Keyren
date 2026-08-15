# Keyren

Keyren is a developer SaaS for software licensing and license-key authentication. It exists so a developer can **add secure license authentication in 5 minutes** instead of building and maintaining their own licensing backend.

Sign in, create a product, generate a license key, ship the key to a customer, and your software verifies it with a single HTTP request. Keyren handles key generation, secure storage, device (HWID) binding, expiration, revocation, and rate limiting.

This repository is currently in **`Alpha_v1`** — a private, testing release. Do not refer to it as "v1" anywhere user-facing; the public API path (`/api/v1/...`) is a normal semantic-versioned URL and is intentionally decoupled from the `Alpha_v1` marketing name, so the API can stay stable while the product moves to `Alpha_v2`, `Beta_v1`, and beyond.

---

## Two separate authentication systems

Keyren has two authentication paths that are never conflated:

- **Developer authentication** — you, the developer, sign in to the Keyren dashboard via [Clerk](https://clerk.com) to manage products and licenses.
- **License authentication** — your customer's software calls the public, unauthenticated `POST /api/v1/licenses/verify` endpoint to check a license key. Clerk is never involved in this path.

---

## Alpha_v1 scope

**Included:**

- Clerk-authenticated dashboard (sign up, sign in, session management)
- Products with a permanent, immutable ID (`prod_...`) that customer software embeds
- License generation with a **show-once** plaintext key reveal
- Three expiration modes: permanent, a fixed duration, or a specific date
- Optional device (HWID) locking — the first device to authenticate claims the license
- Full license lifecycle: revoke, restore, reset activation, permanently delete
- A public, rate-limited verification API: `POST /api/v1/licenses/verify`
- Postgres-backed rate limiting (per-IP and per-product, fixed 60-second windows)
- In-dashboard integration documentation with a real, copy-pasteable snippet

**Explicitly out of scope for Alpha_v1** (do not build these without a new plan):

- Official client SDKs or libraries
- Offline license validation, cached grace periods, or grace tokens
- End-user self-service HWID resets
- Multi-device licenses (a license is single-device or unlocked, nothing in between)
- Organizations, teams, or roles
- Billing
- Webhooks
- Analytics
- An audit-log UI
- Redis or background job queues

---

## Architecture

**Tech stack:** Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, shadcn/ui, Clerk 7, PostgreSQL, Drizzle ORM, Zod 4, Vitest 4 with PGlite for tests.

The application is layered strictly, and every layer only talks to the one below it:

```
UI                    src/app/**/page.tsx, src/components/**
                       Renders data and collects input. Contains no business logic.
        |
        v
route / action         src/app/api/**/route.ts, src/app/dashboard/**/actions.ts
                       Authenticates, validates input with Zod, and delegates.
                       A server action re-derives ownerId from Clerk every time —
                       it is never trusted from the caller.
        |
        v
service                src/lib/products/service.ts, src/lib/licenses/service.ts,
                       src/lib/licenses/verify.ts
                       All business rules live here as plain functions that take
                       an explicit ownerId (or, for verification, no identity at
                       all) and a database handle. Ownership is enforced inside
                       the SQL itself, not by fetching a row and comparing IDs in
                       JavaScript.
        |
        v
persistence             src/db/**
                       Drizzle schema and the Postgres client.
        |
        v
crypto                  src/lib/crypto/**
                       License key generation, hashing, and device fingerprint
                       hashing. The only code that touches node:crypto.
```

A UI component never queries the database directly, and a service function never reads a Clerk session — each layer receives exactly what it needs as an argument.

---

## Local setup

Full step-by-step instructions (creating a free Neon Postgres database and a free Clerk application) are in **[`docs/SETUP.md`](docs/SETUP.md)**. The short version:

1. Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```
2. Fill in `.env.local`:
   - `DATABASE_URL` — any Postgres connection string (Neon, Supabase, Vercel Postgres, or local).
   - `KEYREN_LICENSE_HMAC_SECRET` — generate one with:
     ```bash
     openssl rand -hex 32
     ```
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` — from a Clerk application (test keys for local development).
   - `NEXT_PUBLIC_APP_URL` and the `RATE_LIMIT_*` variables have sane defaults already in `.env.example`.
3. Create the schema:
   ```bash
   npm run db:generate   # only needed after a schema change — writes SQL under drizzle/
   npm run db:migrate    # applies pending migrations to DATABASE_URL
   ```
4. Start the app:
   ```bash
   npm run dev
   ```

`src/env.ts` validates every environment variable at startup with Zod. A missing or malformed value fails immediately and loudly — `npm run build` or `npm run dev` will refuse to start rather than run with an unsafe default.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server. Requires a valid `.env.local`. |
| `npm run build` | Production build. Also validates environment configuration. |
| `npm run start` | Run a production build that has already been built. |
| `npm run typecheck` | `tsc --noEmit` — must stay clean, no exceptions. |
| `npm run lint` | ESLint. |
| `npm run test` | Run the full test suite once (Vitest). |
| `npm run test:watch` | Run tests in watch mode. |
| `npm run db:generate` | Generate a new SQL migration from the Drizzle schema. |
| `npm run db:migrate` | Apply pending migrations to `DATABASE_URL`. |
| `npm run db:studio` | Open Drizzle Studio, a browser GUI for the database. |

The test suite needs no external services: it runs against [PGlite](https://pglite.dev) — a real Postgres compiled to WebAssembly, created fresh in memory for each test file. No Docker, no local Postgres install, and no network access are required to run `npm run test`.

---

## Security notes

These are the properties the codebase is built around. Treat any change that weakens one of them as a defect, not a style choice.

- **Plaintext license keys are never stored.** Only `HMAC-SHA256(KEYREN_LICENSE_HMAC_SECRET, "license:" + normalizedKey)` is written to the database, in `licenses.key_hash`. The plaintext key is shown to the developer exactly once, at the moment of creation, inside the dashboard's show-once dialog — and is cryptographically unrecoverable after that dialog is dismissed.
- **`KEYREN_LICENSE_HMAC_SECRET` must never be shipped to a client**, and never appears in a `"use client"` file, a browser bundle, or distributed software. It is read only on the server, exactly where `src/env.ts` loads it.
- **Rotating the HMAC secret invalidates every existing license.** Verification recomputes `HMAC-SHA256(secret, ...)` from the key the customer's software sends and compares it against the stored hash. Change the secret and every previously issued key hashes to a different value than what is stored — every license stops authenticating at once. Only rotate deliberately, as part of a full reissue.
- **Device fingerprints are spoofable identifiers, not hardware security primitives.** HWID locking raises the cost of casually sharing a license key between machines; it does not, and cannot, make fingerprint spoofing impossible. Keyren never asks for and never interprets raw hardware serials — it only stores and compares a hash of whatever opaque string the client sends.
- **Validation is online-only in Alpha_v1.** There is no offline grant, no cached token, and no grace period. If Keyren is unreachable, integrating software cannot obtain a positive verification result — see [`docs/api.md`](docs/api.md#integrating-safely) for how to plan around that.
- **Ownership is enforced in SQL, not in application code.** Every dashboard read or mutation is a single query scoped by `products.owner_id = $ownerId`, where `ownerId` comes only from Clerk's server-side session. A resource that does not exist and a resource owned by a different developer return the identical "not found" — never "forbidden" — so IDs cannot be probed for existence.

The full public API — including the complete error-code table — is documented in **[`docs/api.md`](docs/api.md)**.
