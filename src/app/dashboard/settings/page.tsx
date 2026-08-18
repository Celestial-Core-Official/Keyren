import { PageHeader } from "@/components/dashboard/page-header";
import { AccountActions } from "@/components/settings/account-actions";
import { AppearanceSetting } from "@/components/settings/appearance-setting";
import { PreferencesSettings } from "@/components/settings/preferences-settings";

/**
 * Settings, which until now had none.
 *
 * Through Alpha_v1 this page was three read-only cards — 189 words of prose
 * and not one control. The Account card spent sixty of those words explaining
 * where to click instead of being a button. What is left is the controls:
 * everything that only described something has either become the control it
 * was describing, or gone.
 *
 * The keyboard shortcuts still work; the `?` dialog is where they are listed,
 * and a second copy here was reference material duplicated into a page of
 * switches.
 */
export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-10">
      <PageHeader title="Settings" />

      <AppearanceSetting />
      <PreferencesSettings />
      <AccountActions />
    </div>
  );
}
