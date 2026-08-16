"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import {
  createLicenseAction,
  type CreateLicenseState,
} from "@/app/dashboard/applications/[applicationId]/licenses/actions";
import { useActionFeedback } from "@/components/dashboard/feedback";
import { BatchResultDialog } from "@/components/licenses/batch-result-dialog";
import { LicenseCreateForm } from "@/components/licenses/license-create-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { idleAction } from "@/lib/actions/state";

const INITIAL: CreateLicenseState = idleAction();

/**
 * Owns the action state, and therefore owns the plaintext keys.
 *
 * Kept in its own component purely so the outer dialog can throw it away: the
 * parent remounts this with a fresh `key` after the developer acknowledges the
 * result, which is what actually drops the keys out of React state.
 * `useActionState` has no reset, so anything short of a remount would leave
 * the plaintext sitting in the component for the life of the page.
 */
function LicenseCreateFlow({
  applicationId,
  applicationSlug,
  open,
  onOpenChange,
  onAcknowledge,
  onGenerateAnother,
}: {
  applicationId: string;
  applicationSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAcknowledge: () => void;
  onGenerateAnother: () => void;
}) {
  const [state, formAction] = useActionState(createLicenseAction, INITIAL);

  // Failures raise a toast; successes are announced by the result dialog
  // itself, which is far louder than a toast and cannot be missed.
  useActionFeedback(state, {});

  const created = state.status === "success" ? (state.data?.licenses ?? null) : null;

  if (created && created.length > 0) {
    return (
      <BatchResultDialog
        licenses={created}
        applicationId={applicationId}
        applicationSlug={applicationSlug}
        onAcknowledge={onAcknowledge}
        onGenerateAnother={onGenerateAnother}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <LicenseCreateForm
          applicationId={applicationId}
          formAction={formAction}
          fieldErrors={state.status === "error" ? state.fieldErrors : {}}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function CreateLicenseDialog({
  applicationId,
  applicationSlug,
  variant = "default",
  size = "sm",
  children,
}: {
  applicationId: string;
  applicationSlug: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);

  function openFresh() {
    setSession((value) => value + 1);
    setOpen(true);
  }

  return (
    <>
      <Button
        size={size}
        variant={variant}
        className="gap-1.5"
        onClick={openFresh}
        data-keyren-create="license"
      >
        <Plus className="size-4" />
        {children ?? "Generate license"}
      </Button>

      <LicenseCreateFlow
        key={session}
        applicationId={applicationId}
        applicationSlug={applicationSlug}
        open={open}
        onOpenChange={setOpen}
        // Acknowledging bumps the key, which unmounts the component holding
        // the plaintext and closes the dialog in the same commit.
        onAcknowledge={() => {
          setOpen(false);
          setSession((value) => value + 1);
        }}
        onGenerateAnother={openFresh}
      />
    </>
  );
}
