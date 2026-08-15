import type { LicenseView } from "./service";

/**
 * The vocabulary of the license browser, kept in one dependency-free module.
 *
 * The URL parser (in `validation/dashboard`) and the SQL builder (in
 * `licenses/query`) both need these, and neither should have to import the
 * other to get them.
 */

export const LICENSE_STATUS_FILTERS = ["all", "active", "revoked", "expired"] as const;
export const ACTIVATION_FILTERS = ["all", "activated", "unactivated"] as const;
export const LOCK_FILTERS = ["all", "locked", "unlocked"] as const;
export const LICENSE_SORTS = [
  "newest",
  "oldest",
  "label",
  "expiresSoon",
  "lastSeen",
] as const;
export const PAGE_SIZES = [25, 50, 100] as const;

/** Long enough for any real label; short enough that the URL stays sane. */
export const SEARCH_MAX_LENGTH = 120;

/**
 * Field and batch bounds live here, with no imports, so the validation
 * schemas, the batch service and the React inputs all constrain to the same
 * numbers instead of each carrying their own copy.
 */
export const LICENSE_LABEL_MAX = 120;
export const LICENSE_NOTES_MAX = 1000;

/**
 * One hundred is where a batch stops being a convenience and starts being a
 * way to lock a table for everyone else. It is also the point past which the
 * one-time reveal becomes unreadable, and an unreadable reveal is how keys get
 * lost.
 */
export const BATCH_QUANTITY_MIN = 1;
export const BATCH_QUANTITY_MAX = 100;

export type LicenseStatusFilter = (typeof LICENSE_STATUS_FILTERS)[number];
export type ActivationFilter = (typeof ACTIVATION_FILTERS)[number];
export type LockFilter = (typeof LOCK_FILTERS)[number];
export type LicenseSort = (typeof LICENSE_SORTS)[number];
export type PageSize = (typeof PAGE_SIZES)[number];

export type LicenseQuery = {
  q: string;
  status: LicenseStatusFilter;
  activation: ActivationFilter;
  lock: LockFilter;
  sort: LicenseSort;
  page: number;
  pageSize: PageSize;
};

export const DEFAULT_LICENSE_QUERY: LicenseQuery = {
  q: "",
  status: "all",
  activation: "all",
  lock: "all",
  sort: "newest",
  page: 1,
  pageSize: 25,
};

/** Human labels for the sort control, so the UI has no second list to drift. */
export const LICENSE_SORT_LABELS: Record<LicenseSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  label: "Label A–Z",
  expiresSoon: "Expiring soonest",
  lastSeen: "Recently seen",
};

export const LICENSE_STATUS_FILTER_LABELS: Record<LicenseStatusFilter, string> = {
  all: "Any status",
  active: "Active",
  revoked: "Revoked",
  expired: "Expired",
};

export const ACTIVATION_FILTER_LABELS: Record<ActivationFilter, string> = {
  all: "Any activation",
  activated: "Activated",
  unactivated: "Not activated",
};

export const LOCK_FILTER_LABELS: Record<LockFilter, string> = {
  all: "Any device lock",
  locked: "Locked to a device",
  unlocked: "Unlocked",
};

/**
 * What the dashboard shows in the status column.
 *
 * `licenses.status` alone is not it: an active row past its expiry is
 * "expired" as far as the verification API — and therefore the customer — is
 * concerned. Computing it in SQL means filtering and display cannot disagree.
 */
export type EffectiveStatus = "active" | "revoked" | "expired";

export type LicenseListItem = LicenseView & { effectiveStatus: EffectiveStatus };

export type LicensePage = {
  rows: LicenseListItem[];
  total: number;
  page: number;
  pageSize: PageSize;
  pageCount: number;
};

/** True when any filter is narrowing the view, so the UI can offer a reset. */
export function isFiltered(query: LicenseQuery): boolean {
  return (
    query.q !== "" ||
    query.status !== "all" ||
    query.activation !== "all" ||
    query.lock !== "all"
  );
}
