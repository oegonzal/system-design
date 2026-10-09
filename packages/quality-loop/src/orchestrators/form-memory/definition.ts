/**
 * The form-memory orchestrator: recall facts about the subject for the
 * fields of one form page without a model call, then answer the fields over
 * them. Two steps over one registered pipeline, declared here as data; the
 * adapters beside it are the only code. It chooses its own pipeline, so a
 * request naming one is refused by the service; a goal the session's field
 * codec did not compose is refused here, before a row exists. The target
 * does not need the recall: a page with no evidence is still answered, and
 * its facts route to the operator.
 */
import {
  FIELD_ANSWER_PIPELINE_ID,
  FORM_MEMORY_ORCHESTRATOR_ID,
  FORM_MEMORY_STEP_REASONS,
  type MemoryContextDto,
  type StartOrchestrationRequest,
} from '@sysdesign/contracts';

import { readIndex } from '../../pipelines/field-answer/input';
import type { OrchestratorDefinition } from '../runner/definition';
import type { FormMemoryPorts } from './ports';
import { recall, target, type FormMemoryOutputs } from './steps';

/** A goal this orchestrator will not run: one the field codec did not compose. */
export const refuseNonForm = (request: StartOrchestrationRequest): string | null =>
  readIndex(request.goal) === null
    ? `${FORM_MEMORY_ORCHESTRATOR_ID} answers a composed form page: the goal carries no ${FIELD_ANSWER_PIPELINE_ID} index`
    : null;

export const FORM_MEMORY: OrchestratorDefinition<FormMemoryOutputs, FormMemoryPorts> = {
  id: FORM_MEMORY_ORCHESTRATOR_ID,
  version: '1.0.0',
  description:
    'Recall facts about the subject for the fields of one form page without a model call, then answer the fields over them.',
  takesTarget: false,
  reasons: FORM_MEMORY_STEP_REASONS,
  refuse: refuseNonForm,
  context: async (ports) =>
    ({ embedding: ports.embedding, store: await ports.store.verify() }) satisfies MemoryContextDto,

  steps: [
    { id: 'recall', run: recall },
    { id: 'target', pipeline: FIELD_ANSWER_PIPELINE_ID, run: target },
  ],
};
