/**
 * Wire tokens as words: `unhandled_failure` → "Unhandled failure",
 * `max-iterations` → "Max iterations", `non_functional` → "Non functional".
 * A grammar over separators, never a lookup — the vocabularies these come
 * from are open records on the pipeline, so a table here would be stale the
 * day a pipeline adds a type.
 */
export function humanizeToken(token: string): string {
  const words = token.split(/[_\-\s]+/).filter((word) => word.length > 0);
  if (words.length === 0) return token;
  const joined = words.join(' ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}
