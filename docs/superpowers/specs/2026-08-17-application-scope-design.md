# Keyren `Alpha_v3` — Application Scope Specification

**Date:** 2026-08-17
**Release:** `Alpha_v3` (package `0.1.3`)
**Theme:** the dashboard always has one application in scope. Behavioural, not visual.

`Alpha_v3` was a visual redesign that changed nothing about how the dashboard is navigated. This
document is the behavioural half: the header chooser becomes the only way to pick an application,
and it is never empty. One confirmed defect in the application kill switch is fixed on the way
through, because the redesign would otherwise entrench it.

---

## 0. What this changes, and what it does not

**Changes:** how an application is chosen, what the Overview and Applications pages are for, and
the markup of the kill switch.

**Does not change:** `POST /api/v1/licenses/verify` — request shape, response envelope, error codes
and HTTP statuses are untouched, and no migration is required. The database schema does not move;
`applications.disabled_at` already exists and keeps its meaning. Nothing in `README.md` under
"Explicitly out of scope" gets built.

The release name and version stay in `src/lib/release.ts`. This is not a new release; it is
`Alpha_v3` continuing.

### Non-negotiable rules this work could plausibly violate

Every rule in `PROGRESS.md` § "Non-negotiable rules" binds. Three are close enough to this work to
be checked against every diff:

- **Rule 1 — assume every client is compromised.** This spec introduces a cookie that names an
  application. It is a *hint about the UI*, never an authorization input. See §1.3.
- **Rule 4 — ownership is enforced in SQL.** The cookie is resolved against the developer's own
  application list, which is already owner-scoped. There is no new query, and no new place an id
  reaches the database without `owner_id` beside it.
- **Rule 5 — `ownerId` comes only from Clerk's server-side `auth()`.** Unchanged. The cookie carries
  an application id and nothing else. It never carries, implies, or influences an owner.

---

## 1. The current application

### 1.1 Why this is needed at all

Today the current application *is* the URL: `ApplicationSwitcher` parses
`/dashboard/applications/<id>` out of `usePathname()` and shows "All applications" when the pattern
does not match. That is exactly right for a chooser that is allowed to be empty, and impossible for
one that is not — `/dashboard`, `/dashboard/applications` and `/dashboard/settings` have no id in
the path and never will.

So the current application becomes a resolved value rather than a parsed one, and the URL stays the
strongest input to that resolution.

### 1.2 The resolution order

The order is:

1. **The URL**, when the path is under `/dashboard/applications/<id>` and `<id>` is one the
   developer owns. A URL you are looking at outranks a cookie from last week.
2. **The cookie**, when it names an application the developer owns.
3. **The newest application.**
4. **`null`**, and only when the developer owns no applications at all.

Step 3 is what makes "always has a picked application" true on a fresh browser, and step 4 is the
one honest exception: there is no application to pick because none exist.

A new module, `src/lib/applications/current.ts`, owns this — and the work is deliberately split
across the boundary where the information actually lives:

```
applicationIdFromPath(pathname)                        -> string | null
resolveCurrentApplication(cookieValue, applications)   -> T | null      // steps 2-4
```

**Step 1 is applied by the client components**, each of which already has `usePathname()`. A server
layout has no pathname at all — Next.js does not give one to a layout — and the alternatives are
worse than the split: middleware could stamp the path into a request header for the layout to read,
which is plumbing in service of information the consumer already holds.

**Steps 2–4 are resolved on the server**, once per request, and passed down as the application to
fall back to when the path names none.

The server half is a pure function of two values, tested in the `node` project. It performs no I/O,
reads no cookie itself and does not import Next.js — which it also cannot, because middleware
imports it and middleware runs on the Edge runtime.

The default in step 3 is computed from `createdAt` rather than taken from position 0. The
applications page sorts by name or by licence count, and a default that depended on the caller's
ordering would put a different answer in the table than the one already showing in the header. Ties
break on id ascending, matching `applicationOrderBy`.

### 1.3 Where the cookie is written

`src/middleware.ts` writes it, because middleware sees every route into an application at once: the
chooser, the command palette, a bookmark, a pasted link, and the redirect that follows creating one.
A server action called from the chooser would catch only the first of those.

