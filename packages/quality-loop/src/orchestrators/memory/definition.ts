/**
 * The memory orchestrator: recall what earlier runs learned, run the target
 * with it, digest the result, store what the digest endorsed. Four steps over
 * three registered pipelines, declared here as data; the adapters beside it
 * are the only code.
 */
import {
  MEMORY_ORCHESTRATOR_ID,
  MEMORY_STEP_REASONS,
  type OrchestrationRunDto,
} from '@sysdesign/contracts';

import { EXPERIENCE_DIGEST_ID } from '../../pipelines/experience-digest/input';
import { MEMORY_RECALL_ID } from '../../pipelines/memory-recall/input';
import { bareRequest, providedAsOutput, refuseInternal } from '../common';
import type { OrchestratorDefinition } from '../runner/definition';
import type { MemoryPorts } from './ports';
import { digest, recall, store, target, type MemoryOutputs } from './steps';

export const MEMORY: OrchestratorDefinition<MemoryOutputs, MemoryPorts> = {
  id: MEMORY_ORCHESTRATOR_ID,
  version: '1.0.0',
  description:
    'Recall what earlier runs learned, run the target with it, digest the result, store what the digest endorsed.',
  takesTarget: true,
  reasons: MEMORY_STEP_REASONS,

  // The goal is taken bare, once, for the record and every child: a goal that
  // already carries remembered evidence is never re-remembered.
  normalize: bareRequest,
  refuse: refuseInternal,
  context: async (ports) => ({ embedding: ports.embedding, store: await ports.store.verify() }),

  steps: [
    {
      id: 'recall',
      pipeline: MEMORY_RECALL_ID,
      run: recall,
      provided: () => ({ status: 'skipped', reason: 'provided-run' }),
    },
    {
      id: 'target',
      pipeline: (request) => request.pipeline,
      run: target,
      provided: providedAsOutput,
    },
    { id: 'digest', pipeline: EXPERIENCE_DIGEST_ID, needs: ['target'], run: digest },
    { id: 'store', needs: ['digest'], run: store },
  ],
};

/**
 * The digest run and the target run a memory record names — one each, since
 * both steps run their pipeline once — or null when either never opened.
 */
export const digestedChildren = (
  record: OrchestrationRunDto,
): { digestRunId: string; targetRunId: string } | null => {
  const digestRunId = record.steps['digest']?.runIds[0];
  const targetRunId = record.steps['target']?.runIds[0];
  return digestRunId === undefined || targetRunId === undefined
    ? null
    : { digestRunId, targetRunId };
};
