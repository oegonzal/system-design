import { z } from 'zod';

import { bound, bounded } from '../bounds';
import { declaredOnce, declaredSection, WORD } from './mission-sections';

/**
 * Documents: the files a mission lets a plan upload, by name.
 *
 *     ## Documents
 *
 *     - resume: the subject's résumé, a PDF
 *
 * The engine carries a document's name and nothing else: the run supplies a
 * file for each name on its command line, the goal's index lists the names,
 * the limits validator cuts an upload naming one the mission does not
 * declare, and the browser puts the file into the control. What the document
 * is for is the bullet's own prose, read by the planner in the mission
 * itself. A mission that declares none lets nothing be uploaded, and nothing
 * here runs.
 */
export const DOCUMENTS_HEADING = '## Documents';
/** The most documents a mission declares: a résumé, a letter, a portfolio — a few files, never a folder. */
export const DOCUMENTS_BOUND = bound(4, 'list');
export const DOCUMENT_NAME_MAX_LENGTH = 40;

/** One bullet: the document's name, a colon, what it is. */
const DOCUMENT_LINE = new RegExp(`^- (?<name>${WORD}): .+$`);

const documentSchema = z.strictObject({
  name: bounded.id(DOCUMENT_NAME_MAX_LENGTH, { min: 1 }),
});

/** A Documents bullet the grammar does not read; the mission is refused before any page is, since a document nobody can name is a file nobody can supply. */
export class MissionDocumentMalformed extends Error {
  override readonly name = 'MissionDocumentMalformed';
  constructor(readonly line: string) {
    super(
      `a line under ${DOCUMENTS_HEADING} is not a document — expected \`- <name>: <what it is>\`, the name lower-case words joined by hyphens and declared once: ${line}`,
    );
  }
}

const readDocuments = declaredSection({
  heading: DOCUMENTS_HEADING,
  line: DOCUMENT_LINE,
  row: documentSchema,
  bound: DOCUMENTS_BOUND,
  malformed: MissionDocumentMalformed,
  across: declaredOnce((row) => row.name),
});

/** The names of the documents a mission declares, in order; none when the section is absent. */
export const documentNamesOf = (mission: string): string[] =>
  readDocuments(mission).map((row) => row.name);
