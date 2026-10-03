/**
 * The two text helpers every layer of the package reaches for — a bounded
 * excerpt and a quoted name — declared once so a label reads the same in the
 * history the next plan is told, the operator's prompt, the goal prose and
 * the terminal tables.
 */

/** The text within `max` characters, the cut marked with an ellipsis so a reader knows it is an excerpt. */
export const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;

/** A name in quotes with its whitespace collapsed, so a multi-line label reads as one. */
export const quote = (text: string): string => `"${text.replace(/\s+/g, ' ').trim()}"`;
