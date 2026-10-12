/**
 * The knowledge orchestrator: learn from a finished run against what is already
 * known. Four steps over two registered pipelines — the target, whatever it is,
 * and the knowledge digest — declared here as data; the adapters beside it are
 * the only code.
 *
 * It is the memory orchestrator's counterpart rather than its replacement. That
 * one recalls lessons for a goal, runs it, and digests what it taught into more
 * lessons. This one asks a different question of the same run: what does the
 * store already know about the evidence this run produced, and what does this run
 * add to it? So the recall happens *after* the target rather than before, the
 * answer reaches the digest rather than the producer, and nothing it finds can
 * change the run being learned from.
 */
import {
  KNOWLEDGE_ORCHESTRATOR_ID,
  KNOWLEDGE_STEP_REASONS,
  knowledgeDigestReportSchema,
  knowledgeKnownReportSchema,
  memoryContextSchema,
  type MemoryContextDto,
} from '@sysdesign/contracts';

import { KNOWLEDGE_DIGEST_ID } from '../../pipelines/knowledge-digest/input';
import { bareRequest, providedAsOutput, refuseInternal } from '../common';
import type { OrchestratorDefinition } from '../runner/definition';
import type { KnowledgePorts } from './ports';
import { digest, known, store, target, type KnowledgeOutputs } from './steps';

export const KNOWLEDGE: OrchestratorDefinition<KnowledgeOutputs, KnowledgePorts> = {
  id: KNOWLEDGE_ORCHESTRATOR_ID,
  version: '1.0.0',
  description:
    'Learn from a finished run against what the store already knows: what it taught, typed, and what it confirms or contradicts.',
  takesTarget: true,
  reasons: KNOWLEDGE_STEP_REASONS,

  // The goal is taken bare, once, for the record and every child: a goal that
  // already carries remembered evidence is never learned from as if it were the
  // author's own.
  normalize: bareRequest,
  refuse: refuseInternal,
  context: async (ports) =>
    ({ embedding: ports.embedding, store: await ports.store.verify() }) satisfies MemoryContextDto,
  contextSchema: memoryContextSchema,
  reports: { known: knowledgeKnownReportSchema, digest: knowledgeDigestReportSchema },

  steps: [
    {
      id: 'target',
      pipeline: (request) => request.pipeline,
      run: target,
      provided: providedAsOutput,
    },
    // `known` and `digest` both need the target and nothing else. The digest
    // deliberately does not need `known`: a store that is empty or switched off
    // leaves it digesting with nothing to compare against, which is what every
    // digest did before there was a store, and is not a reason to learn nothing.
    { id: 'known', needs: ['target'], run: known },
    { id: 'digest', pipeline: KNOWLEDGE_DIGEST_ID, needs: ['target'], run: digest },
    { id: 'store', needs: ['digest'], run: store },
  ],
};
