/**
 * The browser session's planner: one bounded plan for the page in front of
 * it, judged once. The goal is composed by the session — mission, page,
 * elements, recent actions, task ledger — and the artifact is the step plan
 * the session executes once the loop accepts it. Everything here is data
 * except the plan's `OutputShape`, the two exact validators and the
 * hand-back controller beside it.
 *
 * One sample per lens and one hit to confirm, one iteration: a plan is
 * cheap to make again against a fresh observation and expensive to wait
 * for, so the loop runs producer, two critics and one evaluator — four
 * calls — and hands anything but an accept back to the session.
 */
import { BROWSER_STEP_PIPELINE_ID, type StepPlan } from '@sysdesign/contracts';

import type { PipelineDefinition } from '../../core/pipeline';
import { STANDARD_SCORING } from '../../core/policy';
import { HAND_BACK } from './controller';
import criticMission from './lenses/critic.mission.md?raw';
import criticSafety from './lenses/critic.safety.md?raw';
import deriveCriteria from './lenses/derive-criteria.md?raw';
import evaluatorPlan from './lenses/evaluator.plan.md?raw';
import producer from './lenses/producer.md?raw';
import { stepPlanOutput } from './output';
import { limitsValidator, referencesValidator } from './validators';

/**
 * The three grounding criteria head every rubric and the goal's own lines
 * fill the rest. Sized from the longest mission run so far — eight procedure
 * steps, four stop conditions, five never-do lines and two task events, 19
 * lines, of which a cap of 16 silently dropped three and left grounding no
 * room at all (measured 2026-10-07: zero grounding criteria in 165 runs).
 */
const MAX_CRITERIA = 24;

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
        'A stop condition the plan must report with its cause word when the page shows it, or a never-do line it must not cross.',
      grounding:
        'A reading of the page the plan must get right: what kind of page it is, what each listed element does, what the recent actions achieved.',
    },
    findingTypes: {
      skipped_step: 'A procedure step the page allows that the plan skips or takes out of order.',
      stuck_loop:
        'A plan that repeats what the recent actions already did, or leaves the session where it is.',
      misread_page:
        'An assessment that mistakes what kind of page this is or what the recent actions achieved.',
      wrong_target:
        'An action on a listed element that does not do what the plan thinks it does, when a fitting one is listed.',
      unsafe_action:
        'An action the mission forbids, or a submit, payment, deletion or send the mission did not ask for.',
      trap_interaction:
        'An action that answers a field the page hides, or a visible field whose only purpose is to tell a bot from a person.',
      missed_stop:
        'A plan that goes on when the page shows one of the mission’s stop conditions instead of terminating with its cause word.',
    },
    maxCriteria: MAX_CRITERIA,
    fixedCriteria: GROUNDING_CRITERIA.map((statement) => ({ kind: 'grounding', statement })),
    output: stepPlanOutput,
  },

  // Caps are seeded, not measured: no live step run has been recorded yet.
  // The spec holds the seed table; the first live runs replace it, and a cap
  // is also the call's time limit, so one a stage outwrites is a call cut short.
  deriveCriteria: { persona: deriveCriteria, maxTokens: 6000 },
  // The planner sees the checklist: a session derives it once and supplies it on every run.
  producer: { persona: producer, maxTokens: 8000, consumes: ['criteria'] },
  validators: [referencesValidator, limitsValidator],
  controller: HAND_BACK,

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
      consumes: [],
      maxItems: 8,
      maxTokens: 8000,
      findingTypes: ['skipped_step', 'stuck_loop', 'misread_page', 'wrong_target'],
    },
    {
      id: 'critic.safety',
      persona: criticSafety,
      samples: 1,
      consumes: [],
      maxItems: 8,
      maxTokens: 8000,
      findingTypes: ['unsafe_action', 'trap_interaction', 'missed_stop'],
    },
  ],

  evaluators: [
    {
      id: 'evaluator.plan',
      persona: evaluatorPlan,
      samples: 1,
      consumes: [],
      maxItems: MAX_CRITERIA,
      maxTokens: 8000,
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
    // One sample per lens is one opinion. A blocker that cites criteria is
    // held to them: it blocks only when the evaluator failed a gating
    // criterion it cites. Measured 2026-10-07: one sample of one critic
    // refused a correct first plan for a stop condition the page could not
    // show, the evaluator having marked every stop criterion not applicable;
    // the session re-asked the same page twenty times and never moved.
    evidence: {
      minHits: 1,
      minAssessedShare: 0.75,
      lostSample: 'score-only',
      corroboration: 'cited',
    },
    thresholds: { acceptAt: 70, rejectBelow: 30 },
    // One iteration: the controller hands every non-accept back to the session.
    loop: { maxIterations: 1, plateauAfter: 1, concurrency: 3, lostProduces: 1 },
  },
};
