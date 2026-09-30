/**
 * Escapes a user-supplied term for a LIKE / ILIKE pattern, so it matches
 * itself: `%` and `_` are metacharacters, and an unescaped `%` would match
 * every row. The backslash is escaped first, or escaping would introduce its
 * own metacharacter. The caller places the wildcards (`%${escapeLike(term)}%`
 * is "contains"); MikroORM's `$like` / `$ilike` parameterise the value.
 */
export const escapeLike = (term: string): string => term.replace(/[\\%_]/g, '\\$&');
