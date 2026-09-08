/**
 * The first pipeline: judge (and optionally produce) a system-design answer to
 * a prompt held in a markdown file. Everything here is data — vocabularies,
 * md personas, samples and the policy — except the answer's `OutputShape`.
 */
import type { PipelineDefinition } from '../../core/pipeline';
import criticRequirements from './lenses/critic.requirements.md?raw';
import criticScale from './lenses/critic.scale.md?raw';
import criticSoundness from './lenses/critic.soundness.md?raw';
import deriveCriteria from './lenses/derive-criteria.md?raw';
import evaluatorQuality from './lenses/evaluator.quality.md?raw';
import evaluatorRequirements from './lenses/evaluator.requirements.md?raw';
import producer from './lenses/producer.md?raw';
import { designAnswerOutput, type DesignAnswer } from './output';

export const SYSTEM_DESIGN: PipelineDefinition<DesignAnswer> = {
  id: 'system-design',

  version: '1.0.0',

  description:
    'A structured system-design answer to a markdown prompt, judged for coverage, soundness and scale.',

  task: {
    criterionKinds: {
      functional: 'A capability the system must provide.',

      non_functional:
        'A quality target — latency, availability, consistency, durability, freshness, security — with or without a number.',

      scale: 'A stated load, volume or retention figure the design must be sized for.',

      constraint:
        'A hard constraint the design may not violate: an imposed platform, data boundary, compliance rule or interface.',
    },

    findingTypes: {
      missing_requirement: 'A stated requirement the answer does not address.',

      constraint_violation: 'The answer breaks a hard constraint the goal states.',

      scale_mismatch: 'A mechanism that cannot meet a stated scale or quality target.',

      contradiction: 'Two parts of the answer that cannot both be true.',

      unsupported_claim: 'A property asserted with no mechanism in the answer that provides it.',

      bad_assumption: 'An assumption that is wrong for the stated scenario.',

      unhandled_failure: 'A failure the design would meet and does not handle.',
    },

    maxCriteria: 20,

    output: designAnswerOutput,
  },

  deriveCriteria: {
    persona: deriveCriteria,
    maxTokens: 4000,
  },

  producer: {
    persona: producer,
    maxTokens: 16000,
  },

  validators: [],

  critics: [
    {
      id: 'critic.requirements',
      persona: criticRequirements,
      samples: 1,
      maxItems: 10,
      maxTokens: 12000,
    },
    {
      id: 'critic.soundness',
      persona: criticSoundness,
      samples: 2,
      maxItems: 10,
      maxTokens: 12000,
    },
    {
      id: 'critic.scale',
      persona: criticScale,
      samples: 1,
      maxItems: 10,
      maxTokens: 12000,
    },
  ],

  evaluators: [
    {
      id: 'evaluator.requirements',
      persona: evaluatorRequirements,
      samples: 1,
      maxItems: 20,
      maxTokens: 8000,
      criterionKinds: ['functional', 'constraint'],
    },
    {
      id: 'evaluator.quality',
      persona: evaluatorQuality,
      samples: 2,
      maxItems: 20,
      maxTokens: 8000,
      criterionKinds: ['non_functional', 'scale'],
    },
  ],

  policy: {
    version: '1',

    dimensionWeights: {
      completeness: 0.35,

      quality_attributes: 0.3,

      compliance: 0.15,

      soundness: 0.2,
    },

    criterionKinds: {
      functional: {
        dimension: 'completeness',
        weight: 1,
        gate: false,
      },
      non_functional: {
        dimension: 'quality_attributes',
        weight: 1,
        gate: false,
      },
      scale: {
        dimension: 'quality_attributes',
        weight: 0.5,
        gate: false,
      },
      constraint: {
        dimension: 'compliance',
        weight: 1,
        gate: true,
      },
    },

    findingTypes: {
      missing_requirement: {
        dimension: 'completeness',
        gate: false,
      },
      constraint_violation: {
        dimension: 'compliance',
        gate: true,
      },
      scale_mismatch: {
        dimension: 'quality_attributes',
        gate: false,
      },
      contradiction: {
        dimension: 'soundness',
        gate: false,
      },
      unsupported_claim: {
        dimension: 'soundness',
        gate: false,
      },
      bad_assumption: {
        dimension: 'soundness',
        gate: false,
      },
      unhandled_failure: {
        dimension: 'soundness',
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

    evidence: { minHits: 1, minAssessedShare: 0.75 },

    thresholds: { acceptAt: 80, rejectBelow: 35 },

    loop: { maxIterations: 3, plateauAfter: 2, concurrency: 2 },
  },
};
