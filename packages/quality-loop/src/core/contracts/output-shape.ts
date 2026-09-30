/**
 * The two habits every `OutputShape` shares: positional, engine-assigned ids
 * for a list of parts, and the rendering of one titled section a judge reads.
 * A pipeline decides what to number and what a line says; this decides how a
 * numbered part is addressed and how a section is laid out, once.
 */
import type { ArtifactLocation } from '@sysdesign/contracts';

/** `prefix.1`, `prefix.2`, … for each item, labelled as the pipeline says. */
export const numbered = <I>(
  prefix: string,
  items: readonly I[],
  label: (item: I) => string,
): ArtifactLocation[] =>
  items.map((item, index) => ({ id: `${prefix}.${index + 1}`, label: label(item) }));

/** A titled section of rendered lines, or nothing at all when there are none. */
export const section = (title: string, lines: readonly string[]): string[] =>
  lines.length === 0 ? [] : ['', `## ${title}`, ...lines];

/** A section whose every line opens with the id `numbered` gave the item. */
export const numberedSection = <I>(
  title: string,
  prefix: string,
  items: readonly I[],
  line: (item: I) => string,
): string[] =>
  section(
    title,
    items.map((item, index) => `[${prefix}.${index + 1}] ${line(item)}`),
  );
