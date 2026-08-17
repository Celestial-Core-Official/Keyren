# Keyren `Alpha_v3` — Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Keyren's entire visual layer — tokens, typography, landing page, dashboard chrome and every data surface — so the product reads as a high-craft developer SaaS, without adding a single feature or touching the public API.

**Architecture:** A rewritten token layer in `src/app/globals.css` is the foundation; every later task consumes it and none re-declares a colour. New shared primitives (`key-glyph`, `Kbd`, `CodeCard`, `MetricStrip`, `middleTruncate`) are pure and dependency-free so they render inside server components. Surfaces are then converted bottom-up: primitives → shell → data → marketing.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4 (`@theme` in CSS, no config file), shadcn/ui (`radix-nova`), Radix UI, lucide-react, next-themes, Clerk 7, Vitest 4 (`node` + `dom` projects), `next/font/google`. **No new runtime dependency is added by this plan.**

**Spec of record:** `docs/superpowers/specs/2026-08-17-keyren-alpha-v3-design.md`. Where this plan and the spec disagree, the spec wins.

---

## Conventions for every task

- **Verification gate.** A task is not done until `npx tsc --noEmit` and `npx eslint src` are clean and `npm test` is green. Tasks that change rendering additionally require a browser check (see Task 0).
- **Modification steps show the exact before/after region**, not the whole file. Creation steps show the complete file.
- **Never** add `"use client"` to a file that does not already have it. If a change seems to need it, the change is wrong — reach for CSS.
- **Never** introduce a Tailwind palette literal (`emerald-400`, `amber-500`, `zinc-800`, …) in `src/`. Every colour comes from a token.
- Commit after every task with the message given in the task's final step.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/lib/design/key-glyph.tsx` | Deterministic bit-grid from a seed string + the `KeyGlyph` SVG component |
| `src/lib/design/truncate.ts` | `middleTruncate()` — head+tail preserving truncation with a single `…` |
| `src/components/ui/kbd.tsx` | The `<Kbd>` chip primitive |
| `src/components/ui/checkbox.tsx` | shadcn/Radix checkbox (replaces native) |
| `src/components/ui/code-card.tsx` | Header bar + gutter + token-coloured code body |
| `src/components/ui/note.tsx` | Labelled callout (`Security`, `Warning`) |
| `src/components/dashboard/metric-strip.tsx` | The `divide-x` metric rail replacing stat-card grids |
| `src/components/dashboard/header-search.tsx` | Visible ⌘K affordance in the dashboard header |
| `src/components/marketing/*.tsx` | Landing sections: `site-header`, `hero`, `hero-product`, `how-it-works`, `security-model`, `integration`, `cta`, `site-footer` |
| `tests/design/key-glyph.test.ts` | Determinism, bounds, no-plaintext contract |
| `tests/design/truncate.test.ts` | Truncation behaviour |
| `tests/integration/snippet-tokens.test.ts` | Token-tagged snippets reassemble to the plain string |

**Modified (major)** — `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/dashboard/layout.tsx`, `src/lib/release.ts`, `src/components/dashboard/sidebar.tsx`, `src/components/ui/{button,badge,card,table,select}.tsx`, `src/components/licenses/{license-status-badge,license-table,license-filters,license-selection-toolbar,license-card-list}.tsx`, `src/components/applications/{integration-center,api-tester,onboarding-checklist}.tsx`, `src/components/dashboard/{command-palette,page-header,application-tabs,empty-state,pagination,copy-button}.tsx`, `src/app/dashboard/page.tsx`, `src/app/dashboard/applications/[applicationId]/page.tsx`, `src/app/sign-in/[[...sign-in]]/page.tsx`, `src/app/sign-up/[[...sign-up]]/page.tsx`, `src/components/themed-clerk-provider.tsx`, `src/lib/integration/snippets.ts`.

---

## Phase 0 — Groundwork

### Task 0: Establish the verification loop

**Files:** Create `.claude/launch.json`

- [ ] **Step 1: Write the launch config**

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "keyren", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 3000 }
  ]
}
```

- [ ] **Step 2: Start the preview and confirm it renders**

Use `preview_start` with `{name: "keyren"}`. Expected: a tab at `http://localhost:3000` showing the current landing page.

- [ ] **Step 3: Record the baseline**

Screenshot `/` and `/dashboard` in both themes. These are the "before" images; every later visual task is compared against them.

- [ ] **Step 4: Commit**

```bash
git add .claude/launch.json && git commit -m "chore: add dev-server launch config for preview verification"
```

---

### Task 1: Bump the release to `Alpha_v3`

**Files:** Modify `src/lib/release.ts:16-17`, `package.json:3`, `tests/release.test.ts:13-19`

- [ ] **Step 1: Update the test first**

In `tests/release.test.ts`, replace lines 13–19:

```ts
  it("names the current release Alpha_v3", () => {
    expect(RELEASE.name).toBe("Alpha_v3");
  });

  it("pins the package version to 0.1.3", () => {
    expect(RELEASE.version).toBe("0.1.3");
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/release.test.ts`
Expected: FAIL — `expected 'Alpha_v2' to be 'Alpha_v3'`.

- [ ] **Step 3: Make it pass**

`src/lib/release.ts` — `name: "Alpha_v3"`, `version: "0.1.3"`.
`package.json` — `"version": "0.1.3"`.

Also update the doc comment at `release.ts:11-12`, which currently says "can advance to Alpha_v3 or Beta_v1" as a hypothetical — change to "can advance to Beta_v1".

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/release.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/release.ts package.json tests/release.test.ts
git commit -m "chore: bump release to Alpha_v3 (0.1.3)"
```

---

### Task 2: Load the typefaces

**Files:** Modify `src/app/layout.tsx`, `src/app/globals.css`

`Instrument Sans` and `IBM Plex Mono`, both on Google Fonts, fetched at build and self-hosted by `next/font/google`. No runtime request, no npm dependency. **Not Geist** (v0's default output face) and **not stock Inter**.

- [ ] **Step 1: Add the font loaders to the root layout**

Insert above the `metadata` export in `src/app/layout.tsx`:

```tsx
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google";

/**
 * Two faces, each with a job. Instrument Sans is the voice; IBM Plex Mono is
 * the product's own object — every key, ID, fingerprint, status code and
 * numeral is set in it. Both are fetched at build and self-hosted, so no
 * request leaves the visitor's browser for a third-party origin.
 */
const sans = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans-loaded",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono-loaded",
});
```

- [ ] **Step 2: Apply the variables to `<html>`**

Replace the opening tag at `src/app/layout.tsx:17`:

```tsx
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
```

- [ ] **Step 3: Wire the variables into the theme**

In `src/app/globals.css`, inside the `@theme inline` block, replace the `--font-heading` line with:

```css
  --font-sans: var(--font-sans-loaded), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-mono-loaded), ui-monospace, SFMono-Regular, Menlo, monospace;
  --font-heading: var(--font-sans);
```

- [ ] **Step 4: Verify both faces load**

Reload the preview, then run via `javascript_tool`:

```js
[getComputedStyle(document.body).fontFamily,
 getComputedStyle(document.querySelector('pre')).fontFamily]
```

Expected: the first contains `Instrument_Sans`, the second contains `IBM_Plex_Mono`.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat: load Instrument Sans and IBM Plex Mono via next/font"
```

---

### Task 3: Rewrite the token layer

**Files:** Modify `src/app/globals.css` (wholesale)

This is the foundation. Every subsequent task reads from it and none re-declares a colour.

- [ ] **Step 1: Replace the `@theme inline` radius block**

The existing multiplier derivation (`calc(var(--radius) * 0.6)` etc.) is replaced by an explicit scale, so the values are decisions rather than arithmetic:

