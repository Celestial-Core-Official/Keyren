"use client";

import { RelativeTime, DayStamp } from "@/components/dashboard/relative-time";
import { LicenseRowActions } from "@/components/licenses/license-row-actions";
import { LicenseStatusBadge } from "@/components/licenses/license-status-badge";
import { maskedLicenseKey } from "@/lib/crypto/license-key";
import { licenseTitle, UNLABELED_LICENSE } from "@/lib/licenses/display";
import type { LicenseListItem } from "@/lib/licenses/types";
import { cn } from "@/lib/utils";

/**
 * The narrow-screen view.
 *
 * Seven columns squeezed into a phone is a table nobody can read and whose
 * row actions sit off the right edge, reachable only by horizontal scrolling
 * — which on touch competes with the page's own scroll. Cards drop the
 * columns that were only ever context (created, notes preview) and keep what
 * a developer is actually looking for: who it is for, whether it works, when
 * it stops, and the one action they came to perform.
 */
export function LicenseCardList({
  licenses,
  applicationId,
  selection,
}: {
  licenses: LicenseListItem[];
  applicationId: string;
  selection?: {
    selected: ReadonlySet<string>;
    onToggle: (id: string, selected: boolean) => void;
  };
}) {
  return (
    <ul className="space-y-3 md:hidden">
      {licenses.map((license) => {
        const isSelected = selection?.selected.has(license.id) ?? false;

        return (
          <li
            key={license.id}
            className={cn(
              "rounded-lg border border-border p-4",
              isSelected && "border-primary/40 bg-accent/30",
            )}
          >
            <div className="flex items-start gap-3">
              {selection ? (
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-primary"
                  checked={isSelected}
                  onChange={(event) => selection.onToggle(license.id, event.target.checked)}
                  aria-label={`Select ${licenseTitle(license)}`}
                />
              ) : null}

              <div className="min-w-0 flex-1 space-y-1">
                <p
                  className={cn(
                    "truncate text-sm font-medium",
                    license.label === null && "text-muted-foreground italic",
                  )}
                  title={license.label ?? UNLABELED_LICENSE}
                >
                  {licenseTitle(license)}
                </p>
                <code className="block font-mono text-xs break-all text-muted-foreground">
                  {maskedLicenseKey(license.keyLast4)}
                </code>
              </div>

              <LicenseStatusBadge
                status={license.status}
                expiresAt={license.expiresAt}
                effectiveStatus={license.effectiveStatus}
              />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <div className="flex flex-col">
                <dt className="text-muted-foreground">Expires</dt>
                <dd>
                  <DayStamp value={license.expiresAt} fallback="Never" />
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-muted-foreground">Device</dt>
                <dd>{license.hwidLocked ? "Locked" : "Unlocked"}</dd>
              </div>
              <div className="col-span-2 flex flex-col">
                <dt className="text-muted-foreground">Activation</dt>
                <dd>
                  {license.activation ? (
                    <>
                      Last seen <RelativeTime value={license.activation.lastSeenAt} />
                    </>
                  ) : (
                    "Not activated"
                  )}
                </dd>
              </div>
            </dl>

            {/* Actions stay in the card's own flow, so nothing important sits
                past the right edge of a phone screen. */}
            <div className="mt-3 border-t border-border/60 pt-3">
              <LicenseRowActions license={license} applicationId={applicationId} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
