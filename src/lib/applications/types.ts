/**
 * The vocabulary of the applications list, kept free of database and Clerk
 * imports so the URL parser and the service can each depend on it without
 * depending on each other.
 */

export const APPLICATION_SORTS = ["newest", "oldest", "name", "licenses"] as const;

export type ApplicationSort = (typeof APPLICATION_SORTS)[number];

export type ApplicationQuery = {
  q: string;
  sort: ApplicationSort;
};

export const DEFAULT_APPLICATION_QUERY: ApplicationQuery = { q: "", sort: "newest" };

export const APPLICATION_SORT_LABELS: Record<ApplicationSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  name: "Name A–Z",
  licenses: "Most licenses",
};

export function isApplicationFiltered(query: ApplicationQuery): boolean {
  return query.q !== "";
}
