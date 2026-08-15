"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * The boundary for everything under one product.
 *
 * `error.message` is deliberately not rendered. In production Next.js
 * replaces it with a digest anyway, but in development it would be the raw
 * exception — and the habit of printing it is how a driver message or a
 * constraint name ends up on screen. The digest is enough to correlate with
 * a server log.
 */
export default function ProductError({
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
          <p className="text-sm font-medium">Something went wrong loading this product</p>
          <p className="mx-auto max-w-md text-sm text-balance text-muted-foreground">
            Your licenses are safe — this is a problem displaying them, not a change to
            them. Try again, and if it keeps happening the reference below will be in the
            server logs.
          </p>
          {error.digest ? (
            <p className="pt-1 font-mono text-xs text-muted-foreground">{error.digest}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <Button type="button" size="sm" onClick={reset}>
            Try again
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/products">Back to products</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
