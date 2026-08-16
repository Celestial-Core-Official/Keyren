"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import {
  createApplicationAction,
  type ApplicationActionState,
} from "@/app/dashboard/applications/actions";
import { FieldError, SubmitButton, useActionFeedback } from "@/components/dashboard/feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleAction } from "@/lib/actions/state";

const INITIAL: ApplicationActionState = idleAction();

/**
 * The form lives in its own component so the dialog can remount it with a
 * `key` on every opening.
 *
 * `useActionState` has no reset. Left mounted, the previous attempt's error
 * would be sitting there the next time the dialog opens, complaining about a
 * name the developer has not typed yet. Remounting is the only way to
 * genuinely clear it — clearing it in an effect would work but cascades an
 * extra render, and React's lint rule is right to object.
 */
function CreateApplicationForm({ onCancel }: { onCancel: () => void }) {
  const [state, formAction] = useActionState(createApplicationAction, INITIAL);

  // No success toast: creation redirects to the new application, and arriving
  // there is the confirmation.
  useActionFeedback(state);

  const nameError = state.status === "error" ? state.fieldErrors.name : undefined;

  return (
    <form action={formAction}>
      <DialogHeader>
        <DialogTitle>Create application</DialogTitle>
        <DialogDescription>
          Keyren assigns a permanent application ID. Renaming the application later never changes
          it.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2 py-5">
        <Label htmlFor="application-name">Application name</Label>
        <Input
          id="application-name"
          name="name"
          placeholder="Seliware Key"
          autoFocus
          required
          maxLength={200}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "application-name-error" : undefined}
        />
        <FieldError id="application-name-error">{nameError}</FieldError>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton pendingLabel="Creating…">Create application</SubmitButton>
      </DialogFooter>
    </form>
  );
}

export function CreateApplicationDialog({
  /** Lets an empty state open this dialog without carrying its own copy. */
  open: controlledOpen,
  onOpenChange,
  trigger = true,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: boolean;
} = {}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [session, setSession] = useState(0);

  const open = controlledOpen ?? uncontrolledOpen;

  function setOpen(next: boolean) {
    if (next) setSession((value) => value + 1);
    if (onOpenChange) onOpenChange(next);
    else setUncontrolledOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>
          <Button size="sm" className="gap-1.5" data-keyren-create="application">
            <Plus className="size-4" />
            New application
            <kbd className="ml-1 hidden rounded border border-primary-foreground/25 px-1 font-mono text-[10px] sm:inline">
              N
            </kbd>
          </Button>
        </DialogTrigger>
      ) : null}

      <DialogContent>
        <CreateApplicationForm key={session} onCancel={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
