import { PageHeader } from "@/components/dashboard/page-header";
import { AccountActions } from "@/components/settings/account-actions";
import { AppearanceSetting } from "@/components/settings/appearance-setting";
import { PreferencesSettings } from "@/components/settings/preferences-settings";
import { SettingRow, SettingSection } from "@/components/settings/setting-row";
import { KEYBOARD_SHORTCUTS } from "@/lib/shortcuts";
import { RELEASE } from "@/lib/release";

/**
 * Settings, which until now had none.
 *
 * Through Alpha_v1 this page was three read-only cards — 189 words of prose
 * and not one control. The Account card spent sixty of those words explaining
 * where to click instead of being a button. Everything that only described
 * something has either become the control it was describing, or moved to
 * About, where reference material belongs.
 */
export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-10">
      <PageHeader title="Settings" />

      <AppearanceSetting />
      <PreferencesSettings />
      <AccountActions />

      <SettingSection title="Keyboard shortcuts">
        {KEYBOARD_SHORTCUTS.map((shortcut) => (
          <SettingRow key={shortcut.description} label={shortcut.description}>
            <span className="flex gap-1">
              {shortcut.keys.map((key) => (
                <kbd
                  key={key}
                  className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs"
                >
                  {key}
                </kbd>
              ))}
            </span>
          </SettingRow>
        ))}
      </SettingSection>

      <SettingSection title="About">
        <SettingRow label="Release">
          <span className="text-sm text-muted-foreground">
            {RELEASE.name}{" "}
            <span className="font-mono text-xs">({RELEASE.version})</span>
          </span>
        </SettingRow>
        <SettingRow label="Verification API" hint="Versioned separately from the release.">
          <code className="font-mono text-xs text-muted-foreground">
            /api/{RELEASE.apiVersion}/
          </code>
        </SettingRow>
        <div className="space-y-1.5 px-4 py-3">
          <p className="text-sm">Known limitations</p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Online-only. No offline licenses, no cached grace periods.</li>
            <li>A locked license binds to exactly one device.</li>
            <li>Only you can reset an activation — a reinstall consumes the binding until you do.</li>
            <li>Keys are shown once at creation. A lost key can be replaced, never recovered.</li>
          </ul>
        </div>
      </SettingSection>
    </div>
  );
}
