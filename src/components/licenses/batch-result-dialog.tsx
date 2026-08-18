"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Download, FlaskConical, Plus } from "lucide-react";
import { CopyButton } from "@/components/dashboard/copy-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CreatedLicense } from "@/lib/licenses/batch";
import {
  exportFilename,
  plaintextToCsv,
  plaintextToJson,
  type PlaintextLicenseRow,
} from "@/lib/licenses/export";
import { CSV_MIME, JSON_MIME, downloadTextFile } from "@/lib/download";

/**
 * The one and only appearance of a set of plaintext license keys.
 *
 * Everything about this dialog is shaped by that. It cannot be closed by
 * Escape, by clicking outside, or by a close button, because all three are
 * things people do reflexively and any of them would destroy keys the
 * developer has not saved. The only exit is an explicit acknowledgement that
 * they have been saved or exported.
 *
 * The keys exist here and nowhere else: not in the database, not in a log,
 * not behind an endpoint that could re-serve them. Once this component
 * unmounts they are unrecoverable, which is the point.
 */
export function BatchResultDialog({
  licenses,
  applicationId,
  applicationSlug,
  onAcknowledge,
  onGenerateAnother,
}: {
  licenses: CreatedLicense[];
  applicationId: string;
  applicationSlug: string;
  onAcknowledge: () => void;
  onGenerateAnother: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  const rows: PlaintextLicenseRow[] = licenses.map((license) => ({
    label: license.label,
    licenseKey: license.licenseKey,
    applicationId: license.applicationId,
    expiresAt: license.expiresAt,
    hwidLocked: license.hwidLocked,
    createdAt: license.createdAt,
  }));

  const allKeys = licenses.map((license) => license.licenseKey).join("\n");
  const single = licenses.length === 1;

  function downloadCsv() {
    downloadTextFile(exportFilename(applicationSlug, "csv"), plaintextToCsv(rows), CSV_MIME);
  }

  function downloadJson() {
    downloadTextFile(
      exportFilename(applicationSlug, "json"),
      `${JSON.stringify(plaintextToJson(rows), null, 2)}\n`,
      JSON_MIME,
    );
  }

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-warning" />
            {single ? "Save this key now" : `Save these ${licenses.length} keys now`}
          </DialogTitle>
          <DialogDescription>
            This is the only time Keyren will ever show{" "}
            {single ? "this license key" : "these license keys"}. Only a secure derived
            value is stored, so nothing here can be recovered or displayed again.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton
              value={allKeys}
              label={single ? "Copy key" : "Copy all keys"}
              variant="secondary"
              announce
              successMessage={
                single ? "License key copied." : `${licenses.length} keys copied.`
              }
              className="h-8"
            />
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={downloadCsv}>
              <Download className="size-3.5" />
              Download CSV
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={downloadJson}>
              <Download className="size-3.5" />
              Download JSON
            </Button>
          </div>

          {/* Selectable text, so a developer whose browser blocks the
              clipboard can still get the keys out by hand. */}
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Newly generated license keys, shown once
              </caption>
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr>
                  {licenses.length > 1 ? (
                    <th scope="col" className="px-3 py-2 text-xs font-medium text-muted-foreground">
                      Label
                    </th>
                  ) : null}
                  <th scope="col" className="px-3 py-2 text-xs font-medium text-muted-foreground">
                    License key
                  </th>
                  <th scope="col" className="w-10 px-3 py-2">
                    <span className="sr-only">Copy</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((license) => (
                  <tr key={license.id} className="border-t border-border/60">
                    {licenses.length > 1 ? (
                      <td className="max-w-40 truncate px-3 py-2 text-muted-foreground">
                        {license.label ?? "—"}
                      </td>
                    ) : null}
                    <td className="px-3 py-2">
                      <code className="select-all break-all font-mono text-xs">
                        {license.licenseKey}
                      </code>
                    </td>
                    <td className="px-3 py-2">
                      <CopyButton value={license.licenseKey} label="" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span className="text-muted-foreground">
              I have saved or exported every key. I understand{" "}
              {single ? "it" : "they"} cannot be shown again.
            </span>
          </label>
        </div>

        <DialogFooter className="sm:justify-between">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!acknowledged}
              onClick={onGenerateAnother}
              className="gap-1.5"
            >
              <Plus className="size-3.5" />
              Generate another
            </Button>

            {/* The tester lives on the application's Settings tab, not on its
                overview — sending a real request through the real rate limiter
                is a deliberate act rather than something to sit beside a
                license count.

                The key is deliberately NOT carried there in the URL — that
                would write plaintext into history, the address bar and any
                referrer. The developer pastes the key they just saved, which
                is also a useful check that they really saved it. */}
            <Button
              asChild
              variant="ghost"
              size="sm"
              disabled={!acknowledged}
              className="gap-1.5"
            >
              <Link
                href={`/dashboard/applications/${applicationId}/settings#api-tester`}
                onClick={(event) => {
                  if (!acknowledged) event.preventDefault();
                  else onAcknowledge();
                }}
                aria-disabled={!acknowledged}
              >
                <FlaskConical className="size-3.5" />
                Test a license
              </Link>
            </Button>
          </div>

          <Button onClick={onAcknowledge} disabled={!acknowledged}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
