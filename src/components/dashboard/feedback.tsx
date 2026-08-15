"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/actions/state";
import { cn } from "@/lib/utils";

/**
 * Turns an action result into a toast, exactly once per result.
 *
 * The guard is reference identity against the last state this hook reacted
 * to. A server action returns a fresh object on every submission, so two
 * identical successes in a row still each raise a toast, while an unrelated
 * re-render raises none. `useActionState` has no reset, so without the guard
 * the last result would re-announce itself on every render of the component.
 */
export function useActionFeedback<TData>(
  state: ActionState<TData>,
  handlers: { onSuccess?: (data: TData) => void; onError?: () => void } = {},
): void {
  const latest = useRef(handlers);

  useEffect(() => {
    latest.current = handlers;
  });

  const reactedTo = useRef<ActionState<TData> | null>(null);

  useEffect(() => {
    if (reactedTo.current === state) return;
    reactedTo.current = state;

    if (state.status === "success") {
      toast.success(state.message);
      latest.current.onSuccess?.(state.data);
    } else if (state.status === "error") {
      toast.error(state.message);
      latest.current.onError?.();
    }
  }, [state]);
}

/**
 * A submit button whose width does not change when it becomes busy.
 *
 * Both labels occupy the same grid cell, so the button is sized to the wider
 * of the two and stays put. A button that shrinks from "Generate license" to
 * "Generating…" moves everything beside it at the exact moment the developer
 * is watching to see whether their click registered.
 *
 * `useFormStatus` reads the enclosing form's pending state, which is also what
 * makes double submission impossible: the button disables itself the moment
 * the first submission starts, without the caller having to thread state down.
 */
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  variant,
  size,
  className,
  icon,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  disabled?: boolean;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  icon?: React.ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending || disabled}
      aria-busy={pending}
      className={className}
    >
      <span className="grid place-items-center">
        {/* Both labels occupy the cell so the width is fixed, but only the
            visible one is in the accessibility tree — otherwise the button
            would be announced as "Generate license Generating…", which is
            both wrong and confusing at the moment it matters most. */}
        <span
          aria-hidden={pending}
          className={cn(
            "col-start-1 row-start-1 flex items-center gap-1.5",
            pending && "invisible",
          )}
        >
          {icon}
          {children}
        </span>
        <span
          aria-hidden={!pending}
          className={cn(
            "col-start-1 row-start-1 flex items-center gap-1.5",
            !pending && "invisible",
          )}
        >
          <Spinner />
          {pendingLabel ?? children}
        </span>
      </span>
    </Button>
  );
}

/**
 * `motion-safe:` so the rotation is dropped for anyone who has asked their
 * system for reduced motion. The disabled state and the label still convey
 * that work is in progress, so nothing is lost by holding still.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      aria-hidden="true"
      className={cn("size-4 motion-safe:animate-spin", className)}
    />
  );
}

/**
 * Announces an asynchronous result to assistive technology.
 *
 * Toasts are rendered in a portal at the end of the document, and while Sonner
 * announces them, a result that also changes the page needs its own polite
 * region so the change is not silent.
 */
export function LiveRegion({ children }: { children: React.ReactNode }) {
  return (
    <span aria-live="polite" className="sr-only">
      {children}
    </span>
  );
}

/**
 * An inline field error, tied to its input by id so a screen reader reads the
 * problem when focus lands on the box rather than only in a toast that may
 * already have gone.
 */
export function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null;

  return (
    <p id={id} className="text-sm text-destructive">
      {children}
    </p>
  );
}
