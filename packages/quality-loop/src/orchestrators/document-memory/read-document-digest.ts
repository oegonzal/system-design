/**
 * What a document digest endorses: the generic reader bound to the
 * document-digest pipeline's own schema and index, and to what its definition
 * declares each finding type and validator withholds. The digest step reads
 * through here, and what it reads is in the store's own item shape, so the
 * store step hands it to `indexMemories` as it is.
 */
import { withholdingOf, type RunOutputs } from '../../core/outputs';
import { DOCUMENT_DIGEST } from '../../pipelines/document-digest/definition';
import { readIndex } from '../../pipelines/document-digest/input';
import { documentDigestSchema } from '../../pipelines/document-digest/output';
import { endorsedMemories, type DigestReadout } from '../memory/digest/endorsed';

export const readDocumentDigest = (outputs: RunOutputs, acceptAt: number): DigestReadout =>
  endorsedMemories(outputs, acceptAt, {
    schema: documentDigestSchema,
    readIndex,
    withholding: withholdingOf(DOCUMENT_DIGEST),
  });
