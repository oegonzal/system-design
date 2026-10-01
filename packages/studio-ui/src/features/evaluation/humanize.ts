/**
 * Wire tokens as words: `unhandled_failure` → "Unhandled failure",
 * `max-iterations` → "Max iterations", `critic.scale` → "Critic scale".
 * A grammar over separators, never a lookup — the vocabularies these come
 * from are open records on the pipeline, so a table here would be stale the
 * day a pipeline adds a type. A vocabulary that declares its own labels (the
 * canvas criterion kinds) is read from its declaration instead.
 */
export function humanizeToken(token: string): string {
  const words = token.split(/[_\-.\s]+/).filter((word) => word.length > 0);
  if (words.length === 0) return token;
  const joined = words.join(' ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/**
 * A lens as the studio names it — `critic.architecture` → "critic
 * architecture": a lowercase phrase, since it reads as a chip beside the
 * finding rather than as a title. The id itself stays the lens's identity.
 */
export const lensName = (lens: string): string => humanizeToken(lens).toLowerCase();
