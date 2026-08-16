"use client";

import {
  formatDayUtc,
  formatExactLocal,
  formatExactUtc,
  formatRelative,
} from "@/lib/format/date";
import { useDisplayPreferences } from "@/lib/use-preferences";
import { cn } from "@/lib/utils";

/**
 * A relative label with the exact UTC timestamp behind it.
 *
 * This was written as a server component, on the reasoning that computing
 * "3 days ago" on both the server and the client is the classic hydration
 * mismatch. That only held while every caller was a server component, and it
 * no longer is: `license-table.tsx` and `license-card-list.tsx` are both
 * `"use client"`, which pulls this into the client bundle and runs
 * `formatRelative` a second time at hydration, against a later `now`.
 *
 * Whenever those two calls land either side of a bucket boundary — most often
 * "just now" into "1 minute ago", the labels a freshly issued license wears —
 * the text differs, React discards the server HTML for the whole root and
 * re-renders it on the client. That is worth naming, because the visible
 * symptom is nowhere near here: re-rendering the root recreates next-themes'
 * inline theme <script>, and React's warning about it points at
 * `theme-provider.tsx`, which is not involved.
 *
 * `suppressHydrationWarning` covers exactly one element's text and is the
 * sanctioned answer for timestamps. React then keeps the server's label, which
 * is the behaviour this component always wanted — at the granularity anyone
 * reads a licensing dashboard, a label that does not tick is not a loss.
 *
 * `<time>` with a machine-readable `dateTime` means the precise value is
 * available to anything parsing the page, not only to a hovering mouse.
 *
 * The local line is opt-in, from Settings. It is read through the preference
 * store rather than at render, so the server renders the UTC-only title, the
 * first client render agrees with it, and the local line arrives on the
 * re-render immediately after — the alternative reads storage during the
 * render that has to match the server's, which is the mismatch above again.
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
  const { showLocalTime } = useDisplayPreferences();

  if (!value) {
    return <span className={cn("text-muted-foreground", className)}>{fallback}</span>;
  }

  return (
    <time
      dateTime={value.toISOString()}
      title={titleFor(value, showLocalTime)}
      className={cn("whitespace-nowrap", className)}
      suppressHydrationWarning
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
  const { showLocalTime } = useDisplayPreferences();

  if (!value) {
    return <span className={cn("text-muted-foreground", className)}>{fallback}</span>;
  }

  // An expiry is stored as the last instant of a UTC day, so the local
  // equivalent frequently falls on a different date — which is precisely the
  // thing a developer turns this setting on to see. It sits beneath the UTC
  // day and in smaller type, so the UTC value stays the one being read.
  return (
    <span className={cn("inline-flex flex-col", className)}>
      <time
        dateTime={value.toISOString()}
        title={titleFor(value, showLocalTime)}
        className="whitespace-nowrap"
      >
        {formatDayUtc(value)}
      </time>
      {showLocalTime ? (
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {formatExactLocal(value)}
        </span>
      ) : null}
    </span>
  );
}

function titleFor(value: Date, showLocalTime: boolean): string {
  const utc = formatExactUtc(value);
  // Two lines in one `title`: browsers honour the newline, and it keeps the
  // UTC value first and the local value under it rather than beside it.
  return showLocalTime ? `${utc}\n${formatExactLocal(value)}` : utc;
}
