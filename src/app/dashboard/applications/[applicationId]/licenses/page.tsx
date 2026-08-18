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
import { ApplyPageSizePreference } from "@/components/licenses/apply-page-size-preference";
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
  const raw = await searchParams;
  const query = parseLicenseQuery(raw);
  const page = await queryLicenses(db, ownerId, applicationId, query);

  const filtering = isFiltered(query);
  const empty = page.total === 0;

  // Only when the URL is silent on the matter. A link that names a page size
  // means it, and must not be overwritten by whoever opens it.
  const pageSizeFromUrl = raw.pageSize !== undefined;

  return (
    <div className="space-y-6">
      {pageSizeFromUrl ? null : <ApplyPageSizePreference current={query.pageSize} />}

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
        // Wrapped in the same shell the table would have occupied, so the
        // block sits where the rows were rather than floating in the gap, and
        // announced politely because it replaces content that was there a
        // keystroke ago.
        <div aria-live="polite" className="rounded-lg border border-border">
          <EmptyState
            variant="no-results"
            icon={<SearchX className="size-5" />}
            title="No matching licenses"
            // The query is quoted back verbatim: a developer who typed a
            // trailing space or a stray character finds it here rather than
            // concluding the licence is gone.
            description={
              query.q === ""
                ? "Nothing here fits the current filters. Widen them, or clear them to see every license for this application."
                : `No licenses match “${query.q}”. Clear the filters to see every license for this application.`
            }
            action={<ClearFiltersLink />}
          />
        </div>
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
