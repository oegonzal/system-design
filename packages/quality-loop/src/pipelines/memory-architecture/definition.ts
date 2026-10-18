/**
 * The memory-architecture pipeline: generate — and coach — a STRATEGY for an
 * agentic-memory system, expressed as the memory it keeps, the typed service it
 * exposes over that memory, and the workflows that move memory through it. NOT a
 * distributed-systems diagram: a sibling of `agentic-design`, not of
 * `system-design-canvas`. It asks whether a memory system keeps the right
 * registers (working, episodic, semantic, procedural, relational), exposes sound
 * interfaces over them, recalls by routing, writes through a controlled
 * pipeline, scopes and groups by sound metadata, manages long versus short term,
 * and governs what it keeps.
 *
 * Everything the engine knows about memory best practice lives in the lens
 * personas beside this file (the write pipeline, hybrid retrieval, the metadata
 * schema, lifecycle and governance from the field's own literature) — never as
 * engine code, and never naming a vendor as a rule. The definition itself is
 * kinds, types, weights and gates; the artifact and its reference checks are
 * this pipeline's own (`./output`, `./validators`), decoupled from the studio.
 *
 * The dimensions ARE the levels a memory strategy is judged at — completeness,
 * retrieval, ingestion, scoping, governance and lifecycle — and every one is
 * earned by a criterion kind, so none can only fall (the dead-dimension trap
 * `system-design`'s soundness fell into).
 */
import type { MemoryStrategy } from '@sysdesign/contracts';

import { STANDARD } from '../../core/controllers';
import type { PipelineDefinition } from '../../core/pipeline';
import { STANDARD_SCORING } from '../../core/policy';
import criticCapabilities from './lenses/critic.capabilities.md?raw';
import criticGovernance from './lenses/critic.governance.md?raw';
import criticGrounding from './lenses/critic.grounding.md?raw';
import criticIngestion from './lenses/critic.ingestion.md?raw';
import criticRecall from './lenses/critic.recall.md?raw';
import criticScoping from './lenses/critic.scoping.md?raw';
import deriveCriteria from './lenses/derive-criteria.md?raw';
import evaluatorQualities from './lenses/evaluator.qualities.md?raw';
import evaluatorRequirements from './lenses/evaluator.requirements.md?raw';
import producer from './lenses/producer.md?raw';
import { memoryStrategyOutput } from './output';
import { coverageValidator, executabilityValidator, referencesValidator } from './validators';

/** The pipeline's id, named once so an orchestrator can fix its target to it. */
export const MEMORY_ARCHITECTURE_ID = 'memory-architecture';

/** Enough for a memory brief's capabilities, targets, scoping, lifecycle and governance rules. */
const MAX_CRITERIA = 24;

