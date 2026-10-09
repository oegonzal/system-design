/**
 * The fourth pipeline: judge a design for a workflow built out of agents, tools
 * and rules. A sibling of `system-design` rather than a replacement — that one
 * asks whether a design meets its numbers, this one asks whether its parts meet
 * each other.
 *
 * Two departures from `system-design`, both deliberate:
 *
 * 1. `contract` is a criterion kind and `contract_mismatch` a finding type, so
 *    the hand-off between two roles is a thing the panel grades rather than
 *    something inferred from prose. `scale` has no equivalent here: a brief that
 *    states operating targets states them as properties, which is what they are.
 * 2. Every dimension earns from a criterion kind. `system-design` maps no kind
 *    to `soundness`, so it starts at 100 and can only fall — and it sat at
 *    exactly 40, the penalty cap, in every run of a nine-hour experiment. A
 *    dimension that can only lose carries weight without carrying information.
 */
import { STANDARD } from '../../core/controllers';
import type { PipelineDefinition } from '../../core/pipeline';
import { STANDARD_SCORING } from '../../core/policy';
import criticContracts from './lenses/critic.contracts.md?raw';
import criticGenerality from './lenses/critic.generality.md?raw';
import criticRequirements from './lenses/critic.requirements.md?raw';
import criticSoundness from './lenses/critic.soundness.md?raw';
import deriveCriteria from './lenses/derive-criteria.md?raw';
import evaluatorInterfaces from './lenses/evaluator.interfaces.md?raw';
import evaluatorProperties from './lenses/evaluator.properties.md?raw';
import evaluatorRequirements from './lenses/evaluator.requirements.md?raw';
import producer from './lenses/producer.md?raw';
import { agenticDesignOutput, type AgenticDesign } from './output';

const MAX_CRITERIA = 20;

export const AGENTIC_DESIGN: PipelineDefinition<AgenticDesign> = {
  id: 'agentic-design',

  version: '1.0.0',

  // A brief a person types: a route for the router, a target for an orchestrator.

  goalSource: 'brief',

  description:
    'A design for a workflow of agents, tools and rules, judged for coverage, the fit between its parts, and whether it holds for inputs nobody anticipated.',

  task: {
    criterionKinds: {
      capability: 'Something the workflow must be able to do.',

      contract:
        'An interface between two roles: what one hands the next, and what the receiver may assume, including when things go wrong.',

      property:
        'A property the design must hold rather than a thing it must do — determinism, auditability, graceful degradation, extensibility, or working on inputs nobody anticipated.',

      constraint:
        'A hard rule the design may not break: an imposed platform, an authority that may not move, a boundary that may not be crossed.',
    },
    findingTypes: {
      missing_requirement: 'A stated requirement the answer does not address.',

      constraint_violation: 'The answer breaks a hard rule the brief states.',

      contract_mismatch:
        'What one role produces does not satisfy what the next consumes, or a hand-off names no producer or no consumer.',

      sequence_gap: 'A step whose precondition no earlier step establishes.',

      leaky_generality:
        'A mechanism that works only for the shape of input this brief describes; another kind would mean changing the engine rather than adding data.',

      authority_leak: 'A model output decides an outcome the design says is decided by rules.',

      contradiction: 'Two parts of the answer that cannot both be true.',

      unsupported_claim: 'A property asserted with no mechanism in the answer that provides it.',

      unhandled_failure: 'A failure the workflow would meet and does not handle.',
    },
    maxCriteria: MAX_CRITERIA,
    output: agenticDesignOutput,
  },

  deriveCriteria: {
    persona: deriveCriteria,
    maxTokens: 4000,
  },

  // The design this package exists to grade — a person's — never sees the
  // derived criteria. A producer that does writes one mechanism per line, and
  // 279 of 279 criteria passed. Its evaluators consume the confirmed findings
  // instead: producer → critics → evaluators → controller, by declaration.
  // A revision its judges found no better than the best is named to it on
  // the next ask (setbacks), so it does not write the same thing again.
  // Its cap is sized from the recorded runs: a full design has taken up to
  // 26.1k output tokens, thinking included (the spec holds the measurements).
  producer: {
    persona: producer,
    maxTokens: 32000,
    consumes: ['setbacks'],
  },

  validators: [],
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
      id: 'critic.contracts',
      persona: criticContracts,
      samples: 2,
      consumes: [],
      maxItems: 10,
      maxTokens: 12000,
    },
    {
      id: 'critic.soundness',
      persona: criticSoundness,
      samples: 2,
      consumes: [],
      maxItems: 10,
      maxTokens: 12000,
    },
    {
      id: 'critic.generality',
      persona: criticGenerality,
      samples: 2,
      consumes: [],
      maxItems: 10,
      maxTokens: 12000,
    },
  ],

  evaluators: [
    {
      id: 'evaluator.requirements',
      persona: evaluatorRequirements,
      samples: 2,
      consumes: ['findings'],
      maxTokens: 8000,
      criterionKinds: ['capability', 'constraint'],
    },
    {
      id: 'evaluator.interfaces',
      persona: evaluatorInterfaces,
      samples: 2,
      consumes: ['findings'],
      maxTokens: 8000,
      criterionKinds: ['contract'],
    },
    {
      id: 'evaluator.properties',
      persona: evaluatorProperties,
      samples: 2,
      consumes: ['findings'],
      maxTokens: 8000,
      criterionKinds: ['property'],
    },
  ],

  policy: {
    version: '1',

    dimensionWeights: {
      completeness: 0.3,

      interfaces: 0.3,

      compliance: 0.15,

      soundness: 0.25,
    },

    criterionKinds: {
      capability: { dimension: 'completeness', weight: 1, gate: false },
      contract: { dimension: 'interfaces', weight: 1, gate: false },
      property: { dimension: 'soundness', weight: 1, gate: false },
      constraint: { dimension: 'compliance', weight: 1, gate: true },
    },

    findingTypes: {
      missing_requirement: { dimension: 'completeness', gate: false },
      constraint_violation: { dimension: 'compliance', gate: true },
      contract_mismatch: { dimension: 'interfaces', gate: false },
      sequence_gap: { dimension: 'interfaces', gate: false },
      // Gated, alone among the reuse-shaped failures: a workflow that only
      // works on the brief it was written for is the one defect a later,
      // unanticipated input cannot recover from, and every brief here asks for
      // the opposite. Two samples must agree before it blocks.
      leaky_generality: { dimension: 'soundness', gate: true },
      authority_leak: { dimension: 'soundness', gate: false },
      contradiction: { dimension: 'soundness', gate: false },
      unsupported_claim: { dimension: 'soundness', gate: false },
      unhandled_failure: { dimension: 'soundness', gate: false },
    },

    ...STANDARD_SCORING,

    // Two samples everywhere and two hits to confirm: three finding types gate
    // here, and one sample should never be able to block a run on its own.
    evidence: { minHits: 2, minAssessedShare: 0.75, lostSample: 'score-only' },

    thresholds: { acceptAt: 75, rejectBelow: 30 },

    loop: { maxIterations: 3, plateauAfter: 2, concurrency: 2, lostProduces: 1 },
  },
};