- Name: `keyren_app`. Value: the raw application id from the path.
- Written only when the path carries an id **and** the cookie does not already hold it, so ordinary
  navigation inside one application does not rewrite it on every request.
- Also skipped when the request carries Next's `next-router-prefetch` or `next-router-segment-prefetch`
  header — a `<Link>` prefetches once it is merely in the viewport, and that request is not a visit.
- `httpOnly`, `sameSite: "lax"`, `secure` outside development, `path: "/dashboard"`.
- Never written on a path that has no application id. Leaving an application does not clear the
  memory of it — that is the entire point.

The handler currently returns `void`; it will return `NextResponse.next()` with the cookie set when
there is something to write, and keep returning `void` otherwise. `auth.protect()` runs first and
unchanged, so an unauthenticated request is redirected before any cookie logic is reached.

A cookie set here is **not** visible to `cookies()` on the same request — middleware writes it onto
the response, while a server component reads the request that came in. That is harmless, and the
split in §1.2 is why: on the request that first names an application, the client components read
that application out of the path they are rendering, and the path outranks the cookie anyway. The
cookie is for the *next* request — the one that has left the application behind. Anyone tempted to
"fix" the lag by rewriting request headers should read this paragraph first.

**The cookie is untrusted input.** It is editable by hand, it survives a sign-out, and it can name
an application belonging to another developer. Nothing about it is trusted: the layout resolves it
against the list it already fetched — owner-scoped, in SQL — and a value that is not in that list
falls through to step 3. There is no path where the cookie's value reaches a query. Forging it
achieves nothing beyond choosing which of *your own* applications the chooser opens on.

### 1.4 Where it is read

`src/app/dashboard/layout.tsx` already fetches the owner's applications for the chooser and the
command palette. It gains a `cookies()` read and one call to `resolveCurrentApplication`, and passes
the resulting id to the three client components that need it — the chooser, the sidebar and the
mobile navigation. It resolves against the *full* rows, which carry `createdAt`, and trims to the
three fields the client renders only afterwards.

`src/app/dashboard/applications/page.tsx` needs the same answer for its "Current" marker, and a
layout cannot pass props to a page. It resolves it itself, from the same module. That is a second
call, not a second source of truth — and it is cheaper than a context provider existing to carry one
string through a tree that is otherwise entirely server-rendered.

That page resolves against **every** application the developer owns, not the list it is currently
displaying. A search narrows what is on screen, and the header does not change its answer because of
one — so while filtering, and only while filtering, the page pays for a second unfiltered read.

`resolveCurrentApplication` is therefore generic over `{ id: string; createdAt: Date }` rather than
tied to one shape, because the layout and the applications page hold different rows and neither
should convert to satisfy the other.

---

## 2. The chooser

`src/components/dashboard/application-switcher.tsx`. Its contract changes: it is handed
`current: SwitchableApplication | null` instead of deriving identity from the pathname. It keeps
reading the pathname for one thing only — which *section* is open — because that is genuinely a
property of the URL and nothing else.

- **"All applications" is removed** from the menu. It was the only entry that meant "no application
  in scope", and there is no such state any more.
- **The trigger always names an application**, on every dashboard page, including the three that
  have no id in their path.
- **Picking one from inside an application keeps the section.** `/licenses` stays `/licenses`.
  This is existing behaviour and its tests survive intact.
- **Picking one from a workspace page** — Overview, Applications, Settings — goes to that
  application's overview, `/dashboard/applications/<id>`. A pick is a navigation; a chooser that
  changed a label and left you where you were would be a chooser that appeared to do nothing.
- **The disabled mark stays** on both the trigger and the menu rows. A disabled application is still
  pickable, and must be: re-enabling it means going there.
- **Zero applications:** the trigger reads "No applications" and is not a menu of things to pick.
  The only entry is "New application".

`aria-label` follows the same rule it does today — it names the current application and says the
control switches applications, rather than describing the menu.

## 3. Overview and Applications stop being choosers

