# Keyren API Reference — Alpha_v1

This document describes the public license verification API. It is the **only** endpoint customer software talks to, and the **only** endpoint in Keyren that requires no developer authentication of any kind — no Clerk session, no API key, no bearer token.

The URL path is versioned (`/api/v1/...`) on ordinary semantic-versioning grounds, which is intentionally a separate thing from the `Alpha_v1` product release name. The two can move independently: this API can stay at `v1` while the product itself advances to `Alpha_v2` or beyond.

---

## `POST /api/v1/licenses/verify`

Checks whether a license key is valid for a product, on a given device, and reports the outcome.

```
POST https://<your-keyren-deployment>/api/v1/licenses/verify
Content-Type: application/json
```

Any other HTTP method on this path (for example `GET`) returns **`405 Method Not Allowed`** with an `Allow: POST` header and a `BAD_REQUEST`-shaped body, so a wrong-method bug in an integration is obvious rather than looking like a routing 404.

### Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `productId` | `string` | yes | 1–64 characters, matching `prod_[0-9A-Za-z]+`. This is the permanent ID shown on the product's dashboard page. |
| `licenseKey` | `string` | yes | 1–128 characters. Format is **not** validated at this layer — a badly formatted key is rejected as `LICENSE_INVALID`, the same as any other invalid key, so a malformed key and a wrong-but-well-formed key are indistinguishable from outside. |
| `deviceId` | `string` | yes | 1–1024 characters. An opaque, client-computed device fingerprint. Keyren does not parse, validate the shape of, or attempt to interpret this value — it is only ever hashed and compared. |

Any other field in the JSON body is silently stripped, not rejected — sending extra fields is harmless but has no effect.

```json
{
  "productId": "prod_01J9X6QK8N3H7V2M4P5R6S7T8U",
  "licenseKey": "KEYREN-ABCD1234-EFGH5678-JKMN9012-PQRS3456",
  "deviceId": "6f1c9e2a4b7d3f80b1c2d3e4f5a6b7c8"
}
```

### Success response — `200 OK`

```ts
{
  success: true;
  license: {
    status: "active";
    expiresAt: string | null; // ISO 8601 UTC timestamp, or null
  };
}
```

`license.status` is always the literal string `"active"` when `success` is `true` — there is no partial-success state. `expiresAt` is `null` for a permanent license, or an ISO 8601 UTC timestamp for one that expires.

**Example — a license that expires:**

```json
{
  "success": true,
  "license": {
    "status": "active",
    "expiresAt": "2027-02-14T00:00:00.000Z"
  }
}
```

**Example — a permanent license:**

```json
{
  "success": true,
  "license": {
    "status": "active",
    "expiresAt": null
  }
}
```

### Error response

Every rejection — validation, rate limiting, or a licensing decision — uses the same envelope:

```ts
{
  success: false;
  error: {
    code: string;    // one of the codes in the table below
    message: string; // fixed, public-safe text; see the table
  };
}
```

```json
{
  "success": false,
  "error": {
    "code": "LICENSE_EXPIRED",
    "message": "This license has expired."
  }
}
```

`error.message` is always one of the fixed strings below. It never contains exception text, SQL, column names, stack traces, or any other internal detail.

### Error codes

This table is exactly what `src/lib/errors.ts` implements — code, HTTP status, and the fixed message string returned in `error.message` — plus what each one means for an integration.

