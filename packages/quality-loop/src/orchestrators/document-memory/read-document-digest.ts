/**
 * What a document digest endorses: the generic reader bound to the
 * document-digest pipeline's own schema and index, and to what its definition
 * declares each finding type and validator withholds. The digest step reads
 * through here, and what it reads is in the store's own item shape, so the
 * store step hands it to `indexMemories` as it is.
 *
 * A document that declares its scope settles every memory's scope: its
 * declaration decides each memory's scope over the judges' verdict. Each
 * memory endorsed carries the declaration, whatever the digest wrote — the
 * goal's index is an engine fact, the digest's scope a model's — and what
 * withholds is the table the pipeline declares for that case, under which a
 * scope finding withholds nothing (`WITHHOLDING_UNDER_DECLARED_SCOPE`).
 *
 * A document that names a unit of work settles which unit every memory of
 * it bound to one was recorded for: each such memory carries the unit's key,
 * so a search names the unit to read it. One that names none has no unit to
 * give such a memory, and no search would ever read it: the memory is
 * withheld, named by the index (`UNIT_UNNAMED`), and stays in the run's
 * record rather than standing in the store unread — and the digest step
 * counts what it withheld so, and gives its reason, so the chunk is never
 * read as one whose facts are all stored.
 */
import { isUnitBound, type Admission, type DocumentMemoryStepReason } from '@sysdesign/contracts';

import { withholdingOf, type RunOutputs, type WithheldItem } from '../../core/outputs';
import {
  DOCUMENT_DIGEST,
  WITHHOLDING_UNDER_DECLARED_SCOPE,
} from '../../pipelines/document-digest/definition';
import { readIndex } from '../../pipelines/document-digest/input';
import { documentDigestSchema } from '../../pipelines/document-digest/output';
import { ADMITTED_ONLY, endorsedMemories, type DigestReadout } from '../memory/digest/endorsed';

const WITHHOLDING = withholdingOf(DOCUMENT_DIGEST);

/**
 * Why a memory bound to a unit of work, of a document that names none, is
 * withheld: by the index, under the orchestrator's declared reason, which the
 * digest step gives and counts its memories under.
 */
export const UNIT_UNNAMED = {
  source: 'index',
  by: 'unit-unnamed',
  note: 'bound to a unit of work, in a document that names none: no search would read it',
} as const satisfies Omit<WithheldItem, 'ref'> & { by: DocumentMemoryStepReason };

export const readDocumentDigest = (
  outputs: RunOutputs,
  acceptAt: number,
  /** The admissions drawn on; the digest step passes the orchestrator's own declaration. */
  admits: readonly Admission[] = ADMITTED_ONLY,
): DigestReadout => {
  const document = readIndex(outputs.trace.contract.goal)?.document;
  const declared = document?.scope;
  const readout = endorsedMemories(
    outputs,
    acceptAt,
    {
      schema: documentDigestSchema,
      readIndex,
      withholding: declared === undefined ? WITHHOLDING : WITHHOLDING_UNDER_DECLARED_SCOPE,
    },
    admits,
  );
  const scoped =
    declared === undefined
      ? readout.memories
      : readout.memories.map((memory) => ({ ...memory, scope: declared }));
  const unitKey = document?.unitKey;
  if (unitKey !== undefined) {
    return {
      ...readout,
      memories: scoped.map((memory) =>
        isUnitBound(memory.scope) ? { ...memory, unitKey } : memory,
      ),
    };
  }
  return {
    ...readout,
    memories: scoped.filter((memory) => !isUnitBound(memory.scope)),
    withheld: [
      ...readout.withheld,
      ...scoped
        .filter((memory) => isUnitBound(memory.scope))
        .map((memory) => ({ ref: `memory.${memory.position}`, ...UNIT_UNNAMED })),
    ],
  };
};
