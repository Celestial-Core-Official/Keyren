# Keyren `Alpha_v3` — Visual Design Specification

**Date:** 2026-08-17
**Release:** `Alpha_v3` (package `0.1.3`)
**Theme:** a complete visual redesign. No new product capability, no API change, no schema change.

`Alpha_v1` built the machine. `Alpha_v2` made it comfortable. `Alpha_v3` makes it look like
something a developer would trust with their licensing.

---

## 0. What this release is, and is not

**Is:** a total replacement of the token layer, typography, landing page, dashboard chrome and
every data surface. A signature visual device that no template can produce. Correctness fixes for
four defects that the redesign would otherwise entrench.

**Is not:** new features. The list in `README.md` under "Explicitly out of scope" is unchanged and
stays unbuilt: SDKs, offline validation, grace tokens, end-user HWID resets, multi-device licenses,
orgs/teams/roles, billing, webhooks, analytics, an audit-log UI.

`POST /api/v1/licenses/verify` does not move. Its request shape, response envelope, error codes and
HTTP statuses are untouched. No migration is required.

The release name and version live in `src/lib/release.ts` and nowhere else. That file is the only
place `Alpha_v3` / `0.1.3` is written, alongside the `version` field in `package.json`. Nothing
user-facing may call this "v3" — `/api/v1/...` is versioned separately and does not move.

### Non-negotiable rules that still bind

Every rule in `PROGRESS.md` § "Non-negotiable rules" survives this release intact. The three that
this redesign could plausibly violate, and therefore must be checked against every diff:

- **Never store or log plaintext license keys.** The key glyph (§4) derives from the *masked* key
  string that is already rendered on screen. It never touches plaintext, never touches the HMAC, and
  is computed in a server component with no key material crossing to the client beyond what the
  table already displays.
- **No `any`, no `@ts-expect-error`, no `eslint-disable`.** A redesign is not a licence to silence
  the compiler.
- **Do not implement future features.** A visual affordance that implies analytics, teams or billing
  is the same violation as building them. The landing page states nothing the product cannot do.

---

## 1. Research basis

Four parallel research agents produced the evidence this spec rests on. Their full reports:

| Report | Covers |
|---|---|
| `research-slop-vs-craft.md` | 1,590-page Show HN slop dataset; 11 production sites instrumented for computed styles |
| `research-dashboards.md` | 21 reference dashboard/docs surfaces measured; per-file change list for Keyren |
| `research-positioning.md` | Licensing competitors; developer-landing-page conversion research; copy drafts |
| `research-21st-dev.md` | 21st.dev catalogue (now paywalled); free upstream registries; hand-implementable techniques |

The findings that most shape this document:

1. **Purple is not the tell — the gradient is.** Linear (`#5e6ad2`), Clerk (`#6c47ff`) and WorkOS
   (`#6363f1`) all run violet accents and read premium, because the colour is always *flat*. Keyren
   keeps `#4244CE`. What it bans is the ramp, the glow, and the accent-as-decoration.
2. **Measured radii are 2–8px**, never 16-on-everything. Unkey and Arcjet ship 2px, Stripe 4, Vercel 6.
   Keyren's current `--radius: 0.625rem` renders `Card` at 14px — larger than any reference card.
3. **Bold headings are a minority choice.** Stripe's H1 is weight 300; Unkey, Resend, Polar and
   Vercel sit at 400; Linear uses 510/590/680.
4. **7 of 11 heroes are left-aligned.** The generated-page signature is centered hero + badge pill +
   two buttons + three icon-top cards, all four firing together.
5. **A number without a denominator does not deserve a card.** Vercel's Geist Gauge doc is explicit;
   the best developer dashboards lead with the object (a list), not a KPI row.
6. **21st.dev is paywalled** — its registry returns 403 and component source shows as locked. It is
   usable as a visual search engine only; anything installed comes from the free upstream registries
   or is hand-written. This spec hand-writes everything.

---

## 2. Direction — "Instrument"

A precision instrument for a security-adjacent product. Cold, dimensioned, quiet. The chrome is
almost achromatic; the only saturation on screen carries meaning.

