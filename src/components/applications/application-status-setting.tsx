"use client";

import { useActionState, useRef, useState } from "react";
import { setApplicationDisabledAction } from "@/app/dashboard/applications/actions";
import { useActionFeedback } from "@/components/dashboard/feedback";
import { SettingRow, SettingSection } from "@/components/settings/setting-row";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { idleAction } from "@/lib/actions/state";

/**
 * The application kill switch, as a setting rather than a menu item.
 *
 * The same action backs the entry in the actions menu; this is the version you
 * find when you go looking for it, which is where a developer expects to turn
 * something off deliberately rather than in passing.
 *
 * Alpha_v3 built this as a submit `Button` wrapping a `Switch`. Radix's Switch
 * root is itself a `<button>`, so that markup put a button inside a button —
 * and a browser's parser resolves that by closing the outer one and ejecting
 * the switch to be its sibling. Server-rendered, the row arrived as an empty
 * zero-sized button beside a switch carrying `pointer-events-none`, and React
 * then hydrated a tree that did not match the one it had sent. The switch is
 * now the only control in the row and owns its own interaction, which is what
 * a switch is for.
 */
export function ApplicationStatusSetting({
  applicationId,
  name,
  disabled,
}: {
  applicationId: string;
  name: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(setApplicationDisabledAction, idleAction());
  const [confirming, setConfirming] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  useActionFeedback(state, { onSuccess: () => setConfirming(false) });

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
        <form ref={form} action={action}>
          <input type="hidden" name="applicationId" value={applicationId} />
          <input type="hidden" name="disabled" value={disabled ? "false" : "true"} />
          {/* Controlled by the server's answer, not by the click. A switch
              that moved on click would claim the change had happened before
              the action had run — and would be saying so outright while the
              confirmation below is still open and unanswered. */}
          <Switch
            checked={!disabled}
            disabled={pending}
            aria-label={disabled ? "Enable application" : "Disable application"}
            onCheckedChange={() => {
              // Off is the consequential direction: it takes licensing offline
              // for every customer of this application at once, from one
              // click. On restores service and has nothing to warn about.
              if (disabled) form.current?.requestSubmit();
              else setConfirming(true);
            }}
          />
        </form>
      </SettingRow>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every license check for this application will be rejected with
              APPLICATION_DISABLED until you turn it back on. Nothing is destroyed: no
              license is revoked, no activation is released, and enabling it restores
              exactly the state that is there now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {/* Submits the form above, which is outside this dialog — so the
                dialog closing cannot take the submission with it. */}
            <AlertDialogAction
              variant="destructive"
              onClick={() => form.current?.requestSubmit()}
            >
              Disable application
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingSection>
  );
}