| Code | HTTP status | `error.message` | Meaning |
|---|---|---|---|
| `BAD_REQUEST` | 400 | "The request body was malformed." | The body was not JSON, or was missing a required field, or a field was outside its length/format bounds. |
| `PRODUCT_INVALID` | 404 | "The provided product is invalid." | No product with that ID exists. Safe to distinguish from a license failure because product IDs are shipped inside your software and are not secret. |
| `LICENSE_INVALID` | 403 | "The provided license is invalid." | The key does not resolve to a usable license for this product. See the callout below — this code is deliberately ambiguous. |
| `LICENSE_REVOKED` | 403 | "This license has been revoked." | The developer revoked this license from the dashboard. Restorable; if restored, the same key works again. |
| `LICENSE_EXPIRED` | 403 | "This license has expired." | The license's `expiresAt` has passed, compared against Keyren's server clock. |
| `DEVICE_MISMATCH` | 403 | "This license is already active on another device." | The license is HWID-locked and already bound to a different device fingerprint. Resolved from the dashboard by resetting the activation. |
| `RATE_LIMITED` | 429 | "Too many requests. Try again shortly." | Too many verification requests, either from this IP or against this product, within the current window. Honor the `Retry-After` header. |
| `INTERNAL_ERROR` | 500 | "An unexpected error occurred." | Keyren failed unexpectedly. Safe to retry with backoff; nothing about the failure is specific to the request. |

#### Why `LICENSE_INVALID` doesn't say more

`LICENSE_INVALID` is returned identically whether the license key:

- never existed,
- is well-formed but belongs to a **different** product, or
- was **deleted** by the developer.

This is deliberate, not an oversight. If those three cases returned different codes, an attacker could send guesses against the endpoint and use the response to tell "wrong key" apart from "right key, wrong product" apart from "used to be valid" — effectively an oracle for enumerating real license keys or mapping which keys belong to which product. Collapsing all three into one response removes that signal. The verification engine implements this as a single code path, not three implementations that happen to agree today, so it cannot drift apart in a future change.

### Rate limiting

Every request is metered on two independent axes before any license lookup happens, so a flood of guesses never reaches the database:

- **Per IP address** — default 60 requests/minute (`RATE_LIMIT_VERIFY_PER_MINUTE`).
- **Per product** — default 600 requests/minute (`RATE_LIMIT_VERIFY_PER_PRODUCT_PER_MINUTE`).

Both use fixed 60-second windows. A per-IP limit alone would punish an office or campus behind one NAT address while doing nothing about a distributed attacker; a per-product limit alone would let one abusive client exhaust a developer's entire budget. Both axes apply together.

When either limit is exceeded, the response is `429 RATE_LIMITED` with a `Retry-After` header giving the number of seconds to wait. No other detail — which axis tripped, what the configured limits are, or how the limiter is implemented — is exposed.

---

## Integrating safely

Read this before you ship an integration.

- **The product ID is not a credential.** It is safe to embed directly in software you distribute — it is an identifier, not a secret, the same way a public API's account ID would be.
- **Never ship any Keyren dashboard credential, session token, or the HMAC secret inside end-user software.** Assume anything present in a distributed binary or a JavaScript bundle will be read by anyone who has a copy of it. The dashboard's own generated integration snippet only ever includes your product ID for exactly this reason.
- **Send a fingerprint you have already computed and hashed on the client, not raw hardware identifiers.** Keyren never asks for and never interprets raw hardware serials — treat `deviceId` as an opaque value you control the derivation of.
- **A device fingerprint is an identifier, not tamper-proof hardware identity.** HWID locking raises the cost of casually sharing a license key between machines; it does not make spoofing impossible against a motivated attacker.
- **Alpha_v1 is online-only.** There is no offline license, no cached grace token, and no bundled fallback. If Keyren is unreachable — network failure, an outage, a timeout — your software cannot obtain a positive verification result from this API. Decide **deliberately**, ahead of time, what your application does in that situation (for example: fail closed and block usage, fail open with a warning, or use a short-lived local cache with a policy you control) — do not let it be whatever your HTTP client happens to do by default.
- **Handle every error code**, not just the happy path and one generic failure. `LICENSE_REVOKED` and `LICENSE_EXPIRED` are typically worth a specific, actionable message to the end user; `RATE_LIMITED` should back off and retry; `INTERNAL_ERROR` is safe to retry; `LICENSE_INVALID`, `PRODUCT_INVALID`, and `DEVICE_MISMATCH` mean the current key/device combination will not succeed without developer or end-user action and should not be retried in a loop.
