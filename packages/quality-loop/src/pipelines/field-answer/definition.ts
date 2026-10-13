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

/**
 * An answering policy of a few lines plus the never-do lines about what a
 * field takes. Measured 2026-10-10, five Claude derivations of the 8.6 KB
 * mission (`static/runs/2026-10-10T04-17-10-*-criteria`): 8 to 10 criteria
 * once the never-do lines about what the session clicks, submits or sends
 * were left to the planner; 12 is 10 and a fifth more.
 */
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
        'A value about the subject must rest on listed evidence, cited by alias and declared by how it rests; a field nothing bears on is asked of the operator.',
      compliance:
        "A line of the mission's answering policy or its never-do list the answers must honour: a hidden field left blank, a bot question never answered, nothing invented.",
      coverage:
        'A field the answers must settle one way — a value, an ask, a blank — with a required visible field never left blank without a reason.',
    },
    findingTypes: {
      ungrounded:
        'A value, or a claim within a composed one, that nothing listed bears on — an empty basis, or cited evidence about something else — given as resting on the evidence.',
      overstated:
        'A declared kind that claims more than the evidence gives: stated for what it only yields, maps to or suggests; restated for an earlier answer to another thing, figure or period, or about the unit of work it names; derived from figures or parts the evidence does not list.',
      misfit_option:
        'A mapped value whose option does not carry the fact it rests on, or where another listed option carries it as well.',
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

  // Caps a fifth above the most each stage has written (`measured.json`,
  // `pnpm measure:bounds`): 85 runs on Claude, which counts its thinking,
  // 2026-10-05 → 2026-10-11 — the producer to 11,408 tokens, the grounding
  // critic 9,969, the form critic 8,858, the evaluator 13,339 — and five
  // derivations through the criteria endpoint to 7,931 (2026-10-10). A cap is
  // also the call's time limit, so one a stage outwrites is a call cut short.
  deriveCriteria: { persona: deriveCriteria, maxTokens: 10000 },
  // The answerer sees the checklist a session derived once; `memories` keeps
  // `recall: true` legal on a run, unused by default — the form-memory
  // orchestrator puts the evidence into the goal every stage reads instead.
  producer: { persona: producer, maxTokens: 14000, consumes: ['criteria', 'memories'] },
  validators: [referencesValidator, limitsValidator],
  controller: STANDARD,

  critics: [
    {
      id: 'critic.grounding',
      persona: criticGrounding,
      samples: 1,
      maxItems: 10,
      maxTokens: 18500,
    },
    {
      id: 'critic.form',
      persona: criticForm,
      samples: 1,
      maxItems: 10,
      maxTokens: 13500,
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
      maxTokens: 16500,
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
    // `withholds` is what a confirmed finding does to the fields it names when
    // the session reads the page back through the orchestration's report
    // (`withheldItems`): a field it withholds is never filled, and goes to the
    // operator with the finding's words. A value nothing bears on, a value that
    // contradicts its evidence, a mapped value on the wrong option, and a value
    // given to a trap are wrong VALUES — typed into someone's form they would
    // speak falsely for the subject — so each withholds the field it names. An
    // overstated kind is a disagreement about how a true value rests, and the
    // answering settings already say which kinds fill: it is priced on the
    // grounding dimension and withholds nothing, since under a table that
    // fills every kind no re-labelling could change the route — a session that
    // asks on some kind must come with `overstated: every-ref`. A field asked
    // needlessly, or left blank although required, has no value to withhold.
    // Declared here rather than left to the strict default so the read-back
    // never again demotes on "any finding".
    findingTypes: {
      // Priced, not gated: a withheld field is the operator's, and the page's
      // other fields are still worth filling.
      ungrounded: { dimension: 'grounding', gate: false, withholds: 'every-ref' },
      overstated: { dimension: 'grounding', gate: false, withholds: 'none' },
      misfit_option: { dimension: 'grounding', gate: false, withholds: 'every-ref' },
      inconsistent: { dimension: 'grounding', gate: false, withholds: 'every-ref' },
      // The one defect no score can offset: a value in a trap flags the account.
      trap_answered: { dimension: 'compliance', gate: true, withholds: 'every-ref' },
      needless_ask: { dimension: 'coverage', gate: false, withholds: 'none' },
      blank_required: { dimension: 'coverage', gate: false, withholds: 'none' },
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