```css
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-2xl: 12px;
  --radius-3xl: 12px;
  --radius-4xl: 9999px;
```

`--radius-2xl` and `-3xl` are deliberately clamped to 12px rather than deleted: existing components reference them, and clamping stops an old `rounded-2xl` from silently reintroducing a consumer-app corner. `--radius-4xl` stays a pill because `Badge` (`badge.tsx:8`) uses it.

- [ ] **Step 2: Add the new token names to `@theme inline`**

```css
  --color-surface-1: var(--surface-1);
  --color-surface-2: var(--surface-2);
  --color-fg-secondary: var(--fg-secondary);
  --color-fg-tertiary: var(--fg-tertiary);
  --color-fg-quaternary: var(--fg-quaternary);
  --color-border-strong: var(--border-strong);
  --color-success: var(--success);
  --color-success-subtle: var(--success-subtle);
  --color-success-border: var(--success-border);
  --color-warning: var(--warning);
  --color-warning-subtle: var(--warning-subtle);
  --color-warning-border: var(--warning-border);
  --color-destructive-subtle: var(--destructive-subtle);
  --color-destructive-border: var(--destructive-border);
```

- [ ] **Step 3: Replace the `:root` block**

Keep the existing `color-scheme: light` line and its comment verbatim — it is load-bearing and correctly explained. Replace the values below it:

```css
  /* Ramp: 4 steps of foreground, 3 of surface. Chroma sits at 0.002–0.006 on
     the mark's own hue (275) so the greys belong to the palette instead of
     being stock zinc — the Supabase technique, and what the previous palette
     was already reaching for at hue 285. */
  --background: oklch(0.993 0.002 275);
  --surface-1: oklch(1 0 0);
  --surface-2: oklch(0.975 0.003 275);
  --foreground: oklch(0.155 0.006 275);
  --fg-secondary: oklch(0.32 0.008 275);
  --fg-tertiary: oklch(0.485 0.01 275);
  --fg-quaternary: oklch(0.63 0.008 275);

  /* Borders are alpha-composited foreground, not a solid grey, so one value
     survives on --background, --surface-1 and --surface-2 alike. */
  --border: oklch(0.145 0.006 275 / 0.11);
  --border-strong: oklch(0.145 0.006 275 / 0.18);

  /* #4244CE, darkened for a white ground: the hue that reads well against
     near-black is under-contrasted here. */
  --primary: oklch(0.505 0.195 275);
  --primary-foreground: oklch(0.985 0 0);
  --ring: oklch(0.545 0.195 275);

  --success: oklch(0.52 0.14 152);
  --success-subtle: oklch(0.955 0.04 152);
  --success-border: oklch(0.855 0.07 152);
  --warning: oklch(0.52 0.13 68);
  --warning-subtle: oklch(0.96 0.05 78);
  --warning-border: oklch(0.86 0.08 78);
  --destructive: oklch(0.52 0.21 25);
  --destructive-foreground: oklch(0.985 0 0);
  --destructive-subtle: oklch(0.96 0.03 25);
  --destructive-border: oklch(0.87 0.07 25);

  /* shadcn aliases. These are names other components already use; they point
     at the roles above rather than carrying independent values. --accent is
     shadcn's HOVER SURFACE and is unrelated to the brand accent: nothing in it
     is ever --primary-tinted. */
  --card: var(--surface-1);
  --card-foreground: var(--foreground);
  --popover: var(--surface-2);
  --popover-foreground: var(--foreground);
  --secondary: oklch(0.965 0.003 275);
  --secondary-foreground: var(--foreground);
  --muted: oklch(0.965 0.003 275);
  --muted-foreground: var(--fg-tertiary);
  --accent: oklch(0.945 0.004 275);
  --accent-foreground: var(--foreground);
  --input: var(--border);
  --radius: 0.375rem;

  --chart-1: oklch(0.505 0.195 275);
  --chart-2: oklch(0.55 0.14 220);
  --chart-3: oklch(0.52 0.13 160);
  --chart-4: oklch(0.58 0.15 70);
  --chart-5: oklch(0.55 0.19 20);

  --sidebar: var(--background);
  --sidebar-foreground: var(--foreground);
  --sidebar-primary: var(--primary);
  --sidebar-primary-foreground: var(--primary-foreground);
  --sidebar-accent: var(--accent);
  --sidebar-accent-foreground: var(--foreground);
  --sidebar-border: var(--border);
  --sidebar-ring: var(--ring);
```

- [ ] **Step 4: Replace the `.dark` block**

Keep `color-scheme: dark` and keep the existing comment explaining why `--ring` does not track `--primary` down — it is correct and hard-won.

```css
  --background: oklch(0.135 0.004 275);
  --surface-1: oklch(0.165 0.004 275);
  --surface-2: oklch(0.195 0.005 275);
  --foreground: oklch(0.965 0.003 275);
  --fg-secondary: oklch(0.855 0.005 275);
  --fg-tertiary: oklch(0.665 0.008 275);
  --fg-quaternary: oklch(0.505 0.008 275);
  --border: oklch(1 0 0 / 0.09);
  --border-strong: oklch(1 0 0 / 0.15);

  --primary: oklch(0.575 0.185 275);
  --primary-foreground: oklch(0.985 0 0);
  --ring: oklch(0.655 0.185 275);

  --success: oklch(0.72 0.16 150);
  --success-subtle: oklch(0.26 0.05 150);
  --success-border: oklch(0.36 0.07 150);
  --warning: oklch(0.8 0.16 78);
  --warning-subtle: oklch(0.27 0.06 78);
  --warning-border: oklch(0.38 0.08 78);
  --destructive: oklch(0.62 0.2 25);
  --destructive-foreground: oklch(0.985 0 0);
  --destructive-subtle: oklch(0.26 0.07 25);
  --destructive-border: oklch(0.37 0.1 25);

  --card: var(--surface-1);
  --card-foreground: var(--foreground);
  --popover: var(--surface-2);
  --popover-foreground: var(--foreground);
  --secondary: oklch(0.225 0.005 275);
  --secondary-foreground: var(--foreground);
  --muted: oklch(0.225 0.005 275);
  --muted-foreground: var(--fg-tertiary);
  --accent: oklch(0.25 0.006 275);
  --accent-foreground: var(--foreground);
  --input: var(--border);

  --chart-1: oklch(0.68 0.185 275);
  --chart-2: oklch(0.72 0.14 220);
  --chart-3: oklch(0.76 0.13 160);
  --chart-4: oklch(0.8 0.15 70);
  --chart-5: oklch(0.7 0.19 20);

  --sidebar: var(--background);
  --sidebar-foreground: var(--foreground);
  --sidebar-primary: var(--primary);
  --sidebar-primary-foreground: var(--primary-foreground);
  --sidebar-accent: var(--accent);
  --sidebar-accent-foreground: var(--foreground);
  --sidebar-border: var(--border);
  --sidebar-ring: var(--ring);
```

- [ ] **Step 5: Add motion, tracking, shadow and texture tokens**

Append a new block after `.dark`:

