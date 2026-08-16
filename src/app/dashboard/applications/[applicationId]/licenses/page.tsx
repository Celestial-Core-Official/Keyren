import { notFound } from "next/navigation";
import { KeyRound, SearchX } from "lucide-react";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { getCachedApplication } from "@/lib/applications/cached";
import { queryLicenses } from "@/lib/licenses/query";
import { isFiltered } from "@/lib/licenses/types";
import { parseLicenseQuery, type RawSearchParams } from "@/lib/validation/dashboard";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Pagination } from "@/components/dashboard/pagination";
import { CreateLicenseDialog } from "@/components/licenses/create-license-dialog";
import { LicenseFilters } from "@/components/licenses/license-filters";
import { LicenseList } from "@/components/licenses/license-list";
import { ClearFiltersLink } from "@/components/licenses/clear-filters-link";

export default async function LicensesPage({
  params,
  searchParams,
}: {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { applicationId } = await params;
  const ownerId = await requireDeveloperId();

  const application = await getCachedApplication(db, ownerId, applicationId);
  if (!application) notFound();

  // Parsed from the URL, so the first server render already has the right
  // rows — no shipping everything and narrowing it in the browser.
  const query = parseLicenseQuery(await searchParams);
  const page = await queryLicenses(db, ownerId, applicationId, query);

  const filtering = isFiltered(query);
  const empty = page.total === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Licenses</h2>
          <p className="text-sm text-muted-foreground">
            Keys are shown once at creation and cannot be retrieved afterwards.
          </p>
        </div>
        <CreateLicenseDialog applicationId={application.id} applicationSlug={application.slug} />
      </div>

      {/* Filters stay mounted even with no results, so the developer can undo
          the search that emptied the list rather than losing the controls. */}
      {(!empty || filtering) && <LicenseFilters query={query} total={page.total} />}

      {empty && filtering ? (
        <EmptyState
          icon={<SearchX className="size-5" />}
          title="No licenses match these filters"
          description="Nothing here fits the current search and filters. Widen them, or clear them to see every license for this application."
          action={<ClearFiltersLink />}
        />
      ) : empty ? (
        <EmptyState
          icon={<KeyRound className="size-5" />}
          title="No licenses yet"
          description={`Generate one to start authenticating installations of ${application.name}. The key is shown once, immediately after creation.`}
          action={
            <CreateLicenseDialog applicationId={application.id} applicationSlug={application.slug}>
              Generate your first license
            </CreateLicenseDialog>
          }
        />
      ) : (
        <div className="space-y-4">
          <LicenseList
            licenses={page.rows}
            applicationId={application.id}
            applicationSlug={application.slug}
          />

          <Pagination
            page={page.page}
            pageCount={page.pageCount}
            pageSize={page.pageSize}
            total={page.total}
            shown={page.rows.length}
          />
        </div>
      )}
    </div>
  );
}