Chosen as a deliberate blend of two researched directions: the chromatic discipline of a
zero-chroma system, with a warm amber counter-signal in the data layer. Warm-signal-on-cold-grey is
a pairing effectively unused in this category, which is the point.

### 2.1 Rejected outright

These are banned from the codebase, and a diff containing one is wrong regardless of how it looks:

- Any gradient used as decoration. Gradients as *structure* (a masked hairline grid, a 135° hatch at
  ≤5% alpha, an edge fade) are permitted.
- Coloured glows, blurred blobs, floating orbs, `shadow-primary/20`, glassmorphism over a blob.
- A coloured top or left border on a card.
- Emoji anywhere in product chrome or marketing.
- A badge pill above the H1 reading "✨ Introducing…".
- Icon-top three-column feature card grids.
- Numbered "1 / 2 / 3" circles as a How-It-Works section.
- Fake percentages, invented deltas, a chart of data that does not exist.
- Logo walls, testimonials, star ratings, SOC2/ISO badges, uptime claims. There are no customers.
- The banned copy register: *supercharge, seamless, unleash, best-in-class, cutting-edge, the future
  of, without limits, effortlessly, revolutionize*, and every hedge (*may help*, *can potentially*).

---

## 3. Token layer

Everything below lands in `src/app/globals.css`. It is rewritten wholesale, not patched. The
existing file's two genuinely good decisions are preserved and their comments kept: `color-scheme`
on both blocks, and `--ring` deliberately not tracking `--primary` down in dark.

### 3.1 Neutrals

Near-zero chroma carrying a trace of the mark's hue, so the greys read as belonging to the palette
rather than as stock zinc. Chroma `0.003–0.005` at hue `275`. This is the Supabase technique
(generated ramp, tiny chroma) and Keyren's existing `0.005 285` instinct was already right — it
moves to the mark's hue and gains a proper ramp.

**Dark base is near-black with a blue trace, never `#000`.** Foreground is never pure white.

```
DARK                                       LIGHT
--background      oklch(0.135 0.004 275)   oklch(0.993 0.002 275)
--surface-1       oklch(0.165 0.004 275)   oklch(1     0     0  )   /* cards */
--surface-2       oklch(0.195 0.005 275)   oklch(0.975 0.003 275)   /* raised: code, popover */
--foreground      oklch(0.965 0.003 275)   oklch(0.155 0.006 275)   /* step 1 */
--fg-secondary    oklch(0.855 0.005 275)   oklch(0.32  0.008 275)   /* step 2 */
--fg-tertiary     oklch(0.665 0.008 275)   oklch(0.485 0.010 275)   /* step 3 — muted-foreground */
--fg-quaternary   oklch(0.505 0.008 275)   oklch(0.63  0.008 275)   /* step 4 — placeholder, disabled */
--border          oklch(1 0 0 / 0.09)      oklch(0.145 0.006 275 / 0.11)
--border-strong   oklch(1 0 0 / 0.15)      oklch(0.145 0.006 275 / 0.18)
```

The **4-step foreground ramp** is the single most load-bearing addition. Every reference site has
one; Keyren currently has `--foreground` and `--muted-foreground` and nothing between them.

**shadcn aliases.** The named roles above are the source of truth; shadcn's expected variables are
declared as aliases of them, so no existing component breaks and no component needs to learn a new
name it does not already use:

```
--card / --sidebar          → --surface-1
--popover                   → --surface-2
--muted / --secondary       → dark oklch(0.225 0.005 275) · light oklch(0.965 0.003 275)
--accent                    → dark oklch(0.25 0.006 275)  · light oklch(0.945 0.004 275)
--muted-foreground          → --fg-tertiary
--input                     → --border
--card-foreground / --popover-foreground / --secondary-foreground / --accent-foreground
                            → --foreground
```

`--accent` here is shadcn's *hover surface*, unrelated to the brand accent in §3.2. The two must not
be conflated: nothing in `--accent` is ever `--primary`-tinted.

