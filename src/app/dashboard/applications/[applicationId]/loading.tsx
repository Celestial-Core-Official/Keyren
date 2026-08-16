import { Skeleton } from "@/components/dashboard/empty-state";

/** Shaped like the application overview, so nothing jumps when it arrives. */
export default function ApplicationOverviewLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading application">
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-border p-6">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-lg border border-border p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-2/3" />
      </div>

      <div className="space-y-3 rounded-lg border border-border p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    </div>
  );
}
