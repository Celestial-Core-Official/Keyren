"use client";

import { useEffect } from "react";
import { useQueryParams } from "@/components/dashboard/use-query-params";
import { useDisplayPreferences } from "@/lib/use-preferences";
import type { PageSize } from "@/lib/licenses/types";

/**
 * Applies the developer's default page size to a list that did not ask for one.
 *
 * Settings offers a default page size, but the licenses list is paged in SQL on
 * the server and the preference lives in `localStorage`, which the server
 * cannot see — so without this the control wrote a value nothing ever read, and
 * a developer who chose 100 still got 25.
 *
 * The default is applied by writing it into the URL rather than by rendering a
 * different number of rows behind the address bar's back. The URL is this
 * dashboard's store: a view that shows 100 licenses should say so, stay that
 * way when bookmarked or shared, and keep the page controls agreeing with what
 * is on screen.
 *
 * Rendered only when the URL carries no explicit `pageSize`, which is also what
 * makes this terminate: the replace adds one, so the page stops rendering this
 * component. An explicit `?pageSize=` in a shared link always wins over a
 * personal default.
 */
export function ApplyPageSizePreference({ current }: { current: PageSize }) {
  const { setParams } = useQueryParams();
  const { pageSize } = useDisplayPreferences();

  useEffect(() => {
    if (pageSize === current) return;

    // Back to page one: page 4 of a 25-per-page list frequently does not exist
    // at 100 per page, and landing on an empty page reads as data loss.
    setParams({ pageSize, page: null });
  }, [pageSize, current, setParams]);

  return null;
}
