import Link from "next/link";
import { Package } from "lucide-react";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { listApplications } from "@/lib/applications/service";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { CreateApplicationDialog } from "@/components/applications/create-application-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function OverviewPage() {
  const ownerId = await requireDeveloperId();
  const applications = await listApplications(db, ownerId);

  const totalLicenses = applications.reduce((sum, application) => sum + application.licenseCount, 0);
  const empty = applications.length === 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Your licensing footprint at a glance."
        action={
          empty ? null : (
            <Button asChild size="sm">
              <Link href="/dashboard/applications">Manage applications</Link>
            </Button>
          )
        }
      />

      {empty ? (
        // The first thing a new account sees. One action, and it opens the
        // creation dialog directly — Alpha_v1 linked to the applications page and
        // left the developer to find the button again once they arrived.
        <EmptyState
          icon={<Package className="size-5" />}
          title="Create your first application"
          description="An application gives you a permanent application ID. Your software sends that ID with every license check, and it never changes — not even if you rename the application."
          action={<CreateApplicationDialog />}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Applications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">{applications.length}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Licenses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">{totalLicenses}</p>
              </CardContent>
            </Card>
          </div>

          {totalLicenses === 0 ? (
            <EmptyState
              title="No licenses issued yet"
              description="Open an application to generate your first license and copy an integration example."
              action={
                <Button asChild size="sm">
                  <Link href={`/dashboard/applications/${applications[0]!.id}`}>
                    Open {applications[0]!.name}
                  </Link>
                </Button>
              }
            />
          ) : null}
        </>
      )}
    </div>
  );
}
