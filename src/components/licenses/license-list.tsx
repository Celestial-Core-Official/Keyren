"use client";

import { useState } from "react";
import { LicenseCardList } from "@/components/licenses/license-card-list";
import { LicenseSelectionToolbar } from "@/components/licenses/license-selection-toolbar";
import { LicenseTable } from "@/components/licenses/license-table";
import type { LicenseListItem } from "@/lib/licenses/types";

/**
 * Owns the selection, so the table, the cards and the toolbar all agree.
 *
 * Selection covers the current page only. Carrying it across pages would mean
 * a developer could revoke rows they never saw — and the header checkbox
 * would have to mean "all 4,000 matching licenses", which is not something
 * anyone should be able to do by accident. `pageSignature` resets the
 * selection whenever the underlying rows change, so filtering, sorting or
 * paging never leaves stale ids selected.
 */
export function LicenseList({
  licenses,
  applicationId,
  applicationSlug,
}: {
  licenses: LicenseListItem[];
  applicationId: string;
  applicationSlug: string;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  // A new server render with different rows means the previous selection
  // refers to a view that is no longer on screen. Adjusted during render,
  // which is React's documented way to reset state from a prop.
  const pageSignature = licenses.map((license) => license.id).join(",");
  const [lastSignature, setLastSignature] = useState(pageSignature);

  if (pageSignature !== lastSignature) {
    setLastSignature(pageSignature);
    setSelected(new Set());
  }

  function toggle(id: string, isSelected: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(isSelected: boolean) {
    setSelected(isSelected ? new Set(licenses.map((license) => license.id)) : new Set());
  }

  const selectedIds = licenses
    .filter((license) => selected.has(license.id))
    .map((license) => license.id);

  const selectedLicenses = licenses.filter((license) => selected.has(license.id));

  const selection = { selected, onToggle: toggle, onToggleAll: toggleAll };

  return (
    <div className="space-y-4">
      <LicenseTable licenses={licenses} applicationId={applicationId} selection={selection} />
      <LicenseCardList licenses={licenses} applicationId={applicationId} selection={selection} />

      <LicenseSelectionToolbar
        applicationId={applicationId}
        applicationSlug={applicationSlug}
        selectedIds={selectedIds}
        selectedLicenses={selectedLicenses}
        onClear={() => setSelected(new Set())}
      />
    </div>
  );
}
