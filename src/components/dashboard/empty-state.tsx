import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Which job this empty state is doing.
 *
 * One component was covering all four through Alpha_v2, which meant a filter
 * that matched nothing and an application that had never been created were
 * drawn identically — and both drew their own card, so a "no results" block
 * inside a bordered table shell was a box inside a box.
 *
 * - `blank` — the resource has never existed. States the condition, offers the
 *   fastest way to create one.
 * - `informational` — first run, with the value proposition attached.
 * - `no-results` — a filter returned nothing. Draws no border of its own,
 *   because it stands inside a surface that already has one.
 * - `error` — a load failed or access was denied. The icon carries the
 *   destructive tone; nothing else on the block is coloured.
 */
export type EmptyStateVariant = "blank" | "informational" | "no-results" | "error";

/**
 * An empty state that says what is missing and offers the fastest way out of
 * it, inside the card rather than only in the page header.
 *
 * Alpha_v1's empty states described the absence and left the developer to
 * find the button elsewhere on the page — which, on a first run, is exactly
 * the moment they are least able to guess where.
 *
 * One primary action, and at most one secondary when the next step could
 * legitimately be either of two paths. A third is a smell: it means the state
 * has not decided what the developer should do next.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondary,
  variant = "blank",
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  variant?: EmptyStateVariant;
  className?: string;
}) {
  const body = (
    <div
      className={cn(
        "flex flex-col items-center gap-4 px-6 text-center",
        variant === "no-results" ? "py-16" : "py-12",
      )}
    >
      {icon ? (
        <div
          className={cn(
            "flex size-11 items-center justify-center rounded-4xl border",
            variant === "error"
              ? "border-destructive-border bg-destructive-subtle text-destructive"
              : "border-border bg-muted/40 text-fg-tertiary",
          )}
        >
          {icon}
        </div>
      ) : null}

      <div className="space-y-1.5">
        {/* 16/600, up from 14/500. A page-level blank slate whispering at body
            weight inside a 48px-padded card was the quietest thing on the
            screen at the moment it had the most to say. */}
        <p className="text-base font-semibold">{title}</p>
        <p className="mx-auto max-w-md text-sm text-balance text-fg-tertiary">
          {description}
        </p>
      </div>

      {action || secondary ? (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {action}
          {secondary}
        </div>
      ) : null}
    </div>
  );

  // No card of its own: this variant is rendered inside the shell that would
  // otherwise be holding the table, and that shell already draws the border.
  if (variant === "no-results") return <div className={className}>{body}</div>;

  return (
    <Card className={className}>
      <CardContent className="p-0">{body}</CardContent>
    </Card>
  );
}

/**
 * A block that mimics the shape of the content it is standing in for, so the
 * layout does not jump when the real thing arrives.
 *
 * `motion-safe:` on the pulse: a reduced-motion preference should not mean
 * staring at a flashing rectangle.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-md bg-muted/60 motion-safe:animate-pulse", className)}
    />
  );
}
