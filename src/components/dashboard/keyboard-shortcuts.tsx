"use client";

import { useEffect, useState } from "react";
import { KEYBOARD_SHORTCUTS } from "@/lib/shortcuts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Two shortcuts, chosen because they are the two things a developer does
 * repeatedly: find a license, and make a new one.
 *
 * Everything here hinges on not stealing keystrokes. A bare letter shortcut
 * that fires while someone is typing a label into a text box is worse than no
 * shortcut at all, so the handler refuses to act when focus is in any kind of
 * editable field, when a modifier is held (those belong to the browser and
 * the operating system), when the key came from an IME composition, or when a
 * modal dialog is open — inside a dialog, "N" is a letter someone is typing.
 *
 * Escape is deliberately absent: Radix already closes dialogs and menus with
 * it, and the one dialog that must not be dismissed that way — the show-once
 * key reveal — cancels the event itself. Handling Escape here would risk
 * defeating that.
 */

const EDITABLE = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function isTypingInFormField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return EDITABLE.has(target.tagName) || target.isContentEditable;
}

export function KeyboardShortcuts() {
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Composing a character with an IME produces keydown events whose key
      // is meaningless; acting on them would break Japanese or Chinese input.
      if (event.isComposing) return;
      if (isTypingInFormField(event.target)) return;

      // A dialog is open: every letter is content, not a command.
      if (document.querySelector("[role='dialog'][data-state='open']")) return;

      if (event.key === "/") {
        const search = document.querySelector<HTMLInputElement>(
          "[data-keyren-search='true']",
        );
        if (!search) return;

        // Prevented only once a target exists, so "/" still types normally on
        // a page with no search box.
        event.preventDefault();
        search.focus();
        search.select();
        return;
      }

      if (event.key === "n" || event.key === "N") {
        const create = document.querySelector<HTMLElement>("[data-keyren-create]");
        if (!create) return;

        event.preventDefault();
        create.click();
        return;
      }

      // "?" is Shift+/ on most layouts, so it is matched on the produced
      // character rather than on the physical key.
      if (event.key === "?") {
        event.preventDefault();
        setShowing(true);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // The list used to exist only as static text on the settings page, which is
  // the one page you are not on when you want to know a shortcut.
  return (
    <Dialog open={showing} onOpenChange={setShowing}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <dl className="space-y-2 text-sm">
          {KEYBOARD_SHORTCUTS.map((shortcut) => (
            <div key={shortcut.description} className="flex items-baseline gap-3">
              <dt className="flex w-16 shrink-0 gap-1">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs"
                  >
                    {key}
                  </kbd>
                ))}
              </dt>
              <dd className="text-muted-foreground">{shortcut.description}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
