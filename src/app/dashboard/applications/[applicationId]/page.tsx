import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { getCachedApplication } from "@/lib/applications/cached";
import { getApplicationLicenseStats } from "@/lib/licenses/query";
import { OnboardingChecklist } from "@/components/applications/onboarding-checklist";
import { CreateLicenseDialog } from "@/components/licenses/create-license-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  // Expired and revoked are only shown when they exist: a column of zeroes
  // teaches the developer to stop reading the row.
  const cards = [
    { label: "Licenses", value: stats.total, always: true },
    { label: "Active", value: stats.active, always: true },
    { label: "Bound devices", value: stats.boundDevices, always: true },
    { label: "Expired", value: stats.expired, always: false },
    { label: "Revoked", value: stats.revoked, always: false },
  ].filter((card) => card.always || card.value > 0);

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

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
