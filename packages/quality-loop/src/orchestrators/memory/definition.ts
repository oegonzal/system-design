/**
 * The memory orchestrator: recall what earlier runs learned, run the target
 * with it, digest the result, store what the digest endorsed. Four steps over
 * three registered pipelines, declared here as data; the adapters beside it
 * are the only code.
 */
import { MEMORY_ORCHESTRATOR_ID, MEMORY_STEP_REASONS } from '@sysdesign/contracts';

import { EXPERIENCE_DIGEST_ID } from '../../pipelines/experience-digest/input';
import { MEMORY_RECALL_ID } from '../../pipelines/memory-recall/input';
import { bareRequest, providedAsOutput, refuseInternal } from '../common';
import type { OrchestratorDefinition } from '../definition';
import { digest, recall, store, target, type MemoryOutputs, type MemoryPorts } from './steps';

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
