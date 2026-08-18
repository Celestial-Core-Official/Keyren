import { Package, SearchX } from "lucide-react";
import { cookies } from "next/headers";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { listApplications } from "@/lib/applications/service";
import { isApplicationFiltered } from "@/lib/applications/types";
import {
  CURRENT_APPLICATION_COOKIE,
  resolveCurrentApplication,
} from "@/lib/applications/current";
import {
  parseApplicationQuery,
  wantsNewApplication,
  type RawSearchParams,
} from "@/lib/validation/dashboard";
import { KeyGlyph } from "@/lib/design/key-glyph";
import { middleTruncate } from "@/lib/design/truncate";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { CopyButton } from "@/components/dashboard/copy-button";
import { RelativeTime } from "@/components/dashboard/relative-time";
import { CreateApplicationDialog } from "@/components/applications/create-application-dialog";
import { ApplicationActions } from "@/components/applications/application-actions";
import { ApplicationFilters } from "@/components/applications/application-filters";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * An application ID is `app_` plus 26 Crockford symbols. Both ends carry
 * information — the prefix says what kind of thing it is, the tail is the only
 * part that tells two of them apart — so it is truncated in the middle rather
 * than at the end. The full value stays behind the copy button and the title.
 */
const ID_WIDTH = 18;
const ID_WIDTH_NARROW = 22;

/**
 * This page lists applications; it does not choose one. Rows are inert on
 * purpose — the header chooser is the single control that changes the
 * dashboard's subject, and two ways to do that is how the chooser ended up
 * feeling like a shortcut nobody used.
 */
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

  // Resolved against every application the developer owns, not the filtered
  // list: a search narrows what is on screen, and the header does not change
  // its answer because of one. The second read is paid for only while
  // filtering, which is the only time the two lists differ.
  const cookieStore = await cookies();
  const all = filtering ? await listApplications(db, ownerId) : applications;
  const currentId =
    resolveCurrentApplication(cookieStore.get(CURRENT_APPLICATION_COOKIE)?.value, all)?.id ?? null;

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
          title="No Matching Applications"
          description="Nothing here matches by name, slug or application ID. Try a different term."
        />
      ) : empty ? (
        <EmptyState
          icon={<Package className="size-5" />}
          title="No Applications Yet"
          action={<CreateApplicationDialog />}
        />
      ) : (
        <>
          {/* Desktop: a table. */}
          <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {/* The glyph column carries no label: it is a mark, not a
                      value, and a header over it would promise otherwise. */}
                  <TableHead className="w-14" />
                  <TableHead>Name</TableHead>
                  <TableHead>Application ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Licenses</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((application) => (
                  <TableRow key={application.id}>
                    <TableCell className="pr-0">
                      {/* Seeded from the public application ID — nothing
                          secret enters it, and the same application draws the
                          same mark on every surface that shows it. */}
                      <KeyGlyph seed={application.id} size={28} />
                    </TableCell>
                    <TableCell className="max-w-64">
                      {/* Not a link. This table is an inventory, not a way in
                          — the header chooser is the only thing that changes
                          which application the dashboard is looking at. */}
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{application.name}</span>
                        {application.id === currentId ? (
                          <Badge variant="outline" className="shrink-0">
                            Current
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-[13px] text-fg-tertiary">{application.slug}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <code
                          title={application.id}
                          className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[13px] text-fg-tertiary"
                        >
                          {middleTruncate(application.id, ID_WIDTH)}
                        </code>
                        <CopyButton value={application.id} label="" />
                      </div>
                    </TableCell>
                    <TableCell>
                      {/* Only the off state gets a badge. A column of green
                          pills saying Live teaches the eye to skip the column
                          that exists to catch the one row that is not. */}
                      {application.disabledAt ? (
                        <Badge variant="destructive">Disabled</Badge>
                      ) : (
                        <span className="text-[13px] text-fg-tertiary">Live</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {application.licenseCount}
                    </TableCell>
                    <TableCell className="text-[13px] text-fg-tertiary">
                      <RelativeTime value={application.createdAt} />
                    </TableCell>
                    <TableCell>
                      <ApplicationActions
                        applicationId={application.id}
                        name={application.name}
                        disabled={application.disabledAt !== null}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Narrow screens: cards, so the application ID can sit on its own
              line and the menu stays reachable without horizontal scrolling. */}
          <ul className="space-y-3 md:hidden">
            {applications.map((application) => (
              <li key={application.id} className="rounded-lg border border-border p-4">
                <div className="flex items-start gap-3">
                  <KeyGlyph seed={application.id} size={28} className="mt-1 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{application.name}</span>
                      {application.id === currentId ? (
                        <Badge variant="outline" className="shrink-0">
                          Current
                        </Badge>
                      ) : null}
                      {application.disabledAt ? (
                        <Badge variant="destructive" className="shrink-0">
                          Disabled
                        </Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-[13px] text-fg-tertiary">{application.slug}</p>
                  </div>
                  <div className="shrink-0">
                    <ApplicationActions
                      applicationId={application.id}
                      name={application.name}
                      disabled={application.disabledAt !== null}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code
                    title={application.id}
                    className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[13px] text-fg-tertiary"
                  >
                    {middleTruncate(application.id, ID_WIDTH_NARROW)}
                  </code>
                  <CopyButton value={application.id} label="" />
                </div>

                <p className="mt-2 text-[13px] text-fg-tertiary">
                  <span className="tabular-nums">{application.licenseCount}</span> license
                  {application.licenseCount === 1 ? "" : "s"} · created{" "}
                  <RelativeTime value={application.createdAt} />
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
