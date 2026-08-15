"use client";

import { useActionState, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  deleteProductAction,
  renameProductAction,
  type ActionState,
} from "@/app/dashboard/products/actions";
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

const INITIAL: ActionState = { error: null };

export function ProductActions({ productId, name }: { productId: string; name: string }) {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const [renameState, renameAction, renamePending] = useActionState(renameProductAction, INITIAL);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteProductAction, INITIAL);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${name}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            Delete
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
              <Input id={`rename-${productId}`} name="name" defaultValue={name} required maxLength={200} />
              {renameState.error ? (
                <p className="text-sm text-destructive">{renameState.error}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={renamePending}>
                {renamePending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          <form action={deleteAction}>
            <input type="hidden" name="productId" value={productId} />
            <DialogHeader>
              <DialogTitle>Delete {name}?</DialogTitle>
              <DialogDescription>
                This permanently deletes the product and every license under it. Software
                using those licenses will stop authenticating immediately. This cannot be
                undone.
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
              {deleteState.error ? (
                <p className="text-sm text-destructive">{deleteState.error}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDeleting(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={deletePending || confirmation !== name}
              >
                {deletePending ? "Deleting…" : "Delete product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
