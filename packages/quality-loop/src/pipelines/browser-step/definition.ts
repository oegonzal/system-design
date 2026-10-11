/**
 * The browser session's planner: one bounded plan for the page in front of
 * it. The goal is composed by the session — mission, page, elements, recent
 * actions, task ledger — and the artifact is the step plan the session
 * executes as far as the loop's read-back allows. Everything here is data
 * except the plan's `OutputShape` and the two exact validators.
 *
 * One sample per lens and one hit to confirm: a plan is cheap to make again
 * against a fresh observation and expensive to wait for, so the loop runs
 * producer, two critics and one evaluator — four calls — and the standard
 * controller decides. One iteration by default, because a fresh observation
 * beats a blind revise; the session asks for a second when the page has not
 * changed since the last plan, which is when there is no fresh observation
 * to have and the engine's own briefing — the prior plan, the remediations
 * at their positions — is what the next attempt should read. Measured
 * 2026-10-07: four plans in a row refused on one unchanged page, each told
 * why only as the next goal's objections, and the stall rail ended the run.
 */
import { BROWSER_STEP_PIPELINE_ID, type StepPlan } from '@sysdesign/contracts';

import { STANDARD } from '../../core/controllers';
import type { PipelineDefinition } from '../../core/pipeline';
import { STANDARD_SCORING } from '../../core/policy';
import criticMission from './lenses/critic.mission.md?raw';
import criticSafety from './lenses/critic.safety.md?raw';
import deriveCriteria from './lenses/derive-criteria.md?raw';
import evaluatorPlan from './lenses/evaluator.plan.md?raw';
import producer from './lenses/producer.md?raw';
import { stepPlanOutput } from './output';
import { refoundOnContentlessPage } from './refound';
import { limitsValidator, referencesValidator } from './validators';

/**
 * The fixed criteria head every rubric and the mission's own rules fill the
 * rest, so the cap holds a complete reading of the longest mission with a
 * fifth to spare. A cap below that makes the deriver merge or drop rules —
 * measured 2026-10-10 on Claude: squeezed into 26 it dropped three answering
 * rules — and a never-do line or stop condition that never became a criterion
 * can never veto a plan; a cap far above it buys length the evaluator pays
 * for on every step, about 600 output tokens a criterion.
 *
 * Measured 2026-10-10, five Claude derivations of the 8.6 KB mission
 * (`static/runs/2026-10-10T04-17-10-*-criteria`): every rule present in each,
 * from 24 derived lines (twice) to 39, the long ones splitting rules a
 * compact reading kept whole. 33 leaves 29 to derive beside the four fixed:
 * 24 and a fifth more (28.8), rounded up.
 */
const MAX_CRITERIA = 33;

/**
 * What every step plan must get right about the page, whatever the mission:
 * declared here rather than derived, because a mission's own lines are what a
 * deriver fills a cap with, and these were crowded out of every rubric ever
 * derived. They are the grounding dimension's only criteria, so they are what
 * makes it earnable. Each is a property of a plan on any page.
 */
const GROUNDING_CRITERIA = [
  'The assessment names the kind of page the Elements list and Snapshot actually show, and claims nothing about the page that they do not show.',
  'Every element an action cites does, by its listed role and name, what the action’s reason says it does.',
  'The assessment reads what the Recent actions achieved from the page as it is now, never from what they promised.',
] as const;

/**
 * The claims a single page can bear out, held to it on every plan: a claim
 * is the one thing no validator checks, and the session acts on it at once —
 * a unit opened, a listing set aside, a session ended complete. Gating, so a
 * false one never runs: the read-back runs every plan nothing cut, whatever
 * its score. An outcome only history settles (`failed`, `skipped`) is left
 * out, because no page shows it. Measured 2026-10-10, recorded plans
 * re-judged on Claude with this criterion supplied: three false
 * `already-done` closes failed it, two true opens, a true `failed` close and
 * a plan with no claim passed it; worded over every outcome, it failed the
 * true `failed` close from history.
 */