```css
:root {
  /* Two durations, two easings, nothing else. */
  --speed-quick: 120ms;
  --speed-regular: 250ms;
  --ease-out-quad: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);

  /* Tracking is a function of optical size, and only headings receive it. */
  --tracking-display: -0.03em;
  --tracking-heading: -0.02em;
  --tracking-label: 0.06em;

  /* Two shadows. The default shadcn scale is not used anywhere. */
  --shadow-ring: 0 0 0 1px var(--border);
  --shadow-float: 0 16px 40px -12px oklch(0 0 0 / 0.28);

  /* Syntax palette, from the --chart-* tokens that have been defined and
     unused since Alpha_v1. Four hues, which is Clerk's discipline, for zero
     dependencies. */
  --code-plain: var(--foreground);
  --code-comment: var(--fg-quaternary);
  --code-keyword: var(--chart-1);
  --code-string: var(--chart-3);
  --code-fn: var(--chart-2);
  --code-punct: color-mix(in oklch, var(--foreground), transparent 35%);
}

@utility texture-grid {
  background-image: radial-gradient(var(--border) 0.5px, transparent 0.5px);
  background-size: 24px 24px;
}

@utility texture-hatch {
  background-image: repeating-linear-gradient(
    135deg,
    var(--border) 0,
    var(--border) 1px,
    transparent 1px,
    transparent 6px
  );
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 6: Extend the base layer with type defaults**

Replace the `@layer base` block's `html` rule:

```css
  html {
    @apply font-sans;
    -webkit-font-smoothing: antialiased;
  }
  h1, h2, h3 {
    letter-spacing: var(--tracking-heading);
  }
  code, kbd, samp, pre {
    font-family: var(--font-mono);
  }
```

- [ ] **Step 7: Verify the whole app still compiles and renders**

Run: `npx tsc --noEmit && npm run build`
Expected: both clean.

Then screenshot `/` and `/dashboard` in both themes. Everything will look *unstyled-but-correct* at this point — that is expected; components have not been retuned yet. What must be true: no invisible text, no white-on-white, no missing borders.

- [ ] **Step 8: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: rewrite the token layer for Alpha_v3"
```

---

## Phase 1 — Primitives

### Task 4: The key glyph

**Files:** Create `src/lib/design/key-glyph.tsx`, `tests/design/key-glyph.test.ts`

The signature device. Deterministic, pure, seeded **only from strings already visible on screen** — never plaintext, never the stored HMAC.

- [ ] **Step 1: Write the failing test**

Create `tests/design/key-glyph.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { keyGlyphBits, GLYPH_COLS, GLYPH_ROWS } from "@/lib/design/key-glyph";

describe("keyGlyphBits", () => {
  it("returns one cell per grid position", () => {
    expect(keyGlyphBits("KEYREN-7F2A-C1E9")).toHaveLength(GLYPH_COLS * GLYPH_ROWS);
  });

  it("is deterministic for the same seed", () => {
    expect(keyGlyphBits("KEYREN-7F2A-C1E9")).toEqual(keyGlyphBits("KEYREN-7F2A-C1E9"));
  });

  it("produces different grids for different seeds", () => {
    expect(keyGlyphBits("KEYREN-7F2A-C1E9")).not.toEqual(keyGlyphBits("KEYREN-7F2A-C1EA"));
  });

  it("keeps every cell within the 0-3 intensity range", () => {
    for (const cell of keyGlyphBits("app_9k2mQ4vB")) {
      expect(cell).toBeGreaterThanOrEqual(0);
      expect(cell).toBeLessThanOrEqual(3);
    }
  });

  it("never returns an all-zero grid, even for a short seed", () => {
    // An empty glyph would read as a rendering failure rather than a mark.
    expect(keyGlyphBits("a").some((cell) => cell > 0)).toBe(true);
    expect(keyGlyphBits("").some((cell) => cell > 0)).toBe(true);
  });

  it("distributes ink rather than clustering it in one row", () => {
    const bits = keyGlyphBits("KEYREN-QQQQ-QQQQ");
    const rowsWithInk = Array.from({ length: GLYPH_ROWS }, (_, row) =>
      bits.slice(row * GLYPH_COLS, (row + 1) * GLYPH_COLS).some((cell) => cell > 0),
    ).filter(Boolean).length;

    expect(rowsWithInk).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/design/key-glyph.test.ts`
Expected: FAIL — cannot resolve `@/lib/design/key-glyph`.

- [ ] **Step 3: Implement it**

Create `src/lib/design/key-glyph.tsx`:

