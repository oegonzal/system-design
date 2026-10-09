/**
 * The browser session's answerer: every field of one form page, answered
 * from the evidence the goal lists about the subject, routed to the
 * operator, or left blank by rule — judged once. The goal is composed by the
 * session and recomposed by the form-memory orchestrator with the recalled
 * evidence in it; the artifact is the answers the session routes field by
 * field. Everything here is data except the answers' `OutputShape` and the
 * two exact validators beside it.
 *
 * The standard controller, not a hand-back: a judged page is still a page
 * the session can act on field by field — the remediations are the
 * operator's worklist — so a `revise` is read by the caller as "ask about
 * the fields the judges named" rather than as a reason to open a new run.
 */
import { FIELD_ANSWER_PIPELINE_ID, type FieldAnswers } from '@sysdesign/contracts';

import { STANDARD } from '../../core/controllers';
import type { PipelineDefinition } from '../../core/pipeline';
import { STANDARD_SCORING } from '../../core/policy';
import criticForm from './lenses/critic.form.md?raw';
import criticGrounding from './lenses/critic.grounding.md?raw';
import deriveCriteria from './lenses/derive-criteria.md?raw';
import evaluatorAnswers from './lenses/evaluator.answers.md?raw';
import producer from './lenses/producer.md?raw';
import { fieldAnswersOutput } from './output';
import { limitsValidator, referencesValidator } from './validators';

/** An answering policy of a few lines plus its never-do lines. */
const MAX_CRITERIA = 12;

export const FIELD_ANSWER: PipelineDefinition<FieldAnswers> = {
  id: FIELD_ANSWER_PIPELINE_ID,
  version: '1.0.0',

  // A goal another program composes; never a route, a target, or a choice in the UI.
  goalSource: 'composed',
  description:
    "Every field of one form page answered about its subject from the evidence the goal lists, judged for resting on that evidence, for honouring the mission's answering policy and traps, and for settling every field.",

  task: {
    criterionKinds: {
      grounding:
        'A value about the subject must rest on listed evidence, cited by alias; a field no evidence settles is asked of the operator.',
      compliance:
        "A line of the mission's answering policy or its never-do list the answers must honour: a hidden field left blank, a bot question never answered, nothing invented.",
      coverage:
        'A field the answers must settle one way — a value, an ask, a blank — with a required visible field never left blank without a reason.',
    },
    findingTypes: {
      ungrounded:
        'A value about the subject that no cited evidence states, or that rests on no evidence at all.',
      inconsistent:
        'Two answers that cannot both be true, or a value that contradicts the evidence it cites.',
      trap_answered:
        'A value given to a field the page hides, or to a visible question whose only purpose is to tell a bot from a person.',
      needless_ask:
        'A field routed to the operator although the listed evidence settles it plainly.',
      blank_required:
        'A required, visible field left blank with no reason the answering policy allows; a field routed to the operator, or kept as the page holds it, is not left blank.',
    },
    maxCriteria: MAX_CRITERIA,
    output: fieldAnswersOutput,
  },

  // Caps a fifth above the most each lens has measurably written (`measured.json`, two runs as of 2026-10-07) and above their seeds.
  // The spec holds the seed table; the first live runs replace it, and a cap
  // is also the call's time limit, so one a stage outwrites is a call cut short.
  deriveCriteria: { persona: deriveCriteria, maxTokens: 6000 },
  // The answerer sees the checklist a session derived once; `memories` keeps
  // `recall: true` legal on a run, unused by default — the form-memory
  // orchestrator puts the evidence into the goal every stage reads instead.
  producer: { persona: producer, maxTokens: 8000, consumes: ['criteria', 'memories'] },
  validators: [referencesValidator, limitsValidator],
  controller: STANDARD,

  critics: [
    {
      id: 'critic.grounding',
      persona: criticGrounding,
      samples: 1,
      consumes: [],
      maxItems: 10,
      maxTokens: 8000,
    },
    {
      id: 'critic.form',
      persona: criticForm,
      samples: 1,
      consumes: [],
      maxItems: 10,
      maxTokens: 8000,
    },
  ],

  evaluators: [
    {
      id: 'evaluator.answers',
      persona: evaluatorAnswers,
      samples: 1,
      // After the critics, with their confirmed defects before it: an
      // ungrounded value the grounding critic found is measured, not missed.
      consumes: ['findings'],
      maxTokens: 8000,
      criterionKinds: ['grounding', 'compliance', 'coverage'],
    },
  ],

  policy: {
    version: '1',
    dimensionWeights: { grounding: 0.45, compliance: 0.3, coverage: 0.25 },
    criterionKinds: {
      grounding: { dimension: 'grounding', weight: 1, gate: false },
      compliance: { dimension: 'compliance', weight: 1, gate: false },
      coverage: { dimension: 'coverage', weight: 1, gate: false },
    },
    findingTypes: {
      // Priced, not gated: a faulted field is routed to the operator by the
      // caller, and the page's other fields are still worth filling.
      ungrounded: { dimension: 'grounding', gate: false },
      inconsistent: { dimension: 'grounding', gate: false },
      // The one defect no score can offset: a value in a trap flags the account.
      trap_answered: { dimension: 'compliance', gate: true },
      needless_ask: { dimension: 'coverage', gate: false },
      blank_required: { dimension: 'coverage', gate: false },
    },
    ...STANDARD_SCORING,
    // Only the gated type vetoes. The standard scoring would also let a
    // finding a critic called `critical` block the page, whatever its type;
    // measured 2026-10-07, a critical `blank_required` on one field the model
    // had rightly routed to the operator escalated a page whose other two
    // fields were answered right from memory. A severity word is the critic's
    // to choose; a gate is declared here.
    blockingSeverities: [],
    evidence: { minHits: 1, minAssessedShare: 0.75 },
    thresholds: { acceptAt: 70, rejectBelow: 30 },
    // One iteration: the caller reads the judged page field by field.
    loop: { maxIterations: 1, plateauAfter: 1, concurrency: 3, lostProduces: 1 },
  },
};
