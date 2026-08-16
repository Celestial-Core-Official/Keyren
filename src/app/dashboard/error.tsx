"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** The dashboard-wide boundary. See the application boundary for why the raw
 *  message is never rendered. */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
        <div className="flex size-11 items-center justify-center rounded-full border border-border bg-muted/40 text-amber-500">
          <AlertTriangle className="size-5" />
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Something went wrong</p>
          <p className="mx-auto max-w-md text-sm text-balance text-muted-foreground">
            Nothing has been changed. Try again — if it keeps happening, the reference
            below will be in the server logs.
          </p>
          {error.digest ? (
            <p className="pt-1 font-mono text-xs text-muted-foreground">{error.digest}</p>
          ) : null}
        </div>

        <Button type="button" size="sm" onClick={reset}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
