import { describe, expect, it } from 'vitest';

import { ANSWER_REASON_BOUND, type FieldAnswers } from './field-answers.schema';
import { fieldSpecOf } from './field-goal';
import { formObservation } from './fixtures';
import { routeFields } from './route-fields';
import { judgedRun } from './read-back.testing';

const fields = () =>
  formObservation()
    .elements.filter((e) => e.kind !== 'clickable')
    .map(fieldSpecOf);

const answers = (
  overrides: Partial<Record<string, Partial<FieldAnswers['fields'][number]>>> = {},
): FieldAnswers => ({
  summary: 'Four fields; evidence covers the first.',
  fields: [
    {
      ref: 'e1',
      decision: 'answer',
      value: '6',
      confidence: 'high',
      basis: ['m1'],
      reason: 'from m1',
    },
    {
      ref: 'e2',
      decision: 'answer',
      value: 'Yes',
      confidence: 'medium',
      basis: [],
      reason: 'likely',
    },
    {
      ref: 'e3',
      decision: 'answer',
      value: 'https://x',
      confidence: 'high',
      basis: [],
      reason: 'oops',
    },
    {
      ref: 'e4',
      decision: 'leave-blank',
      value: null,
      confidence: 'high',
      basis: [],
      reason: 'bait',
    },
  ].map((answer) => ({ ...answer, ...(overrides[answer.ref] ?? {}) })) as FieldAnswers['fields'],
});