Borders are **alpha-composited foreground**, not solid grey, so they survive on `--background`,
`--surface-1` and `--surface-2` alike. `--border-strong` exists for exactly one job: the two-weight
rule (§6.2).

`--muted-foreground` remains as an alias of `--fg-tertiary` so no existing component breaks, and
both values clear AA against `--background` and `--surface-1` — the constraint the current file
already documents and must not regress.

### 3.2 Accent

```
--primary        dark oklch(0.575 0.185 275)   light oklch(0.505 0.195 275)   /* ≈ #4244CE family */
--primary-fg     oklch(0.985 0 0)
--ring           dark oklch(0.655 0.185 275)   light oklch(0.545 0.195 275)
```

`--primary` in dark is lifted off the mark's literal `#4244CE` for the same reason the current file
documents: `--primary-foreground` is near-white and sits on this fill, so it must clear 4.5:1.
`--ring` stays brighter than `--primary` in both themes because a focus ring is measured against the
page behind it, not against text on top of it.

**The accent appears in exactly four places.** Primary button fill. Focus ring. Active sidebar item.
Active tab underline. A fifth use is a bug.

### 3.3 Status

```
                  DARK                      LIGHT
--success         oklch(0.72 0.16 150)      oklch(0.52 0.14 152)
--success-subtle  oklch(0.26 0.05 150)      oklch(0.955 0.04 152)
--success-border  oklch(0.36 0.07 150)      oklch(0.855 0.07 152)
--warning         oklch(0.80 0.16 78)       oklch(0.52 0.13 68)
--warning-subtle  oklch(0.27 0.06 78)       oklch(0.96  0.05 78)
--warning-border  oklch(0.38 0.08 78)       oklch(0.86  0.08 78)
--destructive     oklch(0.62 0.20 25)       oklch(0.52 0.21 25)
--destructive-subtle / -border follow the same shape
```

Amber is the counter-signal, and it carries real meaning: expiring, bound-to-device. Green is
active/valid. Red is revoked/blocked. **If a colour is not carrying state, it is a neutral.**

These tokens exist specifically to delete the `bg-emerald-500/15 text-emerald-400` Tailwind literals
that are currently hardcoded for both themes across five files (§8, P0).

### 3.4 Surface, radius, shadow

```
--radius: 0.375rem;   /* 6px — the control radius, and the base of the scale */
```

The existing `@theme` block derives its steps by multiplying `--radius`, which at 6px would put
controls at 4.8px and cards at 8.4px. The multipliers are replaced with an explicit scale so the
values are decisions rather than arithmetic:

```
--radius-sm:  4px    chips, kbd, inline code, the code-card gutter
--radius-md:  6px    buttons, inputs, selects, nav rows, tabs      ← = --radius
--radius-lg:  8px    cards, panels, code cards, the command palette
--radius-xl: 12px    dialogs and the sign-in panel only
             full    badges, status dots, avatars, the bulk-selection pill
```

Down from a 14px `Card`. Nothing in a data surface exceeds 8px; `rounded-2xl` and `rounded-3xl` do
not appear in `src/` at all.

**Exactly two shadows survive.** The default shadcn scale is deleted.

```
--shadow-ring: 0 0 0 1px var(--border);                 /* elevation by outline — Vercel's technique */
--shadow-float: 0 16px 40px -12px oklch(0 0 0 / 0.28);  /* genuinely floating things only */
```

`--shadow-float` is permitted on: `Dialog`, `Popover`, `DropdownMenu`, the command palette, the bulk
selection pill. Nowhere else. A card does not float.

`Card`'s existing `ring-1 ring-foreground/10` is already the alpha-border technique and is kept,
retargeted at `--border`.

### 3.5 Motion

```
--speed-quick:   120ms;   /* hover, press, colour change */
--speed-regular: 250ms;   /* panels, dialogs, entrances */
--ease-out-quad: cubic-bezier(0.25, 0.46, 0.45, 0.94);   /* state */
--ease-out-expo: cubic-bezier(0.16, 1, 0.30, 1);         /* entrance */
```

