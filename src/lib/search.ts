/**
 * Escapes the three characters Postgres's LIKE/ILIKE treats specially.
 *
 * Dashboard search terms are free text a developer typed. Without escaping,
 * searching for "50%" matches every row, "order_9" matches "orderX9", and a
 * stray backslash silently swallows the character after it.
 *
 * Backslash is replaced first — otherwise it would escape the escapes added
 * for `%` and `_` afterwards. Postgres uses backslash as the default LIKE
 * escape character, so no explicit `ESCAPE` clause is required.
 *
 * This is not an injection defence: values are always bound as parameters.
 * It exists so the pattern language does not leak into what the developer
 * typed.
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** A contains-match pattern for a user-supplied term. */
export function containsPattern(term: string): string {
  return `%${escapeLikePattern(term)}%`;
}
