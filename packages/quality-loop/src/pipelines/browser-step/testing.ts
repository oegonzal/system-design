/**
 * Builders the browser-step specs share. Pure helpers only — no vitest
 * imports — so the file compiles under the app tsconfig. The goals are
 * composed with the contracts codec over the contracts fixtures, exactly as
 * the session composes them; the plans are the smallest that exercise a rule.
 */
import {
  composeStepGoal,
  emptyLedger,
  listingObservation,
  MISSION_FIXTURE,
  NO_UNITS_ON_RECORD,
  ON_RECORD_TAKEN,
  type PageObservation,
  type StepAction,
  type StepPlan,
  type SuccessCriterion,
  type TaskLedgerSummary,
  type UnitFacet,
  type UnitsOnRecord,
  stepGoalInput,
} from '@sysdesign/contracts';

/** The mission over a page, with no recent actions, and the record an advisor answered — none, unless a spec says. */
export const stepGoal = (
  observation: PageObservation = listingObservation(),
  ledger: TaskLedgerSummary = emptyLedger(),
  mission: string = MISSION_FIXTURE,
  onRecord: UnitsOnRecord = NO_UNITS_ON_RECORD,
): string => composeStepGoal(stepGoalInput({ mission, observation, ledger, onRecord }));

export const click = (
  ref: string,
  reason = `open ${ref}`,
  expect: string | null = null,
): StepAction => ({ kind: 'click', ref, reason, expect, serves: [] });

export const fill = (ref: string, value: string, reason = `type into ${ref}`): StepAction => ({
  kind: 'fill',
  ref,
  value,
  reason,
  expect: null,
  serves: [],
});

export const select = (ref: string, option: string, reason = `choose on ${ref}`): StepAction => ({
  kind: 'select',
  ref,
  option,
  reason,
  expect: null,
  serves: [],
});

export const askFields = (refs: string[], reason = 'questions about the subject'): StepAction => ({
  kind: 'askFields',
  refs,
  reason,
  expect: null,
  serves: [],
});

/** A taskStart with the unit's identity; `declared` when the plan says it takes a unit on record to avoid. */
export const taskStart = (
  label = 'Senior Engineer at Acme',
  facets: UnitFacet[] = [],
  declared = false,
): StepAction => ({
  kind: 'taskStart',
  label,
  url: 'https://jobs.example.test/apply/42',
  facets,
  ...(declared ? { [ON_RECORD_TAKEN]: true } : {}),
  reason: 'one application begins',
  expect: null,
  serves: [],
});

export const taskDone = (): StepAction => ({
  kind: 'taskDone',
  outcome: 'done',
  detail: 'submitted',
  reason: 'the confirmation page is shown',
  expect: null,
  serves: [],
});

export const done = (): StepAction => ({
  kind: 'done',
  reason: 'nothing is due on this page',
  expect: null,
  serves: [],
});

export const terminate = (): StepAction => ({
  kind: 'terminate',
  cause: 'mission-complete',
  detail: 'every listing in view has been applied to',
  reason: "the mission's stop condition is on the page",
  expect: null,
  serves: [],
});

/** The plan a listing page calls for: open the first listing. */
export const samplePlan = (
  actions: StepAction[] = [
    click('e3', 'open the first listing', 'the listing detail with an apply button'),
  ],
  overrides: Partial<StepPlan> = {},
): StepPlan => ({
  assessment:
    'A results page with two listings; no unit of work is open, so the first listing is next.',
  actions,
  ...overrides,
});

/** The rubric a session derives once from the mission and supplies on every run. */
export const sessionCriteria = (): SuccessCriterion[] => [
  { id: 'c1', kind: 'progress', statement: 'Open the next listing when no unit of work is open.' },
  {
    id: 'c2',
    kind: 'safety',
    statement:
      'Terminate with limit-reached when the site says no more applications are allowed today.',
  },
  {
    id: 'c3',
    kind: 'grounding',
    statement: 'The assessment names the kind of page the Elements list shows.',
  },
];
