"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toQueryString } from "@/lib/url-params";

/**
 * Writes filter state into the URL.
 *
 * The URL is the store, not React state. That is what makes a filtered view
 * bookmarkable, shareable, survivable across a refresh, and correct when the
 * back button is pressed — and it is why the server can render the right rows
 * on the first paint instead of shipping everything and narrowing it later.
 *
 * `replace` rather than `push`: adjusting a filter is refining one view, not
 * navigating to a new one, and pushing would make Back walk backwards through
 * every keystroke of a search term.
 */
export function useQueryParams(): {
  params: URLSearchParams;
  setParams: (updates: Record<string, string | number | null>) => void;
  hrefWith: (updates: Record<string, string | number | null>) => string;
} {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const hrefWith = useCallback(
    (updates: Record<string, string | number | null>) =>
      `${pathname}${toQueryString(params, updates)}`,
    [pathname, params],
  );

  const setParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      router.replace(hrefWith(updates), { scroll: false });
    },
    [router, hrefWith],
  );

  return { params, setParams, hrefWith };
}
