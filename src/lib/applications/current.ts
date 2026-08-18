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
  // A present-but-empty cookie cannot name anything either, so it is treated
  // as no cookie at all rather than sent into a lookup that could only fail.
  if (cookieValue) {
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
