/**
 * A mission declares facts for the engine under `##` headings, one bullet
 * each — its Marks, its Stop conditions, its Unit identity, its Unit context,
 * its Advisors.
 * `bulletsUnder` is the one reader of such a section; `declaredSection` is the
 * one grammar machine: a bullet regex whose named groups are the row, a row
 * schema, a list bound, the refusal that names the offending bullet, and an
 * optional rule across rows. A section is a declaration of these, never a
 * loop of its own.
 */
import type { z } from 'zod';

import { bounded, type Bound } from '../bounds';

/** A lower-case word, hyphens allowed: a fact's name, an advisor's id, a document's name, as every grammar here reads it. */
export const WORD = '[a-z][a-z0-9-]*';

/** The second bullet to declare a name already declared, or null: the rule across rows a section of named things shares. */
export const declaredOnce =
  <Row>(key: (row: Row) => string) =>
  (rows: readonly Row[], lines: readonly string[]): string | null => {
    const seen = new Set<string>();
    for (const [index, row] of rows.entries()) {
      if (seen.has(key(row))) return lines[index] ?? null;
      seen.add(key(row));
    }
    return null;
  };

/** The bullets under a heading, trimmed, blank lines skipped, up to the next heading; none when the heading is absent. */
export function bulletsUnder(mission: string, heading: string): string[] {
  const lines = mission.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return [];
  const bullets: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2} /.test(line)) break;
    if (line.trim() === '') continue;
    bullets.push(line.trim());
  }
  return bullets;
}

export interface DeclaredSection<Row> {
  heading: string;
  /** The bullet grammar: its named groups are the row, an optional group it did not match read as null. */
  line: RegExp;
  row: z.ZodType<Row>;
  /** The most bullets the section may hold; past it the list is a size fault. */
  bound: Bound;
  /** The refusal, naming the bullet: one the grammar or the row schema does not read, or the one `across` names. */
  malformed: new (line: string) => Error;
  /** A rule across the rows — one ending per cause, no fact declared twice — answering the offending bullet, or null. */
  across?: (rows: readonly Row[], lines: readonly string[]) => string | null;
}

/**
 * The reader of one declared section: every bullet through the grammar and
 * the row schema, in order, refused by name where either does not read it;
 * then the rule across rows; then the list bound.
 */
export function declaredSection<Row>(section: DeclaredSection<Row>): (mission: string) => Row[] {
  const list = bounded.list(section.bound, section.row);
  return (mission) => {
    const lines = bulletsUnder(mission, section.heading);
    const rows = lines.map((line) => {
      const groups = section.line.exec(line)?.groups;
      if (groups === undefined) throw new section.malformed(line);
      const raw = Object.fromEntries(
        Object.entries(groups).map(([name, value]) => [name, value ?? null]),
      );
      const parsed = section.row.safeParse(raw);
      if (!parsed.success) throw new section.malformed(line);
      return parsed.data;
    });
    const offending = section.across?.(rows, lines) ?? null;
    if (offending !== null) throw new section.malformed(offending);
    return list.parse(rows);
  };
}