Both pages stay. Neither is a way into an application any more.

### 3.1 `src/app/dashboard/applications/page.tsx`

- The stretched row link comes off, in both the desktop table and the narrow-screen cards. The
  `relative`/`after:absolute inset-0` pairing that made the whole row clickable goes with it, along
  with the `relative` wrappers that existed only to lift real controls above it.
- The name is text, not a link.
- **New: a Status column.** Live or Disabled. This is the defect in the user's report that I could
  confirm directly — the application header and the Overview both badge a disabled application, and
  this table, the one place a developer goes to see all of them at once, badges nothing. A disabled
  application currently looks identical to a live one here.
- **New: a "Current" marker** on the row the chooser is pointing at, so the two surfaces agree about
  what is in scope and the table explains where the header's value came from.
- The `⋯` menu is unchanged in purpose and keeps Rename, Disable/Enable and Delete.
- Search, sort and the empty states are untouched.

### 3.2 `src/app/dashboard/page.tsx`

- The Applications section's rows stop being links. The `ChevronRight` goes with the link — it
  promises a destination.
- The `Disabled` badge, the key glyph and the active/total counts stay. The section becomes a
  read-only census.
- **The "Expiring soon" rows stay clickable.** They open one named license, pre-filtered, and that
  section exists precisely to be acted on before a customer writes in. Following one is not browsing
  for an application, and the middleware makes that application current on arrival, as it would for
  any other route in.

### 3.3 What is deliberately left alone

- **The command palette** keeps its application entries. It is a keyboard chooser, not a list you
  browse — the same act as using the header control, performed faster.
- **The "← Applications" back link** in the application header stays. It goes to the list, which is
  not the same as picking from it.
- **The sidebar** gains one behaviour: its "Application" group renders on every dashboard page,
  pointing at the current application, instead of appearing only when the URL contains an id. If an
  application is always in scope, the navigation that belongs to it is always applicable.

---

## 4. The kill switch

### 4.1 The confirmed defect

`ApplicationStatusSetting` renders `<Button type="submit">` wrapping `<Switch>`. Radix's `Switch`
root **is a `<button>`**, so this is a button inside a button — invalid HTML. Verified in a real
browser's parser rather than assumed: given that markup, `innerHTML` yields

```
form
├── input[hidden name=applicationId]
├── input[hidden name=disabled]
├── button[type=submit]              ← empty, zero-sized
├── button[type=button role=switch]  ← ejected from its parent, and pointer-events-none
└── input[type=checkbox]             ← Radix's bubble input, also ejected
```

The parser closes the outer `<button>` when it meets the inner one. Server-rendered, the submit
button therefore arrives **empty**, and the switch arrives as its *sibling* carrying
`pointer-events-none` — a control that cannot be clicked, beside a button with nothing in it. React
then hydrates a tree that does not match, on precisely this subtree.

The client-only render is fine, which is why a component test does not catch it: `appendChild` has
no such parser rule and nests the buttons happily. This is an SSR-and-hydration defect by
construction, and the fix is to stop producing the markup, not to work around what the parser does
with it.

`application-status-setting.tsx:44` is the only place in the codebase where a `Button` wraps a
`Switch`. The other three `Switch` usages are standalone controls with `onCheckedChange` and are
correct.

### 4.2 The rebuild

- The wrapping `Button` is deleted. The `Switch` becomes the only interactive element in the row,
  with no `pointer-events-none` and no `tabIndex={-1}` — it owns its own interaction now, which is
  what a switch is for, and it becomes reachable by keyboard rather than being skipped.
- `onCheckedChange` calls `requestSubmit()` on a ref to the form, so the state change is still a
  server action and the hidden inputs still carry the intended end state. The form and its two
  hidden inputs are unchanged.
- The switch is disabled while a submission is in flight, so it cannot be fired twice.
- **Disabling asks first.** A single stray click currently takes a product's licensing offline for
  every customer at once; the confirmation names the application and says what will happen.
  Enabling is immediate — there is nothing to warn about in restoring service.
- The `⋯` menu's Disable gets the same confirmation, so the two paths to the same consequence
  behave the same way. Enable stays a single click there too.

