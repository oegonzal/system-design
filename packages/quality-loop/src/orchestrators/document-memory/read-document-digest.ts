/**
 * What a document digest endorses: the generic reader bound to the
 * document-digest pipeline's own schema and index, and to what its definition
 * declares each finding type and validator withholds. The digest step reads
 * through here, and what it reads is in the store's own item shape, so the
 * store step hands it to `indexMemories` as it is.
 *
 * A document that declares its scope settles every memory's scope: each one
 * endorsed carries the declaration, whatever the digest wrote — the goal's
 * index is an engine fact, the digest's scope a model's — and the finding
 * that faults a memory's scope withholds nothing, since the scope it faulted
 * is not the one stored.
 */
import type { Admission } from '@sysdesign/contracts';

import { withholdingOf, type RunOutputs, type WithholdingRules } from '../../core/outputs';
import { DOCUMENT_DIGEST, SCOPE_FINDING_TYPE } from '../../pipelines/document-digest/definition';
import { readIndex } from '../../pipelines/document-digest/input';
import { documentDigestSchema } from '../../pipelines/document-digest/output';
import { ADMITTED_ONLY, endorsedMemories, type DigestReadout } from '../memory/digest/endorsed';

const WITHHOLDING = withholdingOf(DOCUMENT_DIGEST);

/** What withholds under a declared scope: as the definition declares, but the scope finding nothing. */
const UNDER_DECLARED_SCOPE: WithholdingRules = {
  ...WITHHOLDING,
  findingTypes: { ...WITHHOLDING.findingTypes, [SCOPE_FINDING_TYPE]: { withholds: 'none' } },
};

export const readDocumentDigest = (
  outputs: RunOutputs,
  acceptAt: number,
  /** The admissions drawn on; the digest step passes the orchestrator's own declaration. */
  admits: readonly Admission[] = ADMITTED_ONLY,
): DigestReadout => {
  const declared = readIndex(outputs.trace.contract.goal)?.document.scope;
  const readout = endorsedMemories(
    outputs,
    acceptAt,
    {
      schema: documentDigestSchema,
      readIndex,
      withholding: declared === undefined ? WITHHOLDING : UNDER_DECLARED_SCOPE,
    },
    admits,
  );
  if (declared === undefined) return readout;
  return {
    ...readout,
    memories: readout.memories.map((memory) => ({ ...memory, scope: declared })),
  };
};
