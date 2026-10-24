/**
 * The form-memory orchestrator: recall facts about the subject for the
 * fields of one form page without a model call, then run the form pipeline
 * the request names over them — answering the fields, or readying suggestions
 * for the operator. Two steps over the declared form pipelines, as data; the
 * adapters beside it are the only code. A goal the form codec did not
 * compose, or one composed for another pipeline than the request names, is
 * refused here, before a row exists. The target does not need the recall: a
 * page with no evidence is still run, and its facts route to the operator.
 */
import {
  FORM_MEMORY_ORCHESTRATOR_ID,
  FORM_MEMORY_STEP_REASONS,
  FORM_MEMORY_TARGET_STEP,
  FORM_PIPELINES,
  formTargetReportSchema,
  memoryContextSchema,
  readFieldIndex,
  type MemoryContextDto,
  type StartOrchestrationRequest,
} from '@sysdesign/contracts';

import type { OrchestratorDefinition } from '../runner/definition';
import { MEMORY_PORT_BUNDLE } from '../memory/ports';
import type { FormMemoryPorts } from './ports';
import { recall, target, type FormMemoryOutputs } from './steps';

/** A request this orchestrator will not run: a goal the form codec did not compose, or one for another pipeline. */
export const refuseNonForm = (request: StartOrchestrationRequest): string | null => {
  const index = readFieldIndex(request.goal);
  if (index === null) {
    return `${FORM_MEMORY_ORCHESTRATOR_ID} runs a composed form page: the goal carries no form index`;
  }
  return index.pipeline === request.pipeline
    ? null
    : `${FORM_MEMORY_ORCHESTRATOR_ID} runs the form pipeline its goal was composed for: the goal is for ${index.pipeline}, the request names ${request.pipeline ?? 'none'}`;
};

export const FORM_MEMORY: OrchestratorDefinition<FormMemoryOutputs, FormMemoryPorts> = {
  id: FORM_MEMORY_ORCHESTRATOR_ID,
  version: '2.0.0',
  description:
    'Recall facts about the subject for the fields of one form page without a model call, then run the form pipeline the request names over them.',
  takesTarget: true,
  ports: MEMORY_PORT_BUNDLE,
  reasons: FORM_MEMORY_STEP_REASONS,
  refuse: refuseNonForm,
  context: async (ports) =>
    ({ embedding: ports.embedding, store: await ports.store.verify() }) satisfies MemoryContextDto,
  contextSchema: memoryContextSchema,
  reports: { [FORM_MEMORY_TARGET_STEP]: formTargetReportSchema },

  steps: [
    { id: 'recall', run: recall },
    { id: FORM_MEMORY_TARGET_STEP, pipeline: FORM_PIPELINES, run: target },
  ],
};
