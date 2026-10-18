/**
 * The register-memory orchestrator: digest one text the host of a memory
 * space composed into the typed memories its registers keep, and report which
 * of them the space may write. One step over one registered pipeline,
 * declared here as data; the adapters beside it are the only code. It writes
 * nothing: the host writes what the step endorsed through the runtime's own
 * write path, under the scope and provenance the goal's index carries, so the
 * orchestrator has no ports and observes nothing at open.
 *
 * It chooses its own pipeline, so a request naming one is refused by the
 * service. Refused here, before a row exists: a goal no register-digest
 * composer rendered; a digest handed in, since the host writes what the step
 * endorses as the text's own digest; and a rubric handed in, since it skips
 * the deriver and with it the rules every digest is held to.
 */
import {
  emptyContextSchema,
  REGISTER_MEMORY_DIGEST_STEP,
  REGISTER_MEMORY_ORCHESTRATOR_ID,
  REGISTER_MEMORY_STEP_REASONS,
  registerDigestReportSchema,
  type StartOrchestrationRequest,
} from '@sysdesign/contracts';

import { readIndex, REGISTER_DIGEST_ID } from '../../pipelines/register-digest/input';
import type { OrchestratorDefinition } from '../runner/definition';
import { digest, type RegisterMemoryOutputs } from './steps';

const refuseUncomposed = (request: StartOrchestrationRequest): string | null => {
  if (readIndex(request.goal) === null) {
    return `${REGISTER_MEMORY_ORCHESTRATOR_ID} digests a text composed for a memory space: the goal carries no ${REGISTER_DIGEST_ID} index`;
  }
  if (request.output !== undefined) {
    return `${REGISTER_MEMORY_ORCHESTRATOR_ID} reports what its own digest of the text endorses: a digest handed in is refused`;
  }
  if (request.criteria !== undefined) {
    return `${REGISTER_MEMORY_ORCHESTRATOR_ID} derives each digest's rubric under the rules every digest is held to: a rubric handed in is refused`;
  }
  return null;
};

export const REGISTER_MEMORY: OrchestratorDefinition<RegisterMemoryOutputs, unknown> = {
  id: REGISTER_MEMORY_ORCHESTRATOR_ID,
  version: '1.0.0',
  description:
    "Digest one text into the typed memories a memory space's registers keep, and report which of them the space may write.",
  takesTarget: false,
  reasons: REGISTER_MEMORY_STEP_REASONS,
  refuse: refuseUncomposed,
  context: () => Promise.resolve({}),
  contextSchema: emptyContextSchema,
  reports: { [REGISTER_MEMORY_DIGEST_STEP]: registerDigestReportSchema },
  steps: [{ id: REGISTER_MEMORY_DIGEST_STEP, pipeline: REGISTER_DIGEST_ID, run: digest }],
};
