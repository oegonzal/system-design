/**
 * The second pipeline: judge candidate chunks recalled from memory for a
 * query and curate them into a pack a producer could read. Everything here is
 * data — vocabularies, md personas, samples and the policy — except the pack's
 * `OutputShape`, the input codec beside it and two exact validators.
 */
import { DIMENSION_FLOOR } from '../../core/controllers';
import type { PipelineDefinition } from '../../core/pipeline';
import { STANDARD_SCORING } from '../../core/policy';
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

  // A goal another program composes; never a route, a target, or a choice in the UI.
  goalSource: 'composed',
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
      restated_defect:
        'A kept chunk that only restates a defect the query lists as already in hand, adding no fix, mechanism or risk.',
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
  producer: { persona: producer, maxTokens: 16000, consumes: ['criteria'] },
  validators: [referencesValidator, limitsValidator],
  // The floor, not the standard order: a pack accepted at 80.6 with coverage
  // at 59.1 is the case it exists for, and this is the pipeline that runs it
  // live against `standard` on the other three.
  controller: DIMENSION_FLOOR,

  critics: [
    {
      id: 'critic.relevance',
      persona: criticRelevance,
      samples: 2,
      consumes: [],
      maxItems: 10,
      maxTokens: 18000,
    },
    {
      id: 'critic.grounding',
      persona: criticGrounding,
      samples: 2,
      consumes: [],
      maxItems: 10,
      maxTokens: 20000,
    },
  ],

  evaluators: [
    {
      id: 'evaluator.coverage',
      persona: evaluatorCoverage,
      samples: 2,
      consumes: [],
      maxTokens: 8000,
      criterionKinds: ['need'],
    },
    {
      id: 'evaluator.admissibility',
      persona: evaluatorAdmissibility,
      samples: 2,
      consumes: [],
      maxTokens: 8000,
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
    // `withholds` is what a confirmed finding does to the kept chunks it
    // names when the pack is read (`withheldItems`), declared by what handing
    // the chunk to the producer as written would do: a chunk that is
    // irrelevant, unsupported, misleading, stale or already in hand would
    // mislead it, so it is withheld; a gap names a chunk without faulting it;
    // and a redundant group withholds nothing, because its confirmed set is
    // a component of overlapping claims, not one claim, so any member may be
    // a bystander (`WITHHOLDINGS` says why).
    findingTypes: {
      missed_chunk: {
        dimension: 'coverage',
        gate: false,
        withholds: 'none',
      },
      no_usable_memory: {
        dimension: 'coverage',
        gate: true,
        withholds: 'every-ref',
      },
      irrelevant_chunk: {
        dimension: 'precision',
        gate: false,
        withholds: 'every-ref',
      },
      redundant_chunk: {
        dimension: 'precision',
        gate: false,
        withholds: 'none',
      },
      // What the producer already holds is not news, but a chunk that
      // restates it misleads nobody: priced, never a reason to withhold the
      // pack — and, confirmed, the chunk itself is withheld like any faulted one.
      restated_defect: {
        dimension: 'precision',
        gate: false,
        withholds: 'every-ref',
      },
      // Priced, not gated: the producer that reads the pack sees the chunk's own
      // text beside the insight, so an over-reaching insight is a penalty,
      // not a reason to withhold the whole pack (the first live run blocked an 83 on one).
      unsupported_insight: {
        dimension: 'fidelity',
        gate: false,
        withholds: 'every-ref',
      },
      misleading_chunk: {
        dimension: 'fidelity',
        gate: false,
        withholds: 'every-ref',
      },
      stale_chunk: {
        dimension: 'fidelity',
        gate: false,
        withholds: 'every-ref',
      },
    },
    ...STANDARD_SCORING,
    // Two samples everywhere and two hits to confirm: a reject for
    // `no_usable_memory` needs both samples of a critic to agree.
    evidence: { minHits: 2, minAssessedShare: 0.75 },
    thresholds: { acceptAt: 75, rejectBelow: 30 },
    loop: { maxIterations: 2, plateauAfter: 2, concurrency: 2, lostProduces: 1 },
  },
};
