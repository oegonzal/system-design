/**
 * The operator's drafter: for every field of one form page the operator is
 * about to be asked, a few suggested answers — from the record the goal lists
 * about the subject, or, where the record is silent and the goal's Suggesting
 * policy allows, drafts labelled as drafts — judged once, each suggestion
 * withheld from the operator when a judge or a validator faults it. A chosen
 * suggestion becomes the operator's own answer, so what each label promises is
 * fixed here, for every goal, and what a goal adds is derived from its policy.
 *
 * Everything here is data except the `OutputShape` and the validators beside
 * it. One iteration, the evaluator beside the critics: the operator waits on
 * this run.
 */
import { ANSWER_SUGGESTIONS_PIPELINE_ID, type AnswerSuggestions } from '@sysdesign/contracts';

import { STANDARD } from '../../core/controllers';
import type { PipelineDefinition } from '../../core/pipeline';
import { STANDARD_SCORING } from '../../core/policy';
import criticFit from './lenses/critic.fit.md?raw';
import criticGrounding from './lenses/critic.grounding.md?raw';
import deriveCriteria from './lenses/derive-criteria.md?raw';
import evaluatorSuggestions from './lenses/evaluator.suggestions.md?raw';
import producer from './lenses/producer.md?raw';
import { answerSuggestionsOutput } from './output';
import { citationsValidator, limitsValidator, referencesValidator } from './validators';

/**
 * Four fixed criteria plus what a Suggesting policy of a few lines yields.
 * Measured 2026-10-11, five Claude derivations of a recorded mission's
 * Suggesting policy (`static/runs/2026-10-11T07-1*-criteria`): 10 to 11
 * criteria, the fixed four included; 14 is 11 and a fifth more.
 */
const MAX_CRITERIA = 14;

/** What every label promises, whatever the goal: the criteria no derivation may drop. */
const FIXED_CRITERIA = [
  {
    kind: 'grounding',
    statement: 'A record suggestion states only what the evidence it cites states.',
  },
  {
    kind: 'grounding',
    statement:
      'A transfer suggestion cites recorded work and claims only how it carries over, never the asked experience itself.',
  },
  {
    kind: 'grounding',
    statement:
      'No suggestion contradicts listed evidence, and no record or transfer suggestion claims what a listed claim boundary forbids.',
  },
  {
    kind: 'fit',
    statement:
      "Every suggestion answers its field's question, can be submitted as it stands, and differs from the others of its field.",
  },
] as const;

export const ANSWER_SUGGESTIONS: PipelineDefinition<AnswerSuggestions> = {
  id: ANSWER_SUGGESTIONS_PIPELINE_ID,
  version: '1.0.0',

  // A goal another program composes; never a route, a target, or a choice in the UI.
  goalSource: 'composed',
  description:
    "A few suggested answers for each field the operator is asked, from the subject's record or drafted and labelled as drafts, judged for resting on what their labels say, for honouring the goal's suggesting policy, and for fitting their fields.",

  task: {
    criterionKinds: {
      grounding:
        'A suggestion rests on what its label says: a record suggestion on the evidence it cites, a transfer on recorded work it carries over, and none past a binding claim boundary.',
      compliance:
        "A line of the goal's suggesting policy the suggestions must honour: which kinds are offered for which questions, and what a draft may claim.",
      fit: 'A suggestion the operator can choose and submit as it stands: answering its field, within its limits, distinct from its siblings.',
    },
    findingTypes: {
      ungrounded: 'A record suggestion stating more than the evidence it cites states.',
      mislabelled:
        'A suggestion labelled for what it does not rest on: a draft labelled record, a transfer claiming the asked experience itself, or citing no recorded work.',
      boundary_crossed:
        'A suggestion claiming what a listed claim boundary forbids, where the suggesting policy lets that boundary bind it.',
      off_question: 'A suggestion answering another question than its field asks.',
      unusable:
        'A suggestion that cannot be submitted as it stands: a placeholder, a note to the operator, a template to fill in.',
      duplicate: 'A suggestion repeating another of its field in other words.',
      policy_breach:
        "A field's suggestions breaking a line of the suggesting policy: a draft the policy calls for missing, or one it keeps from that question offered.",
    },
    maxCriteria: MAX_CRITERIA,
    fixedCriteria: FIXED_CRITERIA,
    output: answerSuggestionsOutput,
  },

  // Caps a fifth above what this pipeline's own runs wrote (`measured.json`,
  // `pnpm measure:bounds`; 51 runs on the subscription, 2026-10-13): the
  // grounding critic ran to 18,190 output tokens, the evaluator to 17,431
  // judging the two-to-four-paragraph drafts the suggesting policy asks for,
  // the producer to 14,047 — past its 8,000 — the fit critic to 11,533. The
  // producer's cap is sized past that for those drafts. A cap is also the
  // call's time limit, so one a stage outwrites is a call cut short.
  deriveCriteria: { persona: deriveCriteria, maxTokens: 10000 },
  producer: { persona: producer, maxTokens: 20000, consumes: ['criteria'] },
  validators: [referencesValidator, citationsValidator, limitsValidator],
  controller: STANDARD,

  critics: [
    {
      id: 'critic.grounding',
      persona: criticGrounding,
      samples: 1,
      maxItems: 10,
      maxTokens: 22000,
    },
    { id: 'critic.fit', persona: criticFit, samples: 1, maxItems: 10, maxTokens: 14000 },
  ],

  evaluators: [
    {
      id: 'evaluator.suggestions',
      persona: evaluatorSuggestions,
      samples: 1,
      // Beside the critics rather than after them: the operator waits on this
      // run, and measured on field-answer's stages that is a third off its time.
      consumes: [],
      maxTokens: 21000,
      criterionKinds: ['grounding', 'compliance', 'fit'],
    },
  ],

  policy: {
    version: '1',
    // A chosen suggestion becomes stored memory: a false label costs the most.
    dimensionWeights: { grounding: 0.5, compliance: 0.25, fit: 0.25 },
    criterionKinds: {
      grounding: { dimension: 'grounding', weight: 1, gate: false },
      compliance: { dimension: 'compliance', weight: 1, gate: false },
      fit: { dimension: 'fit', weight: 1, gate: false },
    },
    findingTypes: {
      // Priced and withheld, never gated: every defect belongs to one
      // suggestion, which is kept from the operator at its location, and the
      // field's other suggestions are still worth offering.
      ungrounded: { dimension: 'grounding', gate: false, withholds: 'every-ref' },
      mislabelled: { dimension: 'grounding', gate: false, withholds: 'every-ref' },
      boundary_crossed: { dimension: 'grounding', gate: false, withholds: 'every-ref' },
      off_question: { dimension: 'fit', gate: false, withholds: 'every-ref' },
      unusable: { dimension: 'fit', gate: false, withholds: 'every-ref' },
      // A repeat is redundant, not wrong: both stay on offer.
      duplicate: { dimension: 'fit', gate: false, withholds: 'none' },
      policy_breach: { dimension: 'compliance', gate: false, withholds: 'every-ref' },
    },
    ...STANDARD_SCORING,
    blockingSeverities: [],
    evidence: { minHits: 1, minAssessedShare: 0.75 },
    thresholds: { acceptAt: 70, rejectBelow: 30 },
    // One iteration: the operator is waiting, and every faulted suggestion is
    // withheld rather than revised.
    loop: { maxIterations: 1, plateauAfter: 1, concurrency: 3, lostProduces: 1 },
  },
};
