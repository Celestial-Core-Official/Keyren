"use client";

import { useActionState, useState } from "react";
import { MoreHorizontal, Pencil, RotateCcw, ShieldOff, ShieldCheck, Trash2 } from "lucide-react";
import {
  deleteLicenseAction,
  resetActivationAction,
  restoreLicenseAction,
  revokeLicenseAction,
  type LicenseActionState,
} from "@/app/dashboard/applications/[applicationId]/licenses/actions";
import { EditLicenseDialog } from "@/components/licenses/edit-license-dialog";
import { SubmitButton, useActionFeedback } from "@/components/dashboard/feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleAction } from "@/lib/actions/state";
import type { LicenseListItem } from "@/lib/licenses/types";
import { licenseDisplayName } from "@/lib/licenses/display";
import { maskedLicenseKey } from "@/lib/crypto/license-key";

const INITIAL: LicenseActionState = idleAction();

/**
 * Which single action this license most likely needs next.
 *
 * A locked license bound to a device is almost always being looked at because
 * the customer changed machines, so Reset activation is the useful button. A
 * license that is not bound is being revoked or restored. Putting that one
 * action in the row saves a menu round trip for the overwhelmingly common
 * case, while the menu still holds everything.
 *
 * Reset is deliberately absent for an unlocked license: its activation row
 * records recent activity, not an exclusive claim, so there is nothing to
 * release and the button would imply a binding that does not exist.
 */
export function primaryActionFor(
  license: Pick<LicenseListItem, "status" | "hwidLocked" | "activation">,
): "reset" | "revoke" | "restore" {
  if (license.status === "revoked") return "restore";
  if (license.hwidLocked && license.activation !== null) return "reset";
  return "revoke";
}

export function canResetActivation(
  license: Pick<LicenseListItem, "hwidLocked" | "activation">,
): boolean {
  return license.hwidLocked && license.activation !== null;
}

export function LicenseRowActions({
  license,
  applicationId,
  compact = false,
}: {
  license: LicenseListItem;
  applicationId: string;
  /**
   * Drops the contextual button and leaves the `⋯` trigger alone.
   *
   * The table's action column is 48px wide and its trigger only appears on
   * hover or focus, so there is no room for a second control — and no loss,
   * because the menu already holds every verb the button could have offered.
   * The card list, which has a full row of its own to spend, keeps both.
   */
  compact?: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState("");

  const [revokeState, revoke] = useActionState(revokeLicenseAction, INITIAL);
  const [restoreState, restore] = useActionState(restoreLicenseAction, INITIAL);
  const [resetState, reset] = useActionState(resetActivationAction, INITIAL);
  const [deleteState, remove] = useActionState(deleteLicenseAction, INITIAL);

  // Alpha_v1 discarded three of these four states entirely, so revoking,
  // restoring and resetting were silent whether they worked or not.
  useActionFeedback(revokeState);
  useActionFeedback(restoreState);
  useActionFeedback(resetState);
  useActionFeedback(deleteState, { onSuccess: () => setDeleteOpen(false) });

  // Cleared in the handler rather than an effect, so closing the dialog does
  // not cascade an extra render — and so the next opening never starts with
  // DELETE already typed.
  function setDeleteOpen(next: boolean) {
    setConfirmDelete(next);
    if (!next) setTyped("");
  }

  const name = licenseDisplayName(license);
  const masked = maskedLicenseKey(license.keyLast4);
  const primary = primaryActionFor(license);
  const resettable = canResetActivation(license);

  function identity() {
    return (
      <>
        <input type="hidden" name="licenseId" value={license.id} />
        <input type="hidden" name="applicationId" value={applicationId} />
      </>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {/* The contextual action, one click away rather than behind a menu. */}
      {compact ? null : (
        <form action={primary === "reset" ? reset : primary === "revoke" ? revoke : restore}>
          {identity()}
          <SubmitButton
            variant="outline"
            size="sm"
            className="h-8"
            pendingLabel="Working…"
            icon={
              primary === "reset" ? (
                <RotateCcw className="size-3.5" />
              ) : primary === "revoke" ? (
                <ShieldOff className="size-3.5" />
              ) : (
                <ShieldCheck className="size-3.5" />
              )
            }
          >
            {primary === "reset" ? "Reset" : primary === "revoke" ? "Revoke" : "Restore"}
          </SubmitButton>
        </form>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`More actions for ${name}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil className="size-4" />
            Edit details
          </DropdownMenuItem>

          {license.status === "active" ? (
            <DropdownMenuItem asChild>
              <form action={revoke} className="w-full">
                {identity()}
                <button type="submit" className="flex w-full cursor-pointer items-center gap-2 text-left">
                  <ShieldOff className="size-4" />
                  Revoke
                </button>
              </form>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <form action={restore} className="w-full">
                {identity()}
                <button type="submit" className="flex w-full cursor-pointer items-center gap-2 text-left">
                  <ShieldCheck className="size-4" />
                  Restore
                </button>
              </form>
            </DropdownMenuItem>
          )}

          {resettable ? (
            <DropdownMenuItem asChild>
              <form action={reset} className="w-full">
                {identity()}
                <button type="submit" className="flex w-full cursor-pointer items-center gap-2 text-left">
                  <RotateCcw className="size-4" />
                  Reset activation
                </button>
              </form>
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" />
            Delete permanently
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditLicenseDialog
        license={license}
        applicationId={applicationId}
        open={editing}
        onOpenChange={setEditing}
      />

      <Dialog open={confirmDelete} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <form action={remove}>
            {identity()}
            <DialogHeader>
              <DialogTitle>Delete this license permanently?</DialogTitle>
              <DialogDescription>
                <span className="font-mono text-xs">{masked}</span>
                {license.label ? ` (${license.label})` : ""} will be erased along with its
                device activation. Any software using it stops authenticating immediately
                and will receive LICENSE_INVALID. This cannot be undone — if you only want
                to disable it temporarily, revoke it instead.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-5">
              <Label htmlFor={`del-${license.id}`}>
                Type <span className="font-mono text-foreground">DELETE</span> to confirm
              </Label>
              <Input
                id={`del-${license.id}`}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <SubmitButton
                variant="destructive"
                pendingLabel="Deleting…"
                disabled={typed !== "DELETE"}
              >
                Delete permanently
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
