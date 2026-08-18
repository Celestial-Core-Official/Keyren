# Application Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The dashboard always has one application in scope, chosen only from the header chooser, and the application kill switch stops being built on invalid HTML.

**Architecture:** The current application becomes a resolution rather than a URL parse, split across the boundary where the information actually lives. The server resolves *cookie → newest application* in the dashboard layout and passes the answer down; the client components apply the *URL outranks everything* rule themselves, because `usePathname()` is theirs and a server layout has no pathname. `src/middleware.ts` writes the cookie whenever a URL names an application, which covers every route in — chooser, palette, bookmark, redirect-after-create — from one place. The Overview and Applications pages keep existing and stop being ways in.

**Tech Stack:** Next.js 16 App Router, React 19.2.8 (`useActionState` with its `pending` element), TypeScript strict, Tailwind 4, Radix (`radix-ui` package), Clerk 7 middleware, Vitest 4 with two projects — `node` for `tests/**/*.test.ts`, `dom` (happy-dom) for `tests/**/*.test.tsx`.

**Spec:** `docs/superpowers/specs/2026-08-17-application-scope-design.md`

**Verified before planning, do not re-litigate:**
- A real browser's parser splits `<button type=submit><button role=switch>` into siblings and empties the outer button. This is the defect in Task 7.
- `form.requestSubmit()` on a form with no submit button drives a React 19 action and carries its hidden inputs, in happy-dom. Both Task 7 and Task 8 depend on it.
- `AlertDialogAction` renders exactly one `<button>` (it is `Button asChild` around the Radix Action) and fires `onClick`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/applications/current.ts` | **New.** The cookie name, the path parser, and the resolution rule. Pure — no I/O, no Next.js, no database. |
| `src/middleware.ts` | Writes the cookie when a path names an application. |
| `src/app/dashboard/layout.tsx` | Reads the cookie, resolves, passes the id to three client components. |
| `src/components/dashboard/application-switcher.tsx` | Takes the resolved id; applies the URL override; no "All applications". |
| `src/components/dashboard/sidebar.tsx` | Application group always renders. |
| `src/components/dashboard/mobile-nav.tsx` | Same, and stops owning a path regex. |
| `src/app/dashboard/applications/page.tsx` | Inert rows, Status column, Current marker. |
| `src/app/dashboard/page.tsx` | Inert application rows. |
| `src/components/applications/application-status-setting.tsx` | The kill switch, rebuilt without a nested button. |
| `src/components/applications/application-actions.tsx` | One status form outside the menu; confirm on disable. |
| `src/app/dashboard/applications/actions.ts` | An honest message for a submission with no id. |

---

## Task 1: The resolution module

**Files:**
- Create: `src/lib/applications/current.ts`
- Create: `tests/applications/current.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/applications/current.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CURRENT_APPLICATION_COOKIE,
  applicationIdFromPath,
  resolveCurrentApplication,
} from "@/lib/applications/current";

/** The two fields resolution actually depends on. */
function application(id: string, createdAt: string) {
  return { id, createdAt: new Date(createdAt) };
}

const NEWEST = application("app_NEWEST", "2026-08-17T00:00:00.000Z");
const MIDDLE = application("app_MIDDLE", "2026-08-16T00:00:00.000Z");
const OLDEST = application("app_OLDEST", "2026-08-15T00:00:00.000Z");

const OWNED = [NEWEST, MIDDLE, OLDEST];

describe("applicationIdFromPath", () => {
  it("finds the application in an application path", () => {
    expect(applicationIdFromPath("/dashboard/applications/app_abc123")).toBe("app_abc123");
  });

  it("finds it under a deeper section", () => {
    expect(applicationIdFromPath("/dashboard/applications/app_abc123/licenses")).toBe(
      "app_abc123",
    );
  });

  it("returns null on the list itself", () => {
    expect(applicationIdFromPath("/dashboard/applications")).toBeNull();
  });

  it("returns null on the workspace pages", () => {
    expect(applicationIdFromPath("/dashboard")).toBeNull();
    expect(applicationIdFromPath("/dashboard/settings")).toBeNull();
  });

  it("ignores a segment that is not an application id", () => {
    // A hand-typed path must not be echoed back as though it named something.
    expect(applicationIdFromPath("/dashboard/applications/not-an-application")).toBeNull();
  });
});

