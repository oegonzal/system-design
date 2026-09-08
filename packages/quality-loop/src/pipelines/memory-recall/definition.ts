/**
 * The second pipeline: judge candidate chunks recalled from memory for a
 * query and curate them into a pack a producer could read. Everything here is
 * data — vocabularies, md personas, samples and the policy — except the pack's
 * `OutputShape`, the input codec beside it and two exact validators.
 */
import type { PipelineDefinition } from '../../core/pipeline';
import { MEMORY_RECALL_ID } from './input';
import criticGrounding from './lenses/critic.grounding.md?raw';
import criticRelevance from './lenses/critic.relevance.md?raw';
import deriveCriteria from './lenses/derive-criteria.md?raw';
import evaluatorAdmissibility from './lenses/evaluator.admissibility.md?raw';
import evaluatorCoverage from './lenses/evaluator.coverage.md?raw';
import producer from './lenses/producer.md?raw';
import { memoryPackOutput, type MemoryPack } from './output';
import { limitsValidator, referencesValidator } from './validators';

const MAX_CRITERIA = 12;

export const MEMORY_RECALL: PipelineDefinition<MemoryPack> = {
  id: MEMORY_RECALL_ID,
  version: '1.0.0',
  description:
    'Chunks recalled from memory for a query, judged for coverage, precision and fidelity and curated into a pack a producer could read.',

  task: {
    criterionKinds: {
      need: 'An aspect of the query — a requirement, target, constraint or risk area — that remembered evidence should inform.',
      admissibility:
        'A rule the goal states about which memory may be kept and how a kept chunk must be grounded, cited or used.',
    },
    findingTypes: {
      missed_chunk: 'A dropped candidate that serves a need no kept chunk serves.',
      no_usable_memory: 'No candidate serves any need of the query; artifact-wide and unfixable.',
      irrelevant_chunk: 'A kept chunk that serves no need of the query.',
      redundant_chunk: 'A kept chunk whose insight another kept chunk already gives.',
      unsupported_insight: "An insight attributed to a chunk that the chunk's text does not say.",
      misleading_chunk:
        'A kept chunk that contradicts a rule or target the query states, or another kept chunk, with no caveat.',
      stale_chunk:
        "A kept chunk superseded by another candidate's later evidence on the same subject.",
    },
    maxCriteria: MAX_CRITERIA,
    output: memoryPackOutput,
  },

  deriveCriteria: { persona: deriveCriteria, maxTokens: 4000 },
  producer: { persona: producer, maxTokens: 4000 },
  validators: [referencesValidator, limitsValidator],

  critics: [
    {
      id: 'critic.relevance',
      persona: criticRelevance,
      samples: 2,
      maxItems: 10,
      maxTokens: 4000,
    },
    {
      id: 'critic.grounding',
      persona: criticGrounding,
      samples: 2,
      maxItems: 10,
      maxTokens: 4000,
    },
  ],

  evaluators: [
    {
      id: 'evaluator.coverage',
      persona: evaluatorCoverage,
      samples: 2,
      maxItems: MAX_CRITERIA,
      maxTokens: 4000,
      criterionKinds: ['need'],
    },
    {
      id: 'evaluator.admissibility',
      persona: evaluatorAdmissibility,
      samples: 2,
      maxItems: MAX_CRITERIA,
      maxTokens: 4000,
      criterionKinds: ['admissibility'],
    },
  ],

  policy: {
    version: '1',
    dimensionWeights: { coverage: 0.4, precision: 0.25, fidelity: 0.35 },
    criterionKinds: {
      need: {
        dimension: 'coverage',
        weight: 1,
        gate: false,
      },
      admissibility: {
        dimension: 'fidelity',
        weight: 1,
        gate: true,
      },
    },
    findingTypes: {
      missed_chunk: {
        dimension: 'coverage',
        gate: false,
      },
      no_usable_memory: {
        dimension: 'coverage',
        gate: true,
      },
      irrelevant_chunk: {
        dimension: 'precision',
        gate: false,
      },
      redundant_chunk: {
        dimension: 'precision',
        gate: false,
      },
      // Priced, not gated: the producer that reads the pack sees the chunk's own
      // text beside the insight, so an over-reaching insight is a penalty,
      // not a reason to withhold the whole pack (the first live run blocked an 83 on one).
      unsupported_insight: {
        dimension: 'fidelity',
        gate: false,
      },
      misleading_chunk: {
        dimension: 'fidelity',
        gate: false,
      },
      stale_chunk: {
        dimension: 'fidelity',
        gate: false,
      },
    },
    resultValues: { pass: 1, partial: 0.5, fail: 0 },
    confidenceWeights: { none: 0, low: 0.33, medium: 0.67, high: 1 },
    penalties: {
      bySeverity: { critical: 40, high: 25, medium: 12, low: 5, info: 0 },
      decay: 0.7,
      maxPerDimension: 60,
    },
    blockingSeverities: ['critical'],
    // Two samples everywhere and two hits to confirm: a reject for
    // `no_usable_memory` needs both samples of a critic to agree.
    evidence: { minHits: 2, minAssessedShare: 0.75 },
    thresholds: { acceptAt: 75, rejectBelow: 30 },
    loop: { maxIterations: 2, plateauAfter: 2, concurrency: 2 },
  },
};
