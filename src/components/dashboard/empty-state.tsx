import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * An empty state that says what is missing and offers the fastest way out of
 * it, inside the card rather than only in the page header.
 *
 * Alpha_v1's empty states described the absence and left the developer to
 * find the button elsewhere on the page — which, on a first run, is exactly
 * the moment they are least able to guess where.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondary,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
        {icon ? (
          <div className="flex size-11 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground">
            {icon}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <p className="text-sm font-medium">{title}</p>
          <p className="mx-auto max-w-md text-sm text-balance text-muted-foreground">
            {description}
          </p>
        </div>

        {action || secondary ? (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {action}
            {secondary}
          </div>
        ) : null}
      </CardContent>
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
