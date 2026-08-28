/**
 * Builds a case-insensitive "contains" pattern for a user-supplied term.
 *
 * `%` and `_` are LIKE metacharacters, so an unescaped term lets a search for
 * `%` match every row and a search for `a_c` match `abc` — surprising rather
 * than dangerous, but wrong either way. The backslash also has to be escaped
 * first, or escaping introduces its own metacharacter.
 *
 * Paired with MikroORM's `$ilike`, which parameterises the value.
 */
export const contains = (term: string): string =>
  `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