Two durations, two easings, nothing else. No global scroll-reveal fade. No animation library:
entrance staggers, the glyph draw-in and any border-beam are `@keyframes` plus `@property`, which
costs nothing and adds no `"use client"` boundary.

Every animation sits behind `motion-safe:` or an explicit `@media (prefers-reduced-motion: reduce)`
block. The existing `motion-safe:animate-pulse` on `Skeleton` is the pattern to follow.

### 3.6 Structural background textures

Permitted, at ≤5% alpha, as structure only:

- **Dot grid** — `radial-gradient(var(--border) 0.5px, transparent 0.5px)` at 24px, edge-masked.
  Landing hero and empty states.
- **Diagonal hatch** — `repeating-linear-gradient(135deg, …)` at 6px. Disabled and inert states,
  in place of a flat grey box.

Both are pure CSS, theme-aware through `--border`, and carry zero JS.

---

## 4. Typography

**Instrument Sans** (UI and display) + **IBM Plex Mono** (keys, IDs, timestamps, numerics, code),
loaded via `next/font/google` in `src/app/layout.tsx`. Fetched at build, self-hosted, subset,
`display: swap`, exposed as `--font-sans` and `--font-mono`. No runtime request to Google, no new
npm dependency.

**Not Geist** — it is v0's default output face, which makes it a tell rather than a decision. **Not
stock Inter** for the same reason. 9 of the 11 sites measured ship a licensed or custom face.

### 4.1 Scale

Tracking is a function of size, and **only headings receive it**. Body, buttons and table cells sit
at `normal`.

```
--tracking-display:  -0.03em
--tracking-heading:  -0.02em
--tracking-body:      0
--tracking-label:     0.06em   /* micro labels only */

role                   size / line-height   weight
hero h1                clamp(2.75rem, 5vw, 4rem) / 1.02   500
section h2             2rem / 2.4rem        500
page title (h1)        1.25rem / 1.75rem    600
section heading (h2)   0.8125rem / 1.25rem  600
card title             0.875rem / 1.25rem   500
body / table cell      0.875rem / 1.25rem   400
secondary / meta       0.8125rem / 1.125rem 400   --fg-tertiary
micro label / kbd      0.6875rem / 1rem     500   uppercase, --tracking-label
mono in a 14px row     0.8125rem / 1.25rem  400
mono in a 13px row     0.75rem / 1.125rem   400
```

**Heading weight is 500, not 700.** 600 is permitted for a single element per page.

### 4.2 Monospace as a first-class UI face

Keyren's core object is a key string; this is category-correct, not decorative. Mono carries: license
keys, application IDs, device fingerprints, error codes, HTTP statuses, durations, timestamps and
every table numeral, always with `tabular-nums`.

Mono renders optically larger than sans at equal px. Every reference drops it ~1px. Keyren currently
runs 12px mono inside 14px rows — a 2px drop that reads timid. **13px in 14px rows.**

Prose measure caps at **65ch (~640px)**. Reading surfaces (Integrate, Settings) cap at 760px.

---

## 5. Signature device — the key glyph

A deterministic bit-grid mark, one per license, in the spirit of SSH randomart.

### 5.1 Contract

```ts
// src/lib/design/key-glyph.ts
export function keyGlyphBits(seed: string): number[];      // 45 cells, 9 × 5, values 0–3
export function KeyGlyph(props: { seed: string; size?: number; className?: string }): JSX.Element;
```

- **Seed is the masked key string already rendered on screen** (e.g. `KEYREN-7F2A…C1E9`), never the
  plaintext key and never the stored HMAC. Nothing secret enters the function and nothing secret
  leaves it. For applications, the seed is the public `app_…` ID.
- Pure, synchronous, dependency-free. A small FNV-1a walk over the seed fills a 9×5 grid with
  intensity values; cells at max intensity render in `--warning`, the rest in `--primary` at stepped
  alpha. Deterministic across server and client, so it renders in a server component with no
  hydration mismatch and no `"use client"`.
- Output is inline `<svg>` with `aria-hidden="true"` — decorative, never the only carrier of
  information.

