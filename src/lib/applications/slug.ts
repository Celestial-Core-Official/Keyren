const MAX_SLUG_LENGTH = 64;

/**
 * Derives a human-readable slug from an application name.
 *
 * Purely cosmetic. Slugs are not unique, are not used for lookup, and are not
 * an identity — duplicate application names are explicitly allowed. The immutable
 * `app_` ID is the only authoritative identifier, which is why this function
 * can afford to be lossy and can always fall back to "application".
 */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    // Strip combining marks left behind by NFKD, so "é" becomes "e".
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Apostrophes are dropped outright rather than treated as a separator,
    // so a contraction like "Acme's" collapses to "acmes", not "acme_s".
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/_+$/g, "");

  return slug.length > 0 ? slug : "application";
}
