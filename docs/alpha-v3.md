# `Alpha_v3` — what changed

**Release:** `Alpha_v3` (package `0.1.3`)
**Theme:** a complete visual redesign. No new capability, no API change, no schema change.

`Alpha_v1` built the machine. `Alpha_v2` made it comfortable. `Alpha_v3` makes it look like
something a developer would trust with their licensing.

The design of record is [`superpowers/specs/2026-08-17-keyren-alpha-v3-design.md`](superpowers/specs/2026-08-17-keyren-alpha-v3-design.md);
the task breakdown is [`superpowers/plans/2026-08-17-keyren-alpha-v3.md`](superpowers/plans/2026-08-17-keyren-alpha-v3.md).

---

## What did not change

`POST /api/v1/licenses/verify` is byte-identical in contract — same request shape, same response
envelope, same error codes, same statuses. `git diff main -- src/app/api src/lib/licenses/verify.ts
src/lib/crypto drizzle` is empty, and its tests are unmodified.

No migration. No new npm dependency. The list under "Explicitly out of scope" in the README is
unchanged and still unbuilt.

---

## The token layer

Rewritten wholesale rather than patched, because every component below it reads from it.

- **A four-step foreground ramp** (`--foreground` → `--fg-secondary` → `--fg-tertiary` →
  `--fg-quaternary`). Alpha_v2 had two steps and nothing between them, which is why every secondary
  surface had to choose between shouting and disappearing.
- **Three surfaces** (`--background`, `--surface-1`, `--surface-2`) with **borders as
  alpha-composited foreground**, so one border value survives on all three.
- Neutrals carry chroma `0.002–0.006` on the mark's own hue (275) rather than zero — far below where
  anyone would call them blue, and enough that they stop reading as a framework default.
- Dark base is near-black with a trace of that hue, never `#000`; foreground is never pure white.
- **Semantic status tokens** (`--success`, `--warning`, `--destructive`, each with `-subtle` and
  `-border`) per theme.
- **An explicit radius scale** — 4 / 6 / 8 / 12px, pill for badges — replacing multiples of a 10px
  base that put `Card` at 14px, larger than any comparable product.
- **Two shadows only**: a `0 0 0 1px` ring for elevation-by-outline, and one large soft lift for
  genuinely floating things. The default scale is unused.
- **Two durations and two easings.** No animation library: entrance staggers are `@keyframes`, so
  nothing gained a client boundary.
- A **syntax palette** built from the five `--chart-*` tokens that had been defined in both themes
  and unused since Alpha_v1.

**The brand accent has exactly four jobs** — primary button fill, focus ring, active nav item,
active tab underline — plus one sanctioned fifth, the onboarding progress rail. It is never a
gradient, never a glow, never a surface tint.

## Typography

**Instrument Sans** for the voice and **IBM Plex Mono** for the product's own object — every key, ID,
fingerprint, error code, status and numeral. Both via `next/font/google`, fetched once at build and
self-hosted, so no request leaves a visitor's browser for a third-party origin.

Deliberately **not Geist** (now v0's default output face, which makes it a default rather than a
decision) and not the stock Inter cut. Tracking is tokenized as a function of optical size and only
headings receive it. Heading weight is 500.

## The key glyph

A deterministic bit-grid mark, one per licence, in the spirit of SSH randomart. It appears in the
licence table, the card list, the application list and as the landing page's motif.

The seed is **the masked key already rendered on screen** — never plaintext, never the stored HMAC —
so it carries no information that was not already beside it. It is pure and synchronous, so it draws
inside a server component with no hydration boundary and no client JavaScript.

Its hash needed an avalanche finalizer: FNV's trailing multiply leaves the low bits barely mixed, so
the final character of a seed reached the output through its low three bits alone, and two hex keys
differing only there drew byte-identical marks — the exact comparison the glyph exists to support.

## Surfaces

**Landing** — one focused scroll, left-aligned, on a masked hairline grid. The fold is anchored by
the real product rendered in HTML using the real tokens, not a screenshot and not an abstract
visual. Three named stages instead of numbered circles. The security model as claim-plus-mechanism
pairs, which is the honest substitute for social proof a pre-customer product has — including the
device caveat `lib/crypto/device.ts` already conceded internally. Integration snippets come from the
same module the Integrate page uses, so the two cannot drift. No pricing table, no logo wall, no
testimonials, no badge pill.

**Shell** — the sidebar bleeds to the viewport edge at 256px. Through Alpha_v2 it sat inside
`max-w-7xl`, which put its right border mid-canvas on any wide display.

**Overview** — eleven identical stat cards across two pages become two ~58px metric rails. A bare
count has no denominator and does not earn a KPI card. No chart: per-day verification counts are not
stored, and a chart of derived-from-nothing data is the loudest tell there is. The dashboard leads
with *Expiring soon*; the application overview leads with its most recently issued licences.

