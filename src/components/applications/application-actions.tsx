"use client";

import { useActionState, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Power, PowerOff, Trash2 } from "lucide-react";
import {
  deleteApplicationAction,
  renameApplicationAction,
  setApplicationDisabledAction,
  type ApplicationActionState,
} from "@/app/dashboard/applications/actions";
import { FieldError, SubmitButton, useActionFeedback } from "@/components/dashboard/feedback";
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

const INITIAL: ApplicationActionState = idleAction();

export function ApplicationActions({
  applicationId,
  name,
  disabled = false,
}: {
  applicationId: string;
  name: string;
  disabled?: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const statusForm = useRef<HTMLFormElement>(null);

  const [renameState, renameAction] = useActionState(renameApplicationAction, INITIAL);
  const [deleteState, deleteAction] = useActionState(deleteApplicationAction, INITIAL);
  const [statusState, statusAction, statusPending] = useActionState(
    setApplicationDisabledAction,
    INITIAL,
  );

  useActionFeedback(renameState, { onSuccess: () => setRenaming(false) });
  useActionFeedback(deleteState);
  useActionFeedback(statusState, { onSuccess: () => setDisabling(false) });

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
            className="group/actions size-8"
            aria-label={`Actions for ${name}`}
          >
            {/* Held at 70% until this control is hovered, focused or open —
                the same discipline every icon in the dashboard chrome
                follows. An overflow trigger at full contrast competes with
                the row's own content for attention it has not earned. */}
            <MoreHorizontal className="size-4 opacity-70 transition-opacity duration-[var(--speed-quick)] group-hover/actions:opacity-100 group-focus-visible/actions:opacity-100 group-aria-expanded/actions:opacity-100" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil className="size-4" />
            Rename
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={statusPending}
            onSelect={() => {
              // Off asks first; on restores service and does not. Submitting a
              // form that lives outside this menu, so the menu closing on
              // select cannot take the submission down with it.
              if (disabled) statusForm.current?.requestSubmit();
              else setDisabling(true);
            }}
          >
            {disabled ? <Power className="size-4" /> : <PowerOff className="size-4" />}
            {disabled ? "Enable" : "Disable"}
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2 className="size-4" />
            Delete application
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* The end state is posted rather than a toggle instruction, so two tabs
          open on the same application cannot race to opposite answers. */}
      <form ref={statusForm} action={statusAction} className="hidden">
        <input type="hidden" name="applicationId" value={applicationId} />
        <input type="hidden" name="disabled" value={disabled ? "false" : "true"} />
      </form>

      <AlertDialog open={disabling} onOpenChange={setDisabling}>
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
            <AlertDialogAction
              variant="destructive"
              onClick={() => statusForm.current?.requestSubmit()}
            >
              Disable application
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <form action={renameAction}>
            <input type="hidden" name="applicationId" value={applicationId} />
            <DialogHeader>
              <DialogTitle>Rename application</DialogTitle>
              <DialogDescription>
                The application ID stays the same, so deployed software keeps working.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-5">
              <Label htmlFor={`rename-${applicationId}`}>Application name</Label>
              <Input
                id={`rename-${applicationId}`}
                name="name"
                defaultValue={name}
                required
                maxLength={200}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? `rename-error-${applicationId}` : undefined}
              />
              <FieldError id={`rename-error-${applicationId}`}>{nameError}</FieldError>
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
            <input type="hidden" name="applicationId" value={applicationId} />
            <DialogHeader>
              <DialogTitle>Delete {name}?</DialogTitle>
              <DialogDescription>
                This permanently deletes the application and every license under it. Software
                using those licenses will stop authenticating immediately and will receive
                APPLICATION_INVALID. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-5">
              <Label htmlFor={`confirm-${applicationId}`}>
                Type <span className="font-mono text-foreground">{name}</span> to confirm
              </Label>
              <Input
                id={`confirm-${applicationId}`}
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
                Delete application
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
