# Keyren `Alpha_v2` — Security Review Addendum

**Date:** 2026-08-15
**Scope:** everything `Alpha_v2` added on top of the `Alpha_v1` build reviewed in
[`security-review.md`](security-review.md), which remains accurate for the parts
it covers.
**Method:** static review of the new code, plus the end-to-end walkthrough in
[`docs/SETUP.md`](SETUP.md).

`Alpha_v2` is a quality-of-life release, but three of its features touch the
system's most sensitive property — the show-once plaintext key — and two
introduce a class of vulnerability the `Alpha_v1` codebase simply could not
have. This addendum covers those, and re-states the invariants that had to
survive.

---

## New attack surface

| Feature | Why it needed review |
|---|---|
| Batch generation | produces up to 100 plaintext keys in one response |
| Plaintext CSV/JSON export | writes keys to a file on the developer's disk |
| Metadata export | runs over **stored** records, at any time |
| Remembered creation settings | writes to `localStorage` |
| In-dashboard API tester | accepts a plaintext key as input |
| Bulk mutations | one request mutating many rows by ID |
| URL-driven filters | every value is attacker-controlled |

---

## SEC-A2-1 — CSV formula injection (addressed by design)

**Severity:** would have been High.

A `label` is free text, and on a licensing dashboard it routinely carries a
customer-supplied reference — an order number, a company name typed in from an
email. Both exports write those labels into a `.csv`.

Excel, Google Sheets and LibreOffice all *evaluate* a cell whose first
character is `=`, `+`, `-` or `@`. A label of

```
=cmd|'/c calc'!A0
```

is not a string in a spreadsheet; it is a command, executed on the machine of
whoever opens the file. This is the classic CSV-injection path, and it turns a
convenience feature into remote code execution against the developer.

**Mitigation.** `neutralizeFormula` in `src/lib/licenses/export.ts` prefixes
any cell beginning with one of those four characters with a single quote,
which forces the spreadsheet to treat it as text. Tab and carriage return are
included because parsers strip leading whitespace *before* deciding whether a
cell is a formula, so `\t=1+1` reaches the same evaluator.

Hardening runs **before** quoting, so a neutralized cell that also contains a
comma still gets its RFC 4180 quotes. It is applied to every column, not only
the label — the product ID passes through the same function.

Covered by `tests/licenses/export.test.ts`.

## SEC-A2-2 — Filename injection via product slug (addressed by design)

**Severity:** Low.

Export filenames embed the product slug, which derives from a
developer-supplied product name. A name could otherwise put a path separator
or a leading dot into a filename the browser is about to write to disk.

**Mitigation.** `exportFilename` reduces the slug to `[a-z0-9-]`, collapsing
everything else, and strips leading and trailing hyphens. A slug of
`../../etc/passwd` becomes `etc-passwd`. Timestamps are UTC, so the filename
agrees with the timestamps inside the file regardless of who exported it.

## SEC-A2-3 — Plaintext keys in the batch flow

The `Alpha_v1` invariant was that a plaintext key exists only in the creation
response and the dialog showing it. `Alpha_v2` had to keep that true for a set
of 100 keys, across a copy action, two file downloads, and an acknowledgement.

What was verified:

- **No new persistence.** Keys are returned by `createLicenseBatch` and never
  written to any column. `tests/licenses/batch.test.ts` serialises every stored
  row and asserts no returned key appears in it.
- **No second endpoint.** Both files are built in the browser from data
  already on the page. Posting the rows to a formatting endpoint would have
  put the keys on the wire a second time and into a second request log.
- **No storage.** `writeLicensePreferences` projects exactly four fields
  explicitly rather than spreading its argument, so an extra property cannot
  ride along; a test passes it a `licenseKey` and asserts nothing resembling
  one is stored.
- **No URL.** The result dialog's "Test a license" link deliberately does not
  carry the key. That would write plaintext into browser history, the address
  bar and any referrer.
- **Genuinely destroyed on acknowledgement.** This is the one `Alpha_v1` got
  structurally wrong. `useActionState` has no reset, so its dialog tracked a
  "dismissed key" string to stop the reveal reappearing while the key itself
  stayed in React state for the life of the page. `Alpha_v2` remounts the
  component that owns the action state with a fresh `key`, which actually
  drops it. `tests/components/create-license-dialog.test.tsx` asserts the key
  is absent from the entire document afterwards.

## SEC-A2-4 — Metadata export cannot leak a key (structural)

The metadata export is the more dangerous of the two, because unlike the batch
export it runs over **stored records at any time**. Its safety is therefore a
property of its type rather than of care taken at the call site:
`LicenseMetadataRow` has no field capable of holding a key. The closest is
`maskedKey`, built from the four characters captured at creation precisely so
the dashboard has something non-secret to point at.

