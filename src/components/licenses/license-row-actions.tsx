"use client";

import { useActionState, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  deleteLicenseAction,
  resetActivationAction,
  restoreLicenseAction,
  revokeLicenseAction,
  type LicenseActionState,
} from "@/app/dashboard/products/[productId]/licenses/actions";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: LicenseActionState = { error: null };

export function LicenseRowActions({
  licenseId,
  productId,
  status,
  hasActivation,
  maskedKey,
}: {
  licenseId: string;
  productId: string;
  status: "active" | "revoked";
  hasActivation: boolean;
  maskedKey: string;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState("");

  const [, revoke, revokePending] = useActionState(revokeLicenseAction, INITIAL);
  const [, restore, restorePending] = useActionState(restoreLicenseAction, INITIAL);
  const [, reset, resetPending] = useActionState(resetActivationAction, INITIAL);
  const [deleteState, remove, deletePending] = useActionState(deleteLicenseAction, INITIAL);

  const busy = revokePending || restorePending || resetPending;

  function hidden() {
    return (
      <>
        <input type="hidden" name="licenseId" value={licenseId} />
        <input type="hidden" name="productId" value={productId} />
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={busy}
            aria-label={`Actions for license ending ${maskedKey.slice(-4)}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-52">
          {status === "active" ? (
            <DropdownMenuItem asChild>
              <form action={revoke}>
                {hidden()}
                <button type="submit" className="w-full cursor-pointer text-left">
                  Revoke
                </button>
              </form>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <form action={restore}>
                {hidden()}
                <button type="submit" className="w-full cursor-pointer text-left">
                  Restore
                </button>
              </form>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem asChild disabled={!hasActivation}>
            <form action={reset}>
              {hidden()}
              <button
                type="submit"
                disabled={!hasActivation}
                className="w-full cursor-pointer text-left disabled:cursor-not-allowed"
              >
                Reset activation
              </button>
            </form>
          </DropdownMenuItem>

          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            Delete permanently
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <form action={remove}>
            {hidden()}
            <DialogHeader>
              <DialogTitle>Delete this license permanently?</DialogTitle>
              <DialogDescription>
                <span className="font-mono text-xs">{maskedKey}</span> will be erased along
                with its device activation. Any software using it stops authenticating
                immediately and will receive LICENSE_INVALID. This cannot be undone — if
                you only want to disable it temporarily, revoke it instead.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-5">
              <Label htmlFor={`del-${licenseId}`}>
                Type <span className="font-mono text-foreground">DELETE</span> to confirm
              </Label>
              <Input
                id={`del-${licenseId}`}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
              />
              {deleteState.error ? (
                <p className="text-sm text-destructive">{deleteState.error}</p>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={deletePending || typed !== "DELETE"}
              >
                {deletePending ? "Deleting…" : "Delete permanently"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
