import Link from "next/link";
import { Package } from "lucide-react";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import {
  EXPIRING_SOON_DAYS,
  getApplicationBreakdown,
  getExpiringSoon,
  getOverviewStats,
} from "@/lib/licenses/query";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { RelativeTime } from "@/components/dashboard/relative-time";
import { CreateApplicationDialog } from "@/components/applications/create-application-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The page you land on after signing in.
 *
 * Through Alpha_v2 this was two numbers — applications and licenses — and
 * nothing else, which gave nobody a reason to come back to it. It now leads
 * with the one thing worth acting on before a customer writes in: what is
 * about to expire.
 */
export default async function OverviewPage() {
  const ownerId = await requireDeveloperId();

  // Three independent reads, so they overlap rather than queue.
  const [stats, expiring, breakdown] = await Promise.all([
    getOverviewStats(db, ownerId),
    getExpiringSoon(db, ownerId),
    getApplicationBreakdown(db, ownerId),
  ]);

  if (stats.applications === 0) {
    return (
      <div className="space-y-8">
        <PageHeader title="Overview" />
        <EmptyState
          icon={<Package className="size-5" />}
          title="Create your first application"
          description="An application gives you a permanent ID. Your software sends it with every license check, and it never changes — not even if you rename the application."
          action={<CreateApplicationDialog />}
        />
      </div>
    );
  }

  // Zeroes are dropped rather than shown: a row of them teaches the developer
  // to stop reading the row. Same convention as the application overview.
  const tiles = [
    { label: "Applications", value: stats.applications, always: true },
    { label: "Licenses", value: stats.total, always: true },
    { label: "Active", value: stats.active, always: true },
    { label: "Expiring soon", value: stats.expiringSoon, always: false },
    { label: "Expired", value: stats.expired, always: false },
    { label: "Revoked", value: stats.revoked, always: false },
  ].filter((tile) => tile.always || tile.value > 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/applications">All applications</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {tile.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{tile.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {expiring.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium">Expiring soon</h2>
            <span className="text-xs text-muted-foreground">
              Next {EXPIRING_SOON_DAYS} days
            </span>
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {expiring.map((license) => (
              <li
                key={license.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3"
              >
                <div className="min-w-0">
                  {/* Straight into that application's licenses, pre-filtered to
                      this key — the point of surfacing it is to act on it. */}
                  <Link
                    href={`/dashboard/applications/${license.applicationId}/licenses?q=${license.keyLast4}`}
                    className="text-sm hover:underline"
                  >
                    {license.label ?? `Unlabeled license ••••${license.keyLast4}`}
                  </Link>
                  <p className="text-xs text-muted-foreground">{license.applicationName}</p>
                </div>
                <RelativeTime value={license.expiresAt} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Applications</h2>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {breakdown.map((application) => (
            <li key={application.id}>
              <Link
                href={`/dashboard/applications/${application.id}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-accent/50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm">{application.name}</span>
                  {application.disabled ? (
                    <Badge variant="destructive">Disabled</Badge>
                  ) : null}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {application.active} active / {application.total}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
