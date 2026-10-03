import { readFile } from 'node:fs/promises';

import type { DocumentReader } from '../../core/ports';

/**
 * JSON Lines, one record per titled section. A record carries its prose under
 * one key and what names it under another, so the reader turns each into a
 * markdown heading and its body — which is all the chunker needs: the heading
 * becomes the record's `context`, so a chunk beginning mid-record still says
 * which record it is from.
 *
 * Which keys those are is a declared map, not an assumption about one corpus:
 * `JSONL_RECORD_FIELDS` names the keys tried, in order, and another corpus is
 * a different map rather than different code. The qualifier keys are written
 * into the heading on purpose. A record that marks a claim as a design, a plan
 * or an interpretation states that once, in a block a chunk may not contain;
 * carried in the heading it reaches every chunk of that record, because a fact
 * stored without its qualifier reads as work completed — which, for a corpus
 * answering job applications, is a claim its own document does not make.
 *
 * Nothing is skipped. A line that will not parse, or a record whose prose or
 * title no listed key yields, is refused by name: for a corpus of facts about
 * a person, a dropped record is a question they can never answer.
 */

/** Where a record's parts live, as dotted paths; the first path yielding a non-empty string wins. */
export interface JsonlRecordFields {
  /** Keys tried for the record's prose. */
  text: readonly string[];
  /** Keys tried for the heading that names the record. */
  heading: readonly string[];
  /** Keys whose values qualify the record; each is labelled by its own last path segment. */
  qualifiers: readonly string[];
}

export const JSONL_RECORD_FIELDS: JsonlRecordFields = {
  text: ['text', 'content', 'body'],
  heading: ['metadata.title', 'title', 'metadata.topic', 'id'],
  qualifiers: ['metadata.evidence_status', 'metadata.career_usage'],
};

/**
 * The level a record's heading is written at; its own headings are pushed below
 * it. Level one, and not two, because the chunker splices its heading path at
 * `level - 1`: a document whose records open at `##` splices at index 1, which
 * never clears index 0, so the first record's title stays pinned above every
 * later one and record 3 comes out as "record 1 > record 3" — one record's
 * qualifier stamped onto another's facts, which is the misattribution this
 * heading exists to prevent. Level one splices at 0 and resets cleanly.
 */
export const RECORD_HEADING_LEVEL = 1;
/** The deepest heading markdown has; a record nested past it flattens into it. */
export const MAX_HEADING_LEVEL = 6;

const HEADING_LINE = /^ {0,3}(#{1,6})(\s+\S)/;

export class MalformedRecord extends Error {
  override readonly name = 'MalformedRecord';
  constructor(
    readonly path: string,
    readonly line: number,
    override readonly cause: Error,
  ) {
    super(`${path}:${line}: not JSON — ${cause.message}`);
  }
}

export class UnreadableRecord extends Error {
  override readonly name = 'UnreadableRecord';
  constructor(
    readonly path: string,
    readonly line: number,
    readonly part: keyof JsonlRecordFields,
    readonly tried: readonly string[],
  ) {
    super(
      `${path}:${line}: no ${part} — none of ${tried.join(', ')} holds a non-empty string on this record`,
    );
  }
}

export class EmptyDocument extends Error {
  override readonly name = 'EmptyDocument';
  constructor(readonly path: string) {
    super(`${path}: holds no JSON Lines records`);
  }
}

/** The value at a dotted path, when it is a non-empty string; otherwise undefined. */
export function stringAt(record: unknown, path: string): string | undefined {
  let value: unknown = record;
  for (const key of path.split('.')) {
    if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

const firstOf = (record: unknown, paths: readonly string[]): string | undefined => {
  for (const path of paths) {
    const value = stringAt(record, path);
    if (value !== undefined) return value;
  }
  return undefined;
};

/** A qualifier's label: its own last path segment, read as words. */
export const qualifierLabel = (path: string): string =>
  (path.split('.').pop() ?? path).replace(/_/g, ' ');

/**
 * The record's own headings pushed below its heading, so none can reach the
 * level that names it — a record opening at `#` would otherwise reset the
 * chunker's heading path and take its own title out of the chunks that follow.
 */
export function demoteHeadings(text: string, by: number): string {
  return text
    .split('\n')
    .map((line) => {
      const heading = HEADING_LINE.exec(line);
      if (heading === null) return line;
      const level = Math.min((heading[1] as string).length + by, MAX_HEADING_LEVEL);
      return `${'#'.repeat(level)}${heading[2] as string}${line.slice(heading[0].length)}`;
    })
    .join('\n');
}

/** One record as a titled markdown section: its heading with its qualifiers, then its prose. */
export function recordText(
  record: unknown,
  path: string,
  line: number,
  fields: JsonlRecordFields,
): string {
  const text = firstOf(record, fields.text);
  if (text === undefined) throw new UnreadableRecord(path, line, 'text', fields.text);
  const heading = firstOf(record, fields.heading);
  if (heading === undefined) throw new UnreadableRecord(path, line, 'heading', fields.heading);
  const qualifiers = fields.qualifiers.flatMap((key) => {
    const value = stringAt(record, key);
    return value === undefined ? [] : [`${qualifierLabel(key)}: ${value}`];
  });
  const title = qualifiers.length === 0 ? heading : `${heading} — ${qualifiers.join(' · ')}`;
  return `${'#'.repeat(RECORD_HEADING_LEVEL)} ${title}\n\n${demoteHeadings(text, RECORD_HEADING_LEVEL)}`;
}

/** Every record as a titled section, the sections apart by a blank line. */
export function jsonlText(
  source: string,
  path: string,
  fields: JsonlRecordFields = JSONL_RECORD_FIELDS,
): string {
  const sections: string[] = [];
  source.split(/\r?\n/).forEach((line, position) => {
    // Blank lines between records are legal JSON Lines and carry no record.
    if (line.trim() === '') return;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new MalformedRecord(path, position + 1, error as Error);
    }
    sections.push(recordText(record, path, position + 1, fields));
  });
  if (sections.length === 0) throw new EmptyDocument(path);
  return sections.join('\n\n');
}

export const jsonlReader = (fields: JsonlRecordFields = JSONL_RECORD_FIELDS): DocumentReader => ({
  async read(path: string): Promise<string> {
    return jsonlText(await readFile(path, 'utf8'), path, fields);
  },
});