### 4.3 The message

`setApplicationDisabledAction` and `deleteApplicationAction` both answer a failed
`applicationIdSchema.safeParse` with *"That application is no longer available."* That sentence is
reachable only when the form did not carry a well-formed id — a bug in the page, never a missing
application — so it describes a state that did not happen and sends the reader to look in the wrong
place.

Both become an honest report that the submission arrived without an application id and that
reloading is the remedy. The genuine "not found / not yours" case is unaffected: it comes from
`notFound("Application")` by way of `safeErrorMessage` and already says the right thing.

---

## 5. Testing

| Test | Project | Asserts |
|---|---|---|
| `tests/applications/current.test.ts` (new) | node | URL beats cookie; cookie used when the URL has none; unknown cookie falls back to newest; an id the developer does not own is ignored in both positions; `null` only on an empty list |
| `tests/components/application-switcher.test.tsx` (rewrite) | dom | No "All applications" entry; the trigger names `current` on a workspace path; picking from a workspace path lands on the application overview; picking inside a section keeps the section; the empty-list state offers only "New application" |
| `tests/components/application-status-setting.test.tsx` (new) | dom | The **server-rendered markup contains no nested `<button>`** — the regression guard for §4.1, asserted against `renderToStaticMarkup` output rather than the client tree, because the client tree was never the broken one; toggling submits the application id and the intended end state; disabling confirms first and enabling does not |
| `tests/components/application-actions.test.tsx` (new) | dom | Disable confirms; Enable does not; the submitted form carries the id and the end state |

Every existing test keeps passing. `npm run test`, `npm run typecheck` and `npm run lint` are all
green before this is called done, and the assertion of green is made from the output rather than
from the absence of a reason to doubt it.

---

## 6. Files

| File | Change |
|---|---|
| `src/lib/applications/current.ts` | New — cookie name and `resolveCurrentApplication` |
| `src/middleware.ts` | Write `keyren_app` when the path names an application |
| `src/app/dashboard/layout.tsx` | Read the cookie, resolve, pass `current` down |
| `src/components/dashboard/application-switcher.tsx` | Takes `current`; loses "All applications"; workspace-page picking |
| `src/components/dashboard/sidebar.tsx` | Application group always renders, against `current` |
| `src/app/dashboard/applications/page.tsx` | Inert rows; Status column; Current marker |
| `src/app/dashboard/page.tsx` | Inert application rows; expiring-soon rows unchanged |
| `src/components/applications/application-status-setting.tsx` | Rebuilt — no nested button; confirm on disable |
| `src/components/applications/application-actions.tsx` | Confirm on disable |
| `src/app/dashboard/applications/actions.ts` | Honest message for a missing id |
| `README.md`, `PROGRESS.md`, `docs/alpha-v3.md` | Record the navigation model and the defect |

---

## 7. Constraints and non-goals

- No schema change, no migration, no API change.
- No new dependency.
- No `any`, no `@ts-expect-error`, no `eslint-disable`, no skipped test.
- The cookie stores an application id and nothing else. It is not a session, not a preference store,
  and not a place to put the next thing that needs remembering.
- Nothing here implies teams, roles, or a workspace concept above the developer. One developer owns
  applications; that is the whole model and it does not move.

## 8. Acceptance

1. On `/dashboard`, `/dashboard/applications` and `/dashboard/settings`, the chooser names an
   application rather than "All applications".
2. The menu has no "All applications" entry at any time.
3. Picking an application from a workspace page lands on that application's overview; picking one
   from inside `/licenses` lands on the new application's `/licenses`.
4. A developer with zero applications sees "No applications" and can only create one.
5. Clicking an application row on Overview or Applications navigates nowhere.
6. A disabled application reads as disabled in the Applications table.
7. The Settings kill switch, viewed in **server-rendered** HTML, contains no `<button>` inside a
   `<button>`, and toggling it works on first paint without depending on hydration recovery.
8. Disabling asks for confirmation from both the settings row and the row menu; enabling does not.
9. `npm run test`, `npm run typecheck`, `npm run lint` all pass.