### 5.2 Where it appears

| Surface | Size |
|---|---|
| License table, leading cell | 20px |
| License card list (mobile) | 24px |
| Show-once reveal dialog | 72px, with a one-line draw-in under `motion-safe` |
| Application header block | 28px, seeded from the `app_…` ID |
| Landing hero | 220px+, as the fold's visual motif |

It is functional — two keys are distinguishable at a glance — and it is the one element of this
design that a template or generator cannot produce.

---

## 6. Dashboard

Density register: **comfortable** (Stripe/Clerk), not compressed.

### 6.1 Shell — `src/app/dashboard/layout.tsx`, `components/dashboard/sidebar.tsx`

| Change | From | To |
|---|---|---|
| Sidebar position | inside `mx-auto max-w-7xl` | `<aside>` **outside** the container, bled to the viewport edge; only `<main>` is constrained, at `max-w-[1160px]` |
| Sidebar width | `w-56` (224px) | `w-64` (256px), `xl:w-[272px]` — the measured band is 260–300 |
| Nav rows | `px-3 py-2 text-sm rounded-md` | `h-8 px-2.5 gap-2.5 text-[13px] rounded-md`; icon `size-4` at `opacity-70`, `opacity-100` when active |
| Section labels | none | `text-[11px] font-medium uppercase tracking-[0.06em] text-[--fg-tertiary]` |
| Contextual group | none | an `Application` group below the global links when inside an app, mirroring the tabs |
| Header search | **absent** | `h-8 w-56 lg:w-72` button, muted "Search…", `<Kbd>⌘K</Kbd>` right-aligned inside the field, opens the palette |
| Breadcrumb | `Keyren [badge] / switcher`, slash at 40% | slash at `--border`; application name as the switcher trigger; third crumb for the active tab at `lg` |

The **visible ⌘K affordance is P0**, not polish: the palette is bound in
`command-palette.tsx:52` and nothing in the chrome indicates it exists. Same for the `/` binding.

### 6.2 Tables — `components/ui/table.tsx`, `licenses/license-table.tsx`

| Item | From | To |
|---|---|---|
| Head | `h-10`, inherits `border-b` | `h-9`, `text-[13px] font-medium text-[--fg-tertiary]`, rule at `--border-strong` |
| Rows | auto (~72px: label + key + notes stacked) | **48px**; notes move out of the row; rules at `--border` |
| Cell padding | `p-2` | `px-3 py-2.5` |
| Leading cell | — | 20px key glyph |
| Masked key | `text-xs` mono | `text-[13px]` mono, **middle-truncated with a single `…` glyph**, click-to-copy, full string on copy |
| Header | static | `sticky top-14 z-10` |
| Selection | native `<input type=checkbox>` | Radix `Checkbox` |
| Selected row | `bg-muted` fill | `inset 2px 0 0 var(--primary)` left rail |
| Row actions | `w-40 text-right` | `w-12`, single `⋯`, revealed on `group-hover` / `focus-within` |
| Empty result | list renders nothing | `EmptyState` variant `no-results`, **outside** the table, quoting the query verbatim |
| Absent values | — | `—`, never `N/A` or an empty cell |

The **two-weight border trick** — header rule stronger than row rules — is cheap and reads as craft.

**Status becomes dot + label.** `<span class="size-1.5 rounded-full bg-[--success]" aria-hidden />`
plus a text label; colour is never the only signal. A *filled* badge is reserved for the one state
that must interrupt: `Revoked`, in `--destructive`. This takes ~25 coloured rectangles per page down
to 25 two-pixel dots.

**Bulk toolbar** (`license-selection-toolbar.tsx`): from 7 buttons in a sticky bar to a compact
centred pill — `sticky bottom-6 mx-auto w-fit rounded-full border bg-popover/95 backdrop-blur px-2
py-1.5`, with `Revoke` and `Restore` visible and Export/Reset/Delete behind `⋯`. Revoke gains an
`Undo` toast; it is already reversible. The typed `DELETE 7` confirmation stays exactly as it is.

