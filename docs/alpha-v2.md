# Keyren `Alpha_v2`

**Package version:** `0.1.2`
**Public API:** unchanged, still `/api/v1/...`

`Alpha_v2` is a quality-of-life release. It changes how the dashboard feels to
use and changes nothing about what Keyren is: the same products, the same
show-once keys, the same single verification endpoint. Software integrated
against `Alpha_v1` keeps working with no change at all — the request fields,
the response envelopes, the error codes and the status codes are all
identical, which is the entire reason the API path is versioned separately
from the release name.

---

## Licenses can be told apart

A license used to be identifiable only by the last four characters of a key
that can never be shown again. That is workable with five licenses and
useless with five hundred.

- **Labels** — an optional short reference (a customer, an order, a seat),
  up to 120 characters.
- **Notes** — optional internal context, up to 1,000 characters.

Both are editable at any time from **Edit details**. Neither is ever returned
by the verification API: that endpoint is unauthenticated and anyone holding a
key can call it, so a customer name or a private remark must not become
readable by the customer.

An unlabelled license shows as *Unlabeled license* with its masked key
beneath, so every row still has something to read.

## Licenses can be found

The list is now searched, filtered, sorted and paged, all through the URL — so
a view can be bookmarked, shared, and survives a refresh or a back navigation.

| Control | Values |
|---|---|
| Search | matches label, notes, and the last four characters of the key |
| Status | any, active, revoked, expired |
| Activation | any, activated, not activated |
| Device lock | any, locked, unlocked |
| Sort | newest, oldest, label A–Z, expiring soonest, recently seen |
| Per page | 25, 50, 100 |

All of it happens in SQL, so the page stays fast as the list grows. Active
filters are summarised as chips with a single **Clear filters** action, and a
search that returns nothing offers to clear itself rather than looking like an
empty product.

Searching for `50%` finds the license labelled "50% off" rather than matching
everything — search terms are escaped, so the pattern language never leaks
into what you typed.

## Licenses can be created in bulk

Generate **1 to 100 licenses at once**. Every license in a batch shares its
expiration, device-lock setting and optional base label; labels past a
quantity of one are numbered automatically (`Acme Corp 1` … `Acme Corp 25`).

The batch is one database transaction. Either every license is created and
returned, or none is — a half-finished batch would leave you with keys you
never saw and no way to tell which ones exist.

### Saving the keys

The result view lists every key, with:

- **Copy all** — all keys, newline separated
- **Download CSV** — `label,licenseKey,productId,expiresAt,hwidLocked,createdAt`
- **Download JSON** — the same fields as an array of objects
- a per-row copy button, and selectable text for a browser that blocks the
  clipboard

Files are named `<product-slug>-licenses-YYYY-MM-DD-HHmmss.csv` (or `.json`),
stamped in UTC so the name agrees with the timestamps inside.

**The dialog cannot be dismissed** by Escape, by clicking outside, or by a
close button until you tick *I have saved or exported every key*. All three
are reflexes, and any of them would destroy keys you had not saved. Exports
are deliberately **not** gated behind that tick — downloading is how you save
them.

Once acknowledged, the keys are gone. There is no historical export, and the
metadata export below has no column capable of carrying one.

## Managing many licenses at once

Select rows with the checkboxes — a header checkbox takes the current page —
and a toolbar appears with **Revoke**, **Restore**, **Reset activations**,
**Export CSV**, **Export JSON** and **Delete**.

Confirmations say what will actually happen: how many are selected, how many
will change, and how many are already in that state and will be left alone.
Afterwards you are told the same three numbers again from the server, so
"revoked 5" never means "revoked 2 and three were already revoked".

Bulk deletion asks you to type **`DELETE <count>`**. Typing `DELETE` is muscle
memory by the third time; typing the number forces a look at how many you are
about to erase.

The metadata export covers label, masked key, product ID, stored and effective
status, expiry, lock state, activation timestamps and creation time. **It
cannot contain a plaintext key** — no such column exists in it.

## Faster day-to-day management

- The **one action a license most likely needs** now sits directly in the row.
  A locked license that is bound to a device offers **Reset**; anything else
  offers **Revoke** or **Restore**. The full menu still holds everything.
- **Reset activation no longer appears for unlocked licenses** at all. Their
  activation row records recent activity, not an exclusive claim — there is
  nothing to release, and offering to release it implied a binding that does
  not exist.
- **Every action now tells you whether it worked.** In `Alpha_v1`, revoking,
  restoring and resetting were silent on both success and failure.
