import { notFound } from "next/navigation";
import { db } from "@/db";
import { env } from "@/env";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { getCachedApplication } from "@/lib/applications/cached";
import { IntegrationCenter } from "@/components/applications/integration-center";

/**
 * The integration snippets, on their own tab.
 *
 * These used to sit at the bottom of the application overview, below the
 * stats, the endpoint card and a floating row of buttons. Four languages of
 * example code is reference material you come to deliberately, not something
 * to scroll past on the way to a license count.
 */
export default async function IntegratePage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const ownerId = await requireDeveloperId();

  const application = await getCachedApplication(db, ownerId, applicationId);
  if (!application) notFound();

  return <IntegrationCenter applicationId={application.id} appUrl={env.NEXT_PUBLIC_APP_URL} />;
}
