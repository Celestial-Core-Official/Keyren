"use client";

import { useActionState, useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  deleteProductAction,
  renameProductAction,
  type ProductActionState,
} from "@/app/dashboard/products/actions";
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

const INITIAL: ProductActionState = idleAction();

export function ProductActions({ productId, name }: { productId: string; name: string }) {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const [renameState, renameAction] = useActionState(renameProductAction, INITIAL);
  const [deleteState, deleteAction] = useActionState(deleteProductAction, INITIAL);

  useActionFeedback(renameState, { onSuccess: () => setRenaming(false) });
  useActionFeedback(deleteState);

  // Every dialog opens clean. Carrying a typed confirmation across a close is
  // how a developer ends up one keystroke from deleting something they only
  // opened the dialog to look at. Cleared in the handler rather than an
  // effect, which would cascade an extra render.
  function setDeletingOpen(next: boolean) {
    setDeleting(next);
    if (!next) setConfirmation("");
  }

  const nameError = renameState.status === "error" ? renameState.fieldErrors.name : undefined;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Actions for ${name}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil className="size-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2 className="size-4" />
            Delete product
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <form action={renameAction}>
            <input type="hidden" name="productId" value={productId} />
            <DialogHeader>
              <DialogTitle>Rename product</DialogTitle>
              <DialogDescription>
                The product ID stays the same, so deployed software keeps working.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-5">
              <Label htmlFor={`rename-${productId}`}>Product name</Label>
              <Input
                id={`rename-${productId}`}
                name="name"
                defaultValue={name}
                required
                maxLength={200}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? `rename-error-${productId}` : undefined}
              />
              <FieldError id={`rename-error-${productId}`}>{nameError}</FieldError>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
              <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting} onOpenChange={setDeletingOpen}>
        <DialogContent>
          <form action={deleteAction}>
            <input type="hidden" name="productId" value={productId} />
            <DialogHeader>
              <DialogTitle>Delete {name}?</DialogTitle>
              <DialogDescription>
                This permanently deletes the product and every license under it. Software
                using those licenses will stop authenticating immediately and will receive
                PRODUCT_INVALID. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-5">
              <Label htmlFor={`confirm-${productId}`}>
                Type <span className="font-mono text-foreground">{name}</span> to confirm
              </Label>
              <Input
                id={`confirm-${productId}`}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDeletingOpen(false)}>
                Cancel
              </Button>
              <SubmitButton
                variant="destructive"
                pendingLabel="Deleting…"
                disabled={confirmation !== name}
              >
                Delete product
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
