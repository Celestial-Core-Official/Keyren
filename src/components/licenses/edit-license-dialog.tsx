"use client";

import { useActionState, useState } from "react";
import {
  updateLicenseDetailsAction,
  type LicenseActionState,
} from "@/app/dashboard/products/[productId]/licenses/actions";
import { FieldError, SubmitButton, useActionFeedback } from "@/components/dashboard/feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleAction } from "@/lib/actions/state";
import { maskedLicenseKey } from "@/lib/crypto/license-key";
import { LICENSE_LABEL_MAX, LICENSE_NOTES_MAX } from "@/lib/licenses/types";
import type { LicenseListItem } from "@/lib/licenses/types";

const INITIAL: LicenseActionState = idleAction();

/**
 * Edits the only two mutable fields a license has.
 *
 * Everything else about a license — its key, its expiry, its device lock — is
 * fixed at creation, so this dialog deliberately shows them as context rather
 * than as inputs. A developer who wants different terms issues a new license.
 */
function EditLicenseForm({
  license,
  productId,
  onDone,
}: {
  license: LicenseListItem;
  productId: string;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(updateLicenseDetailsAction, INITIAL);

  useActionFeedback(state, { onSuccess: onDone });

  const labelError = state.status === "error" ? state.fieldErrors.label : undefined;
  const notesError = state.status === "error" ? state.fieldErrors.notes : undefined;

  return (
        <form action={formAction}>
          <input type="hidden" name="licenseId" value={license.id} />
          <input type="hidden" name="productId" value={productId} />

          <DialogHeader>
            <DialogTitle>Edit license details</DialogTitle>
            <DialogDescription>
              <span className="font-mono text-xs">
                {maskedLicenseKey(license.keyLast4)}
              </span>
              . Labels and notes are for your dashboard only — neither is ever returned by
              the verification API, so nothing here reaches your customers.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-5">
            <div className="space-y-2">
              <Label htmlFor={`label-${license.id}`}>Label</Label>
              <Input
                id={`label-${license.id}`}
                name="label"
                defaultValue={license.label ?? ""}
                maxLength={LICENSE_LABEL_MAX}
                placeholder="Acme Corp — invoice 8891"
                autoComplete="off"
                aria-invalid={labelError ? true : undefined}
                aria-describedby={labelError ? `label-error-${license.id}` : undefined}
              />
              <FieldError id={`label-error-${license.id}`}>{labelError}</FieldError>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`notes-${license.id}`}>Notes</Label>
              <textarea
                id={`notes-${license.id}`}
                name="notes"
                defaultValue={license.notes ?? ""}
                maxLength={LICENSE_NOTES_MAX}
                rows={4}
                placeholder="Anything you want to remember about this license."
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-invalid={notesError ? true : undefined}
                aria-describedby={notesError ? `notes-error-${license.id}` : undefined}
              />
              <FieldError id={`notes-error-${license.id}`}>{notesError}</FieldError>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
          </DialogFooter>
        </form>
  );
}

export function EditLicenseDialog({
  license,
  productId,
  open,
  onOpenChange,
}: {
  license: LicenseListItem;
  productId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // A fresh `key` each time the dialog opens remounts the form, which is what
  // returns the inputs to the stored values and discards the previous
  // attempt's validation errors — `useActionState` has no reset of its own.
  const [session, setSession] = useState(0);

  function setOpen(next: boolean) {
    if (next) setSession((value) => value + 1);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <EditLicenseForm
          key={session}
          license={license}
          productId={productId}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
