import {
  ANSWER_SUGGESTIONS_PIPELINE_ID,
  FAKE_RUBRIC,
  observedElement,
  suggestionLocation,
  type AnswerSuggestions,
  type FieldAnswers,
  type StepPlan,
} from '@sysdesign/contracts';

import { BrainFaulted, type OperatorQuestion } from './ports';
import {
  decidedAnswers,
  decidedPlan,
  decidedSuggestions,
  withheldBy,
  FakeBrowser,
  ScriptedOperator,
  type BrainScript,
  type ScriptedPage,
} from './testing';
import { JOURNEY_ANSWERS, JOURNEY_PLANS as PLANS, journeyPages } from './testing-journey';
import { runScripted as run } from './testing-session';

/**
 * Suggested answers in the session: the journey's form with one required open
 * question added, which no evidence answers, so it goes to the operator with
 * the suggestions readied for it — beside the closed list the operator is
 * asked first, which never asks for any.
 */

const QUESTION = 'What experience do you have building distributed systems?';
const RECORD =
  'Six years building event-driven services at Acme, from the order API to its consumers.';
const TRANSFER = 'The partitioned workers at Acme: the same queue and retry patterns carry over.';
const INVENTED = 'Led a migration of twelve services onto a shared event bus.';

const pages = (): ScriptedPage[] =>
  journeyPages().map((page) =>
    page.id === 'form'
      ? {
          ...page,
          observation: {
            ...page.observation,
            elements: [
              ...page.observation.elements,
              observedElement('e7', 'textbox', QUESTION, {
                kind: 'fillable',
                inputType: 'text',
                required: true,
              }),
            ],
          },
        }
      : page,
  );

const FORM: StepPlan = {
  ...PLANS.form,
  actions: PLANS.form.actions.map((action) =>
    action.kind === 'askFields' ? { ...action, refs: [...action.refs, 'e7'] } : action,
  ),
};

const ANSWERS: FieldAnswers = {
  ...JOURNEY_ANSWERS,
  fields: [
    ...JOURNEY_ANSWERS.fields,
    {
      ref: 'e7',
      decision: 'ask-operator',
      value: null,
      rests: 'none',
      basis: [],
      reason: 'nothing recalled on the question',
    },
  ],
};

/** Drafted in no particular order, the last one faulted by a judge and withheld by the run's report. */
const SUGGESTIONS: AnswerSuggestions = {
  summary: 'One answer from the record, two drafts.',
  fields: [
    {
      ref: 'e7',
      suggestions: [
        { text: INVENTED, basis: 'invented', cites: [], why: 'modelled on the order API' },
        { text: RECORD, basis: 'record', cites: ['m1'], why: 'm1 states the work' },
        { text: TRANSFER, basis: 'transfer', cites: ['m2'], why: 'm2: the same patterns' },
        { text: 'A draft a judge faulted.', basis: 'invented', cites: [], why: 'overreaches' },
      ],
    },
  ],
};

const suggested = (options: Parameters<typeof decidedSuggestions>[1] = {}) =>
  decidedSuggestions(SUGGESTIONS, {
    withheld: [withheldBy(suggestionLocation(0, 3), 'ungrounded', 'faulted by a judge')],
    ...options,
  });

const script = (extra: Partial<BrainScript>): BrainScript => ({
  plans: [PLANS.search, PLANS.results, FORM, PLANS.done, PLANS.end].map((p) => decidedPlan(p)),
  answers: [decidedAnswers(ANSWERS)],
  ...extra,
});

const asked = (questions: readonly OperatorQuestion[]) =>
  questions.filter((question) => question.prompt.title === QUESTION);

const rowOf = <D extends { kind: string; ref: string | null }>(decisions: readonly D[]) =>
  decisions.find((decision) => decision.kind === 'field-answer' && decision.ref === 'e7');

const suggestionsFile = (dumps: { text(path: string): string }) =>
  (JSON.parse(dumps.text('01-steps/03/fields.json')) as { suggestions: Record<string, unknown> })
    .suggestions;

