"use client";

import { startTransition, useActionState, useState } from "react";
import { Download, RotateCcw, ShieldCheck, ShieldOff, Trash2, X } from "lucide-react";
import {
  bulkLicenseAction,
  exportSelectionAction,
  type BulkActionState,
  type ExportSelectionState,
} from "@/app/dashboard/applications/[applicationId]/licenses/bulk-actions";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleAction } from "@/lib/actions/state";
import { CSV_MIME, JSON_MIME, downloadTextFile } from "@/lib/download";
import {
  exportFilename,
  metadataToCsv,
  type LicenseMetadataRow,
  type MetadataJsonRow,
} from "@/lib/licenses/export";
import type { BulkAction } from "@/lib/validation/dashboard";
import type { LicenseListItem } from "@/lib/licenses/types";

const BULK_INITIAL: BulkActionState = idleAction();
const EXPORT_INITIAL: ExportSelectionState = idleAction();

/**
 * How many of the selected licenses a given action would actually affect.
 *
 * Computed here from rows the page already has, purely so the confirmation
 * can say "3 of 7 are eligible" before anything happens. The server recounts
 * authoritatively — this is a preview, not a decision.
 */
export function eligibilityFor(
  action: BulkAction,
  selected: LicenseListItem[],
): { eligible: number; ineligible: number } {
  const eligible = selected.filter((license) => {
    switch (action) {
      case "revoke":
        return license.status === "active";
      case "restore":
        return license.status === "revoked";
      case "reset":
        return license.hwidLocked && license.activation !== null;
      case "delete":
        return true;
    }
  }).length;

  return { eligible, ineligible: selected.length - eligible };
}

const COPY: Record<
  BulkAction,
  { title: string; verb: string; body: string; destructive: boolean }
> = {
  revoke: {
    title: "Revoke selected licenses?",
    verb: "Revoke",
    body: "Software using them stops authenticating immediately and receives LICENSE_REVOKED. Revoking is reversible — you can restore them later.",
    destructive: false,
  },
  restore: {
    title: "Restore selected licenses?",
    verb: "Restore",
    body: "They start authenticating again straight away, subject to their own expiry and device rules.",
    destructive: false,
  },
  reset: {
    title: "Reset activations?",
    verb: "Reset activations",
    body: "The device bindings are released, so the next device to authenticate claims each license. The licenses themselves are unchanged.",
    destructive: false,
  },
  delete: {
    title: "Delete selected licenses permanently?",
    verb: "Delete permanently",
    body: "They are erased along with their device activations. Any software using them stops authenticating immediately and receives LICENSE_INVALID. This cannot be undone — to disable them temporarily, revoke them instead.",
    destructive: true,
  },
};

