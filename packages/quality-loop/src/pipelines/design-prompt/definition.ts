/**
 * The studio's other pipeline: write a system-design prompt from an
 * engineer's experience. The goal is the experience as the studio renders it
 * — role, summary, stack, highlights, employer named — and the artifact is
 * the structured draft the studio renders to markdown once the loop accepts
 * it. The employer is in the goal on purpose: the fidelity critic exists to
 * catch it leaking into the prompt, and `brand_leak` gates.
 *
 * One sample per lens and one hit to confirm: the defects here are checkable
 * from the line alone, the loop is two iterations, and a prompt is cheap to
 * write again.
 */
import { PROMPT_PIPELINE_ID } from '@sysdesign/contracts';

import { STANDARD } from '../../core/controllers';
import type { PipelineDefinition } from '../../core/pipeline';
import criticFidelity from './lenses/critic.fidelity.md?raw';
import criticGradeability from './lenses/critic.gradeability.md?raw';
import deriveCriteria from './lenses/derive-criteria.md?raw';
import evaluatorPrompt from './lenses/evaluator.prompt.md?raw';
import producer from './lenses/producer.md?raw';
import { designPromptOutput } from './output';
import { shapeValidator } from './validators';

const MAX_CRITERIA = 12;

export const DESIGN_PROMPT: PipelineDefinition<ReturnType<typeof designPromptOutput.schema.parse>> =
  {
    id: PROMPT_PIPELINE_ID,

    version: '1.0.0',

    description:
      "A system-design prompt written from an engineer's experience, judged for fidelity to that experience, for whether a panel could grade answers to it, and for staying brand-neutral and one session wide.",

    task: {
      criterionKinds: {
        fidelity:
          'A fact of the experience the prompt must build on: its domain, the shape of an integration, a figure, a failure the system survived.',

        gradeability:
          'A property that lets a panel grade answers: a requirement a grader can check, a target with a number, a stated scale, a constraint a design must respect.',

        scope:
          "A boundary the prompt must hold: no employer, product or vendor named, and one session's worth of design.",
      },
      findingTypes: {
        generic_scenario:
          'A scenario or requirement that would fit any system and rests on nothing the experience states.',

        brand_leak: 'An employer, product, vendor or codename that says where this happened.',

        vague_requirement: 'A requirement with no outcome a grader could observe.',

        unmeasurable_target:
          'A quality target with no figure, unit or percentile, or a scale row that states nothing a design could be sized to.',

        contradiction: 'Two lines of the prompt that cannot both hold.',

        overreach:
          'More than a candidate could design in one session, or parts of the experience the scenario never set up.',
      },
      maxCriteria: MAX_CRITERIA,
      output: designPromptOutput,
    },

    deriveCriteria: {
      persona: deriveCriteria,
      maxTokens: 4000,
    },

    // The writer sees the checklist: the draft is meant to meet it, and the
    // experience it is written from is the goal itself.
    producer: {
      persona: producer,
      maxTokens: 8000,
      consumes: ['criteria'],
    },

    validators: [shapeValidator],
    controller: STANDARD,

    critics: [
      {
        id: 'critic.fidelity',
        persona: criticFidelity,
        samples: 1,
        consumes: [],
        maxItems: 8,
        maxTokens: 8000,
      },
      {
        id: 'critic.gradeability',
        persona: criticGradeability,
        samples: 1,
        consumes: [],
        maxItems: 8,
        maxTokens: 8000,
      },
    ],

    evaluators: [
      {
        id: 'evaluator.prompt',
        persona: evaluatorPrompt,
        samples: 1,
        consumes: ['findings'],
        maxItems: MAX_CRITERIA,
        maxTokens: 6000,
        criterionKinds: ['fidelity', 'gradeability', 'scope'],
      },
    ],

    policy: {
      version: '1',

      dimensionWeights: {
        fidelity: 0.4,

        gradeability: 0.4,

        scope: 0.2,
      },

      criterionKinds: {
        fidelity: { dimension: 'fidelity', weight: 1, gate: false },
        gradeability: { dimension: 'gradeability', weight: 1, gate: false },
        scope: { dimension: 'scope', weight: 1, gate: true },
      },

      findingTypes: {
        generic_scenario: { dimension: 'fidelity', gate: false },
        // A named employer is the one defect no score can offset: the prompt
        // is for practice in the open, and the name is what it must not carry.
        brand_leak: { dimension: 'scope', gate: true },
        vague_requirement: { dimension: 'gradeability', gate: false },
        unmeasurable_target: { dimension: 'gradeability', gate: false },
        contradiction: { dimension: 'gradeability', gate: false },
        overreach: { dimension: 'scope', gate: false },
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

      thresholds: { acceptAt: 75, rejectBelow: 30 },

      loop: { maxIterations: 2, plateauAfter: 2, concurrency: 2 },
    },
  };
