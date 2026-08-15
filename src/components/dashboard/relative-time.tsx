import { formatExactUtc, formatRelative } from "@/lib/format/date";
import { cn } from "@/lib/utils";

/**
 * A relative label with the exact UTC timestamp behind it.
 *
 * Deliberately a server component. Computing "3 days ago" on both the server
 * and the client is the classic hydration mismatch, and the usual fix — render
 * nothing until mounted — makes the column flash empty on every navigation.
 * Rendered once on the server it is stable, and at the granularity anyone
 * reads a licensing dashboard, a label that does not tick is not a loss.
 *
 * `<time>` with a machine-readable `dateTime` means the precise value is
 * available to anything parsing the page, not only to a hovering mouse.
 */
export function RelativeTime({
  value,
  className,
  fallback = "—",
}: {
  value: Date | null;
  className?: string;
  fallback?: string;
}) {
  if (!value) {
    return <span className={cn("text-muted-foreground", className)}>{fallback}</span>;
  }

  return (
    <time
      dateTime={value.toISOString()}
      title={formatExactUtc(value)}
      className={cn("whitespace-nowrap", className)}
    >
      {formatRelative(value)}
    </time>
  );
}

/** A calendar day, with the exact instant available on hover. */
export function DayStamp({
  value,
  className,
  fallback = "Never",
}: {
  value: Date | null;
  className?: string;
  fallback?: string;
}) {
  if (!value) {
    return <span className={cn("text-muted-foreground", className)}>{fallback}</span>;
  }

  return (
    <time
      dateTime={value.toISOString()}
      title={formatExactUtc(value)}
      className={cn("whitespace-nowrap", className)}
    >
      {new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(value)}
    </time>
  );
}
