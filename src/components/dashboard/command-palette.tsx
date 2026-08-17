"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Layers, Plus, Settings } from "lucide-react";
import { searchLicensesAction } from "@/app/dashboard/search-actions";
import type { LicenseSearchHit } from "@/lib/licenses/query";
import type { SwitchableApplication } from "@/components/dashboard/application-switcher";
import { openDialogElement } from "@/components/dashboard/keyboard-shortcuts";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Marks the palette's own dialog, so the shortcut can still close it. */
const PALETTE_ATTRIBUTE = "data-keyren-palette";

/**
 * How anything outside this tree asks the palette to open.
 *
 * A custom event rather than lifted state or a context provider: the palette
 * is mounted once in the dashboard layout, and the only other caller is the
 * header's search button, which is a sibling. A provider for two components
 * would be ceremony, and lifting the state would push `"use client"` onto the
 * layout, which is a server component that fetches the application list.
 *
 * The listener routes through the same guard as ⌘K, so this cannot be used to
 * open the palette over the show-once reveal dialog.
 */
export const OPEN_PALETTE_EVENT = "keyren:open-palette";

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT));
}

type Entry = {
  key: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  go: string;
};

/**
 * Jump anywhere without knowing where it is.
 *
 * Applications are matched in the browser — the list is already loaded for the
 * switcher and is small by nature. Licenses have to go to the server, because
 * a key suffix belongs to whichever application it belongs to and the browser
 * has no idea which.
 */
export function CommandPalette({
  applications,
}: {
  applications: readonly SwitchableApplication[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<readonly LicenseSearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [, startTransition] = useTransition();

  // Guards against an earlier, slower response overwriting a later one — the
  // classic way a palette ends up showing results for a term you already
  // finished typing over.
  const requestRef = useRef(0);

  useEffect(() => {
    /**
     * The one path that may open this palette.
     *
     * Closing is always allowed; opening it over another modal is not. The
     * show-once key reveal is the case that decides this: it deliberately
     * cannot be dismissed by Escape, by a click outside, or by a close
     * button, because each of those would destroy plaintext keys the
     * developer has not saved yet. A palette opening on top would hand back
     * exactly that — a navigation, one keystroke away — and the keys exist
     * nowhere else once this tree unmounts.
     *
     * Both the ⌘K binding and the header's search button route through here,
     * so a second entry point cannot accidentally acquire a weaker guard.
     */
    function toggleIfAllowed(): boolean {
      const dialog = openDialogElement();
      if (dialog && dialog.getAttribute(PALETTE_ATTRIBUTE) === null) return false;

      setOpen((current) => !current);
      return true;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      if (toggleIfAllowed()) event.preventDefault();
    }

    function onRequestOpen() {
      toggleIfAllowed();
    }

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_PALETTE_EVENT, onRequestOpen);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_PALETTE_EVENT, onRequestOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const id = ++requestRef.current;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const results = await searchLicensesAction(term);
        // Stale response: a newer keystroke already fired.
        if (id !== requestRef.current) return;
        setHits(results);
      });
    }, 150);

    return () => clearTimeout(timer);
  }, [term, open]);

  const needle = term.trim().toLowerCase();

  const applicationEntries: Entry[] = applications
    .filter(
      (application) =>
        needle === "" ||
        application.name.toLowerCase().includes(needle) ||
        application.id.toLowerCase().includes(needle),
    )
    .slice(0, 5)
    .map((application) => ({
      key: `app-${application.id}`,
      label: application.name,
      hint: application.disabled ? "Disabled" : undefined,
      icon: <Layers className="size-4 shrink-0 opacity-70" />,
      go: `/dashboard/applications/${application.id}`,
    }));

  const licenseEntries: Entry[] = hits.map((hit) => ({
    key: `lic-${hit.id}`,
    label: hit.label ?? `Unlabeled ••••${hit.keyLast4}`,
    hint: hit.applicationName,
    icon: <KeyRound className="size-4 shrink-0 opacity-70" />,
    go: `/dashboard/applications/${hit.applicationId}/licenses?q=${hit.keyLast4}`,
  }));

  const actionEntries: Entry[] = [
    {
      key: "act-new",
      label: "New application",
      icon: <Plus className="size-4 shrink-0 opacity-70" />,
      go: "/dashboard/applications?new=1",
    },
    {
      key: "act-settings",
      label: "Settings",
      icon: <Settings className="size-4 shrink-0 opacity-70" />,
      go: "/dashboard/settings",
    },
  ].filter((entry) => needle === "" || entry.label.toLowerCase().includes(needle));

  const entries = [...applicationEntries, ...licenseEntries, ...actionEntries];
  const clamped = Math.min(active, Math.max(entries.length - 1, 0));

  function choose(entry: Entry | undefined) {
    if (!entry) return;
    setOpen(false);
    setTerm("");
    setHits([]);
    setActive(0);
    router.push(entry.go);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        {...{ [PALETTE_ATTRIBUTE]: "true" }}
        className="top-24 max-w-lg translate-y-0 gap-0 p-0"
      >
        <DialogTitle className="sr-only">Search applications and licenses</DialogTitle>

        <Input
          autoFocus
          value={term}
          placeholder="Search applications, or a license by label or last 4…"
          onChange={(event) => {
            setTerm(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((current) => Math.min(current + 1, entries.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current) => Math.max(current - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              choose(entries[clamped]);
            }
          }}
          className="h-12 rounded-none border-0 border-b border-border px-4 text-base focus-visible:ring-0"
        />

        <ul className="max-h-80 overflow-y-auto p-1">
          {entries.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing matches “{term}”.
            </li>
          ) : (
            entries.map((entry, index) => (
              <li key={entry.key}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(entry)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm",
                    index === clamped ? "bg-accent text-foreground" : "text-muted-foreground",
                  )}
                >
                  {entry.icon}
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {entry.label}
                  </span>
                  {entry.hint ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {entry.hint}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
