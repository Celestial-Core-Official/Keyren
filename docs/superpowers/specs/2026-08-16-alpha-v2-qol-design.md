# Alpha_v2 QOL — round two

**Date:** 2026-08-16
**Branch:** `alpha-v2`
**Status:** design approved, awaiting implementation plan

---

## The problem

`Alpha_v2` shipped as a quality-of-life release and does not feel like one. The
work it contains is real — labels, search, filtering, bulk generation, exports,
mobile navigation — but all of it landed on the *license list*. The surfaces
around that list were left as they were, and they are where the release feels
unfinished:

- **Settings has no settings.** Three read-only cards. Not one control. The
  page's own comment concedes it: *"There are still no developer-configurable
  settings, and this page still refuses to invent any."*
- **Overview has two numbers.** Products and Licenses, and nothing else. It is
  the page you land on after signing in and there is no reason to return to it.
- **The theme system is wired but inert**, and misbehaves visibly on some
  machines.

The complaint driving this round is that the release is broad and shallow. The
fix is not more surface area — it is finishing the surfaces that exist.

Guiding constraint, stated by the project owner: **simple but good.** Everything
should be easy to use. This is a mandate to add few things and finish them, not
to add many.

---

## Goals

1. Make the theme layer real, and fix the bug it currently causes.
2. Make Settings a page of controls.
3. Make Overview worth opening more than once.
4. Cut the navigation friction that costs the most time per day.
5. Fix the product page's inverted layout.

## Non-goals

Unchanged from `Alpha_v2`, and still deliberately absent: SDKs, offline
validation, end-user self-service resets, multi-device licenses, organizations
or roles, billing, webhooks, analytics, an audit-log UI, Redis, background
queues.

Additionally out of scope for this round:

- **No API changes.** `/api/v1/` does not move. This is a dashboard release.
- **No new database tables.** See decision D1.
- **No schema migration.** Nothing here touches `drizzle/`.

---

## Decisions

### D1 — Preferences live in `localStorage`, not Postgres

Consistent with how license preferences and `next-themes` already work, needs no
migration and no server actions.

The cost is real and accepted: settings do not follow the developer to another
browser or machine. For an alpha where an account is one developer, that is a
fair trade against the size a `developer_preferences` table would add to
Phase 2. Revisit if accounts ever gain a second seat.

### D2 — UTC stays the primary timestamp; local time appears alongside it

`Alpha_v2` made every timestamp UTC on purpose, and documented why: an expiry of
Dec 31 must not read as Jan 1 to someone in Sydney, because the API's answer will
not have moved.

That decision stands. The setting adds local time as **secondary** text next to
the UTC value — never replacing it. A developer can reason about their own
timezone without local time ever becoming the thing they read first.

A full UTC/Local toggle was considered and rejected: it reintroduces exactly the
off-by-a-day confusion the original decision prevents.

Applies to `src/components/dashboard/relative-time.tsx` and the formatters in
`src/lib/format/date.ts`. `RelativeTime` already shows an exact UTC timestamp on
hover; with the setting on, that hover text carries the local equivalent beneath
it. The visible relative text ("3 days ago") does not change. Absolute dates
rendered elsewhere — expiry in the license list, the creation-form preview —
gain a secondary local line. The expiry preview in the creation form is the one
place local time is genuinely useful, since that is where a date is chosen.

### D3 — Foundation before surfaces

Sequencing chosen over building surfaces first. Settings cannot be good until the
theme layer is real, because "theme" is the setting people open Settings to
change. Doing tokens first means the Settings page built in Phase 2 is the last
time Settings is built.

---

## Phase 1 — Foundation

The theme system is half-wired. `next-themes` is a dependency, `sonner.tsx`
calls `useTheme()`, and **no `ThemeProvider` is mounted anywhere in the app.**

### The bug this causes

`useTheme()` outside a provider returns an empty context. The destructuring
default in `src/components/ui/sonner.tsx:8` takes over:

```ts
const { theme = "system" } = useTheme()
```

`Sonner` receives `theme="system"` and resolves it against the OS
`prefers-color-scheme`. A developer whose machine is in light mode gets
**light-styled toasts on a permanently dark application.** Intermittent,
machine-dependent, and indistinguishable from a rendering glitch.

### There is no light theme to switch to

`:root` and `.dark` in `src/app/globals.css` define **identical values**. The
light palette is the dark palette copied. Writing a real light scale is net-new
work, not a tweak — every token needs a considered light value.

### `color-scheme` is load-bearing

`:root` sets `color-scheme: dark`, and the comment above it documents why:
without it, native controls — `<select>` option lists, `<input type="date">`
pickers, checkboxes, scrollbars — paint light, which renders the
license-creation dialog's dropdown as near-white text on white.