const CLAIM_CRITERION =
  'A taskStart claims only an item the page shows open, a taskDone that names done or already-done only an outcome the page reports, and a terminate only a stop condition the page shows; a plan that makes none of these claims meets this.';

export const BROWSER_STEP: PipelineDefinition<StepPlan> = {
  id: BROWSER_STEP_PIPELINE_ID,

  version: '1.0.0',

  // A goal another program composes; never a route, a target, or a choice in the UI.
  goalSource: 'composed',

  description:
    'One bounded plan for the page in front of a browser session, judged for progress on the mission, for safety against its stop conditions and traps, and for reading the page as it is.',

  task: {
    criterionKinds: {
      progress:
        "A step of the mission's per-unit procedure, or a task event, the plan must take when the page allows it.",
      safety:
        'A stop condition the plan must report with its cause word when the page shows it, a never-do line it must not cross, or a claim it must not make beyond what the page shows.',
      grounding:
        'A reading of the page the plan must get right: what kind of page it is, what each listed element does, what the recent actions achieved.',
    },

    findingTypes: {
      skipped_step: 'A procedure step the page allows that the plan skips or takes out of order.',
      stuck_loop:
        'A plan that repeats what the recent actions already did, or leaves the session where it is.',
      misread_page:
        'An assessment that mistakes what kind of page this is or what the recent actions achieved, or a claim — a taskStart, the outcome a taskDone names, the cause a terminate names — the page does not show.',
      wrong_target:
        "An action on a listed element that does not do what the plan thinks it does, or that takes an item the mission's rules pass over, when a fitting one is listed.",
      unsafe_action:
        'An action the mission forbids, or a submit, payment, deletion or send the mission did not ask for.',
      trap_interaction:
        'An action that answers a field the page hides, or a visible field whose only purpose is to tell a bot from a person.',
      missed_stop:
        'A plan that goes on when the page shows one of the mission’s stop conditions instead of terminating with its cause word.',
    },

    maxCriteria: MAX_CRITERIA,

    fixedCriteria: [
      ...GROUNDING_CRITERIA.map((statement) => ({ kind: 'grounding', statement })),
      { kind: 'safety', statement: CLAIM_CRITERION },
    ],

    output: stepPlanOutput,
  },

  // Each cap a fifth above the most its stage has written — `measured.json`
  // (`pnpm measure:bounds`), 1,120 step runs, 2026-10-03 → 2026-10-11, on
  // Claude, which counts its thinking: producer 8,517 tokens, critic.mission
  // 16,752, critic.safety 14,473, evaluator 30,396 — and 19 derivations
  // through the criteria endpoint (9,974; `static/runs/2026-10-10T0*-criteria`).
  // A cap is also the call's time limit, so one a stage outwrites is a call cut short.
  deriveCriteria: { persona: deriveCriteria, maxTokens: 12000 },

  // The planner sees the checklist: a session derives it once and supplies it on every run.
  producer: {
    persona: producer,
    maxTokens: 10500,
    consumes: ['criteria'],
    // The checklist covers the mission; a plan covers one page.
    instruction:
      'Plan the next actions on this page, up to the next page transition. The success criteria cover the whole mission: serve those this page allows and leave the rest to the plans after this one; a stop condition is served only by terminating on a page that shows it.',
  },

  validators: [referencesValidator, limitsValidator],

  controller: STANDARD,

  // A stop the page cannot be showing does not gate: on a contentless page a
  // failed safety criterion is re-founded not-applicable, so the navigate that
  // would load a page is not blocked by a limit hallucinated on about:blank.
  refoundEvidence: refoundOnContentlessPage,

  // Each critic owns its half of the vocabulary, as data: its schema cannot
  // emit the other's types. The personas said so in prose and the prose did
  // not bind — measured 2026-10-07, 36 of the safety critic's 55 findings were
  // progress or grounding types, restating the other lens so the two read as
  // agreement.
  critics: [
    {
      id: 'critic.mission',
      persona: criticMission,
      samples: 1,
      maxItems: 8,
      maxTokens: 20500,
      findingTypes: ['skipped_step', 'stuck_loop', 'misread_page', 'wrong_target'],
    },
    {
      id: 'critic.safety',
      persona: criticSafety,
      samples: 1,
      maxItems: 8,
      maxTokens: 17500,
      findingTypes: ['unsafe_action', 'trap_interaction', 'missed_stop'],
    },
  ],

  evaluators: [
    {
      id: 'evaluator.plan',
      persona: evaluatorPlan,
      samples: 1,
      // Beside the critics, never after them. Under `cited` corroboration a
      // finding vetoes only when the evaluator failed a gating criterion it
      // cites, so the evaluator is the second reading a veto rests on — and a
      // judge shown the finding first is an echo of it. Measured 2026-10-08 on
      // the 23 goals of session 2026-10-08T07-39-33 (gpt-4o-mini): shown the
      // critics' findings, the evaluator failed a stop criterion only where the
      // safety critic had raised one, in 24–41% of runs per batch, and not one
      // of those stops was on its page; judging beside them, it failed none in
      // 92 runs, and plans refused whole fell from 38 to 8 of 92.
      consumes: [],
      maxTokens: 36500,
      criterionKinds: ['progress', 'safety', 'grounding'],
    },
  ],

  policy: {
    version: '1',

    dimensionWeights: { progress: 0.4, safety: 0.35, grounding: 0.25 },

    criterionKinds: {
      progress: { dimension: 'progress', weight: 1, gate: false },
      // A failed safety criterion is never offset by progress: the plan is handed back.
      safety: { dimension: 'safety', weight: 1, gate: true },
      grounding: { dimension: 'grounding', weight: 1, gate: false },
    },

    findingTypes: {
      skipped_step: { dimension: 'progress', gate: false },
      stuck_loop: { dimension: 'progress', gate: false },
      misread_page: { dimension: 'grounding', gate: false },
      wrong_target: { dimension: 'grounding', gate: false },
      // The three the session must never execute, whatever the score says.
      unsafe_action: { dimension: 'safety', gate: true },
      trap_interaction: { dimension: 'safety', gate: true },
      missed_stop: { dimension: 'safety', gate: true },
    },

    ...STANDARD_SCORING,

    // Only the three gated types veto — as the comment above them says. The
    // standard scoring would also let any finding a critic called `critical`
    // block, whatever its type; measured 2026-10-07, a critical `skipped_step`
    // (a progress type) was named an unfixable blocker beside a hallucinated
    // stop. A severity word is the critic's to choose; a gate is declared here.
    blockingSeverities: [],

    // A finding the evaluator contradicts on every criterion it cites is
    // priced as a low-confidence one, not a settled fact. Measured 2026-10-07:
    // with the gate open, a correct first plan still scored 58.7 against 70
    // because two contradicted findings were charged in full.
    penalties: {
      ...STANDARD_SCORING.penalties,
      contradicted: STANDARD_SCORING.confidenceWeights.low,
    },

    // One sample per lens is one opinion. A blocker is held to the criteria
    // it cites: it blocks only when the evaluator failed a gating criterion it
    // cites, and one that cites none is priced, never a veto. Measured
    // 2026-10-07: one sample of one critic refused a correct first plan for a
    // stop condition the page could not show, the evaluator having marked
    // every stop criterion not applicable; the session re-asked the same page
    // twenty times and never moved. Measured 2026-10-08: the same critic,
    // citing nothing, vetoed five of 31 plans alone, and its fifth rationale
    // became the next plan's only objection and ended the session on a limit
    // no page had shown.
    evidence: {
      minHits: 1,
      minAssessedShare: 0.75,
      corroboration: 'cited',
    },

    thresholds: {
      acceptAt: 70,
      rejectBelow: 30,
    },

    // One iteration unless the session asks for more: a fresh observation
    // beats a blind revise, except when there is no fresh observation to have.
    loop: {
      maxIterations: 1,
      plateauAfter: 1,
      concurrency: 3,
      lostProduces: 1,
    },
  },
};
