"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useQueryParams } from "@/components/dashboard/use-query-params";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ACTIVATION_FILTERS,
  ACTIVATION_FILTER_LABELS,
  LICENSE_SORTS,
  LICENSE_SORT_LABELS,
  LICENSE_STATUS_FILTERS,
  LICENSE_STATUS_FILTER_LABELS,
  LOCK_FILTERS,
  LOCK_FILTER_LABELS,
  SEARCH_MAX_LENGTH,
  isFiltered,
  type LicenseQuery,
} from "@/lib/licenses/types";

const SEARCH_DEBOUNCE_MS = 300;

function FilterSelect<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.value as T)}
      className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels[option]}
        </option>
      ))}
    </select>
  );
}

export function LicenseFilters({
  query,
  total,
}: {
  query: LicenseQuery;
  total: number;
}) {
  const { setParams } = useQueryParams();
  const searchId = useId();

  // The input is local so typing stays instant, and the URL catches up on a
  // debounce. Adjusted during render rather than in an effect when the URL
  // moves underneath us — a back navigation or a cleared filter — which is
  // React's documented way to reset state from a prop without an extra
  // commit.
  const [lastQueryFromUrl, setLastQueryFromUrl] = useState(query.q);
  const [term, setTerm] = useState(query.q);

  if (query.q !== lastQueryFromUrl) {
    setLastQueryFromUrl(query.q);
    setTerm(query.q);
  }

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (term === query.q) return;

    // Any filter change also returns to page one: page 4 of the old result
    // set is rarely page 4 of the new one, and landing on an empty page reads
    // as data loss.
    const timer = setTimeout(
      () => setParams({ q: term.trim() || null, page: null }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [term, query.q, setParams]);

  const filtered = isFiltered(query);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={searchId}
            ref={inputRef}
            type="search"
            value={term}
            maxLength={SEARCH_MAX_LENGTH}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search labels, notes, last 4…"
            aria-label="Search licenses"
            // Picked up by the "/" shortcut, which focuses whichever search
            // input the current page has rather than hardcoding one.
            data-keyren-search="true"
            className="pl-8"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Filter by status"
            value={query.status}
            options={LICENSE_STATUS_FILTERS}
            labels={LICENSE_STATUS_FILTER_LABELS}
            onChange={(value) => setParams({ status: value === "all" ? null : value, page: null })}
          />
          <FilterSelect
            label="Filter by activation"
            value={query.activation}
            options={ACTIVATION_FILTERS}
            labels={ACTIVATION_FILTER_LABELS}
            onChange={(value) =>
              setParams({ activation: value === "all" ? null : value, page: null })
            }
          />
          <FilterSelect
            label="Filter by device lock"
            value={query.lock}
            options={LOCK_FILTERS}
            labels={LOCK_FILTER_LABELS}
            onChange={(value) => setParams({ lock: value === "all" ? null : value, page: null })}
          />
          <FilterSelect
            label="Sort licenses"
            value={query.sort}
            options={LICENSE_SORTS}
            labels={LICENSE_SORT_LABELS}
            onChange={(value) => setParams({ sort: value === "newest" ? null : value, page: null })}
          />
        </div>
      </div>

      {filtered ? (
        <div
          role="group"
          aria-label="Active filters"
          className="flex flex-wrap items-center gap-2 text-sm"
        >
          <span className="text-muted-foreground" aria-live="polite">
            {total === 1 ? "1 license matches" : `${total} licenses match`}
          </span>

          {query.q !== "" ? <Chip label={`“${query.q}”`} /> : null}
          {query.status !== "all" ? (
            <Chip label={LICENSE_STATUS_FILTER_LABELS[query.status]} />
          ) : null}
          {query.activation !== "all" ? (
            <Chip label={ACTIVATION_FILTER_LABELS[query.activation]} />
          ) : null}
          {query.lock !== "all" ? <Chip label={LOCK_FILTER_LABELS[query.lock]} /> : null}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              setParams({ q: null, status: null, activation: null, lock: null, page: null });
              setTerm("");
              inputRef.current?.focus();
            }}
          >
            <X className="size-3.5" />
            Clear filters
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
      {label}
    </span>
  );
}