**The light palette must set `color-scheme: light` on `:root`, and `.dark` must
keep `color-scheme: dark`.** Getting this wrong breaks native controls in
whichever theme it is missed.

### Work

1. **Mount `ThemeProvider`** in `src/app/layout.tsx`: `attribute="class"`,
   `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`.
2. **Add `suppressHydrationWarning`** to `<html>`. Required — `next-themes`
   writes the class before React hydrates, and without this React reports a
   mismatch on every load.
3. **Remove `className="dark"`** from `<html>`. It is what pins the app dark.
4. **Remove `bg-[#0a0a0b] text-neutral-100`** from `<body>`. These are
   *redundant overrides* — `@layer base` in `globals.css` already applies
   `bg-background text-foreground` to body. Deleting them is what lets tokens
   take effect.
5. **Write the light palette** in `:root`, move the current dark values to
   `.dark`, and set `color-scheme` correctly in each.
6. **Make Clerk theme-aware.** `appearance` is currently hardcoded dark
   (`colorBackground: "#0a0a0b"`), so sign-in and the profile modal would stay
   dark inside a light app.

### Clerk provider structure

`ClerkProvider` sits in a server component and needs values from a client hook.
Resolved with a thin client wrapper, nested so `useTheme` is available to it:

```
ThemeProvider          (client, next-themes)
  └── ThemedClerkProvider  (client, reads useTheme, sets appearance)
        └── {children}     (server components pass through unchanged)
```

A client component may render server-component children passed as `children`, so
nothing below this boundary becomes client-side.

### Flash of unstyled content

Not a concern. `next-themes` injects a blocking inline script that sets the class
before first paint. The original dark-only workaround — identical `:root` and
`.dark` values — becomes unnecessary and is removed.

### Verification

Every component in `src/components/ui/` carries `dark:` variants that have
**never rendered**, because the app has never been in light mode. Each needs
looking at in light mode. Particular attention to `badge`, `button`,
`dropdown-menu`, `input`, `select`, `switch` and `tabs`, all of which branch on
`dark:` for background or border.

---

## Phase 2 — Settings

### Structure

Release notes and known limitations move to an **About** section. That content is
documentation, and its presence is a large part of why the page reads as a
brochure. What remains on Settings is controls only.

### Controls

| Group | Control | Values |
|---|---|---|
| Appearance | Theme | System / Light / Dark |
| Defaults for new licenses | Expiration mode | Permanent / Duration / Date |
| | Duration | existing `DURATION_OPTIONS` |
| | Device lock | on / off |
| | Quantity | `BATCH_QUANTITY_MIN`–`BATCH_QUANTITY_MAX` |
| Display | Default page size | 25 / 50 / 100 |
| | Show local time alongside UTC | on / off (see D2) |
| Data | Reset remembered settings | destructive, confirmed |
| Account | Open profile / security | opens Clerk directly |

### How defaults interact with existing per-product memory

`src/lib/preferences.ts` already remembers creation settings **per product** in
`keyren:license-prefs:<productId>`. That behaviour is good and stays.

The global default **seeds a product that has no stored preferences yet**. A
product that has been used keeps its own memory and is unaffected. Resolution
order:

```
per-product stored prefs  →  global defaults  →  DEFAULT_LICENSE_PREFERENCES
```

This makes the global setting meaningful for new products without silently
rewriting what an existing product learned.

### Reset

Clears `keyren:license-prefs:*` and `keyren:flag:*`. Today these are written but
never surfaced and never clearable — a dismissed onboarding checklist cannot be
brought back, and a product's remembered quantity cannot be forgotten. Behind a
confirmation, since it discards state across every product.

### Account

Replaces the paragraph pointing at the avatar menu with buttons that call
`openUserProfile()` from `useClerk()`. The existing reasoning — that Keyren must
not duplicate password controls — is respected: this opens Clerk's own UI, it does
not reimplement it. It just stops making the developer hunt for it.

### Storage

Extends `src/lib/preferences.ts` with a global-defaults schema, following that
file's existing discipline exactly:

- zod-validated on read, because storage is untrusted input
- out-of-range values **clamped**, not rejected
- `.catch()` to a default on every field, so a stale key from an older build
  degrades rather than reaching a form
- **explicit field projection on write, never a spread** — this is the boundary
  that keeps labels, notes and plaintext keys out of storage

That last rule is the security-relevant one and is non-negotiable.

---

## Phase 3 — Overview

`src/app/dashboard/page.tsx` renders Products and Licenses and stops. The
*product* page correctly shows Expired and Revoked; the global Overview does not.

### Additions

- **Expiring soon** — next 30 days, linking into the pre-filtered license list
- **Recent activity** — most recent activations and creations
- **Per-product breakdown** — active/total per product, each row a link
- **Global expired / revoked** — shown only when non-zero

