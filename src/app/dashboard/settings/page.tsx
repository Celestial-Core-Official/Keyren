import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RELEASE } from "@/lib/release";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Account and release information."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Your account is managed through the avatar menu in the top-right corner.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Release: {RELEASE.name}{" "}
            <span className="font-mono text-xs font-normal text-muted-foreground">
              ({RELEASE.version})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>This is a private testing release. Known limitations:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Validation is online-only. If Keyren is unreachable, your software cannot
              obtain a positive licensing response. There are no offline licenses and no
              cached grace periods.
            </li>
            <li>HWID-locked licenses bind to exactly one device.</li>
            <li>
              Only a developer can reset an activation. End users cannot reset their own,
              so a reinstall consumes the binding until you reset it.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
