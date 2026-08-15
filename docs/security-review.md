# Keyren Alpha_v1 — Security Review

**Date:** 2026-08-15
**Scope:** Tasks 1–34 (the complete Alpha_v1 build)
**Method:** static review of the finished code, plus a live end-to-end walkthrough against real Neon Postgres and the running server

This is a deliberate pass over the finished system, not a re-run of the test suite. Findings are recorded whether or not they were fixed.

---

## Summary

| | |
|---|---|
| Automated tests | 194 passing, 20 files |
| Typecheck / lint / build | all clean |
| `any` / `@ts-expect-error` / `@ts-ignore` / `eslint-disable` | **zero**, across `src/` and `tests/` |
| Live end-to-end walkthrough | **26/26 assertions passed** |
| Critical findings | **1 found, 1 fixed** |
| Accepted residual risks | 6, documented below |

---

## Critical finding (fixed)

### SEC-1 — Rate limiting was silently disabled in production

**Severity:** High. The specification makes rate limiting mandatory on the public verification endpoint.

**Symptom.** The live walkthrough issued twelve verification requests and the `rate_limit_counters` table contained **zero rows** afterwards.

**Root cause.** `PostgresRateLimiter` bound the window timestamp as a JavaScript `Date`:

```ts
VALUES (${bucketKey}, ${new Date(windowStartMs)}, 1)
```

The production driver (**postgres.js**) rejects a `Date` parameter outright with `ERR_INVALID_ARG_TYPE`. The test driver (**PGlite**) accepts it. The limiter caught the throw and failed open, so:

- every request was allowed, unmetered
- no counter was ever written
- **all 8 rate-limiter unit tests passed**, because they run on PGlite
- **the API route's rate-limit tests passed**, for the same reason
- a live end-to-end run still looked healthy, because failing open is invisible from the outside

This is the worst shape a defect can take: a mandatory control that is completely absent in production while every signal says it works.

**Why the test suite could not have caught it.** The whole suite runs on PGlite by design (no Docker or local Postgres on the build machine). PGlite is *more permissive* than postgres.js, so a driver-specific rejection is structurally invisible to it.

**Fix (three parts):**

1. Bind the timestamp as an ISO-8601 **string**; Postgres casts it to `timestamptz` itself.
2. **Fail open loudly.** The fail-open policy is correct — a limiter outage must not take licensing offline for every customer — but a *silent* fail-open is indistinguishable from working rate limiting. It now logs the dimension name and driver message. It never logs the bucket key, which embeds a client IP.
3. Add **driver-portability tests** that assert on the statement the limiter *builds* rather than on its execution, so PGlite's permissiveness can no longer hide a production failure. The key assertion — no chunk of the query is a `Date` instance — is driver-independent.

**Verified against live Neon:** allows 3 requests at a limit of 3, denies the 4th and 5th with a correct `Retry-After`, and writes real counter rows.

**Generalised lesson, recorded for future work:** any code path that uses raw `db.execute()` is only exercised against PGlite in tests. Treat driver-specific behaviour as untested until proven against postgres.js.

---

## Checks performed and passed

### Secrets never reach a client

`KEYREN_LICENSE_HMAC_SECRET` and `CLERK_SECRET_KEY` appear in exactly three places: `src/env.ts` (the sole reader of `process.env`), the public API route, and the license-creation server action. All three are server-only.

No file carrying `"use client"` imports `@/env`, `@/db`, or references either secret. The only `NEXT_PUBLIC_` variables are the Clerk **publishable** key (designed to be public) and the app URL.

### Plaintext license keys are never persisted

Confirmed by reading a row straight back out of live Neon after creation and scanning every column: the plaintext appears nowhere. Only a 64-character HMAC-SHA256 digest and a 4-character display suffix are stored.

The key exists on exactly one path — `createLicense()` generates it → the server action returns it → the reveal dialog displays it once. It appears in no list or detail view, and `keyHash` appears in **zero** files under `src/components/` or `src/app/dashboard/`.

### Ownership is enforced in SQL

Every product query folds `products.ownerId` into its `WHERE` clause (4 sites). Every license operation routes through `assertOwnsProduct` or `findOwnedLicense` (8 sites), which join `licenses → products` and filter on the owner. There is no fetch-then-compare-in-JavaScript path anywhere.

A miss returns "not found", never "forbidden", so resource IDs cannot be probed for existence.

