import {
  formObservation,
  type FieldAnswers,
  type ObservedElement,
  type PageObservation,
  type StepAction,
  type StepPlan,
} from '@sysdesign/contracts';

import type { ScriptedPage } from './testing';

/**
 * One scripted journey the engine's dry runs share: a search page, a results
 * page, the contracts' form (a field the evidence settles, one it does not,
 * and a hidden trap) and a done page — with the plans a brain would decide
 * for each and the answers the form draws. Fixtures, not behaviour: the
 * engine spec and the Nest end-to-end run read the same story.
 */
export const JOURNEY_URLS = {
  search: 'https://search.example.test/',
  results: 'https://search.example.test/results?q=engineer',
  listing: 'https://jobs.example.test/apply/42',
  done: 'https://jobs.example.test/apply/42/done',
} as const;

export const element = (
  ref: string,
  role: string,
  name: string,
  overrides: Partial<ObservedElement> = {},
): ObservedElement => ({
  ref,
  role,
  name,
  text: null,
  kind: 'clickable',
  inputType: null,
  value: null,
  options: null,
  required: false,
  disabled: false,
  visible: true,
  maxLength: null,
  hiddenTraits: [],
  context: null,
  scope: null,
  ...overrides,
});

export const observation = (
  url: string,
  title: string,
  elements: ObservedElement[],
): PageObservation => ({
  url,
  title,
  elements,
  omittedElements: 0,
  unread: null,
  activeScope: null,
  snapshotRung: 'full',
  reading: { reads: 1, settled: true, durationMs: 0 },
  ariaSnapshot: elements.map((e) => `- ${e.role} "${e.name}" [ref=${e.ref}]`).join('\n'),
});

export const journeyPages = (): ScriptedPage[] => [
  {
    id: 'search',
    observation: observation(JOURNEY_URLS.search, 'Search', [
      element('e1', 'searchbox', 'Search', { kind: 'fillable' }),
      element('e2', 'button', 'Search'),
    ]),
    transitions: { 'click e2': 'results' },
  },
  {
    id: 'results',
    observation: observation(JOURNEY_URLS.results, 'Results', [
      element('e1', 'link', 'Senior Engineer — Acme'),
      element('e2', 'link', 'Staff Engineer — Globex'),
      element('e3', 'button', 'Next page'),
    ]),
    transitions: { 'click e1': 'form' },
  },
  { id: 'form', observation: formObservation(), transitions: { 'click e6': 'done' } },
  {
    id: 'done',
    observation: observation(JOURNEY_URLS.done, 'Application sent', [
      element('e1', 'button', 'Dismiss'),
    ]),
  },
];

const act = <A extends StepAction>(action: A): A => action;
const common = { reason: 'the procedure says so', expect: null };
const plan = (pageKind: StepPlan['pageKind'], actions: StepAction[]): StepPlan => ({
  pageKind,
  assessment: `a ${pageKind} page; carrying the mission forward`,
  actions,
});

/** The plans, page by page; `formAgain` asks one field a second time on the same form. */
export const JOURNEY_PLANS = {
  search: plan('listing', [
    act({ kind: 'fill', ref: 'e1', value: 'software engineer', ...common }),
    act({ kind: 'click', ref: 'e2', reason: 'submit the search', expect: 'a list of results' }),
  ]),
  results: plan('listing', [
    act({
      kind: 'taskStart',
      label: 'Senior Engineer at Acme',
      url: JOURNEY_URLS.listing,
      ...common,
    }),
    act({ kind: 'click', ref: 'e1', ...common }),
  ]),
  form: plan('form', [
    act({ kind: 'askFields', refs: ['e1', 'e2', 'e3'], ...common }),
    act({ kind: 'click', ref: 'e6', ...common }),
  ]),
  /** Asks and stays on the page, so a later plan can ask the same form again. */
  formOnly: plan('form', [
    act({ kind: 'askFields', refs: ['e1', 'e2', 'e3'], ...common }),
    act({ kind: 'done', ...common }),
  ]),
  formAgain: plan('form', [
    act({ kind: 'askFields', refs: ['e2'], ...common }),
    act({ kind: 'click', ref: 'e6', ...common }),
  ]),
  done: plan('confirmation', [
    act({ kind: 'taskDone', outcome: 'done', detail: 'sent', ...common }),
  ]),
  end: plan('confirmation', [
    act({ kind: 'terminate', cause: 'mission-complete', detail: 'nothing left', ...common }),
  ]),
};

/** The whole journey, in order, ending by the mission's own stop condition. */
export const JOURNEY_SEQUENCE: StepPlan[] = [
  JOURNEY_PLANS.search,
  JOURNEY_PLANS.results,
  JOURNEY_PLANS.form,
  JOURNEY_PLANS.done,
  JOURNEY_PLANS.end,
];

/** e1 rests on evidence (filled), e2 is a low-confidence guess (asked), e3 is the hidden trap (blank whatever it says). */
export const JOURNEY_ANSWERS: FieldAnswers = {
  summary: 'Two fields from evidence, one hidden.',
  fields: [
    {
      ref: 'e1',
      decision: 'answer',
      value: '6',
      confidence: 'high',
      basis: ['m1'],
      reason: 'résumé',
    },
    {
      ref: 'e2',
      decision: 'answer',
      value: 'Yes',
      confidence: 'low',
      basis: [],
      reason: 'a guess',
    },
    { ref: 'e3', decision: 'answer', value: 'x', confidence: 'high', basis: [], reason: 'oops' },
  ],
};
