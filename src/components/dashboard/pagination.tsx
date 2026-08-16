"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQueryParams } from "@/components/dashboard/use-query-params";
import { Button } from "@/components/ui/button";
import { PAGE_SIZES, type PageSize } from "@/lib/licenses/types";

/**
 * Page controls, plus the count that tells the developer whether paging is
 * even worth doing.
 *
 * Deliberately previous/next and a position readout rather than a numbered
 * strip: a developer with 4,000 licenses has no use for page 87 as a
 * destination, and the search and filters above are the real way to find
 * something.
 */
export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  shown,
}: {
  page: number;
  pageCount: number;
  pageSize: PageSize;
  total: number;
  shown: number;
}) {
  const { setParams } = useQueryParams();

  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = total === 0 ? 0 : first + shown - 1;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total === 0 ? (
          "No licenses"
        ) : (
          <>
            Showing <span className="tabular-nums text-foreground">{first}</span>–
            <span className="tabular-nums text-foreground">{last}</span> of{" "}
            <span className="tabular-nums text-foreground">{total}</span>
          </>
        )}
      </p>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="hidden sm:inline">Per page</span>
          <select
            value={pageSize}
            // Back to page one: page 4 of a 25-per-page list frequently does
            // not exist at 100 per page, and landing on an empty page reads
            // as data loss.
            onChange={(event) => setParams({ pageSize: event.target.value, page: null })}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            aria-label="Licenses per page"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            disabled={page <= 1}
            onClick={() => setParams({ page: page - 1 <= 1 ? null : page - 1 })}
          >
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">Previous</span>
          </Button>

          <span className="px-1 text-sm whitespace-nowrap text-muted-foreground tabular-nums">
            {page} / {pageCount}
          </span>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            disabled={page >= pageCount}
            onClick={() => setParams({ page: page + 1 })}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
