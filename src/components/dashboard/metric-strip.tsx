import { cn } from "@/lib/utils";

export type Metric = {
  label: string;
  value: string | number;
  /** A ratio, share or comparison. A bare count does not get one. */
  detail?: string;
  tone?: "default" | "warning";
};

/**
 * One rail instead of a grid of cards.
 *
 * A number earns a card when it carries a denominator or a comparison, and an
 * application count carries neither — `Applications 3` set in a 30px numeral
 * inside a bordered box applies the visual weight of a KPI to a fact. Five
 * such boxes, identically sized and identically weighted, say that nothing on
 * the page was prioritised.
 *
 * This costs ~58px for what the tile grid spent ~340px on, and it puts the
 * numbers where they belong: as a reference rail above the thing the page is
 * actually about.
 *
 * Nothing here renders a delta. The schema stores no time series, so a
 * "+12.5% from last month" under any of these numbers would be invented, and
 * an invented number is worse than a missing one.
 */
export function MetricStrip({
  metrics,
  className,
}: {
  metrics: Metric[];
  className?: string;
}) {
  // With an odd number of cells the two-column layout leaves a hole, and the
  // hole would paint as a solid block of the hairline colour rather than as
  // nothing. The last cell takes the whole row instead.
  const lastFillsRow = metrics.length % 2 === 1;

  return (
    <dl
      className={cn(
        // The rules between cells are a 1px gap over the container's own
        // colour rather than per-cell borders. One mechanism then serves both
        // the two-column grid and the single flex row, with no doubled line
        // where a cell's border would meet the container's and no orphaned
        // rule after the last cell.
        "grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:flex",
        className,
      )}
    >
      {metrics.map((metric, index) => (
        <div
          key={metric.label}
          className={cn(
            "min-w-0 flex-1 bg-background px-4 py-3",
            lastFillsRow && index === metrics.length - 1 && "col-span-2 sm:col-span-1",
          )}
        >
          <dt className="truncate text-[11px] leading-none font-medium tracking-[var(--tracking-label)] text-fg-quaternary uppercase">
            {metric.label}
          </dt>
          <dd className="mt-1.5 flex items-baseline gap-1.5 leading-none">
            <span
              className={cn(
                // 18px, not 30px. Display type on a value that fits in a table
                // cell is the loudest thing on the page saying nobody looked
                // at it.
                "text-lg font-semibold tabular-nums",
                metric.tone === "warning" && "text-warning",
              )}
            >
              {metric.value}
            </span>
            {metric.detail ? (
              <span className="truncate text-[13px] tabular-nums text-fg-tertiary">
                {metric.detail}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A share of a whole, formatted for a metric's `detail`, or nothing.
 *
 * `Active 128 (90%)` is a real ratio: the denominator is on the same rail, two
 * cells to the left. `(0%)` against no licences at all is not — there is no
 * whole to be a share of — so an empty denominator returns undefined and the
 * value stands on its own.
 */
export function share(part: number, whole: number): string | undefined {
  if (whole <= 0) return undefined;
  return `(${Math.round((part / whole) * 100)}%)`;
}
