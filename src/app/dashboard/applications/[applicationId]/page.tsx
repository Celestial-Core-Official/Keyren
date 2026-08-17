import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { getCachedApplication } from "@/lib/applications/cached";
import { getApplicationLicenseStats } from "@/lib/licenses/query";
import { MetricStrip, share, type Metric } from "@/components/dashboard/metric-strip";
import { OnboardingChecklist } from "@/components/applications/onboarding-checklist";
import { CreateLicenseDialog } from "@/components/licenses/create-license-dialog";
import { Button } from "@/components/ui/button";

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

  // One aggregate query rather than loading every license to count them.
  const stats = await getApplicationLicenseStats(db, ownerId, applicationId);

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
    </div>
  );
}
