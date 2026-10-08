import { fieldSpecOf, formObservation, type FieldAnswers, finding } from '@sysdesign/contracts';

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
    // The operator answered "Work authorisation" earlier this session: filled, not asked, and said so.
    const cached = routeFieldsInSession(
      decided,
      null,
      fields,
      new Map([
        ['Work authorisation', 'No'],
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
