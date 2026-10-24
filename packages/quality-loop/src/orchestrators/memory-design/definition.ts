/**
 * The memory-design orchestrator: learn from a memory-architecture design run.
 * A dedicated cycle — target → known → digest → store — over the memory
 * design the agentic-system service hands it: the finished coach run stands in
 * for the target (the service recalls coach-only on its own direct run, which
 * an orchestration cannot carry), and the run is digested into typed memory and
 * stored, faceted by the memory-architecture pipeline's own dimensions
 * (retrieval, ingestion, scoping, …) — which is how a memory-design lesson is
 * scoped and grouped by the concern it is about.
 *
 * It is the knowledge orchestrator's cycle fixed to one target: the steps are
 * the knowledge steps, reused verbatim (as `second-opinion` reuses the panel's),
 * because learning from a run is generic and the engine never learns a domain.
 * What makes this a cycle of its own is the fixed target and its own id — the
 * one endpoint the memory-design service addresses — not a second copy of the
 * learning logic.
 */
import {
  KNOWLEDGE_STEP_REASONS,
  knowledgeDigestReportSchema,
  knowledgeKnownReportSchema,
  memoryContextSchema,
  type MemoryContextDto,
} from '@sysdesign/contracts';

import { KNOWLEDGE_DIGEST_ID } from '../../pipelines/knowledge-digest/input';
import { MEMORY_ARCHITECTURE_ID } from '../../pipelines/memory-architecture/definition';
import { bareRequest, providedAsOutput } from '../common';
import { digest, known, store, target, type KnowledgeOutputs } from '../knowledge/steps';
import { KNOWLEDGE_PORT_BUNDLE, type KnowledgePorts } from '../knowledge/ports';
import type { OrchestratorDefinition } from '../runner/definition';

const MEMORY_DESIGN_ORCHESTRATOR_ID = 'memory-design';

export const MEMORY_DESIGN: OrchestratorDefinition<KnowledgeOutputs, KnowledgePorts> = {
  id: MEMORY_DESIGN_ORCHESTRATOR_ID,
  version: '1.0.0',
  description:
    'Learn from a memory-architecture design run: what it taught about recall, ingestion, scoping and governance, typed and stored, against what the memory store already knows.',
  // The target is fixed to the memory-architecture pipeline, so a request naming
  // one is refused by the service; a finished run is provided instead.
  takesTarget: false,
  ports: KNOWLEDGE_PORT_BUNDLE,
  reasons: KNOWLEDGE_STEP_REASONS,

  // The goal is taken bare, once: a goal that already carries remembered
  // evidence is never learned from as if it were the author's own.
  normalize: bareRequest,
  context: async (ports) =>
    ({
      embedding: ports.embedding,
      store: await ports.store.verify(),
    }) satisfies MemoryContextDto,
  contextSchema: memoryContextSchema,
  reports: {
    known: knowledgeKnownReportSchema,
    digest: knowledgeDigestReportSchema,
  },

  steps: [
    { id: 'target', pipeline: MEMORY_ARCHITECTURE_ID, run: target, provided: providedAsOutput },
    { id: 'known', needs: ['target'], run: known },
    { id: 'digest', pipeline: KNOWLEDGE_DIGEST_ID, needs: ['target'], run: digest },
    { id: 'store', needs: ['digest'], run: store },
  ],
};