export const MEMORY_ARCHITECTURE: PipelineDefinition<MemoryStrategy> = {
  id: MEMORY_ARCHITECTURE_ID,

  version: '1.0.0',

  // A memory brief: the agentic-system service passes it in the request body and
  // the loop UI lists this pipeline in its run form. The producer GENERATES the
  // strategy from the brief and coaches it; the memory-design orchestrator
  // targets this pipeline by id and runs the coach with coach-only recall.
  goalSource: 'brief',

  description:
    'A strategy for an agentic-memory system — its memory registers (working, episodic, semantic, procedural, relational; short versus long term), the typed Memory Service interfaces over them, and the recall, write, consolidation and expiry workflows — judged for the memory it keeps, the recall it serves, the write pipeline it runs, how it scopes and ages what it keeps, and how it governs it.',

  task: {
    criterionKinds: {
      capability:
        'Something the memory system must be able to do — remember, recall, update, invalidate, consolidate — for a kind of memory it keeps.',

      recall_target:
        'A retrieval quality or latency target: recall@k, ranking, freshness of a read, a token budget for what reaches the model, recall at a named register.',

      ingestion_rule:
        'A rule the write pipeline must follow: what is captured, extracted, classified, deduplicated and reconciled, and how a memory is persisted with its provenance.',

      scoping_rule:
        'A rule for how memories are isolated and grouped: tenant/user/project scope, partition-by-key rather than a store per user, atomic facts, the metadata a search filters on.',

      lifecycle_rule:
        'A rule for how a memory ages: its short- versus long-term class, when it is consolidated or promoted (episode to lesson, lesson to procedure), superseded or expired, and when the vector index is rebuilt.',

      constraint:
        'A hard rule the design may not break: a data boundary, retained content treated as untrusted, PII handling, an authority that may not move to a model.',
    },

    findingTypes: {
      missing_capability:
        'A memory the brief says the system must keep or serve that no register or interface provides.',

      unbacked_claim:
        'A summary, safeguard or workflow naming an operation or register the strategy does not declare, or naming every register as if each served the requirement — worse than no claim.',

      unexplained_component:
        'A register or interface no workflow exercises, or a capability no workflow serves.',

      contradiction:
        'Two parts of the strategy that cannot both be true: a workflow narrated against the operations its steps invoke, a register’s term against its lifecycle, a summary claim against the interfaces declared.',

      recall_defect:
        'A retrieval design that cannot meet a stated recall target: similarity-only where exact ids must match, no re-ranking, no query routing, a universal score threshold, no token budget, the wrong register recalled.',

      ingestion_defect:
        'A write path that loses, duplicates or corrupts memory: no extraction or validation, non-idempotent writes, dual writes with no reconciliation, a memory persisted with no provenance.',

      lifecycle_gap:
        'A memory that goes stale with nothing to supersede or expire it, an episode never consolidated, a short-term register never bounded, or an embedding-model change with no re-index.',

      scoping_defect:
        'Isolation or grouping that fails: a store or collection per user or per document, a missing tenant/user/project scope, retrieval that can cross a boundary, one register asked to serve reads with different needs.',

      metadata_gap:
        'The metadata a search needs is absent or unindexed: no subject/predicate for a fact, no temporal validity, a filter field that is stored but never indexed, administrative data embedded into the text.',

      constraint_violation: 'The strategy breaks a hard rule the brief states.',

      poisoning_risk:
        'Retrieved memory treated as an instruction rather than data, a model output writing a consequential memory with no validation, or sensitive content persisted that policy forbids.',
    },

    maxCriteria: MAX_CRITERIA,

    output: memoryStrategyOutput,
  },

  deriveCriteria: {
    persona: deriveCriteria,
    maxTokens: 5000,
  },

  // The coach. With no author artifact it GENERATES the strategy from the brief
  // on the first pass, then revises toward the remediations the panel selected.
  // It consumes prior memory-design lessons (recall) and its own setbacks — not
  // the criteria, so a first draft meets the brief rather than echoing its own
  // answer key. Caps seeded from the `agentic-design` analog (the same
  // multi-section artifact shape); re-measure with `pnpm measure:bounds` as runs
  // accrue.
  producer: {
    persona: producer,
    maxTokens: 50000,
    consumes: ['memories', 'setbacks'],
  },

  validators: [referencesValidator, coverageValidator, executabilityValidator],
  controller: STANDARD,

  critics: [
    {
      id: 'critic.capabilities',
      persona: criticCapabilities,
      samples: 2,
      maxItems: 10,
      maxTokens: 30000,
      findingTypes: ['missing_capability', 'unexplained_component'],
    },
    {
      id: 'critic.recall',
      persona: criticRecall,
      samples: 2,
      maxItems: 10,
      maxTokens: 30000,
      findingTypes: ['recall_defect'],
    },
    {
      id: 'critic.ingestion',
      persona: criticIngestion,
      samples: 2,
      maxItems: 10,
      maxTokens: 32000,
      findingTypes: ['ingestion_defect', 'lifecycle_gap'],
    },
    {
      id: 'critic.scoping',
      persona: criticScoping,
      samples: 2,
      maxItems: 10,
      maxTokens: 30000,
      findingTypes: ['scoping_defect', 'metadata_gap'],
    },
    {
      id: 'critic.grounding',
      persona: criticGrounding,
      samples: 2,
      maxItems: 10,
      maxTokens: 32000,
      findingTypes: ['unbacked_claim', 'unexplained_component', 'contradiction'],
    },
    {
      id: 'critic.governance',
      persona: criticGovernance,
      samples: 2,
      maxItems: 8,
      maxTokens: 30000,
      findingTypes: ['constraint_violation', 'poisoning_risk'],
    },
  ],

  evaluators: [
    {
      id: 'evaluator.requirements',
      persona: evaluatorRequirements,
      samples: 2,
      consumes: ['findings'],
      maxTokens: 14000,
      criterionKinds: ['capability', 'constraint'],
    },
    {
      id: 'evaluator.qualities',
      persona: evaluatorQualities,
      samples: 2,
      consumes: ['findings'],
      maxTokens: 16000,
      criterionKinds: ['recall_target', 'ingestion_rule', 'scoping_rule', 'lifecycle_rule'],
    },
  ],

  policy: {
    version: '1',

    dimensionWeights: {
      completeness: 0.18,
      retrieval: 0.22,
      ingestion: 0.22,
      scoping: 0.15,
      governance: 0.08,
      lifecycle: 0.15,
    },

    criterionKinds: {
      capability: { dimension: 'completeness', weight: 1, gate: false },
      recall_target: { dimension: 'retrieval', weight: 1, gate: false },
      ingestion_rule: { dimension: 'ingestion', weight: 1, gate: false },
      scoping_rule: { dimension: 'scoping', weight: 1, gate: false },
      lifecycle_rule: { dimension: 'lifecycle', weight: 1, gate: false },
      constraint: { dimension: 'governance', weight: 1, gate: true },
    },

    findingTypes: {
      // Coverage and alignment failures price where the requirement earned.
      missing_capability: { dimension: 'completeness', gate: false },
      unbacked_claim: { dimension: 'completeness', gate: false },
      unexplained_component: { dimension: 'completeness', gate: false },
      contradiction: { dimension: 'completeness', gate: false },
      // The memory-concern failures price on the dimension their criterion kind earns.
      recall_defect: { dimension: 'retrieval', gate: false },
      ingestion_defect: { dimension: 'ingestion', gate: false },
      lifecycle_gap: { dimension: 'lifecycle', gate: false },
      scoping_defect: { dimension: 'scoping', gate: false },
      metadata_gap: { dimension: 'scoping', gate: false },
      // The two a later, unanticipated input cannot recover from: they gate.
      constraint_violation: { dimension: 'governance', gate: true },
      poisoning_risk: { dimension: 'governance', gate: true },
    },

    ...STANDARD_SCORING,

    // Two samples on every lens and two hits to confirm: two finding types gate,
    // and one sample must never be able to block a run.
    evidence: { minHits: 2, minAssessedShare: 0.75 },

    thresholds: { acceptAt: 75, rejectBelow: 30 },

    loop: { maxIterations: 3, plateauAfter: 2, concurrency: 3, lostProduces: 1 },
  },
};
