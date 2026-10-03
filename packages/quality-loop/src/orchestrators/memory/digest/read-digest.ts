/**
 * What an experience digest endorses: the generic reader in `endorsed.ts`
 * bound to the experience-digest pipeline's own schema, index and what its
 * definition declares each finding type and validator withholds. The memory
 * orchestrator's digest step and the re-index tool both read through here, so
 * the two can never endorse differently.
 */
import { withholdingOf, type RunOutputs } from '../../../core/outputs';
import { EXPERIENCE_DIGEST } from '../../../pipelines/experience-digest/definition';
import { readIndex as readDigestIndex } from '../../../pipelines/experience-digest/input';
import { experienceDigestSchema } from '../../../pipelines/experience-digest/output';
import { endorsedMemories, type DigestReadout } from './endorsed';

export type { Digested, DigestReadout, MemoryToStore } from './endorsed';

export const memoriesToStore = (outputs: RunOutputs, acceptAt: number): DigestReadout =>
  endorsedMemories(outputs, acceptAt, {
    schema: experienceDigestSchema,
    readIndex: readDigestIndex,
    withholding: withholdingOf(EXPERIENCE_DIGEST),
  });
