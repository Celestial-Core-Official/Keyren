"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useQueryParams } from "@/components/dashboard/use-query-params";
import { Input } from "@/components/ui/input";
import {
  APPLICATION_SORTS,
  APPLICATION_SORT_LABELS,
  type ApplicationQuery,
} from "@/lib/applications/types";
import { SEARCH_MAX_LENGTH } from "@/lib/licenses/types";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Search and sort for the applications list.
 *
 * Application ID is searchable alongside name and slug, because the ID is what a
 * developer usually has in front of them — pasted from a stack trace, a
 * support ticket, or their own config — far more often than the name they
 * chose months ago.
 */
export function ApplicationFilters({
  query,
  total,
}: {
  query: ApplicationQuery;
  total: number;
}) {
  const { setParams } = useQueryParams();

  const [lastQueryFromUrl, setLastQueryFromUrl] = useState(query.q);
  const [term, setTerm] = useState(query.q);

  if (query.q !== lastQueryFromUrl) {
    setLastQueryFromUrl(query.q);
    setTerm(query.q);
  }

  useEffect(() => {
    if (term === query.q) return;
    const timer = setTimeout(
      () => setParams({ q: term.trim() || null }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [term, query.q, setParams]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={term}
          maxLength={SEARCH_MAX_LENGTH}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search name, slug or application ID…"
          aria-label="Search applications"
          data-keyren-search="true"
          className="pl-8"
        />
      </div>

      <select
        value={query.sort}
        aria-label="Sort applications"
        onChange={(event) =>
          setParams({ sort: event.target.value === "newest" ? null : event.target.value })
        }
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        {APPLICATION_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {APPLICATION_SORT_LABELS[sort]}
          </option>
        ))}
      </select>

      {query.q !== "" ? (
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {total === 1 ? "1 application matches" : `${total} applications match`}
        </span>
      ) : null}
    </div>
  );
}
