import { notFound } from "next/navigation";
import { db } from "@/db";
import { env } from "@/env";
import { requireDeveloperId } from "@/lib/auth/require-developer";
import { getCachedApplication } from "@/lib/applications/cached";
import { verifyUrl } from "@/lib/release";
import { ApiTester } from "@/components/applications/api-tester";
import { ApplicationStatusSetting } from "@/components/applications/application-status-setting";
import { CopyButton } from "@/components/dashboard/copy-button";
import { SettingRow, SettingSection } from "@/components/settings/setting-row";

/**
 * Per-application developer settings.
 *
 * The license tester lives here rather than on the overview: it sends a real
 * request to the real endpoint through the real rate limiter, which is a
 * deliberate thing you come here to do, not something that belongs beside a
 * license count.
 */
export default async function ApplicationSettingsPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const ownerId = await requireDeveloperId();

  const application = await getCachedApplication(db, ownerId, applicationId);
  if (!application) notFound();

  const endpoint = verifyUrl(env.NEXT_PUBLIC_APP_URL);

  return (
    <div className="max-w-3xl space-y-10">
      <SettingSection title="Identifiers">
        <SettingRow label="Application ID" hint="Compiled into your software. Never changes.">
          <span className="flex items-center gap-1">
            <code className="font-mono text-xs text-muted-foreground">{application.id}</code>
            <CopyButton value={application.id} label="" />
          </span>
        </SettingRow>
        <SettingRow label="Verification endpoint">
          <span className="flex items-center gap-1">
            <code className="max-w-[22rem] truncate font-mono text-xs text-muted-foreground">
              {endpoint}
            </code>
            <CopyButton value={endpoint} label="" />
          </span>
        </SettingRow>
      </SettingSection>

      <ApplicationStatusSetting
        applicationId={application.id}
        name={application.name}
        disabled={application.disabledAt !== null}
      />

      <ApiTester applicationId={application.id} />
    </div>
  );
}