**Verified live:** a second developer attempting to revoke, delete, or reset the activation of another developer's license was refused on all three, and the victim's row was confirmed untouched afterwards.

### `ownerId` is never client-supplied

`src/lib/validation/dashboard.ts` contains no `ownerId` field at all — a test asserts a crafted `ownerId` in a form submission is stripped. The only producer is `requireDeveloperId()`, which wraps Clerk's server-side `auth()`. Every server action calls it independently, because a server action is a public HTTP endpoint and is not protected by the fact that only Keyren's own UI calls it.

### The public endpoint is not behind Clerk

`createRouteMatcher(["/dashboard(.*)"])` — `/api/v1/**` is deliberately excluded. Customer software authenticates with a license key, not a session, and must never receive a redirect. Verified live: `POST /api/v1/licenses/verify` reaches the real handler unauthenticated.

### Enumeration resistance

A license that never existed, one belonging to a different product, and one that was deleted all return a byte-identical `LICENSE_INVALID` / 403. Verified live for all three.

`PRODUCT_INVALID` is deliberately distinguishable: product IDs are shipped inside customer software and are not secret, so telling an integrating developer their product ID is wrong helps them without helping an attacker.

### Error messages leak nothing

All eight public messages are fixed strings containing no SQL, schema, identifiers, or exception text. Zod's issue list is referenced **zero** times in the route — verified live, a malformed body returns only `"The request body was malformed."`

The catch-all logs `error.message` server-side and returns only `INTERNAL_ERROR`.

### Verification ordering

Read end to end and confirmed: locate product → derive key hash → locate license **scoped by `productId`** → constant-time digest re-check → **revoked before expired** → expiration against the **server** clock only → device rules → activation bookkeeping. Rate limiting runs before any license lookup, so a flood of guesses never reaches the licenses table.

`VerifyInput.now` is a test-only clock injection point and is never populated from the request.

### Logging

Two `console.*` call sites exist in the entire codebase. Neither receives a license key, a key hash, a raw device fingerprint, or a request body.

---

## Accepted residual risks

Each is a deliberate Alpha_v1 trade-off, not an oversight.

1. **Fixed-window rate limiting admits up to 2× the limit across a window boundary.** Acceptable for a private alpha; the `RateLimiter` interface allows a sliding window or token bucket to replace it without touching the verification path.

2. **The rate limiter fails open.** A limiter outage means unmetered traffic rather than every customer's software going offline. This is the correct trade, but it is now logged so the condition is detectable — see SEC-1.

3. **`x-forwarded-for` is client-controllable.** This is precisely why the policy meters on two axes; a per-IP limit alone is not trustworthy, and the per-product axis bounds a distributed attacker.

4. **Device fingerprints are spoofable.** A determined attacker who reverse-engineers the integration can forge one. Keyren treats the fingerprint as an identifier that raises the cost of casual key sharing, not as a hardware security primitive. The product documentation states this plainly rather than overclaiming.

5. **Alpha_v1 is online-only.** Keyren is a hard availability dependency for every integrating application. There are no offline licenses and no cached grace tokens. Documented in the README, the API reference, the dashboard settings page, and the per-product integration panel.

6. **`/dashboard/settings` and the dashboard layout do not call `requireDeveloperId()`.** Both render only static content and navigation — neither queries the database or displays developer-owned data, so there is nothing to leak. They remain gated by middleware. Any future change that makes either read owned data **must** add the call.

---

## Rotation warning

`KEYREN_LICENSE_HMAC_SECRET` is the input to every stored license digest. Rotating it invalidates **every license key ever issued**, because verification recomputes the digest and it will no longer match. There is no re-keying path in Alpha_v1, since plaintext keys are not retained. Treat it as permanent for the life of the deployment.

---

## Conclusion

The security model holds. The one critical finding was a mandatory control that was completely inert in production while presenting as healthy — found only by running the system for real against its production driver, which is exactly what the live walkthrough was for.

The strongest structural property of this codebase is that ownership is enforced inside the SQL rather than by a check a caller must remember to perform. That, plus keys never existing in plaintext at rest, means the two most damaging failure modes for a licensing service are closed by construction rather than by discipline.

The most important lesson for future work: **a green test suite proved nothing about the rate limiter**, because the test driver was more permissive than the production one. Anything touching raw SQL needs verification against postgres.js specifically.
