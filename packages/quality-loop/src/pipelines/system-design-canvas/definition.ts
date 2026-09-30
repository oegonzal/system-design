/**
 * The studio's pipeline: a canvas drawn by a person, judged against the prompt
 * it answers, and — when the studio asks for more than one iteration —
 * coached. Everything the studio's own engine once knew about system design
 * lives in the lens personas beside this file; the definition itself is kinds,
 * types, weights and gates.
 *
 * Two things shape the policy:
 *
 * 1. Explanation earns coverage. A functional criterion passes only through a
 *    binding whose path the diagram contains, and a claim the diagram does not
 *    back, a part nobody explains, or a narration that contradicts the drawing
 *    prices onto `coverage` — the same dimension the requirement earned on.
 *    A box with the right label and no story is worth as much as no box.
 * 2. Every dimension earns from a criterion kind. `soundness` in the older
 *    text pipeline could only fall; here the failures of soundness price onto
 *    `quality_attributes`, which the non-functional and scale criteria earn.
 *
 * The studio always provides the artifact, so the producer is the coach: it
 * runs on revise and retry only, and is told to keep the author's ids and to
 * prefix anything it adds with `ai-` so the studio can tell the two apart.
 */
import { CANVAS_PIPELINE_ID } from '@sysdesign/contracts';

import { STANDARD } from '../../core/controllers';
import type { PipelineDefinition } from '../../core/pipeline';
import criticArchitecture from './lenses/critic.architecture.md?raw';
import criticExplanation from './lenses/critic.explanation.md?raw';
import criticRequirements from './lenses/critic.requirements.md?raw';
import criticScale from './lenses/critic.scale.md?raw';
import criticScenarios from './lenses/critic.scenarios.md?raw';
import deriveCriteria from './lenses/derive-criteria.md?raw';
import evaluatorQuality from './lenses/evaluator.quality.md?raw';
import evaluatorRequirements from './lenses/evaluator.requirements.md?raw';
import producer from './lenses/producer.md?raw';
import { canvasOutput, type CanvasSubmission } from './output';
import { referencesValidator, structureValidator } from './validators';

const MAX_CRITERIA = 24;

