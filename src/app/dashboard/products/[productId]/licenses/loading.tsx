import { Skeleton } from "@/components/dashboard/empty-state";

/**
 * Shaped like the licenses view rather than a generic spinner, so the page
 * does not visibly reflow when the real rows arrive.
 */
export default function LicensesLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading licenses">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-8 w-36" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-full sm:w-64" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="space-y-px rounded-lg border border-border p-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-4 py-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
            <Skeleton className="hidden h-5 w-16 sm:block" />
            <Skeleton className="hidden h-4 w-20 md:block" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