- Toasts name the license that changed, by label or masked key.
- A failed copy is now visible, with a prompt to select the text manually.
  It used to fail silently — including during a key's only appearance.

## Dates mean what they say

Choosing an expiry date now means **the whole of that day**, ending
`23:59:59.999Z`. `Alpha_v1` used midnight, cutting the customer off a day
earlier than chosen, and said nothing about which end of the day it meant. The
form previews the exact instant — *Expires Aug 31, 2026 at 23:59 UTC* — before
you submit, and the date picker refuses past dates.

Everything is formatted in UTC. An expiry of Dec 31 must not read as Jan 1 to
someone in Sydney, because the API's answer will not have moved. Recent
activity reads as *3 days ago*, with the exact UTC timestamp on hover.

## Integrating

The integration panel now offers **JavaScript, Python, cURL and C#**, each
with your product ID and deployment URL already filled in, and each with its
own copy button.

They are written as code worth shipping. Every one carries a timeout — a
licensing check that hangs takes your application down with it — reads the
body as text and parses it defensively, because a 429 from a proxy or a 502
from a load balancer is frequently HTML, checks `success` rather than only the
status code, and names all eight error codes.

### The tester

Below the examples, **Test a license** sends a real request to the real
`/api/v1/licenses/verify`, through the same rate limiter your customers hit,
and shows the status, the round-trip time, the relevant headers and the
formatted response — including a non-JSON body shown verbatim rather than
turned into a parse error.

The device ID defaults to a fresh `keyren-dashboard-test-…` per run, because
**testing a device-locked license claims it**. Without that, testing a key
would bind it to the dashboard and leave the real customer receiving
`DEVICE_MISMATCH`. The panel says so above the button.

Nothing you type there is saved anywhere.

## Getting started

A new account now opens the product-creation dialog directly instead of
linking to a page where the button has to be found again.

Each product shows a three-step checklist: generate a license, copy an
integration example, run one successful verification. Two of the three are
derived from real data — a license exists or it does not, and an activation
row is only ever written by a verification that succeeded — so it cannot claim
a step is done when it is not, or ask you to redo something you finished. It
disappears when complete, and can be dismissed.

## Getting around

- **Mobile navigation.** `Alpha_v1` hid the sidebar below the `md` breakpoint
  and replaced it with nothing, so on a phone the only way between sections
  was the back button. There is now a menu, including the current product's
  Overview and Licenses.
- **Mobile license cards** instead of a seven-column table whose actions sat
  off the right edge.
- **Product tabs show which one you are on**, with `aria-current`.
- **Keyboard:** `/` focuses the current page's search box, `N` opens its
  create dialog. Both stand down while you are typing in a field, when a
  modifier is held, during IME composition, and whenever a dialog is open.
- A **skip link** is the first tab stop on every page.

## Products

- Search by **name, slug or product ID** — the ID is usually what you have in
  front of you, pasted from a stack trace or a support ticket.
- Sort by newest, oldest, name, or license count.
- Rows are clickable in full, while the copy button and actions menu keep
  working.
- One-click copy for both the **product ID** and the **verification endpoint**.

## Corrected numbers

- **Active** now excludes expired licenses. It counted `status = 'active'`
  before, so a product whose licenses had all lapsed still reported them as
  active — the figure most likely to be trusted at a glance, disagreeing with
  what the API told customers.
- **Expired** and **Revoked** counts appear when they are non-zero.
- **Activated devices** is now **Bound devices**, counting only locked
  licenses that hold a binding. An unlocked license with an activation row has
  merely been seen recently.

## Smaller things

- Masked keys read `KEYREN-••••-••••-••••-1234`. The old form appended the
  suffix to a full-width masked group, implying four characters that do not
  exist.
- Creation settings — expiration mode, duration, device lock, quantity — are
  remembered per product. Labels, notes and keys never are.
- Loading skeletons shaped like the content they stand in for.
- Route-level error and not-found pages that do not print exception text.
- Spinners and pulses only under `motion-safe`.

---

## Not in this release

Unchanged from `Alpha_v1`, and still deliberately absent: SDKs, offline
validation or grace tokens, end-user self-service resets, multi-device
licenses, organizations or roles, billing, webhooks, analytics, an audit-log
UI, Redis, and background queues.

## Upgrading

One additive migration (`drizzle/0001_*.sql`) adds the nullable `label` and
`notes` columns and an index. Existing rows are untouched and existing keys
keep working — `KEYREN_LICENSE_HMAC_SECRET` is not involved, so nothing is
re-derived.

```bash
npm run db:migrate
```
