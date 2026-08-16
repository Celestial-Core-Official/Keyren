"use client";

import { X } from "lucide-react";
import { useQueryParams } from "@/components/dashboard/use-query-params";
import { Button } from "@/components/ui/button";

/**
 * Resets the filters without touching anything else in the URL.
 *
 * A link to the bare pathname would also throw away the page size the
 * developer chose, which is a preference rather than a filter.
 */
export function ClearFiltersLink() {
  const { setParams } = useQueryParams();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="gap-1.5"
      onClick={() =>
        setParams({ q: null, status: null, activation: null, lock: null, page: null })
      }
    >
      <X className="size-4" />
      Clear filters
    </Button>
  );
}
