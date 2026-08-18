"use client";

import { RelativeTime, DayStamp } from "@/components/dashboard/relative-time";
import { LicenseRowActions } from "@/components/licenses/license-row-actions";
import { LicenseStatusBadge } from "@/components/licenses/license-status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { maskedLicenseKey } from "@/lib/crypto/license-key";
import { KeyGlyph } from "@/lib/design/key-glyph";
import { middleTruncate } from "@/lib/design/truncate";
import { licenseTitle, UNLABELED_LICENSE } from "@/lib/licenses/display";
import type { LicenseListItem } from "@/lib/licenses/types";
import { cn } from "@/lib/utils";

/**
 * The same budget the table uses. A 26-character masked key at 13px mono is
 * wider than the identity column of a 375px card once the checkbox, the glyph
 * and the status label have taken their share, and it middle-truncates for the
 * same reason it does in the table: the `KEYREN-` head is shared by every key,
 * so the tail is the part worth keeping.
 */
const KEY_WIDTH = 22;

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
        const masked = maskedLicenseKey(license.keyLast4);

        return (
          <li
            key={license.id}
            className={cn(
              "rounded-lg border border-border p-4",
              // The same left rail the table gives a selected row, rather than
              // a tinted card: a fill at the contrast a light theme allows is
              // not legible, and a coloured border on a card is banned outright.
              isSelected && "shadow-[inset_2px_0_0_var(--primary)]",
            )}
          >
            <div className="flex items-start gap-3">
              {selection ? (
                <Checkbox
                  className="mt-0.5 shrink-0"
                  checked={isSelected}
                  onCheckedChange={(checked) => selection.onToggle(license.id, checked === true)}
                  aria-label={`Select ${licenseTitle(license)}`}
                />
              ) : null}

              {/* Seeded from the masked key printed directly beneath it. */}
              <KeyGlyph seed={masked} size={24} className="mt-1 shrink-0" />

              <div className="min-w-0 flex-1 space-y-0.5">
                <p
                  className={cn(
                    "truncate text-sm font-medium",
                    license.label === null && "font-normal text-fg-tertiary italic",
                  )}
                  title={license.label ?? UNLABELED_LICENSE}
                >
                  {licenseTitle(license)}
                </p>
                <code
                  className="block font-mono text-[13px] text-fg-tertiary"
                  title={masked}
                >
                  {middleTruncate(masked, KEY_WIDTH)}
                </code>
              </div>

              <LicenseStatusBadge
                status={license.status}
                expiresAt={license.expiresAt}
                effectiveStatus={license.effectiveStatus}
              />
            </div>

            {license.notes ? (
              <p className="mt-2 text-[13px] text-fg-tertiary">{license.notes}</p>
            ) : null}

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
              <div className="flex flex-col">
                <dt className="text-fg-tertiary">Expires</dt>
                <dd>
                  <DayStamp value={license.expiresAt} fallback="Never" />
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-fg-tertiary">Device</dt>
                <dd>{license.hwidLocked ? "Locked" : "Unlocked"}</dd>
              </div>
              <div className="col-span-2 flex flex-col">
                <dt className="text-fg-tertiary">Activation</dt>
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
            <div className="mt-3 border-t border-border pt-3">
              <LicenseRowActions license={license} applicationId={applicationId} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