**Pagination**: `21–40 of 142` (drop "Showing") and `Page 2 of 7` (not `2 / 7`). Native `<select>`
in filters and pagination is replaced by shadcn `Select` so the app has one focus grammar.

### 6.3 Overview pages — `dashboard/page.tsx`, `applications/[applicationId]/page.tsx`

Both currently render 3–6 identical `Card`s at `text-3xl` — precisely the four-identical-stat-cards
shape. They collapse into **one metric strip**:

```
┌ APPLICATIONS 3 │ LICENSES 142 │ ACTIVE 128 (90%) │ EXPIRING 7d 4 │ REVOKED 2 ┐   56px
└───────────────────────────────────────────────────────────────────────────────┘
```

One `rounded-lg border divide-x` flex row; cell `px-4 py-3`; label `text-[11px]` uppercase tracking
label; value `text-lg font-semibold tabular-nums`. Wraps to a 2-column grid under `sm`. ~56px
instead of ~340px for the same information.

**Then the page gets its actual subject.** *Expiring soon* is promoted to the first full-width block,
count in the heading (`Expiring soon · 4`), each row an entity row at `h-14` with the relative time
in `--warning` and `⋯` on hover.

The existing "drop zero-valued tiles" logic is right for derived states (Revoked, Expired) and wrong
for primary counts — `0 licenses` is informative. Keep the former, show the latter.

**No chart.** Per-day verification counts are not stored. A sparkline would be decoration wearing
data's clothes, which is the loudest tell on the list. If a real series is ever stored, the
`--chart-*` tokens are already defined and waiting.

### 6.4 Empty states & onboarding

`EmptyState` gains a `variant` prop — `blank | informational | no-results | error` — controlling icon
treatment and whether the block draws its own border (a `no-results` inside a table shell must not,
the table already has one). Title moves from `text-sm font-medium` to `text-base font-semibold`.
Title Case title stating the condition; sentence-case description adding *new* information; **one**
primary CTA, at most one secondary. Three CTAs is a smell.

The licenses `no-results` state quotes the query verbatim and wires the existing `ClearFiltersLink`.

`OnboardingChecklist` is structurally strong — steps derived from real data, self-destructing when
complete — and changes visually only: drop the `border-primary/25 bg-primary/[0.03]` tint for a
plain card plus a 2px progress rail and `1 of 3` in `tabular-nums`; replace `line-through` on
completed steps with a filled check (strike-through reads "cancelled", not "done"); add step
numerals.

### 6.5 Code presentation — new `components/ui/code-card.tsx`

```
┌───────────────────────────────────────────────────────┐  radius 8px, overflow-hidden
│ verify.js         [JS][PY][cURL][C#]           [copy] │  h-9, --surface-2, border-b
├───────────────────────────────────────────────────────┤
│ 1 │ const res = await fetch(…)                        │  13/20 mono
│ 2 │   …                                               │  gutter 32px
└───────────────────────────────────────────────────────┘  --surface-2, max-h-[420px]
```

Language chips live **inside** the header bar as `h-6 px-2 text-[11px]` segments, not a full
`TabsList` above the box. Copy sits at the header's right edge and keeps the existing `announce`
toast and the `writeUiFlag('copied-snippet:…')` side effect — that flag feeds the onboarding
checklist and must not be lost.

**Syntax colouring with zero dependencies.** `lib/integration/snippets.ts` already generates the four
snippets; it gains a token-tagged variant alongside the plain string. Colours come from the five
`--chart-*` tokens already defined in both themes and currently unused:

```
--code-plain: var(--foreground);          --code-keyword: var(--chart-1);
--code-comment: var(--fg-quaternary);     --code-string:  var(--chart-3);
--code-punct: 65% foreground;             --code-fn:      var(--chart-2);
```

Four hues, Clerk's discipline, no library. **The clipboard payload stays the plain string.**

The nine error codes move from a comma-run inside a sentence to a 2-column grid of `<code>` chips.
"Before you ship this" becomes a `Note` callout with a `Security` label.

