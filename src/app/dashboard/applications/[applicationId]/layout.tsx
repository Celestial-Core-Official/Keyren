import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { getCachedApplication } from "@/lib/applications/cached";
import { CopyButton } from "@/components/dashboard/copy-button";
import { ApplicationTabs } from "@/components/dashboard/application-tabs";

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
        </div>

        <ApplicationTabs applicationId={application.id} />
      </div>

      {children}
    </div>
  );
}