export const SYSTEM_DESIGN_CANVAS: PipelineDefinition<CanvasSubmission> = {
  id: CANVAS_PIPELINE_ID,

  version: '1.0.0',

  description:
    'A canvas drawn in the studio — nodes, edges, the brief binding each requirement to the parts that hold it, and the narrative — judged against the prompt it answers, and coached when asked.',

  task: {
    criterionKinds: {
      functional:
        'A capability the system must provide: a request it serves, data it ingests, a job it runs.',

      non_functional:
        'A quality target the design must meet: latency, availability, consistency, durability, freshness, security, observability or cost.',

      scale:
        'A load, volume, retention or fleet figure the design must be sized for — one figure per criterion.',

      constraint:
        'A hard rule the design may not break: an imposed platform, a data boundary, a compliance rule, a vendor that only behaves one way.',
    },
    findingTypes: {
      missing_requirement: 'A stated requirement nothing in the diagram delivers.',

      constraint_violation: 'The diagram breaks a hard rule the goal states.',

      scale_mismatch:
        'A part sized for a different load than the goal states — too little, or far too much.',

      unhandled_failure:
        'A failure the system would meet that the design does not survive or recover from.',

      data_integrity:
        'Data that can be lost, duplicated, served stale past a stated bound, or written by two owners at once.',

      topology_defect:
        'A connection, or the absence of one, that fails as drawn: an unreachable part, a client on a store, a single point on a path the goal does not forgive.',

      interface_defect:
        'An operation carried but never declared, declared but never exercised, or owned by a part of the wrong kind.',

      operability_gap:
        'Nothing watches, traces, rotates or alerts on what the goal asks to be operated — or machinery no requirement here pays for.',

      unbacked_claim:
        'A binding or narration naming a mechanism the diagram does not provide, or naming every part as if each held the requirement.',

      unexplained_component:
        'A load-bearing part no binding, rationale or responsibility accounts for, or a functional requirement no path traces.',

      contradiction:
        'Two parts of the submission that cannot both be true: a path narrated differently from the edges drawn, a claim against a config entry.',

      bad_assumption:
        'A design decision resting on something the goal does not say and would not grant.',
    },
    maxCriteria: MAX_CRITERIA,
    output: canvasOutput,
  },

  deriveCriteria: {
    persona: deriveCriteria,
    maxTokens: 4000,
  },

  // The coach. Withholding the criteria is deliberate: it revises against the
  // remediations the panel selected, in the author's shape, never against
  // the checklist the canvas is graded on. 14000 keeps a full canvas under
  // the subscription client's output cap.
  producer: {
    persona: producer,
    maxTokens: 14000,
    consumes: [],
  },

  validators: [referencesValidator, structureValidator],
  controller: STANDARD,

  critics: [
    {
      id: 'critic.requirements',
      persona: criticRequirements,
      samples: 2,
      consumes: [],
      maxItems: 10,
      maxTokens: 12000,
    },
    {
      id: 'critic.architecture',
      persona: criticArchitecture,
      samples: 2,
      consumes: [],
      maxItems: 12,
      maxTokens: 14000,
    },
    {
      id: 'critic.scale',
      persona: criticScale,
      samples: 2,
      consumes: [],
      maxItems: 8,
      maxTokens: 12000,
    },
    {
      id: 'critic.explanation',
      persona: criticExplanation,
      samples: 2,
      consumes: [],
      maxItems: 10,
      maxTokens: 12000,
    },
    {
      id: 'critic.scenarios',
      persona: criticScenarios,
      samples: 2,
      consumes: [],
      maxItems: 8,
      maxTokens: 12000,
    },
  ],

  evaluators: [
    {
      id: 'evaluator.requirements',
      persona: evaluatorRequirements,
      samples: 2,
      consumes: ['findings'],
      maxItems: MAX_CRITERIA,
      maxTokens: 8000,
      criterionKinds: ['functional', 'constraint'],
    },
    {
      id: 'evaluator.quality',
      persona: evaluatorQuality,
      samples: 2,
      consumes: ['findings'],
      maxItems: MAX_CRITERIA,
      maxTokens: 8000,
      criterionKinds: ['non_functional', 'scale'],
    },
  ],

  policy: {
    version: '1',

    dimensionWeights: {
      coverage: 0.4,

      quality_attributes: 0.4,

      compliance: 0.2,
    },

    criterionKinds: {
      functional: { dimension: 'coverage', weight: 1, gate: false },
      non_functional: { dimension: 'quality_attributes', weight: 1, gate: false },
      // Half the weight of a quality target: a figure is met or not, and a
      // prompt lists several of them.
      scale: { dimension: 'quality_attributes', weight: 0.5, gate: false },
      constraint: { dimension: 'compliance', weight: 1, gate: true },
    },

    findingTypes: {
      missing_requirement: { dimension: 'coverage', gate: false },
      constraint_violation: { dimension: 'compliance', gate: true },
      scale_mismatch: { dimension: 'quality_attributes', gate: false },
      unhandled_failure: { dimension: 'quality_attributes', gate: false },
      data_integrity: { dimension: 'quality_attributes', gate: false },
      topology_defect: { dimension: 'quality_attributes', gate: false },
      interface_defect: { dimension: 'quality_attributes', gate: false },
      operability_gap: { dimension: 'quality_attributes', gate: false },
      // The explanation failures price where the requirement earned: a claim
      // the diagram does not back costs the coverage it pretended to have.
      unbacked_claim: { dimension: 'coverage', gate: false },
      unexplained_component: { dimension: 'coverage', gate: false },
      contradiction: { dimension: 'coverage', gate: false },
      bad_assumption: { dimension: 'quality_attributes', gate: false },
    },

    resultValues: { pass: 1, partial: 0.5, fail: 0 },

    confidenceWeights: { none: 0, low: 0.33, medium: 0.67, high: 1 },

    penalties: {
      bySeverity: { critical: 40, high: 25, medium: 12, low: 5, info: 0 },
      decay: 0.7,
      maxPerDimension: 60,
    },

    blockingSeverities: ['critical'],

    // Two samples on every lens and two hits to confirm: a constraint
    // violation gates, and one sample must never be able to block a run.
    evidence: { minHits: 2, minAssessedShare: 0.75 },

    thresholds: { acceptAt: 75, rejectBelow: 30 },

    loop: { maxIterations: 3, plateauAfter: 2, concurrency: 3 },
  },
};