export function LicenseSelectionToolbar({
  applicationId,
  applicationSlug,
  selectedIds,
  selectedLicenses,
  onClear,
}: {
  applicationId: string;
  applicationSlug: string;
  selectedIds: string[];
  selectedLicenses: LicenseListItem[];
  onClear: () => void;
}) {
  const [confirming, setConfirming] = useState<BulkAction | null>(null);
  const [typed, setTyped] = useState("");

  const [bulkState, runBulk] = useActionState(bulkLicenseAction, BULK_INITIAL);
  const [exportState, runExport, exporting] = useActionState(
    exportSelectionAction,
    EXPORT_INITIAL,
  );
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("csv");

  /**
   * Dispatched directly rather than through a form, because the format is a
   * property of which button was pressed rather than of the submission — two
   * forms differing only in a hidden field would be worse.
   */
  function exportAs(format: "csv" | "json") {
    setExportFormat(format);

    const formData = new FormData();
    formData.set("applicationId", applicationId);
    for (const id of selectedIds) formData.append("licenseIds", id);

    startTransition(() => runExport(formData));
  }

  useActionFeedback(bulkState, {
    onSuccess: () => {
      closeConfirm();
      onClear();
    },
  });

  // The rows arrive in the action result; the file is assembled here so no
  // endpoint exists that serves license data to whoever holds its URL.
  useActionFeedback(exportState, {
    onSuccess: (data) => {
      if (!data) return;
      writeExport(data.rows, exportFormat, applicationSlug);
      onClear();
    },
  });

  function closeConfirm() {
    setConfirming(null);
    setTyped("");
  }

  const count = selectedIds.length;
  if (count === 0) return null;

  const summary = confirming ? eligibilityFor(confirming, selectedLicenses) : null;
  const requiredPhrase = `DELETE ${count}`;

  function identity() {
    return (
      <>
        <input type="hidden" name="applicationId" value={applicationId} />
        {selectedIds.map((id) => (
          <input key={id} type="hidden" name="licenseIds" value={id} />
        ))}
      </>
    );
  }

  return (
    <>
      <div
        role="region"
        aria-label="Selected licenses"
        className="sticky bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/95 p-3 shadow-[var(--shadow-float)] backdrop-blur"
      >
        <span className="text-sm font-medium tabular-nums" aria-live="polite">
          {count} selected
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setConfirming("revoke")}
          >
            <ShieldOff className="size-3.5" />
            Revoke
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setConfirming("restore")}
          >
            <ShieldCheck className="size-3.5" />
            Restore
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setConfirming("reset")}
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={exporting}
            onClick={() => exportAs("csv")}
          >
            <Download className="size-3.5" />
            Export CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={exporting}
            onClick={() => exportAs("json")}
          >
            <Download className="size-3.5" />
            Export JSON
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirming("delete")}
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            onClick={onClear}
          >
            <X className="size-3.5" />
            Clear
          </Button>
        </div>
      </div>

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => (open ? undefined : closeConfirm())}
      >
        <DialogContent>
          {confirming ? (
            <form action={runBulk}>
              {identity()}
              <input type="hidden" name="action" value={confirming} />

              <DialogHeader>
                <DialogTitle>{COPY[confirming].title}</DialogTitle>
                <DialogDescription>{COPY[confirming].body}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-5">
                <dl className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Selected</dt>
                    <dd className="tabular-nums">{count}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Will change</dt>
                    <dd className="tabular-nums">{summary?.eligible ?? 0}</dd>
                  </div>
                  {summary && summary.ineligible > 0 ? (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">
                        Already in that state, left alone
                      </dt>
                      <dd className="tabular-nums">{summary.ineligible}</dd>
                    </div>
                  ) : null}
                </dl>

                {COPY[confirming].destructive ? (
                  <div className="space-y-2">
                    {/* The count is part of the phrase on purpose: it forces
                        the developer to look at how many they are erasing,
                        rather than typing a word from muscle memory. */}
                    <Label htmlFor="bulk-delete-confirm">
                      Type{" "}
                      <span className="font-mono text-foreground">{requiredPhrase}</span>{" "}
                      to confirm
                    </Label>
                    <Input
                      id="bulk-delete-confirm"
                      value={typed}
                      onChange={(event) => setTyped(event.target.value)}
                      autoComplete="off"
                    />
                  </div>
                ) : null}
              </div>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={closeConfirm}>
                  Cancel
                </Button>
                <SubmitButton
                  variant={COPY[confirming].destructive ? "destructive" : "default"}
                  pendingLabel="Working…"
                  disabled={
                    (COPY[confirming].destructive && typed !== requiredPhrase) ||
                    (summary?.eligible ?? 0) === 0
                  }
                >
                  {COPY[confirming].verb}
                </SubmitButton>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function writeExport(
  rows: MetadataJsonRow[],
  format: "csv" | "json",
  applicationSlug: string,
): void {
  if (format === "json") {
    downloadTextFile(
      exportFilename(applicationSlug, "json"),
      `${JSON.stringify(rows, null, 2)}\n`,
      JSON_MIME,
    );
    return;
  }

  // Back into Date objects so the one CSV serializer — with its quoting and
  // its formula hardening — is the only thing that ever writes a cell.
  const revived: LicenseMetadataRow[] = rows.map((row) => ({
    ...row,
    expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
    activatedAt: row.activatedAt ? new Date(row.activatedAt) : null,
    lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt) : null,
    createdAt: new Date(row.createdAt),
  }));

  downloadTextFile(exportFilename(applicationSlug, "csv"), metadataToCsv(revived), CSV_MIME);
}
