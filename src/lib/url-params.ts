/**
 * Merges updates into an existing query string.
 *
 * The whole point is that unrelated parameters survive. A developer who has
 * filtered to revoked licenses, sorted by expiry and moved to page three
 * should be able to type in the search box without silently losing the other
 * three choices — which is what building a fresh `URLSearchParams` from
 * scratch on every control would do.
 *
 * `null` removes a parameter rather than writing an empty one, so a cleared
 * filter leaves a clean URL instead of `?q=&status=`.
 */
export function mergeSearchParams(
  current: URLSearchParams | string,
  updates: Record<string, string | number | null>,
): string {
  const params = new URLSearchParams(
    typeof current === "string" ? current : current.toString(),
  );

  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") params.delete(key);
    else params.set(key, String(value));
  }

  // Sorted so the same set of choices always produces the same URL, which
  // makes a bookmarked view and a shared link byte-identical.
  params.sort();

  return params.toString();
}

/** `?a=1&b=2`, or the bare path when nothing is set. */
export function toQueryString(
  current: URLSearchParams | string,
  updates: Record<string, string | number | null>,
): string {
  const merged = mergeSearchParams(current, updates);
  return merged === "" ? "" : `?${merged}`;
}
