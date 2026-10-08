/**
 * The input codec of the document-digest pipeline. The goal is rendered by
 * the program that owns the document — the ingester for a résumé or notes
 * file, the browser session for the operator's answers from one task — with
 * the contracts codec (`renderDocumentGoal`): numbered sections the model
 * cites by alias, the rules, and the index the validators read back here
 * through the engine's own fence reader.
 */
import {
  bound,
  DOCUMENT_DIGEST_ID,
  documentIndexSchema,
  type DocumentIndex,
  readFencedIndex,
} from '@sysdesign/contracts';

export { DOCUMENT_DIGEST_ID };
export type { DocumentIndex };

/** A chunk of up to 32 sections: one criterion per fact worth capturing, plus the rules. */
export const MAX_CRITERIA = 24;

/**
 * The statement bound the deriver writes within. A fact criterion carries
 * the section's own figures, names and dates so the panel can check the
 * memory against them without re-reading the chunk; its target sits above
 * the contract's default with headroom, and past the ceiling a statement is
 * kept and recorded rather than discarding the rubric.
 */
export const STATEMENT_BOUND = bound(600);

/** The index the composer wrote, or null for a goal that is not a document chunk. */
export const readIndex = (goal: string): DocumentIndex | null =>
  readFencedIndex(goal, documentIndexSchema);
