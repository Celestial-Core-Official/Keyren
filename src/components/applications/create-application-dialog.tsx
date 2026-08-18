"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import {
  createApplicationAction,
  type ApplicationActionState,
} from "@/app/dashboard/applications/actions";
import { FieldError, SubmitButton, useActionFeedback } from "@/components/dashboard/feedback";
import { useQueryParams } from "@/components/dashboard/use-query-params";
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
import { Kbd } from "@/components/ui/kbd";
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
  requested = false,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: boolean;
  /**
   * `?new=1` in the URL.
   *
   * The application switcher and the command palette both offer "New
   * application" from anywhere in the dashboard, and neither can open a dialog
   * that lives on a page they are not on — so they navigate here and say what
   * they came for. Without this the developer landed on the list and had to
   * find the button again, which is the friction those entries exist to
   * remove.
   */
  requested?: boolean;
} = {}) {
  const { setParams } = useQueryParams();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(requested);
  const [session, setSession] = useState(0);

  // Adjusted during render rather than in an effect, the same way the mobile
  // nav closes itself on navigation. It matters for the developer who is
  // already on this page: picking "New application" from the switcher changes
  // the URL without remounting anything, so only a change in this prop can
  // open the dialog.
  const [lastRequested, setLastRequested] = useState(requested);
  if (requested !== lastRequested) {
    setLastRequested(requested);
    if (requested) {
      setSession((value) => value + 1);
      setUncontrolledOpen(true);
    }
  }

  const open = controlledOpen ?? uncontrolledOpen;

  function setOpen(next: boolean) {
    if (next) setSession((value) => value + 1);
    if (onOpenChange) onOpenChange(next);
    else setUncontrolledOpen(next);

    // The URL claimed the dialog was open. It is not any more, and leaving the
    // parameter behind would reopen it on the next refresh or back navigation.
    if (!next && requested) setParams({ new: null });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>
          <Button size="sm" className="gap-1.5" data-keyren-create="application">
            <Plus className="size-4" />
            New application
            {/* The shared chip rather than a bespoke one: sans, 12px, 4px
                radius, one height everywhere the product shows a binding.
                Recoloured for a primary fill, which is the only surface in
                the app where a Kbd sits on the accent rather than on a
                page. */}
            <Kbd className="ml-1 hidden border-primary-foreground/30 bg-transparent text-primary-foreground/80 sm:inline-flex">
              N
            </Kbd>
          </Button>
        </DialogTrigger>
      ) : null}

      <DialogContent>
        <CreateApplicationForm key={session} onCancel={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