That last convention is copied deliberately from
`src/app/dashboard/products/[productId]/page.tsx`, whose comment explains it: *a
column of zeroes teaches the developer to stop reading the row.*

### Data

New owner-scoped aggregates in `src/lib/licenses/query.ts`, alongside
`getProductLicenseStats`. **Computed in SQL, never by loading rows and counting
in JavaScript** — the existing stats query already sets this precedent and the
list is expected to grow.

Timestamps are bound as ISO strings, per the fix in commit `3eb73e1` and the
helper in `src/lib/db/timestamp.ts`.

The empty state stays as it is — a new account with no products should still see
one action, not a grid of zeroes.

---

## Phase 4 — Navigation

### Command palette (`Cmd+K` / `Ctrl+K`)

Searches across:

- **Products** — name, slug, product ID
- **Licenses** — label, and last four characters of the key
- **Actions** — new product, settings, theme

The motivating case: a customer emails a key suffix, and today the developer must
work out which product it belongs to before they can search for it.

Requirements:

- **Owner-scoped on the server.** Every query filters by owner id. A palette that
  searched globally would be a cross-account leak.
- **Search terms escaped**, reusing `src/lib/search.ts`. `Alpha_v2` already
  ensures searching `50%` finds the license labelled "50% off"; the palette must
  not reintroduce pattern-language leakage.
- **Debounced**, and cancelling in-flight requests on a new keystroke.
- **Never displays a plaintext key** — none exists to display; only masked forms
  and labels.

### Shortcuts

- **`?` opens an overlay** listing shortcuts, available from any page. Today the
  list is static text on a page nobody visits.
- Grow `KEYBOARD_SHORTCUTS` beyond its current four entries.
- Existing guards are preserved: letter shortcuts stand down while typing in a
  field, when a modifier is held, during IME composition, and whenever a dialog
  is open. `Cmd+K` is exempt from the modifier guard by design, being a modifier
  shortcut itself.

### Product actions from inside a product

`ProductActions` — rename and delete — is mounted **only on the products list**
(`src/app/dashboard/products/page.tsx`). Once inside a product there is no way to
rename it without navigating back out.

Mount it in the product layout header next to the product name. Same component,
one more usage site.

---

## Phase 5 — Product page

`src/app/dashboard/products/[productId]/page.tsx` is a six-section scroll, and
the primary actions are in the middle of it.

1. **Primary actions move up** beside the product title in the layout header.
   *Generate license* and *Manage licenses* currently float mid-page, below the
   stats and endpoint cards and above the integration panel.
2. **Drop the duplicated product ID** from the Endpoint card. The ID renders
   twice on one screen with two copy buttons — once in the layout header
   (`layout.tsx`), once in the Endpoint card. The header keeps it; the card keeps
   the endpoint URL only.
3. **Integration + API tester move to an Integrate tab.** `ProductTabs` already
   exists and already handles `aria-current`; this adds a third tab. Overview
   becomes short enough to read.

The onboarding checklist stays on Overview. It is derived from real data, already
disappears when complete, and is the one thing a new product should show first.

---

## Testing

Follows what the repo already does — `vitest`, `@testing-library/react`, and the
existing patterns in `tests/components/`.

| Area | Approach |
|---|---|
| Preferences schema | Unit. Tampered, stale, out-of-range and absent values all degrade to defaults; write projection drops unknown fields |
| Defaults resolution | Unit. per-product → global → built-in, and that an existing product is not overwritten |
| Overview aggregates | Unit against `pglite`, matching `tests/licenses/query.test.ts` |
| Palette search | Unit for escaping and owner scoping; RTL for the component |
| Shortcuts overlay | RTL, extending `tests/components/keyboard-shortcuts.test.tsx` |
| Theme | Visual verification in the browser preview, both themes |

`npm run typecheck`, `npm run lint` and `npm run test` all pass before any phase
is considered done.

---

## Risks

**The light theme is the largest unknown.** Every `dark:` variant in
`src/components/ui/` is untested in the theme it was written to complement.
Expect contrast problems, especially on `badge`, `button` and `dropdown-menu`.
This is why Phase 1 is first and why it ends in visual verification rather than a
unit test.

**`color-scheme` is easy to get wrong and loud when it is.** Native controls go
invisible. Both branches need checking against a real `<select>` and a real date
picker, which the license-creation dialog provides.

**Clerk's appearance is theme-reactive through a client boundary.** If
`ThemedClerkProvider` is nested outside `ThemeProvider` by mistake, `useTheme`
returns empty and Clerk silently falls back — the same class of bug as the
current Sonner one, with the same silent failure mode.

**Scope.** Five phases is a lot for one release. They are ordered so that
stopping after any phase leaves the app in a coherent state. Phase 1 alone fixes
a real bug and is worth shipping on its own.
