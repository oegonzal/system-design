import {
  fieldQuestionOf,
  fieldSpecOf,
  formObservation,
  type FieldAnswers,
  type FieldSpec,
  finding,
} from '@sysdesign/contracts';

import {
  faultedReadouts,
  fieldTypeOf,
  routeFieldsInSession,
  withOperatorCache,
} from './field-routing';
import { BrainFaulted } from './ports';
import { decidedAnswers } from './testing';

const fields = formObservation()
  .elements.filter((e) => ['e1', 'e2', 'e3', 'e4'].includes(e.ref))
  .map(fieldSpecOf);

const answers: FieldAnswers = {
  summary: 'four fields',
  fields: [
    { ref: 'e1', decision: 'answer', value: '6', confidence: 'high', basis: ['m1'], reason: 'cv' },
    {
      ref: 'e2',
      decision: 'answer',
      value: 'Yes',
      confidence: 'medium',
      basis: [],
      reason: 'likely',
    },
    { ref: 'e3', decision: 'answer', value: 'x', confidence: 'high', basis: [], reason: 'oops' },
    {
      ref: 'e4',
      decision: 'leave-blank',
      value: null,
      confidence: 'high',
      basis: [],
      reason: 'bait',
    },
  ],
};

describe('field routing in a session', () => {
  it('[BRW-3] follows the declared precedence — hidden traits before the model, confidence and basis after — and the cache stands in for an ask alone', () => {
    const decided = decidedAnswers(answers);
    const routed = routeFieldsInSession(decided, null, fields, new Map());
    expect(routed.map((r) => [r.field.ref, r.route, r.source])).toEqual([
      ['e1', 'fill', 'memory'],
      ['e2', 'ask-operator', 'loop'],
      ['e3', 'leave-blank', 'blank'],
      ['e4', 'leave-blank', 'blank'],
    ]);
    // The operator answered the work-authorisation question earlier this session — cached under
    // what the field asks, label and help text as one — so it is filled, not asked, and said so.
    const cached = routeFieldsInSession(
      decided,
      null,
      fields,
      new Map([
        [fieldQuestionOf(fields[1]) ?? '', 'No'],
        ['Website', 'never used: the field is hidden first'],
      ]),
    );
    expect(cached[1]).toMatchObject({
      route: 'fill',
      source: 'operator',
      value: 'No',
      cached: true,
    });
    expect(cached[2]).toMatchObject({ route: 'leave-blank', source: 'blank', cached: false });
    // A judge pointing at a field, or a closed admission, goes to the operator before the cache is read.
    const judged = decidedAnswers(answers, { findings: [finding('ungrounded', ['field.1'])] });
    expect(routeFieldsInSession(judged, null, fields, new Map())[0]).toMatchObject({
      route: 'ask-operator',
      faults: ['ungrounded: ungrounded seen'],
    });
    // A run that fell short demotes nothing by itself: the judges' objections arrive as faults.
    const fellShort = decidedAnswers(answers, { admission: 'fell-short' });
    expect(routeFieldsInSession(fellShort, null, fields, new Map())[0]).toMatchObject({
      route: 'fill',
      source: 'memory',
    });
    // Nothing judged at all: a required field is the operator's, an optional one is left blank.
    const unjudged = decidedAnswers(answers, { admission: 'no-rubric' });
    expect(routeFieldsInSession(unjudged, null, fields, new Map()).map((r) => r.route)).toEqual([
      'ask-operator',
      'ask-operator',
      'leave-blank',
      'leave-blank',
    ]);
  });

  it('[BRW-3] with no run to read, a required field goes to the operator, an optional one is left blank, and a hidden one stays blank', () => {
    const fault = new BrainFaulted('unreachable', 'nobody home');
    const routed = faultedReadouts(fields, fault);
    expect(routed.map((r) => [r.route, r.source])).toEqual([
      ['ask-operator', 'engine'],
      ['ask-operator', 'engine'],
      ['leave-blank', 'blank'],
      ['leave-blank', 'engine'],
    ]);
    expect(routed[0]?.reason).toBe('brain unreachable: brain unreachable: nobody home');
    expect(routed[3]?.reason).toBe(
      'optional, left blank: brain unreachable: brain unreachable: nobody home',
    );
    expect(routeFieldsInSession(null, fault, fields, new Map([['Website', 'x']]))[2]?.route).toBe(
      'leave-blank',
    );
    expect(routeFieldsInSession(null, null, fields, new Map())).toEqual([]);
    expect(withOperatorCache([], new Map())).toEqual([]);
  });

  it('[BRW-3] reuses an operator answer only for the question it answered, and never for a field that asks nothing it can be told by', () => {
    // Measured 2026-10-10: every radio question of a form had an empty name,
    // so one answer stood in for three questions the operator never saw.
    const question = (ref: string, context: string | null): FieldSpec => ({
      ref,
      role: 'radiogroup',
      name: '',
      inputType: null,
      options: ['Yes', 'No'],
      optionsOmitted: 0,
      value: null,
      required: false,
      invalid: false,
      maxLength: null,
      hiddenTraits: [],
      context,
    });
    const questions = [
      question('e21', 'Will you now or in the future require sponsorship?'),
      question('e22', 'Are you legally authorized to work in the United States?'),
      question('e23', null),
    ];
    const asked = decidedAnswers({
      summary: 'three questions no evidence settles',
      fields: questions.map((field) => ({
        ref: field.ref,
        decision: 'ask-operator' as const,
        value: null,
        confidence: 'low' as const,
        basis: [],
        reason: 'no evidence',
      })),
    });
    const routed = routeFieldsInSession(
      asked,
      null,
      questions,
      new Map([
        ['Will you now or in the future require sponsorship?', 'No'],
        ['', 'Yes'],
      ]),
    );
    expect(routed.map((r) => [r.route, r.value, r.cached])).toEqual([
      ['fill', 'No', true],
      ['ask-operator', null, false],
      ['ask-operator', null, false],
    ]);
    expect(routed[0]?.reason).toBe(
      'the operator answered "Will you now or in the future require sponsorship?" earlier this session',
    );
    // With no run to read, an unanswered choice is still the operator's, as the route table has it.
    const faulted = faultedReadouts(questions, new BrainFaulted('unreachable', 'nobody home'));
    expect(faulted.map((r) => r.route)).toEqual(['ask-operator', 'ask-operator', 'ask-operator']);
  });

  it("names a field's control kind from its role and input type", () => {
    expect(fieldTypeOf({ role: 'textbox', inputType: 'number' })).toBe('number');
    expect(fieldTypeOf({ role: 'textbox', inputType: 'text' })).toBe('text');
    expect(fieldTypeOf({ role: 'textbox', inputType: 'textarea' })).toBe('textarea');
    expect(fieldTypeOf({ role: 'textbox', inputType: null })).toBe('text');
    expect(fieldTypeOf({ role: 'combobox', inputType: 'select' })).toBe('select');
    expect(fieldTypeOf({ role: 'radiogroup', inputType: null })).toBe('radio');
    expect(fieldTypeOf({ role: 'checkbox', inputType: 'checkbox' })).toBe('checkbox');
    expect(fieldTypeOf({ role: 'button', inputType: null })).toBe('unknown');
  });
});