describe("resolveCurrentApplication", () => {
  it("uses the cookie when it names an owned application", () => {
    expect(resolveCurrentApplication(MIDDLE.id, OWNED)).toBe(MIDDLE);
  });

  it("falls back to the newest when there is no cookie", () => {
    expect(resolveCurrentApplication(undefined, OWNED)).toBe(NEWEST);
  });

  it("falls back to the newest when the cookie names a deleted application", () => {
    expect(resolveCurrentApplication("app_DELETED", OWNED)).toBe(NEWEST);
  });

  it("ignores a cookie naming an application the developer does not own", () => {
    // The list is already owner-scoped in SQL, which is what makes reading an
    // untrusted cookie safe: a value outside the list matches nothing.
    expect(resolveCurrentApplication("app_SOMEONEELSES", OWNED)).toBe(NEWEST);
  });

  it("does not depend on the order it is handed", () => {
    // The applications page sorts by name, or by licence count. The answer has
    // to be the same one the header reached, or the two disagree on screen.
    expect(resolveCurrentApplication(undefined, [OLDEST, NEWEST, MIDDLE])).toBe(NEWEST);
  });

  it("breaks a createdAt tie on id, the way the list query does", () => {
    const a = application("app_AAA", "2026-08-17T00:00:00.000Z");
    const b = application("app_BBB", "2026-08-17T00:00:00.000Z");
    expect(resolveCurrentApplication(undefined, [b, a])).toBe(a);
  });

  it("returns null only when there is nothing to pick", () => {
    expect(resolveCurrentApplication(undefined, [])).toBeNull();
    expect(resolveCurrentApplication("app_ANY", [])).toBeNull();
  });

  it("names the cookie once, for middleware and the layout to share", () => {
    expect(CURRENT_APPLICATION_COOKIE).toBe("keyren_app");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/applications/current.test.ts --project node
```

Expected: FAIL — `Failed to resolve import "@/lib/applications/current"`.

- [ ] **Step 3: Write the module**

Create `src/lib/applications/current.ts`:

```ts
/**
 * Which application the dashboard is looking at.
 *
 * Through Alpha_v3 this was a parse of the URL and nothing else, which is
 * exactly right for a chooser that is allowed to be empty. It is wrong for one
 * that is not: `/dashboard`, `/dashboard/applications` and `/dashboard/settings`
 * carry no application in their path and never will.
 *
 * So it becomes a resolution, and it is deliberately split. The rule "a URL you
 * are looking at outranks a cookie from last week" is applied by the client
 * components, because `usePathname()` is theirs and a server layout has no
 * pathname at all. What is left — cookie, then a default — is what the server
 * resolves here and hands down.
 *
 * Nothing in this file performs I/O, reads a cookie store, or imports Next.js.
 * It is a function of two values, which is what makes precedence, a stale
 * cookie and a deleted application testable without a request, a DOM or a
 * database. It also has to stay that way because middleware imports it, and
 * middleware runs on the Edge runtime.
 */

/**
 * The cookie that remembers the last application.
 *
 * Scoped to `/dashboard` and written only by middleware. It is a hint about the
 * UI and never an authorization input — see `resolveCurrentApplication`.
 */
export const CURRENT_APPLICATION_COOKIE = "keyren_app";

/**
 * Matches `/dashboard/applications/<id>`, capturing the id and nothing deeper.
 *
 * The `app_` prefix is part of the pattern rather than `[^/]+`: `/applications`
 * followed by a hand-typed segment names nothing, and treating it as an id
 * would put a value in the header that no application answers to.
 */
const APPLICATION_PATH = /^\/dashboard\/applications\/(app_[0-9A-Za-z]+)(?:\/|$)/;

export function applicationIdFromPath(pathname: string): string | null {
  return APPLICATION_PATH.exec(pathname)?.[1] ?? null;
}

/**
 * The application to treat as current when the path does not name one.
 *
 * Generic over `{ id, createdAt }` because the layout holds one shape and the
 * applications page another, and neither should convert to satisfy the other.
 *
 * `applications` is the developer's own list, already scoped by `owner_id` in
 * SQL. That is precisely what makes reading an untrusted cookie safe: a value
 * that is stale, hand-edited, or names another developer's application matches
 * nothing in this list and falls through to the default. The cookie's value
 * never reaches a query.
 *
 * The default is the newest application, computed rather than taken from
 * position 0. The applications page sorts by name or by licence count, and a
 * default that depended on the caller's order would put a different answer in
 * the table than the one already showing in the header.
 */
export function resolveCurrentApplication<T extends { id: string; createdAt: Date }>(
  cookieValue: string | undefined,
  applications: readonly T[],
): T | null {
  if (cookieValue !== undefined) {
    const remembered = applications.find((application) => application.id === cookieValue);
    if (remembered) return remembered;
  }

  // Newest first, ties broken on id ascending — the same ordering
  // `applicationOrderBy` gives the list, so both agree about which is first.
  let newest: T | null = null;
  for (const application of applications) {
    if (newest === null) {
      newest = application;
      continue;
    }
    const difference = application.createdAt.getTime() - newest.createdAt.getTime();
    if (difference > 0 || (difference === 0 && application.id < newest.id)) {
      newest = application;
    }
  }

  return newest;
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run tests/applications/current.test.ts --project node
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/applications/current.ts tests/applications/current.test.ts
git commit -m "feat: resolve which application the dashboard is looking at"
```

---

## Task 2: Middleware remembers the application

**Files:**
- Modify: `src/middleware.ts`

There is no unit test for this step. Middleware is a Next.js runtime integration with no seam this project can exercise — `tests/` has no Next request harness and adding one to assert a `Set-Cookie` header would be a larger and less honest thing than the four lines under test. It is verified in Task 9 against the running app instead.

- [ ] **Step 1: Add the cookie write**

Replace the whole body of `src/middleware.ts` with:

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { SIGN_IN_URL, SIGN_UP_URL } from "@/lib/auth/routes";
import {
  CURRENT_APPLICATION_COOKIE,
  applicationIdFromPath,
} from "@/lib/applications/current";

/**
 * Everything under /dashboard requires an authenticated developer.
 *
 * The public verification API is deliberately NOT matched: customer software
 * authenticates with a license key, not a Clerk session, and must never be
 * redirected to a sign-in page. The two authentication systems are entirely
 * separate and share no state.
 *
 * Middleware is a convenience, not the security boundary. Every server action
 * and query independently re-derives the owner from `auth()` and scopes its
 * SQL — a middleware misconfiguration alone cannot expose another
 * developer's data.
 */
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware(
  async (auth, request) => {
    if (isProtectedRoute(request)) {
      await auth.protect();
    }

    // Every route into an application passes through here — the chooser, the
    // command palette, a bookmark, a pasted link, and the redirect that follows
    // creating one. A server action called from the chooser would catch only
    // the first of those, which is why this lives in middleware and not there.
    //
    // The cookie this writes is not visible to `cookies()` on this same
    // request, and does not need to be: the client components read the
    // application out of the path they are already rendering, and the path
    // outranks the cookie anyway. This is for the next request, the one that
    // has left the application behind.
    const applicationId = applicationIdFromPath(request.nextUrl.pathname);
    if (applicationId === null) return;
    if (request.cookies.get(CURRENT_APPLICATION_COOKIE)?.value === applicationId) return;

    const response = NextResponse.next();
    response.cookies.set(CURRENT_APPLICATION_COOKIE, applicationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/dashboard",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  },
  {
    // Without these, `auth.protect()` falls through to `redirectToSignIn()`,
    // which defaults to Clerk's hosted account portal on an accounts.dev
    // domain — sending a signed-out developer off Keyren entirely, past the
    // `/sign-in` page this app ships and links to from its own landing page.
    //
    // That page is also the only one `ThemedClerkProvider` can theme, so the
    // portal was permanently light-mode Clerk branding for an app that is dark
    // by default.
    signInUrl: SIGN_IN_URL,
    signUpUrl: SIGN_UP_URL,
  },
);

export const config = {
  matcher: [
    // Skip static files and Next internals, run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: remember the application a URL names"
```

---

## Task 3: The chooser is never empty

**Files:**
- Modify: `src/components/dashboard/application-switcher.tsx`
- Modify: `src/app/dashboard/layout.tsx`
- Test: `tests/components/application-switcher.test.tsx` (replace wholesale)

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `tests/components/application-switcher.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApplicationSwitcher } from "@/components/dashboard/application-switcher";

const push = vi.fn();
let pathname = "/dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));

const APPLICATIONS = [
  { id: "app_alpha", name: "Alpha Tool", disabled: false },
  { id: "app_beta", name: "Beta Suite", disabled: true },
] as const;

function renderSwitcher(
  at: string,
  fallbackId: string | null = "app_alpha",
  applications: readonly { id: string; name: string; disabled: boolean }[] = APPLICATIONS,
) {
  pathname = at;
  render(<ApplicationSwitcher applications={applications} fallbackId={fallbackId} />);
  return userEvent.setup();
}

beforeEach(() => {
  push.mockClear();
});

describe("ApplicationSwitcher — which application is current", () => {
  it("names the application from the URL", () => {
    renderSwitcher("/dashboard/applications/app_beta");
    expect(screen.getByRole("button", { name: /Beta Suite/ })).toBeTruthy();
  });

  it("names the resolved application on a page with none in the path", () => {
    // The whole point of this release: there is no "All applications" state to
    // fall into on the workspace pages.
    renderSwitcher("/dashboard", "app_beta");
    expect(screen.getByRole("button", { name: /Beta Suite/ })).toBeTruthy();
  });

  it("lets the URL outrank the remembered application", () => {
    renderSwitcher("/dashboard/applications/app_alpha", "app_beta");
    expect(screen.getByRole("button", { name: /Alpha Tool/ })).toBeTruthy();
  });

  it("never offers an All applications entry", async () => {
    const user = renderSwitcher("/dashboard");
    await user.click(screen.getByRole("button", { name: /Alpha Tool/ }));
    expect(screen.queryByText("All applications")).toBeNull();
  });

  it("marks a disabled application in the list", async () => {
    const user = renderSwitcher("/dashboard/applications/app_alpha");
    await user.click(screen.getByRole("button", { name: /Alpha Tool/ }));

    // Beta is off; the developer should be able to see that without opening it.
    const beta = screen.getByRole("menuitem", { name: /Beta Suite/ });
    expect(beta.querySelector('[aria-label="Disabled"]')).toBeTruthy();
  });

  it("falls back to the resolved application for an id the developer does not own", () => {
    // A hand-typed or stale id resolves to nothing rather than being echoed
    // back as though it were real — and there is still an application in scope.
    renderSwitcher("/dashboard/applications/app_someone_else", "app_alpha");
    expect(screen.getByRole("button", { name: /Alpha Tool/ })).toBeTruthy();
  });

  it("says so plainly when the developer owns nothing", async () => {
    const user = renderSwitcher("/dashboard", null, []);
    const trigger = screen.getByRole("button", { name: /No applications yet/ });
    await user.click(trigger);

    expect(screen.getByText("New application")).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Alpha Tool/ })).toBeNull();
  });
});

describe("ApplicationSwitcher — switching keeps the section", () => {
  it("stays on licenses when switching application", async () => {
    // Changing the subject, not the place.
    const user = renderSwitcher("/dashboard/applications/app_alpha/licenses");

    await user.click(screen.getByRole("button", { name: /Alpha Tool/ }));
    await user.click(screen.getByRole("menuitem", { name: /Beta Suite/ }));

    expect(push).toHaveBeenCalledWith("/dashboard/applications/app_beta/licenses");
  });

  it("stays on the overview when switching from an overview", async () => {
    const user = renderSwitcher("/dashboard/applications/app_alpha");

    await user.click(screen.getByRole("button", { name: /Alpha Tool/ }));
    await user.click(screen.getByRole("menuitem", { name: /Beta Suite/ }));

    expect(push).toHaveBeenCalledWith("/dashboard/applications/app_beta");
  });

  it("preserves a deeper section rather than truncating to the application root", async () => {
    const user = renderSwitcher("/dashboard/applications/app_alpha/licenses/extra");

    await user.click(screen.getByRole("button", { name: /Alpha Tool/ }));
    await user.click(screen.getByRole("menuitem", { name: /Beta Suite/ }));

    expect(push).toHaveBeenCalledWith("/dashboard/applications/app_beta/licenses/extra");
  });

  it("opens the application overview when picking from a workspace page", async () => {
    // There is no section to carry across from /dashboard, and a pick that
    // changed a label without going anywhere would read as a broken control.
    const user = renderSwitcher("/dashboard", "app_alpha");

    await user.click(screen.getByRole("button", { name: /Alpha Tool/ }));
    await user.click(screen.getByRole("menuitem", { name: /Beta Suite/ }));

    expect(push).toHaveBeenCalledWith("/dashboard/applications/app_beta");
  });

  it("opens the application overview when picking from the applications list", async () => {
    const user = renderSwitcher("/dashboard/applications", "app_alpha");

    await user.click(screen.getByRole("button", { name: /Alpha Tool/ }));
    await user.click(screen.getByRole("menuitem", { name: /Beta Suite/ }));

    expect(push).toHaveBeenCalledWith("/dashboard/applications/app_beta");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/components/application-switcher.test.tsx --project dom
```

Expected: FAIL — the `fallbackId` prop does not exist, and "All applications" still renders.

- [ ] **Step 3: Rewrite the switcher**

Replace the entire contents of `src/components/dashboard/application-switcher.tsx`:

```tsx
"use client";

import { useRouter, usePathname } from "next/navigation";
import { Check, ChevronsUpDown, Plus, PowerOff } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { applicationIdFromPath } from "@/lib/applications/current";
import { cn } from "@/lib/utils";

export type SwitchableApplication = {
  id: string;
  name: string;
  disabled: boolean;
};

/**
 * Picks which application the whole dashboard is looking at.
 *
 * There is always one. Through Alpha_v3 this control read "All applications"
 * on every page whose path did not name one, which made the dashboard's
 * subject a thing you could be outside of; the lists were the real choosers
 * and this was a shortcut. That is now inverted — this is the only way to pick
 * an application, so it may never be empty.
 *
 * Identity comes from two places, in order. The path, when it names an
 * application: a URL you are looking at outranks anything remembered. Then
 * `fallbackId`, resolved on the server from the cookie and then the newest
 * application. The path half is applied here rather than upstream because
 * `usePathname()` is a client hook and the layout that resolves the other half
 * is a server component with no pathname of its own.
 *
 * The important behaviour on switch is that you stay on the section you were
 * reading. Switching from A's licenses goes to B's licenses, not to B's
 * overview. Implemented by rewriting one path segment rather than by storing a
 * selection, so a switched-to view is still bookmarkable and still survives a
 * refresh.
 */
export function ApplicationSwitcher({
  applications,
  fallbackId,
}: {
  applications: readonly SwitchableApplication[];
  /**
   * The application to treat as current when the path does not name one.
   * Resolved server-side: the `keyren_app` cookie, then the newest
   * application, then `null` for a developer who owns none.
   */
  fallbackId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const inPath = applicationIdFromPath(pathname);
  const currentId = inPath ?? fallbackId;
  const current = applications.find((application) => application.id === currentId) ?? null;

  // Only a path that actually names an application has a section to preserve.
  // From /dashboard there is nothing to carry across, and a switch lands on
  // the application's overview.
  const suffix = inPath === null ? "" : pathname.slice(`/dashboard/applications/${inPath}`.length);

  function switchTo(id: string) {
    router.push(`/dashboard/applications/${id}${suffix}`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors",
          "hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          current ? "text-foreground" : "text-muted-foreground",
        )}
        aria-label={
          current
            ? `Current application: ${current.name}. Switch application`
            : "No applications yet. Create one"
        }
      >
        <span className="truncate">{current?.name ?? "No applications"}</span>
        {current?.disabled ? (
          <PowerOff className="size-3.5 shrink-0 text-destructive" aria-label="Disabled" />
        ) : null}
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        {applications.length > 0 ? (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Applications
            </DropdownMenuLabel>
            {applications.map((application) => (
              <DropdownMenuItem
                key={application.id}
                onSelect={() => switchTo(application.id)}
                className="justify-between gap-2"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{application.name}</span>
                  {application.disabled ? (
                    <PowerOff className="size-3 shrink-0 text-destructive" aria-label="Disabled" />
                  ) : null}
                </span>
                {application.id === currentId ? (
                  <Check className="size-3.5 shrink-0" />
                ) : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        ) : null}

        <DropdownMenuItem onSelect={() => router.push("/dashboard/applications?new=1")}>
          <Plus className="size-4" />
          New application
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Run the switcher test and watch it pass**

```bash
npx vitest run tests/components/application-switcher.test.tsx --project dom
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Resolve in the layout and pass it down**

In `src/app/dashboard/layout.tsx`, add to the imports:

```tsx
import { cookies } from "next/headers";
import {
  CURRENT_APPLICATION_COOKIE,
  resolveCurrentApplication,
} from "@/lib/applications/current";
```

Replace the `const applications = ...` block with:

```tsx
  // Owner-scoped, and the only query the shell makes. The full rows are kept
  // for resolution — which needs `createdAt` — and trimmed before crossing to
  // the client, where only three fields are rendered.
  const owned = await listApplications(db, ownerId);

  const cookieStore = await cookies();
  const current = resolveCurrentApplication(
    cookieStore.get(CURRENT_APPLICATION_COOKIE)?.value,
    owned,
  );
  const fallbackId = current?.id ?? null;

  const applications = owned.map((application) => ({
    id: application.id,
    name: application.name,
    disabled: application.disabledAt !== null,
  }));
```

Then pass it to the three consumers:

```tsx
          <MobileNav applications={applications} fallbackId={fallbackId} />
```

```tsx
          <ApplicationSwitcher applications={applications} fallbackId={fallbackId} />
```

```tsx
            <DashboardSidebar fallbackId={fallbackId} />
```

`MobileNav` and `DashboardSidebar` do not accept these props until Task 4; `npm run typecheck` will fail between here and there, which is expected and is why the two tasks share a commit boundary only at the end of Task 4.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/application-switcher.tsx src/app/dashboard/layout.tsx tests/components/application-switcher.test.tsx
git commit -m "feat: give the chooser an application on every page"
```

---

## Task 4: The application navigation always applies

**Files:**
- Modify: `src/components/dashboard/sidebar.tsx`
- Modify: `src/components/dashboard/mobile-nav.tsx`
- Modify: `tests/components/keyboard-shortcuts.test.tsx:1-20,163-186`

`currentApplicationId` currently lives in `mobile-nav.tsx` and is tested from `keyboard-shortcuts.test.tsx`. Task 1 replaced it with `applicationIdFromPath`, which middleware and the switcher also need — three copies of one regex is the alternative. The old export goes and its tests move.

- [ ] **Step 1: Move the path-parser tests out**

In `tests/components/keyboard-shortcuts.test.tsx`, delete the import of `currentApplicationId`:

```tsx
import { currentApplicationId } from "@/components/dashboard/mobile-nav";
```

and delete the entire `describe("currentApplicationId", ...)` block at lines 163–186. Its cases already exist in `tests/applications/current.test.ts` from Task 1 — do not re-add them anywhere.

- [ ] **Step 2: Run the shortcuts test and watch it still pass**

```bash
npx vitest run tests/components/keyboard-shortcuts.test.tsx --project dom
```

Expected: PASS, with the `currentApplicationId` cases gone.

- [ ] **Step 3: Take the prop in the sidebar**

In `src/components/dashboard/sidebar.tsx`, replace the `APPLICATION_PATH` constant and the `DashboardSidebar` signature. Delete this:

```tsx
/** Matches /dashboard/applications/<id>, capturing the id and nothing deeper. */
const APPLICATION_PATH = /^\/dashboard\/applications\/([^/]+)/;

export function DashboardSidebar() {
  const pathname = usePathname();
  const applicationId = APPLICATION_PATH.exec(pathname)?.[1];
```

and put this in its place:

```tsx
export function DashboardSidebar({ fallbackId }: { fallbackId: string | null }) {
  const pathname = usePathname();

  // The application group used to appear only inside an application. An
  // application is now always in scope, so the navigation that belongs to one
  // is always applicable — and a sidebar whose second half appears and
  // disappears is a sidebar that moves under the cursor.
  const applicationId = applicationIdFromPath(pathname) ?? fallbackId;
```

Add to the imports:

```tsx
import { applicationIdFromPath } from "@/lib/applications/current";
```

The `{applicationId ? (...) : null}` block below is unchanged: it now renders on every page for a developer who owns an application, and still renders nothing for one who owns none.

- [ ] **Step 4: Take the prop in the mobile navigation**

In `src/components/dashboard/mobile-nav.tsx`, delete the exported helper:

```tsx
/**
 * Extracts the application being viewed from the path.
 * ...
 */
export function currentApplicationId(pathname: string): string | null {
  return /^\/dashboard\/applications\/(app_[0-9A-Za-z]+)(\/|$)/.exec(pathname)?.[1] ?? null;
}
```

Add to the imports:

```tsx
import { applicationIdFromPath } from "@/lib/applications/current";
import type { SwitchableApplication } from "@/components/dashboard/application-switcher";
```

Change the signature and the derivation:

```tsx
export function MobileNav({
  applications,
  fallbackId,
}: {
  applications: readonly SwitchableApplication[];
  fallbackId: string | null;
}) {
```

and replace:

```tsx
  const applicationId = currentApplicationId(pathname);
```

with:

```tsx
  const applicationId = applicationIdFromPath(pathname) ?? fallbackId;
  const application = applications.find((candidate) => candidate.id === applicationId) ?? null;
```

Then replace the heading inside the `{applicationId ? (` block so the panel names what it is showing, since it is no longer implied by the page you are on:

```tsx
              <p className="mt-4 px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {application?.name ?? "This application"}
              </p>
```

- [ ] **Step 5: Typecheck and run the whole suite**

```bash
npm run typecheck && npm run test
```

Expected: typecheck silent, every test passing. This is the first point since Task 3 Step 5 where both are true.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/sidebar.tsx src/components/dashboard/mobile-nav.tsx tests/components/keyboard-shortcuts.test.tsx
git commit -m "feat: keep the application navigation on every page"
```

---

## Task 5: The applications list stops being a chooser

**Files:**
- Modify: `src/app/dashboard/applications/page.tsx`

A server component with no client behaviour and no exported logic; it is verified by reading and in Task 9. Do not invent a test that renders a page component with a mocked database — this project has no such harness and adding one for a table would be a larger change than the table.

- [ ] **Step 1: Resolve the current application on the page**

In `src/app/dashboard/applications/page.tsx`, add to the imports:

```tsx
import { cookies } from "next/headers";
import {
  CURRENT_APPLICATION_COOKIE,
  resolveCurrentApplication,
} from "@/lib/applications/current";
import { Badge } from "@/components/ui/badge";
```

and delete the now-unused `Link` import:

```tsx
import Link from "next/link";
```

After `const applications = await listApplications(db, ownerId, query);`, insert:

```tsx
  const filtering = isApplicationFiltered(query);

  // Resolved against every application the developer owns, not the filtered
  // list: a search narrows what is on screen, and the header does not change
  // its answer because of one. Only paid for while filtering.
  const cookieStore = await cookies();
  const all = filtering ? await listApplications(db, ownerId) : applications;
  const currentId =
    resolveCurrentApplication(cookieStore.get(CURRENT_APPLICATION_COOKIE)?.value, all)?.id ??
    null;
```

and delete the existing `const filtering = isApplicationFiltered(query);` line that sat below it, so `filtering` is declared exactly once.

- [ ] **Step 2: Make the desktop table inert and add the two states**

Replace the `<TableHeader>` block with:

```tsx
              <TableHeader>
                <TableRow>
                  {/* The glyph column carries no label: it is a mark, not a
                      value, and a header over it would promise otherwise. */}
                  <TableHead className="w-14" />
                  <TableHead>Name</TableHead>
                  <TableHead>Application ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Licenses</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
```

Replace the whole `<TableBody>` block with:

```tsx
              <TableBody>
                {applications.map((application) => (
                  <TableRow key={application.id}>
                    <TableCell className="pr-0">
                      {/* Seeded from the public application ID — nothing
                          secret enters it, and the same application draws the
                          same mark on every surface that shows it. */}
                      <KeyGlyph seed={application.id} size={28} />
                    </TableCell>
                    <TableCell className="max-w-64">
                      {/* Not a link. This table is an inventory, not a way in
                          — the header chooser is the only thing that changes
                          which application the dashboard is looking at. */}
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{application.name}</span>
                        {application.id === currentId ? (
                          <Badge variant="outline" className="shrink-0">
                            Current
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-[13px] text-fg-tertiary">{application.slug}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <code
                          title={application.id}
                          className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[13px] text-fg-tertiary"
                        >
                          {middleTruncate(application.id, ID_WIDTH)}
                        </code>
                        <CopyButton value={application.id} label="" />
                      </div>
                    </TableCell>
                    <TableCell>
                      {/* Only the off state gets a badge. A column of green
                          pills saying Live teaches the eye to skip the column
                          that exists to catch the one row that is not. */}
                      {application.disabledAt ? (
                        <Badge variant="destructive">Disabled</Badge>
                      ) : (
                        <span className="text-[13px] text-fg-tertiary">Live</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {application.licenseCount}
                    </TableCell>
                    <TableCell className="text-[13px] text-fg-tertiary">
                      <RelativeTime value={application.createdAt} />
                    </TableCell>
                    <TableCell>
                      <ApplicationActions
                        applicationId={application.id}
                        name={application.name}
                        disabled={application.disabledAt !== null}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
```

- [ ] **Step 3: Make the narrow-screen cards match**

Replace the whole `<ul className="space-y-3 md:hidden">` block with:

```tsx
          <ul className="space-y-3 md:hidden">
            {applications.map((application) => (
              <li key={application.id} className="rounded-lg border border-border p-4">
                <div className="flex items-start gap-3">
                  <KeyGlyph seed={application.id} size={28} className="mt-1 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{application.name}</span>
                      {application.id === currentId ? (
                        <Badge variant="outline" className="shrink-0">
                          Current
                        </Badge>
                      ) : null}
                      {application.disabledAt ? (
                        <Badge variant="destructive" className="shrink-0">
                          Disabled
                        </Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-[13px] text-fg-tertiary">{application.slug}</p>
                  </div>
                  <div className="shrink-0">
                    <ApplicationActions
                      applicationId={application.id}
                      name={application.name}
                      disabled={application.disabledAt !== null}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code
                    title={application.id}
                    className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[13px] text-fg-tertiary"
                  >
                    {middleTruncate(application.id, ID_WIDTH_NARROW)}
                  </code>
                  <CopyButton value={application.id} label="" />
                </div>

                <p className="mt-2 text-[13px] text-fg-tertiary">
                  <span className="tabular-nums">{application.licenseCount}</span> license
                  {application.licenseCount === 1 ? "" : "s"} · created{" "}
                  <RelativeTime value={application.createdAt} />
                </p>
              </li>
            ))}
          </ul>
```

- [ ] **Step 4: Update the page's own doc comment**

Above `const ID_WIDTH = 18;`, the existing comment about middle truncation stays. Add below it:

```tsx
/**
 * This page lists applications; it does not choose one. Rows are inert on
 * purpose — the header chooser is the single control that changes the
 * dashboard's subject, and two ways to do that is how the switcher ended up
 * feeling like a shortcut nobody used.
 */
```

- [ ] **Step 5: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: both silent. A leftover unused import of `Link` fails lint — remove it if so.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/applications/page.tsx
git commit -m "feat: make the applications list an inventory, not a chooser"
```

---

## Task 6: The overview stops being a chooser

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Make the application rows inert**

In `src/app/dashboard/page.tsx`, replace the whole final `<section>` — the one headed `Applications` — with:

```tsx
      <section className="space-y-3">
        <h2 className="text-[13px] font-semibold">Applications</h2>
        {/* A census, not a menu. Picking an application happens in the header
            chooser and nowhere else; these rows report. */}
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {breakdown.map((application) => (
            <li key={application.id} className="flex h-14 items-center gap-3 px-4">
              {/* The same mark this application wears everywhere else, drawn
                  from its public ID. Two applications are told apart at a
                  glance by it before either name has been read. */}
              <KeyGlyph seed={application.id} size={28} className="shrink-0" />
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-sm">{application.name}</span>
                {application.disabled ? <Badge variant="destructive">Disabled</Badge> : null}
              </span>
              <span className="shrink-0 text-[13px] tabular-nums text-fg-tertiary">
                {application.active} active / {application.total}
              </span>
            </li>
          ))}
        </ul>
      </section>
```

The "Expiring soon" section above it is unchanged. Those rows open one named license, pre-filtered, and that section exists to be acted on — following one is not browsing for an application.

- [ ] **Step 2: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: both silent. `Link` and `ChevronRight` are both still used by the expiring-soon section and by the header action, so neither import is removed.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: make the overview report applications rather than offer them"
```

---

## Task 7: Rebuild the kill switch

**Files:**
- Modify: `src/components/applications/application-status-setting.tsx`
- Modify: `src/app/dashboard/applications/[applicationId]/settings/page.tsx:52-55`
- Create: `tests/components/application-status-setting.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/application-status-setting.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { ApplicationStatusSetting } from "@/components/applications/application-status-setting";
import { actionSuccess } from "@/lib/actions/state";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const actions = vi.hoisted(() => ({
  createApplicationAction: vi.fn(),
  deleteApplicationAction: vi.fn(),
  renameApplicationAction: vi.fn(),
  setApplicationDisabledAction: vi.fn(),
}));
vi.mock("@/app/dashboard/applications/actions", () => actions);

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
  for (const action of Object.values(actions)) {
    action.mockReset();
    action.mockResolvedValue(actionSuccess("Done.", null));
  }
});

describe("ApplicationStatusSetting — the markup", () => {
  /**
   * The regression guard for the defect this component was rebuilt for.
   *
   * Radix's Switch root is a <button>. Wrapping it in a submit <Button> nested
   * one button inside another, and a browser's parser resolves that by closing
   * the outer one and ejecting the switch as a sibling — so the server-rendered
   * row arrived with an empty zero-sized button beside an unclickable switch,
   * and React then hydrated a tree that did not match.
   *
   * Asserted against the server markup rather than the rendered DOM, because
   * the client tree was never the broken one: appendChild has no such parser
   * rule and nests the two happily. A test that renders and clicks cannot see
   * this.
   */
  it("server-renders no button inside a button", () => {
    const html = renderToStaticMarkup(
      <ApplicationStatusSetting applicationId="app_ABC123" name="Acme" disabled={false} />,
    );

    const opens = [...html.matchAll(/<button\b|<\/button>/g)].map((match) => match[0]);
    let depth = 0;
    for (const token of opens) {
      if (token === "</button>") {
        depth -= 1;
        continue;
      }
      depth += 1;
      expect(depth).toBeLessThanOrEqual(1);
    }
    expect(depth).toBe(0);
  });

  it("keeps the switch reachable by keyboard", () => {
    // It used to carry tabIndex={-1} because a Button owned the interaction.
    render(<ApplicationStatusSetting applicationId="app_ABC123" name="Acme" disabled={false} />);
    expect(screen.getByRole("switch").getAttribute("tabindex")).not.toBe("-1");
  });
});

describe("ApplicationStatusSetting — turning it off", () => {
  it("asks before disabling rather than acting on the click", async () => {
    const user = userEvent.setup();
    render(<ApplicationStatusSetting applicationId="app_ABC123" name="Acme" disabled={false} />);

    await user.click(screen.getByRole("switch"));

    expect(await screen.findByText(/Disable Acme\?/)).toBeTruthy();
    expect(actions.setApplicationDisabledAction).not.toHaveBeenCalled();
  });

  it("submits the application and the intended end state once confirmed", async () => {
    const user = userEvent.setup();
    render(<ApplicationStatusSetting applicationId="app_ABC123" name="Acme" disabled={false} />);

    await user.click(screen.getByRole("switch"));
    await user.click(await screen.findByRole("button", { name: "Disable application" }));

    await waitFor(() => expect(actions.setApplicationDisabledAction).toHaveBeenCalled());
    const formData = actions.setApplicationDisabledAction.mock.calls[0]![1] as FormData;
    expect(formData.get("applicationId")).toBe("app_ABC123");
    expect(formData.get("disabled")).toBe("true");
    expect(formData.get("ownerId")).toBeNull();
  });

  it("does nothing at all when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    render(<ApplicationStatusSetting applicationId="app_ABC123" name="Acme" disabled={false} />);

    await user.click(screen.getByRole("switch"));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(actions.setApplicationDisabledAction).not.toHaveBeenCalled();
  });
});

describe("ApplicationStatusSetting — turning it back on", () => {
  it("restores service on the click, with nothing to confirm", async () => {
    const user = userEvent.setup();
    render(<ApplicationStatusSetting applicationId="app_ABC123" name="Acme" disabled />);

    await user.click(screen.getByRole("switch"));

    await waitFor(() => expect(actions.setApplicationDisabledAction).toHaveBeenCalled());
    const formData = actions.setApplicationDisabledAction.mock.calls[0]![1] as FormData;
    expect(formData.get("applicationId")).toBe("app_ABC123");
    expect(formData.get("disabled")).toBe("false");
  });

  it("reports the result rather than staying silent", async () => {
    actions.setApplicationDisabledAction.mockResolvedValue(
      actionSuccess("Application enabled. License checks will succeed again.", null),
    );
    const user = userEvent.setup();
    render(<ApplicationStatusSetting applicationId="app_ABC123" name="Acme" disabled />);

    await user.click(screen.getByRole("switch"));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Application enabled. License checks will succeed again.",
      ),
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/components/application-status-setting.test.tsx --project dom
```

Expected: FAIL — the `name` prop does not exist, the markup nests two buttons, and there is no confirmation.

- [ ] **Step 3: Rebuild the component**

Replace the entire contents of `src/components/applications/application-status-setting.tsx`:

```tsx
"use client";

import { useActionState, useRef, useState } from "react";
import { setApplicationDisabledAction } from "@/app/dashboard/applications/actions";
import { useActionFeedback } from "@/components/dashboard/feedback";
import { SettingRow, SettingSection } from "@/components/settings/setting-row";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { idleAction } from "@/lib/actions/state";

/**
 * The application kill switch, as a setting rather than a menu item.
 *
 * The same action backs the entry in the actions menu; this is the version you
 * find when you go looking for it, which is where a developer expects to turn
 * something off deliberately rather than in passing.
 *
 * Alpha_v3 built this as a submit `Button` wrapping a `Switch`. Radix's Switch
 * root is itself a `<button>`, so that markup put a button inside a button —
 * and a browser's parser resolves that by closing the outer one and ejecting
 * the switch to be its sibling. Server-rendered, the row arrived as an empty
 * zero-sized button beside a switch carrying `pointer-events-none`, and React
 * then hydrated a tree that did not match the one it had sent. The switch is
 * now the only control in the row and owns its own interaction, which is what
 * a switch is for.
 */
export function ApplicationStatusSetting({
  applicationId,
  name,
  disabled,
}: {
  applicationId: string;
  name: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(setApplicationDisabledAction, idleAction());
  const [confirming, setConfirming] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  useActionFeedback(state, { onSuccess: () => setConfirming(false) });

  return (
    <SettingSection title="Status">
      <SettingRow
        label={disabled ? "Disabled" : "Accepting license checks"}
        hint={
          disabled
            ? "Every verification is rejected with APPLICATION_DISABLED. No license was changed."
            : "Turning this off rejects every license check for this application until you turn it back on."
        }
      >
        <form ref={form} action={action}>
          <input type="hidden" name="applicationId" value={applicationId} />
          <input type="hidden" name="disabled" value={disabled ? "false" : "true"} />
          {/* Controlled by the server's answer, not by the click. A switch
              that moved on click would claim the change had happened before
              the action had run — and would be lying outright while the
              confirmation below is still open. */}
          <Switch
            checked={!disabled}
            disabled={pending}
            aria-label={disabled ? "Enable application" : "Disable application"}
            onCheckedChange={() => {
              // Off is the consequential direction: it takes licensing offline
              // for every customer of this application at once, from one
              // click. On restores service and has nothing to warn about.
              if (disabled) form.current?.requestSubmit();
              else setConfirming(true);
            }}
          />
        </form>
      </SettingRow>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every license check for this application will be rejected with
              APPLICATION_DISABLED until you turn it back on. Nothing is destroyed: no
              license is revoked, no activation is released, and enabling it restores
              exactly the state that is there now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {/* Submits the form above, which is outside this dialog — so the
                dialog closing cannot take the submission with it. */}
            <AlertDialogAction
              variant="destructive"
              onClick={() => form.current?.requestSubmit()}
            >
              Disable application
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingSection>
  );
}
```

- [ ] **Step 4: Pass the name from the settings page**

In `src/app/dashboard/applications/[applicationId]/settings/page.tsx`, replace:

```tsx
      <ApplicationStatusSetting
        applicationId={application.id}
        disabled={application.disabledAt !== null}
      />
```

with:

```tsx
      <ApplicationStatusSetting
        applicationId={application.id}
        name={application.name}
        disabled={application.disabledAt !== null}
      />
```

- [ ] **Step 5: Run the test and watch it pass**

```bash
npx vitest run tests/components/application-status-setting.test.tsx --project dom
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/applications/application-status-setting.tsx src/app/dashboard/applications/[applicationId]/settings/page.tsx tests/components/application-status-setting.test.tsx
git commit -m "fix: rebuild the kill switch on markup a parser will keep"
```

---

## Task 8: One status form, and an honest failure

**Files:**
- Modify: `src/components/applications/application-actions.tsx`
- Modify: `src/app/dashboard/applications/actions.ts:91,119`
- Create: `tests/components/application-actions.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/application-actions.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApplicationActions } from "@/components/applications/application-actions";
import { actionFailure, actionSuccess } from "@/lib/actions/state";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const actions = vi.hoisted(() => ({
  createApplicationAction: vi.fn(),
  deleteApplicationAction: vi.fn(),
  renameApplicationAction: vi.fn(),
  setApplicationDisabledAction: vi.fn(),
}));
vi.mock("@/app/dashboard/applications/actions", () => actions);

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
  for (const action of Object.values(actions)) {
    action.mockReset();
    action.mockResolvedValue(actionSuccess("Done.", null));
  }
});

function openMenu(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole("button", { name: "Actions for Acme" }));
}

describe("ApplicationActions — the status entry", () => {
  it("offers Disable for a live application", async () => {
    const user = userEvent.setup();
    render(<ApplicationActions applicationId="app_ABC123" name="Acme" disabled={false} />);
    await openMenu(user);

    expect(await screen.findByText("Disable")).toBeTruthy();
    expect(screen.queryByText("Enable")).toBeNull();
  });

  it("offers Enable for a disabled application", async () => {
    // The state a developer reaches this menu to get out of.
    const user = userEvent.setup();
    render(<ApplicationActions applicationId="app_ABC123" name="Acme" disabled />);
    await openMenu(user);

    expect(await screen.findByText("Enable")).toBeTruthy();
    expect(screen.queryByText("Disable")).toBeNull();
  });

  it("asks before disabling", async () => {
    const user = userEvent.setup();
    render(<ApplicationActions applicationId="app_ABC123" name="Acme" disabled={false} />);
    await openMenu(user);
    await user.click(await screen.findByText("Disable"));

    expect(await screen.findByText(/Disable Acme\?/)).toBeTruthy();
    expect(actions.setApplicationDisabledAction).not.toHaveBeenCalled();
  });

  it("submits the id and the intended end state once confirmed", async () => {
    const user = userEvent.setup();
    render(<ApplicationActions applicationId="app_ABC123" name="Acme" disabled={false} />);
    await openMenu(user);
    await user.click(await screen.findByText("Disable"));
    await user.click(await screen.findByRole("button", { name: "Disable application" }));

    await waitFor(() => expect(actions.setApplicationDisabledAction).toHaveBeenCalled());
    const formData = actions.setApplicationDisabledAction.mock.calls[0]![1] as FormData;
    expect(formData.get("applicationId")).toBe("app_ABC123");
    expect(formData.get("disabled")).toBe("true");
    expect(formData.get("ownerId")).toBeNull();
  });

  it("enables on the click, with nothing to confirm", async () => {
    const user = userEvent.setup();
    render(<ApplicationActions applicationId="app_ABC123" name="Acme" disabled />);
    await openMenu(user);
    await user.click(await screen.findByText("Enable"));

    await waitFor(() => expect(actions.setApplicationDisabledAction).toHaveBeenCalled());
    const formData = actions.setApplicationDisabledAction.mock.calls[0]![1] as FormData;
    expect(formData.get("applicationId")).toBe("app_ABC123");
    expect(formData.get("disabled")).toBe("false");
  });

  it("surfaces a failure rather than swallowing it", async () => {
    actions.setApplicationDisabledAction.mockResolvedValue(
      actionFailure("That submission arrived without an application. Reload and try again."),
    );
    const user = userEvent.setup();
    render(<ApplicationActions applicationId="app_ABC123" name="Acme" disabled />);
    await openMenu(user);
    await user.click(await screen.findByText("Enable"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "That submission arrived without an application. Reload and try again.",
      ),
    );
  });
});

describe("ApplicationActions — the destructive entry is unchanged", () => {
  it("keeps the delete button disabled until the name is typed exactly", async () => {
    const user = userEvent.setup();
    render(<ApplicationActions applicationId="app_ABC123" name="Acme" disabled={false} />);
    await openMenu(user);
    await user.click(await screen.findByText("Delete application"));

    const confirm = screen.getByRole("button", { name: "Delete application" });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    await user.type(screen.getByLabelText(/type/i), "Acme");
    expect(confirm.hasAttribute("disabled")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/components/application-actions.test.tsx --project dom
```

Expected: FAIL — Disable currently submits immediately, so there is no `Disable Acme?` to find.

- [ ] **Step 3: Move the status form out of the menu**

In `src/components/applications/application-actions.tsx`:

Add `useRef` to the React import and add the alert-dialog import:

```tsx
import { useActionState, useRef, useState } from "react";
```

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
```

Add the state and the ref beside the existing ones:

```tsx
  const [disabling, setDisabling] = useState(false);
  const statusForm = useRef<HTMLFormElement>(null);
```

Take the pending flag from the status action:

```tsx
  const [statusState, statusAction, statusPending] = useActionState(
    setApplicationDisabledAction,
    INITIAL,
  );
```

and give its feedback a handler that closes the confirmation:

```tsx
  useActionFeedback(statusState, { onSuccess: () => setDisabling(false) });
```

Replace the in-menu form:

```tsx
          {/* A form rather than an onSelect handler: the menu item posts the
              intended end state, so two tabs open on the same application
              cannot race to opposite answers. */}
          <form action={statusAction}>
            <input type="hidden" name="applicationId" value={applicationId} />
            <input type="hidden" name="disabled" value={disabled ? "false" : "true"} />
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                {disabled ? <Power className="size-4" /> : <PowerOff className="size-4" />}
                {disabled ? "Enable" : "Disable"}
              </button>
            </DropdownMenuItem>
          </form>
```

with a plain menu item that drives the form declared outside the menu:

```tsx
          <DropdownMenuItem
            disabled={statusPending}
            onSelect={() => {
              // Off asks first; on restores service and does not. Submitting a
              // form that lives outside this menu, so the menu closing on
              // select cannot take the submission down with it.
              if (disabled) statusForm.current?.requestSubmit();
              else setDisabling(true);
            }}
          >
            {disabled ? <Power className="size-4" /> : <PowerOff className="size-4" />}
            {disabled ? "Enable" : "Disable"}
          </DropdownMenuItem>
```

Then, immediately after the closing `</DropdownMenu>` tag, add the form and the confirmation:

```tsx
      {/* The end state is posted rather than a toggle instruction, so two tabs
          open on the same application cannot race to opposite answers. */}
      <form ref={statusForm} action={statusAction} className="hidden">
        <input type="hidden" name="applicationId" value={applicationId} />
        <input type="hidden" name="disabled" value={disabled ? "false" : "true"} />
      </form>

      <AlertDialog open={disabling} onOpenChange={setDisabling}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every license check for this application will be rejected with
              APPLICATION_DISABLED until you turn it back on. Nothing is destroyed: no
              license is revoked, no activation is released, and enabling it restores
              exactly the state that is there now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => statusForm.current?.requestSubmit()}
            >
              Disable application
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

- [ ] **Step 4: Make the failure message honest**

In `src/app/dashboard/applications/actions.ts`, both occurrences of:

```ts
  if (!parsed.success) return actionFailure("That application is no longer available.");
```

become:

```ts
  // Reachable only when the form arrived without a well-formed application id,
  // which is a bug in the page rather than a missing application. Saying "no
  // longer available" sent the reader to look for a deletion that never
  // happened.
  if (!parsed.success) {
    return actionFailure("That submission arrived without an application. Reload and try again.");
  }
```

There are two: line 91 in `deleteApplicationAction` and line 119 in `setApplicationDisabledAction`. Both change. The genuine "not found or not yours" case is untouched — it arrives through `notFound("Application")` and `safeErrorMessage`, and already says the right thing.

- [ ] **Step 5: Run the test and watch it pass**

```bash
npx vitest run tests/components/application-actions.test.tsx --project dom
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/applications/application-actions.tsx src/app/dashboard/applications/actions.ts tests/components/application-actions.test.tsx
git commit -m "fix: confirm before disabling, and stop blaming a missing application"
```

---

## Task 9: Verify against the running app, then document

**Files:**
- Modify: `README.md`
- Modify: `PROGRESS.md`
- Modify: `docs/alpha-v3.md`

- [ ] **Step 1: Run everything**

```bash
npm run test && npm run typecheck && npm run lint
```

Expected: every suite passing, both other commands silent. Read the output. Do not proceed on the absence of a reason to doubt it.

- [ ] **Step 2: Check the middleware and the chooser in the browser**

Task 2 has no unit test, and Tasks 5 and 6 changed server components that none of the suites render. This step is where they are actually verified. The dev server may already be running on port 3000 — check before starting another.

Sign in, then confirm, in order:

1. On `/dashboard`, the chooser names an application rather than "All applications".
2. Open an application, return to `/dashboard`, and confirm the chooser still names the one you opened — this is the cookie, and it is the only proof middleware wrote it.
3. On `/dashboard/applications`, the row for that application is marked Current.
4. Clicking an application row on `/dashboard` and on `/dashboard/applications` navigates nowhere.
5. The chooser has no "All applications" entry.
6. Disable an application from its Settings tab: the confirmation appears, the switch does not move until the action returns, and the toast confirms it.
7. That application now reads Disabled in the applications table, and the chooser shows its `⏻` mark.
8. Enable it again from the row menu in the table — one click, no confirmation.

Any failure here is a defect in the task that introduced it. Fix it there, with its test, rather than patching over it in this task.

- [ ] **Step 3: Record it**

In `README.md`, under the dashboard description, add:

```markdown
### Choosing an application

The dashboard always has exactly one application in scope, and the chooser in the
header is the only control that changes it. Overview and Applications report on
every application you own; neither is a way into one.

Which application is current resolves in three steps: the URL when it names one,
then the `keyren_app` cookie, then your newest application. The cookie is written
by middleware whenever a URL names an application, and is a hint about the
interface only — it is resolved against your own applications before it is used,
so a stale or hand-edited value selects nothing.
```

In `docs/alpha-v3.md`, append:

```markdown
## Application scope

The dashboard now has exactly one application in scope at all times, and the
header chooser is the only control that changes it. "All applications" is gone —
it was the one entry meaning "no application in scope", and there is no such
state left. Overview and Applications keep existing and stop being ways in:
their rows report, and nothing in them navigates into an application.

Which application is current resolves in three steps — the URL when it names
one, then the `keyren_app` cookie, then the newest application — and the split
is deliberate. The URL half is applied in the client components, because
`usePathname()` is theirs and a server layout has no pathname. The rest is
resolved server-side and handed down. Middleware writes the cookie whenever a
URL names an application, which is the one place that sees every route in:
chooser, command palette, bookmark, and the redirect after creating one.

The cookie is a hint about the interface and never an authorization input. It is
resolved against the developer's own applications — already scoped by
`owner_id` in SQL — before it is used, so a stale, hand-edited, or
someone-else's value matches nothing and falls through to the default.

The applications table also gained a Status column. A disabled application was
badged in the application header and on the overview, and badged nowhere in the
one table that lists every application at once.

## The kill switch was built on invalid HTML

`ApplicationStatusSetting` rendered a submit `Button` wrapping a `Switch`.
Radix's `Switch` root is itself a `<button>`, so the markup nested one button
inside another, and the HTML parser resolves that by closing the outer one:
server-rendered, the row arrived as an empty zero-sized submit button beside a
switch that had been ejected to be its sibling and carried `pointer-events-none`.
React then hydrated a tree that did not match the one it had sent.

A component test could not see this, which is why it survived a release. The
client-rendered tree was never the broken one — `appendChild` has no such parser
rule and nests the two happily. Verified by handing the exact markup to a real
browser's parser and reading back the result. The regression guard therefore
asserts on `renderToStaticMarkup` output rather than on a rendered DOM.

Disabling now asks first, from both the settings row and the row menu. One click
took licensing offline for every customer of that application at once.
```

In `PROGRESS.md`, append to the "Environment facts" section:

```markdown
### Radix primitives that render a `<button>` may not be nested

`Switch`, `AlertDialogAction`, `AlertDialogCancel`, `DropdownMenuTrigger` and
`Button` each render a `<button>`. Nesting any of them inside another produces
invalid HTML, and the browser's parser resolves it by closing the outer element
and re-parenting the inner one as a sibling — so the server-rendered DOM does
not match what React sent, and hydration recovers a tree the markup never had.

Only server-rendered markup shows the damage. A component test renders through
`appendChild`, which has no such rule and nests the two happily, so this class of
defect passes every test that renders and clicks. Assert on
`renderToStaticMarkup` output when a control could plausibly be nesting one.

To attach a form submission to a Radix control, give the form a ref and call
`requestSubmit()` from the control's own handler. The form then lives outside
any menu or dialog that closes on select, so closing cannot take the submission
with it.
```

- [ ] **Step 4: Commit**

```bash
git add README.md PROGRESS.md docs/alpha-v3.md
git commit -m "docs: record the application scope model and the nested-button defect"
```

---

## Acceptance

Every item in §8 of the spec, checked against the running app in Task 9 Step 2, plus:

- `npm run test`, `npm run typecheck`, `npm run lint` all pass.
- No `any`, no `@ts-expect-error`, no `eslint-disable`, no skipped test.
- No schema change, no migration, no change to `POST /api/v1/licenses/verify`.
- No new dependency.