**Licence table** — 48px single-line rows, a glyph column, the masked key middle-truncated in its
own cell with the full value on copy, notes off the row, sticky header from `xl`, a left rail
instead of a fill on selection, and the bulk bar collapsed into a floating pill with `Undo` on
revoke.

**Code** — one container with language chips inside its header bar, a line-number gutter and token
colouring from `--chart-*`. The copied payload is still the plain string.

**Auth** — split layout, and Clerk rethemed from the token layer so it stops reading as a
third-party embed.

## Defects fixed along the way

1. **Status badges failed contrast in light mode.** `license-status-badge.tsx` hardcoded
   `bg-emerald-500/15 text-emerald-400` and the amber equivalent for *both* themes — leftovers from
   when `<html>` was pinned dark. Against the light tint that is roughly 2:1. The same literals
   survived in four other files. All now come from semantic tokens, with a test that fails if one
   creeps back.
2. **⌘K was invisible.** Bound since Alpha_v2, with no affordance anywhere in the chrome. It now has
   a header search control, routed through the same guard as the keyboard binding — so it still
   cannot open over the show-once reveal dialog.
3. **Native controls escaped the focus grammar.** The `<select>` in filters and pagination and the
   checkboxes in the licence table fell back to the OS focus ring. Replaced with the Radix
   equivalents.
4. **The sidebar rule landed mid-canvas** on any display wider than 1280px.
5. **A sticky table header that could never have worked.** `ui/table.tsx` wraps every table in
   `overflow-x-auto`, which forces `overflow-y` to compute to `auto` and makes the container a
   scrollport — so a sticky `<thead>` stuck to something that never scrolls vertically.
   `overflow-x: clip` preserves sticky and is applied from `xl`, where columns fit; below that,
   reachable content beats a sticky header.

## Verification

`npm run typecheck`, `npm run lint`, `npm test` (803 tests, 60 files) and `npm run build` all pass.

Grep gates: no Tailwind palette literal, no `rounded-2xl`/`3xl`, no default shadow, no
`shadow-primary`, no emoji in `src/`, and every `backdrop-blur` is chrome.

**Not yet verified visually.** The dashboard sits behind Clerk and could not be signed into during
the build, so every dashboard surface is verified by typecheck, lint and the test suite rather than
by eye. A pass through all of them in both themes at 375 / 768 / 1440 is the remaining acceptance
step.

---

## Application scope

The dashboard now has exactly one application in scope at all times, and the header
chooser is the only control that changes it. "All applications" is gone — it was the one
entry meaning "no application in scope", and there is no such state left. Overview and
Applications keep existing and stop being ways in: their rows report, and nothing in them
navigates into an application.

Which application is current resolves in three steps — the URL when it names one, then the
`keyren_app` cookie, then the newest application — and the split is deliberate. The URL
half is applied in the client components, because `usePathname()` is theirs and a server
layout has no pathname. The rest is resolved server-side and handed down. Middleware
writes the cookie whenever a URL names an application, which is the one place that sees
every route in: chooser, command palette, bookmark, and the redirect after creating one.

A `<Link>` prefetches once it is merely in the viewport, and that request reaches
middleware like any other — so the write is skipped on both of Next's prefetch headers.
Without that, looking at a page which links into applications was enough to rewrite the
remembered one, to whichever prefetch landed last, with nobody having clicked anything.

The cookie is a hint about the interface and never an authorization input. It is resolved
against the developer's own applications — already scoped by `owner_id` in SQL — before it
is used, so a stale, hand-edited, or someone-else's value matches nothing and falls
through to the default.

The applications table also gained a Status column. A disabled application was badged in
the application header and on the overview, and badged nowhere in the one table that lists
every application at once.

## The kill switch was built on invalid HTML

`ApplicationStatusSetting` rendered a submit `Button` wrapping a `Switch`. Radix's `Switch`
root is itself a `<button>`, so the markup nested one button inside another, and the HTML
parser resolves that by closing the outer one: server-rendered, the row arrived as an empty
zero-sized submit button beside a switch that had been ejected to be its sibling and
carried `pointer-events-none`. React then hydrated a tree that did not match the one it had
sent.

A component test could not see this, which is why it survived a release. The client-rendered
tree was never the broken one — `appendChild` has no such parser rule and nests the two
happily. Verified by handing the exact markup to a real browser's parser and reading back
the result. The regression guard therefore asserts on `renderToStaticMarkup` output rather
than on a rendered DOM, and fails on the old markup with "expected 2 to be less than or
equal to 1".

Disabling now asks first, from both the settings row and the row menu. One click took
licensing offline for every customer of that application at once.