`ApiTester` — already the strongest surface in the app — changes visually only: the result summary
becomes a response header bar matching `CodeCard` (`HTTP 200` chip · `84 ms` · content-type · copy),
status colours from `--success`/`--destructive`, and the amber warning gets the same `Note`
treatment so the two pages rhyme.

### 6.6 Craft details

- **New `components/ui/kbd.tsx`** — 20px tall, 12px, 4px radius, `padding 0 4px`, **sans not mono**,
  recessed (background = page, not a raised 3D key). Used in the header search, the palette rows,
  the palette footer rail and the shortcuts overlay.
- **Command palette** — group headings in Title Case (`Applications`, `Licenses`, `Actions`), rather
  than one flat concatenated list; `aria-live="polite"` on the result count; per-row `Kbd` chips;
  footer rail `↑↓ navigate · ↵ open · esc close`; `max-w-xl`, `h-11` input and rows,
  `max-h-[380px]` list. Its refusal to open over the reveal dialog is correct and stays.
- **Focus grammar** — one ring everywhere. The native `<select>` and checkboxes are the only two
  escapes and both are replaced.
- **Skeletons** at the *real* row heights and column widths for the license table, metric strip and
  application list.
- **Toast copy pass** — `{Noun} {past-participle}`, no "successfully", no trailing period on a
  single-sentence toast (`Copied to clipboard`, not `Copied to clipboard.`); errors are two sentences
  ending in a recovery step, "Couldn't" for user-state and "Failed to" for infrastructure.
- **Relative time** — short form inside 7 days, absolute beyond, full ISO in `title`.
- **Icons** at `size-4`, single stroke weight, held at `opacity-70` until active.

### 6.7 Auth pages

`sign-in` and `sign-up` move to a split layout: the form column on the left at 400px, and on the
right a full-height panel carrying the dot grid, the wordmark, and one line stating the security
model. Clerk's appearance object is themed from the new tokens through the existing
`ThemedClerkProvider`, so the hosted components stop looking like a third-party embed.

---

## 7. Landing page

One focused scroll. Left-aligned. Container 1200px, single gutter, no per-section improvisation.

**No pricing table, no logo wall, no testimonials, no metrics banner, no badge pill above the H1,
and no "what we don't do" section.** The product does not overstate what it does; it simply does not
enumerate what it lacks.

### 7.1 Sections

1. **Header** — mark + wordmark, release chip, `Sign in` / `Get started`. Sticky, 20px backdrop blur,
   `--background/80`. Blur is chrome, never content.
2. **Hero** — left-aligned, asymmetric split.
   > **Stop building a licensing backend.**
   > Key generation, device binding, expiry and revocation behind one endpoint you don't have to run.

   Primary CTA `Create an account`; secondary `See the API`, which anchors to §7.1.5 on the same
   page — there is no docs site, and a link that 404s is worse than no link. Beneath the copy, the real verify
   request. To the right, the product UI rendered in **actual HTML using the real tokens** — a
   license table with key glyphs, bleeding off the right edge. Not a screenshot, not a stock image,
   not an abstract illustration: the research finding is that ~90% of B2D sites use abstract visuals
   and developers read that as a lack of confidence.
3. **How it works** — three *named* stages, not numbered circles: `Create an application` →
   `Issue keys` → `Verify on start`. Each carries a real fragment of UI or code.
4. **The security model** — claim + mechanism pairs, which is the honest substitute for social proof:
   *Keys are never stored* / only `HMAC-SHA256` of a normalized key is written, plaintext is shown
   once and is unrecoverable. *Bound to a device* / the first device to authenticate claims the
   licence — and states plainly that a fingerprint raises the cost of casual key sharing rather than
   being a hardware security primitive, which is what the code itself already concedes.
   *Rate limited at the edge* / per-IP and per-application, fixed 60-second windows.
   *Ownership enforced in SQL* / a miss returns "not found", never "forbidden", so IDs cannot be
   probed.
5. **Integration** — the `CodeCard` with the four real language snippets, generated by the same
   module the dashboard uses. Nothing bespoke, nothing aspirational.