describe('routeFields', () => {
  it('[QL-37] fills a grounded answer, asks for an ungrounded medium one, and blanks a hidden field whatever the model said', () => {
    const routes = routeFields(judgedRun({ artifact: answers() }), 'admitted', fields());
    expect(routes.map((r) => [r.field.ref, r.route, r.source])).toEqual([
      ['e1', 'fill', 'memory'],
      ['e2', 'ask-operator', 'loop'],
      ['e3', 'leave-blank', 'blank'],
      ['e4', 'leave-blank', 'blank'],
    ]);
    expect(routes[0].value).toBe('6');
    expect(routes[2].reason).toContain('trap-skipped');
  });

  it('[QL-37] never fills a field a confirmed finding or a validation warning points at', () => {
    const routes = routeFields(
      judgedRun({
        artifact: answers(),
        findings: [
          { type: 'ungrounded', locationRefs: ['field.1'], rationale: 'no evidence says 6' },
        ],
        validation: [
          {
            validatorId: 'limits',
            gate: 'warn',
            problems: [{ severity: 'medium', locationRefs: ['field.2'], message: 'not an option' }],
          },
        ],
      }),
      'admitted',
      fields(),
    );
    expect(routes[0].route).toBe('ask-operator');
    expect(routes[0].faults).toEqual(['ungrounded: no evidence says 6']);
    expect(routes[0].value).toBe('6');
    expect(routes[1].faults).toEqual(['limits: not an option']);
  });

  it('[QL-37] a run that fell short demotes nothing by itself; a page nothing judged asks for its required fields and blanks the optional ones; a required field left blank is asked', () => {
    const fellShort = routeFields(judgedRun({ artifact: answers() }), 'fell-short', fields());
    expect(fellShort.map((r) => r.route)).toEqual([
      'fill',
      'ask-operator',
      'leave-blank',
      'leave-blank',
    ]);
    const unjudged = routeFields(judgedRun({ artifact: answers() }), 'no-rubric', fields());
    expect(unjudged.map((r) => [r.route, r.source])).toEqual([
      ['ask-operator', 'engine'],
      ['ask-operator', 'engine'],
      ['leave-blank', 'blank'],
      ['leave-blank', 'engine'],
    ]);
    expect(unjudged[0].reason).toBe('page-escalated: no-rubric');
    expect(unjudged[3].reason).toBe('optional, left blank: page-escalated: no-rubric');

    const blankRequired = routeFields(
      judgedRun({ artifact: answers({ e1: { decision: 'leave-blank', value: null } }) }),
      'admitted',
      fields(),
    );
    expect(blankRequired[0].route).toBe('ask-operator');
    expect(blankRequired[0].reason).toContain('required field left blank');
  });

  it('[QL-37] keeps what a field holds when the model says so or answers with the same value, asks when a keep has nothing to keep, and blanks an optional field a judge faulted', () => {
    const holding = fields().map((field) =>
      field.ref === 'e1' ? { ...field, value: '6' } : field,
    );
    const kept = routeFields(
      judgedRun({ artifact: answers({ e1: { decision: 'keep', value: null } }) }),
      'admitted',
      holding,
    );
    expect(kept[0]).toMatchObject({ route: 'keep', value: '6', source: 'memory' });
    const same = routeFields(judgedRun({ artifact: answers() }), 'admitted', holding);
    expect(same[0]).toMatchObject({
      route: 'keep',
      value: '6',
      reason: 'holds it already: from m1',
    });
    const empty = routeFields(
      judgedRun({ artifact: answers({ e1: { decision: 'keep', value: null } }) }),
      'admitted',
      fields(),
    );
    expect(empty[0]).toMatchObject({ route: 'ask-operator', reason: 'nothing to keep: from m1' });
    // A judge pointed at an optional field: left blank with the fault on the row, never the operator's.
    const faulted = routeFields(
      judgedRun({
        artifact: answers({ e4: { decision: 'answer', value: 'none' } }),
        findings: [{ type: 'ungrounded', locationRefs: ['field.4'], rationale: 'invented' }],
      }),
      'admitted',
      fields(),
    );
    expect(faulted[3]).toMatchObject({
      route: 'leave-blank',
      source: 'loop',
      reason: 'optional, left blank: faulted',
      faults: ['ungrounded: invented'],
    });
  });

  it('[QL-37] asks for a choice the page asks with nothing chosen, marked required or not, and leaves one that holds an answer to the model', () => {
    // Measured 2026-10-09: the form marked every select and text field
    // required and none of its radio questions; each was left blank as
    // optional, and the page refused to advance past it.
    const question = (value: string | null) =>
      fields().map((field) =>
        field.ref === 'e4'
          ? {
              ...field,
              role: 'radiogroup',
              inputType: null,
              options: ['Yes', 'No'],
              required: false,
              value,
            }
          : field,
      );
    const asked = routeFields(
      judgedRun({ artifact: answers({ e4: { decision: 'ask-operator', value: null } }) }),
      'admitted',
      question(null),
    );
    expect(asked[3]).toMatchObject({ route: 'ask-operator', source: 'loop' });
    const blanked = routeFields(judgedRun({ artifact: answers() }), 'admitted', question(null));
    expect(blanked[3]).toMatchObject({
      route: 'ask-operator',
      reason: 'unanswered choice left blank: bait',
    });
    const answered = routeFields(judgedRun({ artifact: answers() }), 'admitted', question('Yes'));
    expect(answered[3]).toMatchObject({ route: 'leave-blank', source: 'blank' });
  });

  it('[QL-37] asks when the model answered with low confidence or did not answer at all', () => {
    const low = routeFields(
      judgedRun({ artifact: answers({ e1: { confidence: 'low' } }) }),
      'admitted',
      fields(),
    );
    expect(low[0].route).toBe('ask-operator');
    expect(low[0].value).toBe('6');

    const partial = answers();
    partial.fields = partial.fields.filter((f) => f.ref !== 'e2');
    const missing = routeFields(judgedRun({ artifact: partial }), 'admitted', fields());
    expect(missing[1]).toMatchObject({
      route: 'ask-operator',
      reason: 'unanswered',
      source: 'engine',
    });
  });

  it('[QL-37] [QL-58] routes every answer of a page whose reason the seam kept just past its ceiling', () => {
    const reason = 'r'.repeat(ANSWER_REASON_BOUND.ceiling + 1);
    const routes = routeFields(
      judgedRun({ artifact: answers({ e1: { reason } }) }),
      'admitted',
      fields(),
    );
    expect(routes.map((r) => [r.field.ref, r.route, r.source])).toEqual([
      ['e1', 'fill', 'memory'],
      ['e2', 'ask-operator', 'loop'],
      ['e3', 'leave-blank', 'blank'],
      ['e4', 'leave-blank', 'blank'],
    ]);
    expect(routes[0]).toMatchObject({ value: '6', reason });
  });
});
