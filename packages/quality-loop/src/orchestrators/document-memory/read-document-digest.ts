/**
 * What a document digest endorses: the generic reader bound to the
 * document-digest pipeline's own schema and index. The digest step reads
 * through here, and what it reads is in the store's own item shape, so the
 * store step hands it to `indexMemories` as it is.
 */
import type { RunOutputs } from '../../core/outputs';
import { readIndex } from '../../pipelines/document-digest/input';
import { documentDigestSchema } from '../../pipelines/document-digest/output';
import { endorsedMemories, type DigestReadout, type Withhold } from '../memory/digest/endorsed';

/**
 * What each of the document digest's findings withholds from the store, by what
 * the finding says about the fact rather than by how loudly it says it.
 *
 * A fact the sections never stated, or a section read as saying what it does
 * not, is wrong: storing it would have the corpus assert something about the
 * subject that their own documents do not, so every memory such a finding names
 * is withheld. The remaining types fault a fact that is true. A duplicate is
 * repaired by keeping one of the pair. A fact a form could not use as written, a
 * condition that restates its insight, and a fact no memory captured all say
 * the writing is weak, not that the fact is false — and a true fact dropped for
 * its phrasing is a detail the corpus can never answer with again, which for a
 * record of someone's career is the worse loss. Measured on the first live
 * chunk: three of eight true facts were withheld, two of them for using "him"
 * where the subject's name belonged.
 */
export const DOCUMENT_WITHHOLDS: Readonly<Record<string, Withhold>> = {
  invented_fact: 'every-ref',
  misread_section: 'every-ref',
  duplicate_fact: 'all-but-one',
  missed_fact: 'none',
  unusable_fact: 'none',
  vague_condition: 'none',
};

export const readDocumentDigest = (outputs: RunOutputs, acceptAt: number): DigestReadout =>
  endorsedMemories(outputs, acceptAt, {
    schema: documentDigestSchema,
    readIndex,
    withholds: DOCUMENT_WITHHOLDS,
  });
