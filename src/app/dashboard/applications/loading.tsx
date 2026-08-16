import { Skeleton } from "@/components/dashboard/empty-state";

/** Shaped like the applications list, so the layout does not shift on arrival. */
export default function ApplicationsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading applications">
      <div className="flex items-start justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-full sm:w-64" />
        <Skeleton className="h-9 w-36" />
      </div>

      <div className="space-y-px rounded-lg border border-border p-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-center gap-4 py-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="hidden h-5 w-48 sm:block" />
            <Skeleton className="h-8 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}
