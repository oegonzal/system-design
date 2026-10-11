/**
 * The text helpers every layer reaches for — a bounded excerpt, a quoted
 * name, a JSON-quoted token, a literal for a pattern — declared once so a
 * label reads the same in a goal, a history line, an operator's prompt, a
 * validator's message and a terminal table, and is matched the same way.
 */

/** The text within `max` characters, the cut marked with an ellipsis so a reader knows it is an excerpt. */
export const excerpt = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;

/** A name in double quotes with its whitespace collapsed, so a multi-line label reads as one. */
export const quoted = (text: string): string => `"${text.replace(/\s+/g, ' ').trim()}"`;

/** A token in JSON quotes, escapes included, so a message names it exactly as written. */
export const quotedJson = (text: string): string => JSON.stringify(text);

/** A literal as a pattern matches it: every character a regular expression reads as syntax, escaped. */
export const escapeRegExp = (literal: string): string =>
  literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The option a typed answer names, spelled as the list spells it: the option
 * itself, else the one option equal to it but for case; null when it names
 * none, or more than one.
 */
export function listedOptionOf(options: readonly string[], typed: string): string | null {
  const text = typed.trim();
  if (options.includes(text)) return text;
  const named = options.filter(
    (option) => option.localeCompare(text, undefined, { sensitivity: 'accent' }) === 0,
  );
  return named.length === 1 ? (named[0] ?? null) : null;
}
