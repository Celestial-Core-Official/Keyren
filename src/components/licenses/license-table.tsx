"use client";

import { NotebookPen } from "lucide-react";
import { CopyButton } from "@/components/dashboard/copy-button";
import { RelativeTime, DayStamp } from "@/components/dashboard/relative-time";
import { LicenseRowActions } from "@/components/licenses/license-row-actions";
import { LicenseStatusBadge } from "@/components/licenses/license-status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { maskedLicenseKey } from "@/lib/crypto/license-key";
import { KeyGlyph } from "@/lib/design/key-glyph";
import { middleTruncate } from "@/lib/design/truncate";
import { licenseTitle, UNLABELED_LICENSE } from "@/lib/licenses/display";
import type { LicenseListItem } from "@/lib/licenses/types";
import { cn } from "@/lib/utils";

/**
 * How much of the masked key survives in the cell.
 *
 * `KEYREN-••••-••••-••••-WXYZ` is 26 characters, so 22 spends one character on
 * the ellipsis and drops one of the three identical bullet groups — the only
 * part of the string that carries nothing.
 */
const KEY_WIDTH = 22;

/**
 * The desktop view, at one row per license rather than one card per license.
 *
 * Through Alpha_v2 every row stacked label, masked key and notes three deep,
 * which put rows at roughly 72px and made a list of forty licenses read as a
 * column of cards. The key now has its own column and the notes have moved to
 * the label's tooltip, so a row is a single 48px line and a page of them scans
 * the way a table is supposed to.
 */
export function LicenseTable({
  licenses,
  applicationId,
  selection,
}: {
  licenses: LicenseListItem[];
  applicationId: string;
  selection?: {
    selected: ReadonlySet<string>;
    onToggle: (id: string, selected: boolean) => void;
    onToggleAll: (selected: boolean) => void;
  };
}) {
  const allSelected =
    selection !== undefined &&
    licenses.length > 0 &&
    licenses.every((license) => selection.selected.has(license.id));

  const someSelected =
    selection !== undefined && licenses.some((license) => selection.selected.has(license.id));

  return (
    <div className="hidden rounded-lg border border-border md:block">
      <Table>
        {/* Held under the 56px dashboard header so the column names stay
            readable while a long page scrolls past them. */}
        {/* Sticky only from xl, where the container stops being a scrollport
            (see the comment in ui/table.tsx). Below that these classes would
            be inert anyway, so they are not applied rather than applied and
            quietly doing nothing. */}
        <TableHeader className="xl:sticky xl:top-14 xl:z-10 xl:bg-background">
          <TableRow>
            {selection ? (
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={(checked) => selection.onToggleAll(checked === true)}
                  aria-label="Select all licenses on this page"
                />
              </TableHead>
            ) : null}
            <TableHead className="w-10">
              <span className="sr-only">Key mark</span>
            </TableHead>
            <TableHead>License</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Device</TableHead>
            <TableHead>Activation</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {licenses.map((license) => {
            const isSelected = selection?.selected.has(license.id) ?? false;
            const masked = maskedLicenseKey(license.keyLast4);

            return (
              <TableRow
                key={license.id}
                data-state={isSelected ? "selected" : undefined}
                className="group h-12"
              >
                {selection ? (
                  <TableCell>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) =>
                        selection.onToggle(license.id, checked === true)
                      }
                      aria-label={`Select ${licenseTitle(license)}`}
                    />
                  </TableCell>
                ) : null}

                <TableCell>
                  {/* Seeded from the masked key — the same string rendered two
                      cells to the right. Plaintext and the stored HMAC never
                      reach this function, so the mark carries nothing that was
                      not already on the screen. */}
                  <KeyGlyph seed={masked} size={20} />
                </TableCell>

                <TableCell className="max-w-56">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "truncate text-sm font-medium",
                        license.label === null && "font-normal text-fg-tertiary italic",
                      )}
                      title={license.label ?? UNLABELED_LICENSE}
                    >
                      {licenseTitle(license)}
                    </span>

                    {/* Notes used to be a third line in every row. They are an
                        annotation on the licence rather than a column of the
                        table, so they hang off the label instead of setting the
                        height of every row that does not have any. */}
                    {license.notes ? (
                      <span className="shrink-0 text-fg-quaternary" title={license.notes}>
                        <NotebookPen aria-hidden="true" className="size-3.5" />
                        <span className="sr-only">{license.notes}</span>
                      </span>
                    ) : null}
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-1">
                    {/* Middle-truncated, because every key in the table shares
                        the `KEYREN-` head and only the tail tells two rows
                        apart. The full string is in the tooltip and is what
                        the copy button writes. */}
                    <code className="font-mono text-[13px] text-fg-tertiary" title={masked}>
                      {middleTruncate(masked, KEY_WIDTH)}
                    </code>
                    <CopyButton
                      value={masked}
                      label=""
                      className="size-6 shrink-0 px-0 opacity-0 transition-opacity duration-[var(--speed-quick)] group-hover:opacity-100 focus-visible:opacity-100"
                    />
                  </div>
                </TableCell>

                <TableCell>
                  <LicenseStatusBadge
                    status={license.status}
                    expiresAt={license.expiresAt}
                    effectiveStatus={license.effectiveStatus}
                  />
                </TableCell>

                <TableCell className="text-sm text-fg-tertiary">
                  {license.hwidLocked ? "Locked" : "Unlocked"}
                </TableCell>

                <TableCell className="text-sm text-fg-tertiary">
                  {license.activation ? (
                    <RelativeTime value={license.activation.lastSeenAt} />
                  ) : (
                    "Not activated"
                  )}
                </TableCell>

                <TableCell className="text-sm text-fg-tertiary">
                  <DayStamp value={license.expiresAt} fallback="Never" />
                </TableCell>

                <TableCell className="text-sm text-fg-tertiary">
                  <RelativeTime value={license.createdAt} />
                </TableCell>

                <TableCell>
                  {/* Revealed on hover, and — the half that matters — on focus,
                      so the menu is still reachable by keyboard from a row a
                      pointer has never touched. */}
                  <div className="flex justify-end opacity-0 transition-opacity duration-[var(--speed-quick)] group-hover:opacity-100 focus-within:opacity-100 has-aria-expanded:opacity-100">
                    <LicenseRowActions license={license} applicationId={applicationId} compact />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
