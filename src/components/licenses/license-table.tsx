"use client";

import { RelativeTime, DayStamp } from "@/components/dashboard/relative-time";
import { LicenseRowActions } from "@/components/licenses/license-row-actions";
import { LicenseStatusBadge } from "@/components/licenses/license-status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { maskedLicenseKey } from "@/lib/crypto/license-key";
import { licenseTitle, UNLABELED_LICENSE } from "@/lib/licenses/display";
import type { LicenseListItem } from "@/lib/licenses/types";
import { cn } from "@/lib/utils";

/**
 * The desktop view.
 *
 * The identity column carries the label as its primary line with the masked
 * key beneath it. Alpha_v1 had only the masked key, which meant every row
 * looked the same and told the developer nothing about who the license was
 * for.
 */
export function LicenseTable({
  licenses,
  productId,
  selection,
}: {
  licenses: LicenseListItem[];
  productId: string;
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
    <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
      <Table>
        <TableHeader>
          <TableRow>
            {selection ? (
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={allSelected}
                  // Indeterminate cannot be expressed as an attribute, so the
                  // DOM property is set through a ref callback.
                  ref={(node) => {
                    if (node) node.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={(event) => selection.onToggleAll(event.target.checked)}
                  aria-label="Select all licenses on this page"
                />
              </TableHead>
            ) : null}
            <TableHead>License</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Device</TableHead>
            <TableHead>Activation</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-40 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {licenses.map((license) => {
            const isSelected = selection?.selected.has(license.id) ?? false;

            return (
              <TableRow key={license.id} data-state={isSelected ? "selected" : undefined}>
                {selection ? (
                  <TableCell>
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={isSelected}
                      onChange={(event) => selection.onToggle(license.id, event.target.checked)}
                      aria-label={`Select ${licenseTitle(license)}`}
                    />
                  </TableCell>
                ) : null}

                <TableCell className="max-w-64">
                  <p
                    className={cn(
                      "truncate text-sm font-medium",
                      license.label === null && "text-muted-foreground italic",
                    )}
                    title={license.label ?? UNLABELED_LICENSE}
                  >
                    {licenseTitle(license)}
                  </p>
                  <code className="font-mono text-xs text-muted-foreground">
                    {maskedLicenseKey(license.keyLast4)}
                  </code>
                  {license.notes ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground" title={license.notes}>
                      {license.notes}
                    </p>
                  ) : null}
                </TableCell>

                <TableCell>
                  <LicenseStatusBadge
                    status={license.status}
                    expiresAt={license.expiresAt}
                    effectiveStatus={license.effectiveStatus}
                  />
                </TableCell>

                <TableCell className="text-sm text-muted-foreground">
                  {license.hwidLocked ? "Locked" : "Unlocked"}
                </TableCell>

                <TableCell className="text-sm text-muted-foreground">
                  {license.activation ? (
                    <RelativeTime value={license.activation.lastSeenAt} />
                  ) : (
                    "Not activated"
                  )}
                </TableCell>

                <TableCell className="text-sm text-muted-foreground">
                  <DayStamp value={license.expiresAt} fallback="Never" />
                </TableCell>

                <TableCell className="text-sm text-muted-foreground">
                  <RelativeTime value={license.createdAt} />
                </TableCell>

                <TableCell>
                  <LicenseRowActions license={license} productId={productId} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
