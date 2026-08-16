"use client";

import { useActionState } from "react";
import { setApplicationDisabledAction } from "@/app/dashboard/applications/actions";
import { useActionFeedback } from "@/components/dashboard/feedback";
import { SettingRow, SettingSection } from "@/components/settings/setting-row";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { idleAction } from "@/lib/actions/state";

/**
 * The application kill switch, as a setting rather than a menu item.
 *
 * The same action backs the entry in the actions menu; this is the version you
 * find when you go looking for it, which is where a developer expects to turn
 * something off deliberately rather than in passing.
 */
export function ApplicationStatusSetting({
  applicationId,
  disabled,
}: {
  applicationId: string;
  disabled: boolean;
}) {
  const [state, action] = useActionState(setApplicationDisabledAction, idleAction());
  useActionFeedback(state);

  return (
    <SettingSection title="Status">
      <SettingRow
        label={disabled ? "Disabled" : "Accepting license checks"}
        hint={
          disabled
            ? "Every verification is rejected with APPLICATION_DISABLED. No license was changed."
            : "Turning this off rejects every license check for this application until you turn it back on."
        }
      >
        <form action={action}>
          <input type="hidden" name="applicationId" value={applicationId} />
          <input type="hidden" name="disabled" value={disabled ? "false" : "true"} />
          {/* A submit button styled as a switch: the state change is a server
              action, so it has to be a form submission rather than a
              controlled input that lies about having already changed. */}
          <Button type="submit" variant="ghost" className="h-auto p-0 hover:bg-transparent">
            <Switch
              checked={!disabled}
              // The button owns the interaction; the switch is the indicator.
              tabIndex={-1}
              className="pointer-events-none"
              aria-label={disabled ? "Enable application" : "Disable application"}
            />
          </Button>
        </form>
      </SettingRow>
    </SettingSection>
  );
}
