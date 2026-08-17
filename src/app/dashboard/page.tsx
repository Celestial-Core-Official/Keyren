import Link from "next/link";
import { ChevronRight, Package } from "lucide-react";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import {
  EXPIRING_SOON_DAYS,
  getApplicationBreakdown,
  getExpiringSoon,
  getOverviewStats,
} from "@/lib/licenses/query";
import { KeyGlyph } from "@/lib/design/key-glyph";
import { EmptyState } from "@/components/dashboard/empty-state";
import { MetricStrip, share, type Metric } from "@/components/dashboard/metric-strip";
import { PageHeader } from "@/components/dashboard/page-header";
import { RelativeTime } from "@/components/dashboard/relative-time";
import { CreateApplicationDialog } from "@/components/applications/create-application-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * The page you land on after signing in.
 *
 * Through Alpha_v1 this was two numbers — applications and licenses — and
 * nothing else, which gave nobody a reason to come back to it. Alpha_v2 grew
 * that into six equally-weighted stat cards, which is the same problem wearing
 * more chrome: six facts of identical visual weight tell a reader nothing
 * about which one to look at.
 *
 * The numbers are now a reference rail, and the page leads with the one thing
 * worth acting on before a customer writes in: what is about to expire.
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
          title="No Applications Yet"
          description="An application gives you a permanent ID. Your software sends it with every license check, and it never changes — not even if you rename the application."
          action={<CreateApplicationDialog />}
        />
      </div>
    );
  }

  // Primary counts always render: `0 licenses` is informative, and a developer
  // who has just created an application needs to see that the count is zero.
  // Derived states are dropped when empty — a column of zeroes beside Expired
  // and Revoked teaches the reader to stop reading the rail.
  const metrics: Metric[] = [
    { label: "Applications", value: stats.applications },
    { label: "Licenses", value: stats.total },
    { label: "Active", value: stats.active, detail: share(stats.active, stats.total) },
  ];

  if (stats.expiringSoon > 0) {
    metrics.push({
      label: `Expiring ${EXPIRING_SOON_DAYS}d`,
      value: stats.expiringSoon,
      tone: "warning",
    });
  }
  if (stats.expired > 0) metrics.push({ label: "Expired", value: stats.expired });
  if (stats.revoked > 0) metrics.push({ label: "Revoked", value: stats.revoked });

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

      <MetricStrip metrics={metrics} />

      {expiring.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[13px] font-semibold">
              Expiring soon{" "}
              <span className="font-normal tabular-nums text-fg-tertiary">
                · {stats.expiringSoon}
              </span>
            </h2>
            <span className="text-[13px] text-fg-tertiary">
              {/* The query returns the soonest handful rather than everything
                  in the window, and the heading counts the whole window. Say
                  which is which rather than letting the two numbers disagree
                  silently. */}
              {stats.expiringSoon > expiring.length
                ? `Soonest ${expiring.length}, next ${EXPIRING_SOON_DAYS} days`
                : `Next ${EXPIRING_SOON_DAYS} days`}
            </span>
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {expiring.map((license) => (
              <li key={license.id}>
                {/* Straight into that application's licenses, pre-filtered to
                    this key — the point of surfacing it is to act on it. */}
                <Link
                  href={`/dashboard/applications/${license.applicationId}/licenses?q=${license.keyLast4}`}
                  className="group flex h-14 items-center gap-4 px-4 transition-colors duration-[var(--speed-quick)] hover:bg-accent/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {license.label ?? `Unlabeled license ••••${license.keyLast4}`}
                    </span>
                    <span className="block truncate text-[13px] text-fg-tertiary">
                      {license.applicationName}
                    </span>
                  </span>
                  {/* Amber is the counter-signal and it is carrying meaning
                      here: this date is the reason the row is on the page. */}
                  <RelativeTime
                    value={license.expiresAt}
                    className="shrink-0 text-[13px] text-warning"
                  />
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-fg-quaternary opacity-0 transition-opacity duration-[var(--speed-quick)] group-hover:opacity-100 group-focus-visible:opacity-100"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-[13px] font-semibold">Applications</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {breakdown.map((application) => (
            <li key={application.id}>
              <Link
                href={`/dashboard/applications/${application.id}`}
                className="group flex h-14 items-center gap-3 px-4 transition-colors duration-[var(--speed-quick)] hover:bg-accent/60"
              >
                {/* The same mark this application wears everywhere else, drawn
                    from its public ID. Two applications are told apart at a
                    glance by it before either name has been read. */}
                <KeyGlyph seed={application.id} size={28} className="shrink-0" />
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-sm">{application.name}</span>
                  {application.disabled ? (
                    <Badge variant="destructive">Disabled</Badge>
                  ) : null}
                </span>
                <span className="shrink-0 text-[13px] tabular-nums text-fg-tertiary">
                  {application.active} active / {application.total}
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-fg-quaternary opacity-0 transition-opacity duration-[var(--speed-quick)] group-hover:opacity-100 group-focus-visible:opacity-100"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
