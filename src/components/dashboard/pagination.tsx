"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQueryParams } from "@/components/dashboard/use-query-params";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      {/* `21–40 of 142`, with an en dash and without "Showing". The verb was
          doing no work: a readout beneath a list is self-evidently describing
          the list. */}
      <p className="text-sm text-fg-tertiary" aria-live="polite">
        {total === 0 ? (
          "No licenses"
        ) : (
          <>
            <span className="tabular-nums text-foreground">{first}</span>–
            <span className="tabular-nums text-foreground">{last}</span> of{" "}
            <span className="tabular-nums text-foreground">{total}</span>
          </>
        )}
      </p>

      <div className="flex items-center gap-3">
        {/* A <label> cannot label a Radix trigger — the trigger is a button,
            which is not a labelable element — so the visible words are a plain
            caption and the accessible name lives on the trigger itself, where
            it is also there for the viewport that hides the caption. */}
        <div className="flex items-center gap-2 text-sm text-fg-tertiary">
          <span aria-hidden="true" className="hidden sm:inline">
            Per page
          </span>
          <Select
            value={String(pageSize)}
            // Back to page one: page 4 of a 25-per-page list frequently does
            // not exist at 100 per page, and landing on an empty page reads
            // as data loss.
            onValueChange={(next) => setParams({ pageSize: next, page: null })}
          >
            <SelectTrigger aria-label="Licenses per page" className="tabular-nums">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)} className="tabular-nums">
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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

          {/* `Page 2 of 7`, not `2 / 7`: a bare fraction beside two arrows
              reads as a ratio until you work out that it is not one. */}
          <span className="px-1 text-sm whitespace-nowrap text-fg-tertiary tabular-nums">
            Page {page} of {pageCount}
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
