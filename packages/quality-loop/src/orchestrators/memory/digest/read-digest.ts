/**
 * What an experience digest endorses: the generic reader in `endorsed.ts`
 * bound to the experience-digest pipeline's own schema and index. The memory
 * orchestrator's digest step and the re-index tool both read through here, so
 * the two can never endorse differently.
 */
import type { RunOutputs } from '../../../core/outputs';
import { readIndex as readDigestIndex } from '../../../pipelines/experience-digest/input';
import { experienceDigestSchema } from '../../../pipelines/experience-digest/output';
import { endorsedMemories, type DigestReadout } from './endorsed';

export type { Digested, DigestReadout, MemoryToStore } from './endorsed';

export const memoriesToStore = (outputs: RunOutputs, acceptAt: number): DigestReadout =>
  endorsedMemories(outputs, acceptAt, {
    schema: experienceDigestSchema,
    readIndex: readDigestIndex,
  });