Tests assert the column list contains no `licenseKey`, and that a row's
serialisation does not contain the plaintext of the license it describes.

## SEC-A2-5 — Bulk operations and authorization

Bulk mutations accept a list of IDs from the browser, which is exactly the
shape of request that invites an IDOR.

- **Ownership is in the SQL**, as a subquery over `products` scoped to the
  Clerk-derived owner. There is no load-then-check-in-JavaScript path a later
  edit could drop.
- **Counts are not an oracle.** The result distinguishes "changed" from
  "already in that state", but **not** "missing" from "belongs to someone
  else" — both are `notFound`. Distinguishing them would let a developer probe
  whether a guessed license ID exists. A test asserts a foreign ID and a
  nonexistent one produce byte-identical results.
- **The ID list is bounded** at the largest page size. Selection is per-page,
  so a longer list did not come from the UI, and an unbounded `IN (...)` is a
  cheap way to make one request do a lot of work.
- **Duplicates are collapsed**, so a repeated ID cannot inflate counts.

`tests/licenses/bulk.test.ts` covers foreign IDs, missing IDs, and mixed
selections for every operation.

## SEC-A2-6 — URL parameters are untrusted input

Every filter, sort, page and page-size value arrives from the address bar.

- `parseLicenseQuery` **never throws**. An unknown enum, a fractional page, a
  negative page, a 21-digit page number or a repeated parameter all fall back
  to a default, so a stale bookmark or a crawler appending junk still renders.
- `pageSize` is restricted to `{25, 50, 100}`. Without that, `?pageSize=100000`
  is a one-parameter denial of service against the developer's own dashboard.
- Search terms are **escaped for `LIKE`**. This is not an injection defence —
  values are always bound as parameters — but without it the pattern language
  leaks into what was typed: `50%` matches everything, `order_9` matches
  `orderX9`.

## SEC-A2-7 — The API tester

The tester accepts a plaintext key and sends a real request.

- It posts to the **real public endpoint**, through the real rate limiter. A
  private test route would have made a green result meaningless.
- The key is component state only: never stored, never in the URL, never sent
  anywhere but the endpoint under test. Three tests assert this.
- The device ID defaults to a **fresh disposable value per run**. An
  HWID-locked license binds to the first device that authenticates, so a
  stable test ID would claim the license for the dashboard and leave the real
  customer receiving `DEVICE_MISMATCH`. The panel warns about this above the
  button, not after.
- A network failure reports that the request never arrived, without the
  browser's exception text.

## SEC-A2-8 — Error message discipline

`Alpha_v2` shows more actionable errors than `Alpha_v1`, which is a risk: the
easy implementation is to pass `error.message` through.

`safeErrorMessage` allow-lists the three messages a developer can act on and
replaces everything else with a fixed fallback. Matching is **exact, not
substring**, so a driver error that happens to contain an allowed phrase
cannot smuggle a constraint name out alongside it — there is a test for
precisely that case.

Route-level error boundaries render `error.digest`, never `error.message`. In
production Next.js replaces the message anyway, but in development it is the
raw exception, and printing it is the habit that eventually puts schema
details on screen.

---

## Invariants re-verified

| Invariant | Status |
|---|---|
| Plaintext keys never in Postgres | holds — asserted per batch member |
| Plaintext keys never in storage, URL, or logs | holds |
| Batch creation is all-or-nothing | holds — proven by forcing the unique index |
| No historical plaintext export exists | holds — structurally impossible |
| `KEYREN_LICENSE_HMAC_SECRET` stays server-only | holds — unchanged |
| Owner ID always re-derived from Clerk | holds — no action reads one from a form |
| Ownership enforced in SQL | holds — including the new bulk and query paths |
| Foreign resources indistinguishable from missing | holds — including bulk counts |
| Public API contract unchanged | holds — no change to the route or its envelopes |
| Destructive actions confirmation-gated | holds — bulk delete requires `DELETE <count>` |
| No `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` in `src/` | holds |

The single `@ts-expect-error` in the repository is in
`tests/preferences.test.ts`, deliberately passing fields the type forbids in
order to prove the preferences writer discards them.

---

## Accepted residual risks

The six risks accepted in the `Alpha_v1` review are unchanged. `Alpha_v2` adds
two:

1. **A CSV of plaintext keys exists on the developer's disk.** That is the
   point of the feature — it is how a batch gets saved — but Keyren has no
   control over the file afterwards. The dialog's wording makes the
   irreversibility explicit; protecting the file is the developer's
   responsibility.

2. **The API tester can claim an HWID-locked license.** Mitigated by
   defaulting to a fresh disposable device ID per run and by an explicit
   warning, but a developer who unticks that box and tests a real customer's
   key will bind it to the dashboard. Recoverable in one click via Reset
   activation, and the tester says so when it sees `DEVICE_MISMATCH`.