```tsx
/**
 * A deterministic mark for a licence, in the spirit of SSH randomart.
 *
 * The seed is a string the developer can already see — a masked key
 * (`KEYREN-7F2A…C1E9`) or a public application ID. Plaintext keys and the
 * stored HMAC never enter this function, so the glyph carries no information
 * that was not already on the screen beside it.
 *
 * It is pure and synchronous, which is the whole point: it renders inside a
 * server component with no hydration boundary and no client JavaScript.
 */

export const GLYPH_COLS = 9;
export const GLYPH_ROWS = 5;

const CELLS = GLYPH_COLS * GLYPH_ROWS;

/** FNV-1a, 32-bit. Chosen for being short, stable and dependency-free — not
 *  for any cryptographic property, which this deliberately does not need. */
function fnv1a(input: string, salt: number): number {
  let hash = 0x811c9dc5 ^ salt;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

export function keyGlyphBits(seed: string): number[] {
  // An empty or one-character seed still has to draw something; salting the
  // hash with the cell index gives every cell an independent draw even when
  // the seed itself carries almost no entropy.
  const normalized = seed.length > 0 ? seed : "keyren";
  const bits: number[] = [];

  for (let cell = 0; cell < CELLS; cell += 1) {
    const hash = fnv1a(normalized, cell * 0x9e3779b1);
    // Bias toward ink: 0 appears with probability 3/8, so a grid reads as a
    // mark rather than as scattered dust.
    const draw = hash % 8;
    bits.push(draw < 3 ? 0 : draw < 6 ? 1 : draw === 6 ? 2 : 3);
  }

  return bits;
}

const INTENSITY_OPACITY = [0, 0.18, 0.45, 0.9] as const;

export function KeyGlyph({
  seed,
  size = 20,
  className,
}: {
  seed: string;
  size?: number;
  className?: string;
}) {
  const bits = keyGlyphBits(seed);
  const cell = size / GLYPH_COLS;
  const height = cell * GLYPH_ROWS;

  return (
    <svg
      width={size}
      height={height}
      viewBox={`0 0 ${size} ${height}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {bits.map((intensity, index) => {
        if (intensity === 0) return null;

        const column = index % GLYPH_COLS;
        const row = Math.floor(index / GLYPH_COLS);

        return (
          <rect
            key={index}
            x={column * cell}
            y={row * cell}
            width={Math.max(cell - cell * 0.18, 0.5)}
            height={Math.max(cell - cell * 0.18, 0.5)}
            rx={cell * 0.12}
            // The single brightest intensity is the counter-signal; everything
            // else is the accent. Two colours, no gradient.
            fill={intensity === 3 ? "var(--warning)" : "var(--primary)"}
            opacity={INTENSITY_OPACITY[intensity]}
          />
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/design/key-glyph.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/design/key-glyph.tsx tests/design/key-glyph.test.ts
git commit -m "feat: add the deterministic key glyph"
```

---

### Task 5: Middle truncation

**Files:** Create `src/lib/design/truncate.ts`, `tests/design/truncate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { middleTruncate } from "@/lib/design/truncate";

describe("middleTruncate", () => {
  it("returns short values untouched", () => {
    expect(middleTruncate("app_9k2m", 20)).toBe("app_9k2m");
  });

  it("keeps head and tail and joins them with a single ellipsis glyph", () => {
    const result = middleTruncate("KEYREN-ABCD-EFGH-IJKL-MNOP", 16);

    expect(result).toHaveLength(16);
    expect(result.startsWith("KEYREN-")).toBe(true);
    expect(result.endsWith("MNOP")).toBe(true);
    // One glyph, not three periods: three would reserve three character cells
    // in a monospace column.
    expect(result.split("…")).toHaveLength(2);
    expect(result).not.toContain("...");
  });

  it("favours the head when the budget is odd", () => {
    expect(middleTruncate("abcdefghijklmno", 8)).toBe("abcd…lmno".slice(0, 8));
  });

  it("never returns more characters than the budget", () => {
    for (const max of [4, 5, 8, 13, 21]) {
      expect(middleTruncate("x".repeat(80), max).length).toBeLessThanOrEqual(max);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/design/truncate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

```ts
/**
 * Head-and-tail truncation for values where both ends carry information —
 * licence keys, application IDs, device fingerprints, paths.
 *
 * End-truncation would hide the tail, which for a masked key is the only part
 * that distinguishes one row from another. The joiner is the single character
 * "…" rather than three periods, so a monospace column does not lose three
 * character cells to it.
 *
 * The full value is what gets copied; this is presentation only.
 */
export function middleTruncate(value: string, max: number): string {
  if (max <= 1) return "…";
  if (value.length <= max) return value;

  const budget = max - 1;
  const head = Math.ceil(budget / 2);
  const tail = budget - head;

  return `${value.slice(0, head)}…${tail > 0 ? value.slice(-tail) : ""}`;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/design/truncate.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/design/truncate.ts tests/design/truncate.test.ts
git commit -m "feat: add middle truncation for keys and IDs"
```

---

### Task 6: The `Kbd` primitive

**Files:** Create `src/components/ui/kbd.tsx`

Measured off Geist: 20px tall, 12px, 4px radius, `padding 0 4px`, **sans not mono**, and *recessed* — the background is the page, not a raised 3D key.

- [ ] **Step 1: Create the component**

```tsx
import { cn } from "@/lib/utils";

/**
 * A keyboard hint chip.
 *
 * Deliberately sans, not mono: a shortcut is a label, not a value, and the
 * mono face in this product is reserved for things the developer copies.
 * Deliberately recessed rather than a raised 3D key — it sits inside a search
 * field and a command row, where a bevel would compete with the control.
 */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-background px-1 font-sans text-xs leading-none text-fg-tertiary select-none",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/kbd.tsx
git commit -m "feat: add the Kbd chip primitive"
```

---

### Task 7: Radix `Checkbox`, and a `Select` audit

**Files:** Create `src/components/ui/checkbox.tsx`; verify `src/components/ui/select.tsx` exists

The native `<input type=checkbox>` in `license-table.tsx:56,88` and the native `<select>` in `license-filters.tsx:42` / `pagination.tsx:58` fall back to the OS focus ring, which breaks the one focus grammar the rest of the app maintains.

- [ ] **Step 1: Confirm what is already present**

Run: `ls src/components/ui/select.tsx src/components/ui/checkbox.tsx`
Expected: `select.tsx` exists, `checkbox.tsx` does not.

- [ ] **Step 2: Create the checkbox**

```tsx
"use client";

import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded-sm border border-border-strong outline-none transition-colors",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <Check className="size-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint src/components/ui/checkbox.tsx`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/checkbox.tsx
git commit -m "feat: add a Radix checkbox so native controls stop escaping the focus grammar"
```

---

### Task 8: Retune the shadcn primitives

**Files:** Modify `src/components/ui/{button,card,badge,table}.tsx`

- [ ] **Step 1: `table.tsx` — density and the two-weight rule**

Replace the `TableHead` classes (line 73) with:

```
"h-9 px-3 text-left align-middle text-[13px] font-medium whitespace-nowrap text-fg-tertiary [&:has([role=checkbox])]:pr-0"
```

Replace `TableCell` classes (line 86) with:

```
"px-3 py-2.5 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0"
```

Replace `TableHeader` classes (line 26) with:

```
"[&_tr]:border-b [&_tr]:border-border-strong"
```

Replace `TableRow` classes (line 60) with:

```
"border-b border-border transition-colors duration-(--speed-quick) hover:bg-accent/60 has-aria-expanded:bg-accent/60 data-[state=selected]:bg-accent/40 data-[state=selected]:shadow-[inset_2px_0_0_var(--primary)]"
```

The header rule is `--border-strong` and the row rules are `--border`: a table whose head is heavier than its rows is the cheapest craft signal available.

- [ ] **Step 2: `card.tsx` — flatten it**

Find the root `Card` class string and ensure it reads `rounded-lg border border-border bg-card` with **no `shadow-*`**. If a `shadow-` class is present, delete it. The `ring-1 ring-foreground/10` technique, if present, is retargeted to `ring-border`.

- [ ] **Step 3: `button.tsx` — motion tokens**

Replace any `transition-all` with `transition-colors duration-(--speed-quick) ease-(--ease-out-quad)`. Leave `focus-visible:ring-3 ring-ring/50` exactly as it is — it is already correct and is the grammar everything else is being aligned to.

- [ ] **Step 4: `badge.tsx` — add the status variants**

Add to the `variants.variant` map, after `outline`:

```ts
        success:
          "border-success-border bg-success-subtle text-success",
        warning:
          "border-warning-border bg-warning-subtle text-warning",
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm test`
Expected: typecheck clean; tests green (`license-table.test.tsx` asserts behaviour, not classes — if any test asserts a class string, update the assertion, do not weaken the component).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui
git commit -m "feat: retune the shadcn primitives to the Alpha_v3 density and tokens"
```

---

### Task 9: Status as dot + label

**Files:** Modify `src/components/licenses/license-status-badge.tsx`, `tests/components/license-status-badge.test.tsx`

This is **P0-1**: the current file hardcodes `text-emerald-400` / `text-amber-400` for *both* themes, which in light mode is roughly 2:1 contrast.

- [ ] **Step 1: Read the existing test to see what it asserts**

Run: `cat tests/components/license-status-badge.test.tsx`

Preserve every behavioural assertion (which status resolves from which inputs). Only the presentation assertions change.

- [ ] **Step 2: Add the failing assertion**

Append to the test file:

```tsx
  it("carries no Tailwind palette literals, which would be theme-blind", () => {
    const { container } = render(
      <LicenseStatusBadge status="active" expiresAt={null} />,
    );

    expect(container.innerHTML).not.toMatch(/emerald|amber-\d|text-\w+-400/);
  });

  it("labels every state in text, so colour is never the only signal", () => {
    for (const [props, label] of [
      [{ status: "active" as const, expiresAt: null }, "Active"],
      [{ status: "revoked" as const, expiresAt: null }, "Revoked"],
      [{ status: "active" as const, expiresAt: new Date(0) }, "Expired"],
    ]) {
      cleanup();
      render(<LicenseStatusBadge {...(props as never)} />);
      expect(screen.getByText(label as string)).toBeTruthy();
    }
  });
```

Add `cleanup` and `screen` to the `@testing-library/react` import if not already present.

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run tests/components/license-status-badge.test.tsx`
Expected: FAIL on the palette-literal assertion.

- [ ] **Step 4: Rewrite the component**

Replace lines 27–42 of `src/components/licenses/license-status-badge.tsx`:

```tsx
  // A filled badge is reserved for the one state that must interrupt. Every
  // other state is a dot plus a label, which takes ~25 coloured rectangles per
  // page down to 25 two-pixel dots — the reason Vercel's and Linear's lists
  // read calm.
  if (resolved === "revoked") return <Badge variant="destructive">Revoked</Badge>;

  const tone = resolved === "expired" ? "bg-warning" : "bg-success";
  const label = resolved === "expired" ? "Expired" : "Active";

  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap">
      <span className={`size-1.5 shrink-0 rounded-full ${tone}`} aria-hidden="true" />
      {label}
    </span>
  );
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run tests/components/license-status-badge.test.tsx`
Expected: PASS.

- [ ] **Step 6: Kill the remaining literals**

Run: `grep -rn "emerald-\|amber-4\|amber-5" src/`
Expected hits: `dashboard/copy-button.tsx:76`, `applications/api-tester.tsx:222,237`, `applications/onboarding-checklist.tsx:139`.

Replace `text-emerald-400` → `text-success`, `text-amber-400` → `text-warning`, `bg-amber-500/15` → `bg-warning-subtle`, `border-amber-500/25` → `border-warning-border`.

Re-run the grep. Expected: no hits in `src/`.

- [ ] **Step 7: Verify and commit**

```bash
npx tsc --noEmit && npm test
git add src/components tests/components/license-status-badge.test.tsx
git commit -m "fix: replace theme-blind Tailwind colour literals with semantic status tokens"
```

---

## Phase 2 — Dashboard shell

### Task 10: Full-bleed sidebar and the visible ⌘K control

**Files:** Create `src/components/dashboard/header-search.tsx`; modify `src/app/dashboard/layout.tsx:37-63`, `src/components/dashboard/command-palette.tsx`

**P0-2** and **P0-4**.

- [ ] **Step 1: Expose an opener from the command palette**

Read `src/components/dashboard/command-palette.tsx`. It binds ⌘K at line 52 against a local open state. Add a module-level custom-event opener so a server-rendered button can trigger it without lifting state or adding a provider:

```tsx
export const OPEN_PALETTE_EVENT = "keyren:open-palette";

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT));
}
```

and, inside the existing `useEffect` that binds the keyboard shortcut, add a listener for `OPEN_PALETTE_EVENT` that runs the same guarded open path the ⌘K handler uses — including the existing refusal to open over the reveal dialog (`command-palette.tsx:56-62`), which must not be bypassed.

- [ ] **Step 2: Create the header search control**

`src/components/dashboard/header-search.tsx`:

```tsx
"use client";

import { Search } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { openCommandPalette } from "@/components/dashboard/command-palette";

/**
 * The command palette has been bound to ⌘K since Alpha_v2 and has never had a
 * visible affordance, which meant the feature effectively did not exist for
 * anyone who had not read the shortcuts overlay. Every reference product puts
 * a search control in the chrome with the shortcut as a chip inside it.
 */
export function HeaderSearch() {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      className="hidden h-8 w-56 items-center gap-2 rounded-md border border-border bg-surface-1 px-2.5 text-left text-[13px] text-fg-quaternary transition-colors duration-(--speed-quick) hover:border-border-strong hover:text-fg-tertiary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:flex lg:w-72"
    >
      <Search className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
      <span className="flex-1">Search…</span>
      <Kbd>⌘K</Kbd>
    </button>
  );
}
```

- [ ] **Step 3: Restructure the layout**

In `src/app/dashboard/layout.tsx`, replace the header's closing region and the container (lines 46–63):

```tsx
          <span className="text-border" aria-hidden="true">
            /
          </span>
          <ApplicationSwitcher applications={applications} />
        </div>
        <div className="flex items-center gap-3">
          <HeaderSearch />
          <UserButton />
        </div>
      </header>

      <div className="flex">
        <aside className="hidden w-64 shrink-0 border-r border-border md:block xl:w-[272px]">
          <div className="sticky top-14">
            <DashboardSidebar />
          </div>
        </aside>
        <main
          id="dashboard-content"
          className="min-w-0 flex-1 px-4 py-8 sm:px-6"
        >
          <div className="mx-auto max-w-[1160px]">{children}</div>
        </main>
      </div>
```

The `mx-auto max-w-7xl` wrapper is gone: it was what put the sidebar's right border in the middle of a wide canvas. Only the content column is constrained now.

Add the import: `import { HeaderSearch } from "@/components/dashboard/header-search";`

- [ ] **Step 4: Verify in the browser**

Reload `/dashboard` at 1440px in both themes. Confirm: the sidebar's border runs to the left viewport edge; the content column is centred within the remaining space; the search control is visible and `⌘K` opens the palette; clicking the control opens the palette.

Run `read_console_messages` — expected: no errors, no hydration warnings.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/layout.tsx src/components/dashboard
git commit -m "feat: bleed the sidebar to the viewport edge and give Cmd-K a visible control"
```

---

### Task 11: Sidebar

**Files:** Modify `src/components/dashboard/sidebar.tsx`

- [ ] **Step 1: Rewrite the nav rows and add section labels**

Replace the component body. `NAV` is unchanged; the row metrics, icon opacity and a section label are new. When inside an application, a second group mirrors the tabs so deep navigation exists in one place on wide screens.

```tsx
const SECTION = "px-2.5 pt-4 pb-1.5 text-[11px] font-medium uppercase tracking-[var(--tracking-label)] text-fg-quaternary";
const ROW = "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-(--speed-quick)";
```

Row classes become:

```tsx
            className={cn(
              ROW,
              active
                ? "bg-accent font-medium text-foreground [&_svg]:opacity-100"
                : "text-fg-tertiary hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0 opacity-70" />
```

Wrap the existing map in a labelled group:

```tsx
    <nav className="flex flex-col gap-0.5 p-3" aria-label="Dashboard">
      <p className={SECTION}>Workspace</p>
      {NAV.map(/* … */)}
    </nav>
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`, then reload and confirm rows are 32px, icons sit at 70% until active, and the active row reads as the only accent-bearing element in the sidebar.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/sidebar.tsx
git commit -m "feat: retune the sidebar to the Alpha_v3 nav metrics"
```

---

### Task 12: Command palette

**Files:** Modify `src/components/dashboard/command-palette.tsx`

- [ ] **Step 1: Group the results**

The list currently concatenates three entry types into one flat array (`:128`). Split rendering into Title Case groups — `Applications`, `Licenses`, `Actions` — each preceded by a `text-[11px] uppercase tracking-[var(--tracking-label)] text-fg-quaternary px-3 py-1.5` heading. Navigation results and actions must not share a group.

- [ ] **Step 2: Add the footer rail and per-row chips**

Below the list:

```tsx
      <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-[11px] text-fg-quaternary">
        <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
        <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
        <span className="flex items-center gap-1"><Kbd>esc</Kbd> close</span>
      </div>
```

- [ ] **Step 3: Announce the result count**

Add `aria-live="polite"` to the element carrying the result count so narrowing is announced.

- [ ] **Step 4: Resize**

`max-w-lg` → `max-w-xl`; input and rows to `h-11`; list `max-h-[380px]`.

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/components/command-palette.test.tsx`
Expected: PASS. The existing test asserts the reveal-dialog refusal — that behaviour must survive untouched.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/command-palette.tsx
git commit -m "feat: group, annotate and resize the command palette"
```

---

### Task 13: Page header and application tabs

**Files:** Modify `src/components/dashboard/page-header.tsx`, `src/components/dashboard/application-tabs.tsx`

- [ ] **Step 1: Page header**

Title to `text-xl font-semibold tracking-[var(--tracking-heading)]`; wrapper `pb-6` → `pb-4`; description to `text-[13px] text-fg-tertiary`.

- [ ] **Step 2: Tabs**

Tighten to `h-9 px-3 text-[13px]`, and move the active underline to an `after:` pseudo-element (`after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-primary`) so activating a tab does not shift layout by the border's height.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit && npm test
git add src/components/dashboard/page-header.tsx src/components/dashboard/application-tabs.tsx
git commit -m "feat: retune the page header and application tabs"
```

---

## Phase 3 — Data surfaces

### Task 14: The licence table

**Files:** Modify `src/components/licenses/license-table.tsx`

- [ ] **Step 1: Add the glyph column and the truncated key**

Import `KeyGlyph` and `middleTruncate`. The leading cell renders `<KeyGlyph seed={license.maskedKey} size={20} />` — seeded from the **masked** key, which is the string already rendered in the row.

The key cell becomes `text-[13px]` mono (up from `text-xs`), `text-fg-tertiary`, showing `middleTruncate(license.maskedKey, 22)` with the full value carried by the existing copy affordance and the `title` attribute.

- [ ] **Step 2: Take notes out of the row**

Three stacked lines per row is why the table reads as a card list. Keep label on the primary line; move `notes` to the row's `title` and the row-detail surface. Target row height 48px.

- [ ] **Step 3: Replace the native checkboxes**

Swap the `<input type="checkbox">` at lines 56 and 88 for the `Checkbox` from Task 7, preserving every existing `aria-label`, `checked`, `indeterminate` and `onChange` behaviour exactly.

- [ ] **Step 4: Sticky header, narrow actions column**

`<TableHeader>` gains `sticky top-14 z-10 bg-background`. The actions column goes `w-40 text-right` → `w-12`, with the trigger revealed by `opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100` on a `group` row.

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/components/license-table.test.tsx tests/components/license-selection.test.tsx`
Expected: PASS. If a test queries the native checkbox by role, `role="checkbox"` is what Radix renders too — update the query only if it targets `input[type=checkbox]` specifically.

Then check in the browser at 1440px and 375px, both themes.

- [ ] **Step 6: Commit**

```bash
git add src/components/licenses/license-table.tsx
git commit -m "feat: rebuild the licence table at 48px rows with key glyphs"
```

---

### Task 15: Filters and pagination

**Files:** Modify `src/components/licenses/license-filters.tsx`, `src/components/dashboard/pagination.tsx`

- [ ] **Step 1: Replace both native `<select>` elements**

Use the existing `src/components/ui/select.tsx`. Preserve the URL-driven behaviour exactly: these controls write query params, and `use-query-params.ts` is the contract.

- [ ] **Step 2: Fix the pagination copy**

`Showing 21-40 of 142` → `21–40 of 142` (en dash, no "Showing"). `2 / 7` → `Page 2 of 7`.

- [ ] **Step 3: Verify**

Run: `npx vitest run tests/components/license-filters.test.tsx tests/url-params.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/licenses/license-filters.tsx src/components/dashboard/pagination.tsx
git commit -m "feat: replace native selects and fix pagination copy"
```

---

### Task 16: Selection toolbar

**Files:** Modify `src/components/licenses/license-selection-toolbar.tsx`

- [ ] **Step 1: Collapse to a floating pill**

Seven buttons in a sticky bar reads as a second toolbar rather than a selection state. Target:

```
sticky bottom-6 mx-auto w-fit rounded-4xl border border-border bg-popover/95 px-2 py-1.5 backdrop-blur shadow-[var(--shadow-float)]
[ 3 selected │ Revoke  Restore  ⋯ │ ✕ ]
```

`Revoke` and `Restore` stay visible; Export CSV, Export JSON, Reset and Delete move behind a `⋯` `DropdownMenu`.

- [ ] **Step 2: Add Undo on revoke**

Revoke is already reversible (`:71`). Emit `toast("{n} licenses revoked", { action: { label: "Undo", onClick: … } })` calling the existing restore path. Do not add undo to delete — it is not reversible.

- [ ] **Step 3: Keep the typed confirmation exactly as it is**

`DELETE 7`, including the count (`:298-305`), is a genuinely good detail. Do not simplify it.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run tests/components/license-selection.test.tsx
git add src/components/licenses/license-selection-toolbar.tsx
git commit -m "feat: collapse the bulk toolbar into a floating selection pill with undo"
```

---

### Task 17: Mobile card list and empty states

**Files:** Modify `src/components/licenses/license-card-list.tsx`, `src/components/dashboard/empty-state.tsx`

- [ ] **Step 1: Mirror the new density in the card list**

Status becomes dot + label in the card header; add the 24px `KeyGlyph`; mono at 13px.

- [ ] **Step 2: Add the `variant` prop to `EmptyState`**

```tsx
variant?: "blank" | "informational" | "no-results" | "error";
```

`no-results` renders with **no border of its own** (the table shell already has one) as a plain `py-16` centred block. `error` tints the icon with `--destructive`. Title moves from `text-sm font-medium` to `text-base font-semibold`; description `text-sm text-fg-tertiary`. Cap at one primary CTA plus at most one secondary.

- [ ] **Step 3: Quote the query on the licences page**

Wire the existing `ClearFiltersLink` into a `no-results` state reading `No licenses match “{query}”.` with a `Clear filters` action. Wrap the region in `aria-live="polite"`.

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit && npm test
git add src/components/licenses/license-card-list.tsx src/components/dashboard/empty-state.tsx src/app/dashboard/applications
git commit -m "feat: add empty-state variants and echo the query on no results"
```

---

## Phase 4 — Overview and first run

### Task 18: The metric strip

**Files:** Create `src/components/dashboard/metric-strip.tsx`; modify `src/app/dashboard/page.tsx:53-86`, `src/app/dashboard/applications/[applicationId]/page.tsx:38-83`

Both pages currently render 3–6 identical `Card`s at `text-3xl` — the four-identical-stat-cards shape verbatim.

- [ ] **Step 1: Create the component**

```tsx
import { cn } from "@/lib/utils";

export type Metric = {
  label: string;
  value: string | number;
  /** A ratio, share or comparison. A bare count does not get one. */
  detail?: string;
  tone?: "default" | "warning";
};

/**
 * One rail instead of a grid of cards.
 *
 * A number earns a card when it has a denominator or a comparison; an
 * application count has neither. This costs ~56px for what the tile grid spent
 * ~340px on, and it stops the page opening with five equally-weighted facts
 * and no subject.
 */
export function MetricStrip({ metrics, className }: { metrics: Metric[]; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border sm:flex sm:divide-x",
        className,
      )}
    >
      {metrics.map((metric) => (
        <div key={metric.label} className="min-w-0 flex-1 border-b border-border px-4 py-3 sm:border-b-0">
          <dt className="text-[11px] font-medium uppercase tracking-[var(--tracking-label)] text-fg-quaternary">
            {metric.label}
          </dt>
          <dd className="mt-1 flex items-baseline gap-1.5">
            <span
              className={cn(
                "text-lg font-semibold tabular-nums",
                metric.tone === "warning" && "text-warning",
              )}
            >
              {metric.value}
            </span>
            {metric.detail ? (
              <span className="text-[13px] text-fg-tertiary tabular-nums">{metric.detail}</span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 2: Replace both tile grids**

Feed it the same numbers the cards already compute. Keep the existing "drop zero-valued tiles" logic **for derived states only** (Revoked, Expired) — a primary count of `0` is informative and stays. `Active` carries a real ratio as its `detail` (`128 (90%)`); nothing carries an invented delta.

- [ ] **Step 3: Promote "Expiring soon"**

Make it the first full-width block under the strip, count in the heading (`Expiring soon · 4`), each row `h-14` with the relative time in `text-warning`.

- [ ] **Step 4: Ship no chart**

Per-day verification counts are not stored. Do not add a sparkline, an area chart or a trend arrow. Confirm with `grep -rn "chart" src/app/dashboard` — expected: no hits.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run tests/licenses/overview.test.ts && npx tsc --noEmit
git add src/components/dashboard/metric-strip.tsx src/app/dashboard
git commit -m "feat: replace the stat-card grids with a metric strip"
```

---

### Task 19: Onboarding checklist

**Files:** Modify `src/components/applications/onboarding-checklist.tsx`

Structurally strong already — steps derived from real data, self-destructing when complete. Visual changes only.

- [ ] **Step 1: Drop the accent tint**

`border-primary/25 bg-primary/[0.03]` → `border-border`. The accent has four roles and "tinting a card" is not one of them.

- [ ] **Step 2: Add a progress rail**

A 2px track under the header, filled to `done/total`, in `bg-primary`, with `1 of 3` in `tabular-nums` beside it.

- [ ] **Step 3: Replace strike-through with filled checks**

`line-through text-muted-foreground` reads as *cancelled*, not *done*. Use a filled check circle (`bg-success text-background`) and keep the completed title at full colour.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run tests/components/onboarding-checklist.test.tsx
git add src/components/applications/onboarding-checklist.tsx
git commit -m "feat: restyle the onboarding checklist with a progress rail"
```

---

## Phase 5 — Code surfaces

### Task 20: Token-tagged snippets

**Files:** Modify `src/lib/integration/snippets.ts`; create `tests/integration/snippet-tokens.test.ts`

Syntax colouring with **zero dependencies**, because the four snippets are generated by code we own.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { SNIPPET_LANGUAGES, snippetFor, tokenizeSnippet } from "@/lib/integration/snippets";

describe("tokenizeSnippet", () => {
  it("reassembles to exactly the plain string for every language", () => {
    for (const language of SNIPPET_LANGUAGES) {
      const plain = snippetFor(language, { appUrl: "https://keys.example.com" });
      const rebuilt = tokenizeSnippet(plain, language)
        .map((token) => token.text)
        .join("");

      expect(rebuilt).toBe(plain);
    }
  });

  it("only ever emits known token kinds", () => {
    const kinds = new Set(["plain", "comment", "keyword", "string", "fn", "punct"]);

    for (const token of tokenizeSnippet(`const x = "y"; // note`, "javascript")) {
      expect(kinds.has(token.kind)).toBe(true);
    }
  });
});
```

Adjust `snippetFor`'s call signature to whatever the module already exports — read it first and match, do not invent an API.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/integration/snippet-tokens.test.ts`
Expected: FAIL — `tokenizeSnippet` is not exported.

- [ ] **Step 3: Implement the tokenizer**

Add to `src/lib/integration/snippets.ts` a `tokenizeSnippet(source, language)` returning `{ kind, text }[]`, driven by a small per-language regex table for comments, strings, keywords, call identifiers and punctuation. **The reassembly invariant is the contract**: concatenating `text` must return the input byte-for-byte, which is what keeps the copy payload and the displayed code from ever diverging.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/integration/snippet-tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/integration/snippets.ts tests/integration/snippet-tokens.test.ts
git commit -m "feat: tokenize integration snippets for dependency-free highlighting"
```

---

### Task 21: `CodeCard` and `Note`

**Files:** Create `src/components/ui/code-card.tsx`, `src/components/ui/note.tsx`

- [ ] **Step 1: Build `CodeCard`**

```
┌───────────────────────────────────────────────────────┐  rounded-lg, overflow-hidden
│ verify.js         [JS][PY][cURL][C#]           [copy] │  h-9, bg-surface-2, border-b
├───────────────────────────────────────────────────────┤
│ 1 │ const res = await fetch(…)                        │  13/20 mono
└───────────────────────────────────────────────────────┘  bg-surface-2, max-h-[420px]
```

Language chips are `h-6 px-2 text-[11px]` segments **inside** the header bar — not a full `TabsList` above the box. The gutter is 32px at `text-fg-quaternary`. Token colours come from the `--code-*` variables added in Task 3. The copy button sits at the header's right edge and **copies the plain string, never the tokenized JSX**.

- [ ] **Step 2: Build `Note`**

A callout with an icon, a label (`Security`, `Warning`), and children. Tones map to `--warning-subtle`/`--warning-border` and `--surface-2`/`--border`.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/ui/code-card.tsx src/components/ui/note.tsx
git commit -m "feat: add the CodeCard and Note primitives"
```

---

### Task 22: Integration centre and API tester

**Files:** Modify `src/components/applications/integration-center.tsx`, `src/components/applications/api-tester.tsx`

- [ ] **Step 1: Replace the raw `<pre>` with `CodeCard`**

`integration-center.tsx:69-71` currently renders `<pre class="bg-muted/40 p-4 text-xs">` with no highlighting, tabs above the box and the copy button outside the container. Move to one `CodeCard`.

**Preserve `writeUiFlag('copied-snippet:…')` (`:63`)** — that flag is what feeds the onboarding checklist, and losing it silently breaks a derived step.

- [ ] **Step 2: Restructure the reference content**

The nine error codes move from a comma-run inside a sentence (`:96-106`) to a 2-column grid of `<code>` chips. "Before you ship this" becomes a `Note` with a `Security` label.

- [ ] **Step 3: Give the tester a response header bar**

`api-tester.tsx:217-241` becomes a bar matching `CodeCard`'s header: `HTTP 200` chip · `84 ms` · content-type, copy at the right edge, sitting on the same container as the body `<pre>`. Status colours from `--success`/`--destructive`. The amber warning (`:172-182`) becomes a `Note`.

**Do not change what it calls or what it sends.** It hits the real public endpoint through the real rate limiter, and that is the point of it.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/components/api-tester.test.tsx`
Expected: PASS.

Then exercise the tester in the browser against a real licence and confirm the response bar renders in both themes.

- [ ] **Step 5: Commit**

```bash
git add src/components/applications
git commit -m "feat: rebuild the integration centre and tester on CodeCard"
```

---

## Phase 6 — Marketing and auth

### Task 23: Landing shell and hero

**Files:** Rewrite `src/app/page.tsx`; create `src/components/marketing/{site-header,hero,hero-product,site-footer}.tsx`

Left-aligned, container 1200px, one gutter. **No badge pill above the H1, no logo wall, no testimonials, no pricing, no metrics banner, and no section enumerating what the product does not do.**

- [ ] **Step 1: `site-header`**

Mark + wordmark + release chip on the left; `Sign in` / `Get started` on the right, inside the existing `<Show when="signed-out">` / `signed-in` split from the current page. Sticky, `bg-background/80`, 20px backdrop blur — blur is chrome, never content.

- [ ] **Step 2: `hero`**

```
Stop building a licensing backend.

Key generation, device binding, expiry and revocation behind one endpoint
you don't have to run.

[ Create an account ]   [ See the API → ]
```

`See the API` anchors to `#integration` on the same page. There is no docs site and a link that 404s is worse than no link.

H1 at `clamp(2.75rem, 5vw, 4rem)`, **weight 500**, `tracking-[var(--tracking-display)]`, `leading-[1.02]`, left-aligned, measure capped at ~18ch per line by `max-w-[15ch]`-class constraints rather than `<br>`.

Background: the `texture-grid` utility, masked to fade out with `mask-image: radial-gradient(…)`. No blob, no glow, no gradient wash.

- [ ] **Step 3: `hero-product`**

The real product UI in **actual HTML using the real tokens** — a licence table fragment with three rows, real `KeyGlyph` marks, dot+label statuses and mono keys, bleeding off the right edge on `lg`. Not a screenshot, not an abstract illustration.

Entrance only: a staggered `@keyframes` fade+translate on the rows, `--speed-regular` / `--ease-out-expo`, under `motion-safe:`. Nothing loops.

- [ ] **Step 4: `site-footer`**

Wordmark, release name, the verify endpoint path, and links that actually exist.

- [ ] **Step 5: Verify**

Screenshot `/` at 375, 768 and 1440, both themes. Confirm no horizontal scroll at 375.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/components/marketing
git commit -m "feat: build the Alpha_v3 landing hero"
```

---

### Task 24: Landing body

**Files:** Create `src/components/marketing/{how-it-works,security-model,integration,cta}.tsx`; modify `src/app/page.tsx`

- [ ] **Step 1: `how-it-works`**

Three **named** stages — `Create an application`, `Issue keys`, `Verify on start` — each carrying a real fragment of UI or code. **No numbered circles**, no icon-top cards.

- [ ] **Step 2: `security-model`**

Claim + mechanism pairs, which is the honest substitute for social proof a pre-customer product has:

- *Keys are never stored* — only `HMAC-SHA256` of a normalized key is written. Plaintext is shown once, at creation, and is unrecoverable afterwards.
- *Bound to a device* — the first device to authenticate claims the licence. A fingerprint raises the cost of casual key sharing; it is not a hardware security primitive. (This is what `src/lib/crypto/device.ts` already concedes internally, and publishing it buys more trust than any badge.)
- *Rate limited at the edge* — per-IP and per-application, fixed 60-second windows.
- *Ownership enforced in SQL* — a miss returns "not found", never "forbidden", so IDs cannot be probed for existence.

Rendered as a ruled list with hairline separators. **Not** a three-column icon-card grid.

- [ ] **Step 3: `integration`**

`id="integration"`. The same `CodeCard` the dashboard uses, fed by the same `snippets.ts` module, with the four real languages.

- [ ] **Step 4: `cta`**

One line, one button. No second CTA, no email capture, no "trusted by".

- [ ] **Step 5: Copy audit**

Run: `grep -rniE "supercharge|seamless|unleash|best-in-class|cutting-edge|effortless|revolution|the future of|without limits" src/`
Expected: no hits.

- [ ] **Step 6: Verify and commit**

```bash
npm run build
git add src/app/page.tsx src/components/marketing
git commit -m "feat: build the Alpha_v3 landing body"
```

---

### Task 25: Auth pages

**Files:** Modify `src/app/sign-in/[[...sign-in]]/page.tsx`, `src/app/sign-up/[[...sign-up]]/page.tsx`, `src/components/themed-clerk-provider.tsx`

- [ ] **Step 1: Split layout**

Form column at 400px on the left; a full-height panel on the right carrying `texture-grid`, the wordmark, and one line stating the security model. Collapses to the form alone under `lg`.

- [ ] **Step 2: Theme Clerk from the tokens**

Extend the existing `ThemedClerkProvider` appearance object so Clerk's hosted components read `--primary`, `--background`, `--surface-1`, `--border`, `--radius` and the loaded font families, instead of looking like a third-party embed.

- [ ] **Step 3: Verify**

Screenshot both routes in both themes. Confirm the Clerk card's radius and accent match the app's.

- [ ] **Step 4: Commit**

```bash
git add src/app/sign-in src/app/sign-up src/components/themed-clerk-provider.tsx
git commit -m "feat: restyle the auth pages and theme Clerk from the token layer"
```

---

## Phase 7 — Sweep

### Task 26: Toasts, skeletons, relative time

**Files:** Modify every `toast.*` call site; `src/components/dashboard/empty-state.tsx` (Skeleton), `src/components/dashboard/relative-time.tsx`

- [ ] **Step 1: Toast copy pass**

`{Noun} {past-participle}`. No "successfully". **No trailing period on a single-sentence toast** — `Copied to clipboard`, not `Copied to clipboard.` (`copy-button.tsx:55`). Errors are two sentences ending in a recovery step; "Couldn't" for user-state, "Failed to" for infrastructure (`copy-button.tsx:59-61` becomes "Couldn't"). Pair the toast verb 1:1 with the destructive button verb: `Delete permanently` → `Licenses deleted`, never "removed".

- [ ] **Step 2: Skeletons at real dimensions**

Extend `Skeleton` usage to the licence table (5 rows at the real 48px height and the real column widths), the metric strip and the application list. Keep `motion-safe:animate-pulse`.

- [ ] **Step 3: Relative time**

Short form (`2m ago`, `5h ago`) inside 7 days, absolute (`Mar 14, 2026`) beyond, full ISO in `title`.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run tests/components/relative-time.test.tsx tests/components/copy-button.test.tsx
git add src/components
git commit -m "feat: align toast copy, skeletons and relative time to the Alpha_v3 rules"
```

---

### Task 27: Acceptance sweep

**Files:** none — this task only verifies and fixes what it finds

- [ ] **Step 1: Run every gate**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Expected: all four clean. Record the test count.

- [ ] **Step 2: Run the grep gates**

```bash
grep -rnE "emerald-|amber-[45]|zinc-|slate-|text-[a-z]+-400" src/          # expect: nothing
grep -rn "rounded-2xl\|rounded-3xl" src/                                    # expect: nothing
grep -rn "shadow-primary\|shadow-md\|shadow-sm\|shadow-xl" src/             # expect: nothing
grep -rnP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" src/                     # expect: nothing
grep -rn "backdrop-blur" src/                                               # expect: chrome only
```

Fix anything that hits.

- [ ] **Step 3: Verify every surface in both themes at three widths**

Landing, sign-in, sign-up, dashboard overview, applications list, application overview, licences, integrate, application settings, account settings, plus the create-licence, edit-licence, batch-result and reveal dialogs, plus every empty state. At 375px, 768px and 1440px, in light **and** dark.

For each: no horizontal scroll, no invisible text, no OS-default focus ring, the accent in only its four roles.

- [ ] **Step 4: Confirm the API is untouched**

```bash
git diff main --stat -- src/app/api src/lib/licenses/verify.ts drizzle
```

Expected: empty. If anything shows, revert it — no part of this plan may touch the public contract.

- [ ] **Step 5: Update the docs**

`README.md` and `PROGRESS.md`: change the current-release line to `Alpha_v3` and add a short section pointing at the spec. Create `docs/alpha-v3.md` summarising what changed, in the shape of the existing `docs/alpha-v2.md`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: record Alpha_v3 and complete the acceptance sweep"
```

---

## Self-review

**Spec coverage.** §3 token layer → Task 3. §4 typography → Tasks 2–3. §5 key glyph → Task 4, consumed in 14, 17, 23. §6.1 shell → Tasks 10–11. §6.2 tables → Tasks 8, 14–16. §6.3 overview → Task 18. §6.4 empty states and onboarding → Tasks 17, 19. §6.5 code → Tasks 20–22. §6.6 craft details → Tasks 6, 12, 26. §6.7 auth → Task 25. §7 landing → Tasks 23–24. §8 P0-1 → Task 9; P0-2 → Task 10; P0-3 → Tasks 7, 14, 15; P0-4 → Task 10. §9 constraints → enforced by Task 27's grep gates. §11 acceptance → Task 27. Release bump → Task 1.

**Type consistency.** `keyGlyphBits(seed: string): number[]` and `KeyGlyph({ seed, size, className })` are defined in Task 4 and used with those names in 14, 17, 23. `middleTruncate(value, max)` defined in Task 5, used in 14. `Kbd` defined in Task 6, used in 10 and 12. `Checkbox` defined in Task 7, used in 14. `Metric`/`MetricStrip` defined in Task 18 and used only there. `tokenizeSnippet(source, language) => { kind, text }[]` defined in Task 20, consumed by `CodeCard` in Task 21. `OPEN_PALETTE_EVENT`/`openCommandPalette` defined in Task 10 Step 1, consumed in Task 10 Step 2.

**Known soft edge.** Tasks 11–19 and 22–26 modify existing files whose full current contents are not reproduced here; they specify the target class strings, metrics and behaviour rather than a complete file body. This is deliberate — reproducing ~4,000 lines of unchanged surrounding code would make the plan less usable, not more — but it means each of those tasks must begin by reading the file it modifies.
