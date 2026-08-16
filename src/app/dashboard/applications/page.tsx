import Link from "next/link";
import { Package, SearchX } from "lucide-react";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { listApplications } from "@/lib/applications/service";
import { isApplicationFiltered } from "@/lib/applications/types";
import {
  parseApplicationQuery,
  wantsNewApplication,
  type RawSearchParams,
} from "@/lib/validation/dashboard";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { CopyButton } from "@/components/dashboard/copy-button";
import { RelativeTime } from "@/components/dashboard/relative-time";
import { CreateApplicationDialog } from "@/components/applications/create-application-dialog";
import { ApplicationActions } from "@/components/applications/application-actions";
import { ApplicationFilters } from "@/components/applications/application-filters";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const ownerId = await requireDeveloperId();

  const raw = await searchParams;
  const query = parseApplicationQuery(raw);
  const applications = await listApplications(db, ownerId, query);

  const filtering = isApplicationFiltered(query);
  const empty = applications.length === 0;

  // Where the switcher's and the command palette's "New application" entries
  // land. Only the header's dialog is told, so an empty list does not open two.
  const requestingNew = wantsNewApplication(raw);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description="Each application has a permanent ID that your software sends when verifying a license."
        action={<CreateApplicationDialog requested={requestingNew} />}
      />

      {!empty || filtering ? <ApplicationFilters query={query} total={applications.length} /> : null}

      {empty && filtering ? (
        <EmptyState
          icon={<SearchX className="size-5" />}
          title="No applications match that search"
          description="Nothing here matches by name, slug or application ID. Try a different term."
        />
      ) : empty ? (
        <EmptyState
          icon={<Package className="size-5" />}
          title="No applications yet"
          description="An application gives you a permanent application ID. Your software sends that ID with every license check, and it never changes — not even if you rename the application."
          action={<CreateApplicationDialog />}
        />
      ) : (
        <>
          {/* Desktop: a table. */}
          <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Application ID</TableHead>
                  <TableHead className="text-right">Licenses</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((application) => (
                  // `relative` so the stretched link below has something to
                  // position against; the cells that hold real controls get
                  // their own `relative` to sit above it.
                  <TableRow key={application.id} className="relative">
                    <TableCell className="max-w-64">
                      {/* The link stretches across the row via a pseudo
                          element, so the whole row is clickable without
                          nesting the copy button or the menu inside an anchor
                          — which would be invalid and would swallow their
                          clicks. */}
                      <Link
                        href={`/dashboard/applications/${application.id}`}
                        className="font-medium after:absolute after:inset-0 after:content-[''] hover:underline"
                      >
                        <span className="block truncate">{application.name}</span>
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{application.slug}</p>
                    </TableCell>
                    <TableCell>
                      <div className="relative flex items-center gap-1">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {application.id}
                        </code>
                        <CopyButton value={application.id} label="" />
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {application.licenseCount}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <RelativeTime value={application.createdAt} />
                    </TableCell>
                    <TableCell>
                      <div className="relative">
                        <ApplicationActions
                          applicationId={application.id}
                          name={application.name}
                          disabled={application.disabledAt !== null}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Narrow screens: cards, so the application ID can wrap and the menu
              stays reachable without horizontal scrolling. */}
          <ul className="space-y-3 md:hidden">
            {applications.map((application) => (
              <li
                key={application.id}
                className="relative rounded-lg border border-border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/applications/${application.id}`}
                      className="font-medium after:absolute after:inset-0 after:content-['']"
                    >
                      <span className="block truncate">{application.name}</span>
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{application.slug}</p>
                  </div>
                  <div className="relative shrink-0">
                    <ApplicationActions
                          applicationId={application.id}
                          name={application.name}
                          disabled={application.disabledAt !== null}
                        />
                  </div>
                </div>

                <div className="relative mt-3 flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all">
                    {application.id}
                  </code>
                  <CopyButton value={application.id} label="" />
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  {application.licenseCount} license{application.licenseCount === 1 ? "" : "s"} ·
                  created <RelativeTime value={application.createdAt} />
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
