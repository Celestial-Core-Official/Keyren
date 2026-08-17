import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { getCachedApplication } from "@/lib/applications/cached";
import { getApplicationLicenseStats, queryLicenses } from "@/lib/licenses/query";
import { DEFAULT_LICENSE_QUERY } from "@/lib/licenses/types";
import { MetricStrip, share, type Metric } from "@/components/dashboard/metric-strip";
import { OnboardingChecklist } from "@/components/applications/onboarding-checklist";
import { CreateLicenseDialog } from "@/components/licenses/create-license-dialog";
import { LicenseStatusBadge } from "@/components/licenses/license-status-badge";
import { RelativeTime } from "@/components/dashboard/relative-time";
import { Button } from "@/components/ui/button";
import { KeyGlyph } from "@/lib/design/key-glyph";
import { middleTruncate } from "@/lib/design/truncate";
import { maskedLicenseKey } from "@/lib/crypto/license-key";
import { UNLABELED_LICENSE } from "@/lib/licenses/display";

/**
 * What one application looks like at a glance.
 *
 * This page used to be six stacked blocks of equal weight — checklist, stats,
 * an endpoint card, a floating row of buttons, the integration snippets and a
 * live API tester — with the primary actions stranded in the middle. The
 * snippets and the tester now have their own tabs, the identifiers moved to
 * the application's settings, and what is left is the thing an overview is
 * for: the numbers, and the action you most likely came to take.
 */
export default async function ApplicationOverviewPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const ownerId = await requireDeveloperId();

  const application = await getCachedApplication(db, ownerId, applicationId);
  if (!application) notFound();

  // One aggregate query rather than loading every license to count them, plus
  // the five most recent rows so the page has an object and not only counts.
  // Both are owner-scoped in SQL; neither trusts the URL's applicationId.
  const [stats, recent] = await Promise.all([
    getApplicationLicenseStats(db, ownerId, applicationId),
    queryLicenses(db, ownerId, applicationId, {
      ...DEFAULT_LICENSE_QUERY,
      sort: "newest",
    }),
  ]);

  // Primary counts always render, because `0 licenses` on an application
  // created a minute ago is the most informative thing the rail can say.
  // Expired and revoked are dropped when empty: a column of zeroes beside
  // derived states teaches the developer to stop reading the rail.
  //
  // Bound devices deliberately carries no ratio. Its honest denominator is the
  // number of hwid-locked licenses rather than the total, and a share of the
  // wrong whole is worse than no share at all.
  const metrics: Metric[] = [
    { label: "Licenses", value: stats.total },
    { label: "Active", value: stats.active, detail: share(stats.active, stats.total) },
    { label: "Bound devices", value: stats.boundDevices },
  ];

  if (stats.expired > 0) metrics.push({ label: "Expired", value: stats.expired });
  if (stats.revoked > 0) metrics.push({ label: "Revoked", value: stats.revoked });

  return (
    <div className="space-y-8">
      <OnboardingChecklist
        applicationId={application.id}
        applicationSlug={application.slug}
        hasLicense={stats.total > 0}
        // Derived, not remembered: an activation row is only ever written by
        // a verification that succeeded.
        hasVerification={stats.activated > 0}
      />

      {/* Above the numbers, not stranded below them. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/dashboard/applications/${application.id}/licenses`}>
            Manage licenses
          </Link>
        </Button>
        <CreateLicenseDialog
          applicationId={application.id}
          applicationSlug={application.slug}
        />
      </div>

      <MetricStrip metrics={metrics} />

      {/* The page's actual subject.
          Without this the overview is an action row and a 58px rail once the
          checklist self-destructs — numbers about an object, with the object
          itself nowhere on the page. The best developer consoles lead with the
          thing (a deployment list, a service canvas, an issue view) and let the
          counts annotate it. This is the same paged query the Licenses tab
          runs, asked for five rows. */}
      {recent.rows.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-[13px] font-semibold tracking-[var(--tracking-heading)]">
              Recently issued
            </h2>
            <Link
              href={`/dashboard/applications/${application.id}/licenses`}
              className="text-[13px] text-fg-tertiary transition-colors duration-[var(--speed-quick)] hover:text-foreground"
            >
              All {stats.total} licenses
            </Link>
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {recent.rows.slice(0, 5).map((license) => (
              <li
                key={license.id}
                className="flex h-14 items-center gap-3 px-3 transition-colors duration-[var(--speed-quick)] hover:bg-accent/60"
              >
                <KeyGlyph seed={maskedLicenseKey(license.keyLast4)} size={20} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">
                    {license.label ?? <span className="text-fg-quaternary">{UNLABELED_LICENSE}</span>}
                  </span>
                  <span className="block truncate font-mono text-[12px] text-fg-quaternary">
                    {middleTruncate(maskedLicenseKey(license.keyLast4), 22)}
                  </span>
                </span>
                <LicenseStatusBadge
                  status={license.status}
                  expiresAt={license.expiresAt}
                  effectiveStatus={license.effectiveStatus}
                />
                <span className="hidden w-28 text-right text-[12px] text-fg-quaternary sm:block">
                  <RelativeTime value={license.createdAt} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