6. **CTA** — one line, one button.
7. **Footer** — slim. Wordmark, release, the verify endpoint path, links that exist.

Every section heading is a short declarative claim followed by one sentence naming the mechanism.

---

## 8. Correctness fixes folded in

Four defects that this redesign touches and would otherwise entrench.

**P0-1 — status badges fail contrast in light mode.** `license-status-badge.tsx:31,38` hardcodes
`bg-emerald-500/15 text-emerald-400` and the amber equivalent for *both* themes. Tailwind's `*-400`
lightness is ~0.77–0.85; against the light theme's tint that is roughly 2:1, far under AA. The same
dark-only literals survive in `copy-button.tsx:76`, `api-tester.tsx:222,237` and
`onboarding-checklist.tsx:139`. All are leftovers from the era when `<html>` was pinned `dark`.
Fixed by §3.3.

**P0-2 — ⌘K is invisible.** Bound, functional, and completely undiscoverable. Fixed by §6.1.

**P0-3 — native controls break the focus grammar.** `<select>` in `license-filters.tsx:42` and
`pagination.tsx:58`, checkboxes in `license-table.tsx:56,88`. Fixed by §6.2.

**P0-4 — the sidebar border lands mid-canvas.** `w-56` inside `mx-auto max-w-7xl` means on a wide
display the shell's own rule floats in the middle of the page with dead space either side. Fixed by
§6.1.

---

## 9. Constraints and non-goals

- **No new runtime dependency.** No animation library: the two effects worth having use `motion` only
  as a scalar tweener, and CSS `@property` plus `@keyframes` does the same job at zero cost and with
  no added client boundary. No syntax-highlighting library. No chart library.
- **`next/font/google` fetches at build only.** No runtime request, no third-party origin at render.
- **Server components stay server components.** The key glyph, code card and metric strip are all
  pure render — no `"use client"` is added to any file that does not already have it.
- **No schema change, no migration, no API change.** `drizzle/` is untouched.
- **The 194-test suite must stay green**, and tests that assert on copy get updated alongside the copy
  rather than deleted.
- **Both themes ship first-class.** 34% of the slop dataset is permanently dark; a real light theme
  is itself a differentiator. Every surface is checked in both.
- **Accessibility does not regress**: skip link first in tab order, `aria-current` on nav and tabs,
  `aria-live` on the tester result and filter count, `motion-safe:` on every animation, colour never
  the sole carrier of state.

---

## 10. Preserve — do not regress

The research explicitly validated these against reference products. They are load-bearing:

- URL as the single source of truth for the selected application; switching preserves the section.
- Show-once plaintext reveal, with the command palette refusing to open over the reveal dialog.
- Onboarding steps derived from data rather than remembered.
- `--ring` not tracking `--primary` down in dark, with the contrast reasoning written out.
- `motion-safe:` on the skeleton pulse.
- Typed confirmation including the count (`DELETE 7`) for bulk delete.
- `tabular-nums` on every count.
- The API tester hitting the real public endpoint through the real rate limiter.
- Ownership enforced inside the SQL statement, never fetch-then-compare.

---

## 11. Acceptance

`Alpha_v3` is done when:

1. `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` all pass clean.
2. Every surface — landing, sign-in, sign-up, overview, applications, application overview, licenses,
   integrate, both settings pages, all dialogs, all empty states — is verified in **both themes** at
   375px, 768px and 1440px.
3. No `emerald-*`, `amber-*`, `-400`-class Tailwind colour literal remains in `src/`.
4. `--radius` is `0.375rem`; no `rounded-2xl`/`rounded-3xl` on a data container.
5. The accent appears in exactly four roles; `grep` finds no `shadow-primary`, no gradient used as
   decoration, no `backdrop-blur` outside chrome.
6. No emoji in `src/`.
7. A visible ⌘K control is in the dashboard header, and every native `<select>`/checkbox is gone.
8. The key glyph renders identically on server and client, seeded only from already-visible strings.
9. `POST /api/v1/licenses/verify` is byte-identical in contract; its tests are unmodified.