describe('suggested answers in the session', () => {
  it('[BRW-12] asks for them once per form, for the open fields going to the operator, under the session’s rubric, and letters them record first, drafts labelled apart, withheld ones left out', async () => {
    const { brain, operator, detail, dumps, warnings } = await run({
      script: script({ suggestions: [suggested()] }),
      lines: ['Yes', 'b'],
      browser: new FakeBrowser(pages()),
    });
    expect(brain.derived.map((derived) => derived.pipeline)).toContain(
      ANSWER_SUGGESTIONS_PIPELINE_ID,
    );
    // The closed list is answered by its options: only the open question went for suggestions.
    expect(brain.suggestionInputs.map((input) => input.fields.map((field) => field.ref))).toEqual([
      ['e7'],
    ]);
    expect(brain.suggestionInputs[0]?.criteria).toEqual(FAKE_RUBRIC);
    const questions = asked(operator.questions);
    expect(questions).toHaveLength(1);
    expect(questions[0]?.prompt.choices).toEqual([
      { id: 'c1', label: RECORD, note: 'from your record — m1 states the work' },
      { id: 'c2', label: TRANSFER, note: 'draft: transferable — m2: the same patterns' },
      {
        id: 'c3',
        label: INVENTED,
        note: 'draft: invented — not in your record — modelled on the order API',
      },
    ]);
    // The letter fills the whole text, and the answer is taught like any other.
    const row = rowOf(detail.decisions);
    expect(row).toMatchObject({ source: 'operator', answer: TRANSFER });
    expect(row?.payload).toMatchObject({ via: 'scripted', chosen: 'transfer' });
    expect(brain.taught.some((taught) => taught.parts[0]?.includes(`"${TRANSFER}"`))).toBe(true);
    expect(suggestionsFile(dumps)).toMatchObject({
      requested: ['e7'],
      state: 'settled',
      admission: 'admitted',
      withheld: [withheldBy(suggestionLocation(0, 3), 'ungrounded', 'faulted by a judge')],
      fault: null,
    });
    expect(warnings).toEqual([]);
  });

  it('[BRW-12] asks at once, and when the suggestions arrive before an answer withdraws the question as superseded and asks again with them', async () => {
    let arrive = (): void => undefined;
    const suggestionsGate = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    const withdrawals: unknown[] = [];
    const operator = new ScriptedOperator(['Yes', 'a']);
    const ask = operator.ask.bind(operator);
    // The suggestions arrive while the open question waits for its answer.
    operator.ask = (question, signal) => {
      if (question.prompt.title === QUESTION) {
        signal?.addEventListener('abort', () => withdrawals.push(signal.reason), { once: true });
        arrive();
      }
      return ask(question, signal);
    };
    const { detail } = await run({
      script: script({ suggestions: [suggested()], suggestionsGate }),
      operator,
      browser: new FakeBrowser(pages()),
    });
    expect(asked(operator.questions).map((question) => question.prompt.choices.length)).toEqual([
      0, 3,
    ]);
    expect(withdrawals).toEqual([{ reason: 'superseded', note: 'suggested answers arrived' }]);
    expect(rowOf(detail.decisions)).toMatchObject({ source: 'operator', answer: RECORD });
    expect(rowOf(detail.decisions)?.payload).toMatchObject({ chosen: 'record' });
  });

  it('[BRW-12] takes an answer given before the suggestions, asks nothing again, and records them as still coming', async () => {
    const { operator, detail, dumps } = await run({
      script: script({ suggestions: [suggested()], suggestionsGate: new Promise(() => undefined) }),
      lines: ['Yes', 'Five years of event-driven services.'],
      browser: new FakeBrowser(pages()),
    });
    expect(asked(operator.questions)).toHaveLength(1);
    expect(rowOf(detail.decisions)).toMatchObject({
      answer: 'Five years of event-driven services.',
    });
    expect(rowOf(detail.decisions)?.payload).toMatchObject({ chosen: 'typed' });
    expect(suggestionsFile(dumps)).toMatchObject({ state: 'pending', runId: null });
  });

  it('[BRW-12] asks without suggestions when their run faults, warned once, or when no judge saw them', async () => {
    const faulted = await run({
      script: script({ suggestions: [new BrainFaulted('unreachable', 'the loop is down')] }),
      lines: ['Yes', 'Five years.'],
      browser: new FakeBrowser(pages()),
    });
    expect(asked(faulted.operator.questions).map((q) => q.prompt.choices)).toEqual([[]]);
    expect(suggestionsFile(faulted.dumps)).toMatchObject({
      state: 'faulted',
      fault: 'brain unreachable: the loop is down',
    });
    expect(faulted.warnings).toEqual([
      'step 3: no suggested answers — brain unreachable: the loop is down',
    ]);

    const unjudged = await run({
      script: script({ suggestions: [suggested({ admission: 'no-rubric' })] }),
      lines: ['Yes', 'Five years.'],
      browser: new FakeBrowser(pages()),
    });
    expect(asked(unjudged.operator.questions).map((q) => q.prompt.choices)).toEqual([[]]);
    expect(suggestionsFile(unjudged.dumps)).toMatchObject({
      state: 'settled',
      admission: 'no-rubric',
      offered: {},
    });
  });
});
