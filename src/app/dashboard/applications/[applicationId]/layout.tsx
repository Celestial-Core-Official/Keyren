import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { getCachedApplication } from "@/lib/applications/cached";
import { CopyButton } from "@/components/dashboard/copy-button";
import { ApplicationTabs } from "@/components/dashboard/application-tabs";
import { ApplicationActions } from "@/components/applications/application-actions";
import { Badge } from "@/components/ui/badge";

export default async function ApplicationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const ownerId = await requireDeveloperId();

  // Scoped by owner. An application belonging to another developer resolves to
  // null and renders the same 404 as one that does not exist.
  //
  // Cached per request, so the page beneath this layout can make the same
  // call — and make its own ownership check rather than trusting this one —
  // without a second round trip to the database.
  const application = await getCachedApplication(db, ownerId, applicationId);
  if (!application) notFound();

  return (
    <div className="space-y-8">
      {/* The identity block is one compact row: a long application name and a
          application ID used to cost four stacked lines of vertical space before
          any actual content appeared. */}
      <div className="space-y-3 border-b border-border">
        <Link
          href="/dashboard/applications"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Applications
        </Link>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="min-w-0 text-xl font-semibold tracking-tight break-words">
            {application.name}
          </h1>
          <div className="flex items-center gap-1">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {application.id}
            </code>
            <CopyButton value={application.id} label="" />
          </div>

          {application.disabledAt ? (
            <Badge variant="destructive">Disabled</Badge>
          ) : null}

          {/* Rename and delete used to exist only on the applications list, so
              renaming the application you were looking at meant navigating out
              of it first. */}
          <div className="ml-auto">
            <ApplicationActions
              applicationId={application.id}
              name={application.name}
              disabled={application.disabledAt !== null}
            />
          </div>
        </div>

        {application.disabledAt ? (
          <p className="text-sm text-destructive">
            Every license check for this application is being rejected. Enable it from
            the actions menu to resume.
          </p>
        ) : null}

        <ApplicationTabs applicationId={application.id} />
      </div>

      {children}
    </div>
  );
}
