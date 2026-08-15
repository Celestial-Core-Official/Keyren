/**
 * The vocabulary of the products list, kept free of database and Clerk
 * imports so the URL parser and the service can each depend on it without
 * depending on each other.
 */

export const PRODUCT_SORTS = ["newest", "oldest", "name", "licenses"] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];

export type ProductQuery = {
  q: string;
  sort: ProductSort;
};

export const DEFAULT_PRODUCT_QUERY: ProductQuery = { q: "", sort: "newest" };

export const PRODUCT_SORT_LABELS: Record<ProductSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  name: "Name A–Z",
  licenses: "Most licenses",
};

export function isProductFiltered(query: ProductQuery): boolean {
  return query.q !== "";
}
