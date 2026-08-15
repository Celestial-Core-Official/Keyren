import { PageHeader } from "@/components/dashboard/page-header";
import { KEYBOARD_SHORTCUTS } from "@/components/dashboard/keyboard-shortcuts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RELEASE } from "@/lib/release";

/**
 * There are still no developer-configurable settings, and this page still
 * refuses to invent any. It states what release this is, what it cannot do,
 * and how to drive it from the keyboard.
 */
export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description="Account and release information." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Your email, password, connected sign-in methods and account deletion are all
            managed by Clerk, which Keyren uses for authentication.
          </p>
          <p>
            Open them from the avatar menu in the top-right corner of any dashboard page —
            Keyren deliberately does not duplicate those controls, because two places to
            change a password is one place too many.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Keyboard shortcuts</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2 text-sm">
            {KEYBOARD_SHORTCUTS.map((shortcut) => (
              <div key={shortcut.description} className="flex items-baseline gap-3">
                <dt className="w-14 shrink-0">
                  {shortcut.keys.map((key) => (
                    <kbd
                      key={key}
                      className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs"
                    >
                      {key}
                    </kbd>
                  ))}
                </dt>
                <dd className="text-muted-foreground">{shortcut.description}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Letter shortcuts are ignored while you are typing in a field, so they never
            interfere with a label or a search term.
          </p>
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
            <li>
              License keys are shown exactly once, at creation. Keyren stores only a keyed
              derivation, so a lost key cannot be recovered — it can only be replaced.
            </li>
          </ul>
          <p>
            The public verification API is versioned separately, at{" "}
            <code className="font-mono text-xs">/api/{RELEASE.apiVersion}/</code>. It does
            not move when the release name does, so integrations built against{" "}
            {RELEASE.apiVersion} keep working.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
