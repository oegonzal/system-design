import { describe, expect, it } from 'vitest';

import type { AnswerBasis } from './vocab';
import { ANSWER_REASON_BOUND, type FieldAnswers } from './field-answers.schema';
import { fieldSpecOf, type FieldSpec } from './field-goal';
import { answeringFixture, formObservation } from './fixtures';
import { type WithheldRef } from './pipelines';
import { routeFields, type FieldsDecision } from './route-fields';
import { judgedRun } from './read-back.testing';

const fields = () =>
  formObservation()
    .elements.filter((e) => e.kind !== 'clickable')
    .map(fieldSpecOf);

/** What the session read of the orchestration: the run as judged, its admission, and what the report withholds. */
const decided = (
  run: FieldsDecision['run'],
  admission: FieldsDecision['admission'] = 'admitted',
  withheld: WithheldRef[] = [],
): FieldsDecision => ({ run, admission, withheld });

const byFinding = (ref: string, by: string, note: string | null = null): WithheldRef => ({
  ref,
  source: 'finding',
  by,
  note,
});

/** Routed under settings that fill every kind but `inferred` and the kinds listed — the lever these cases watch. */
const route = (
  decision: FieldsDecision,
  specs: readonly FieldSpec[],
  asks: readonly AnswerBasis[] = ['inferred'],
) => routeFields(decision, specs, answeringFixture(asks));

const answers = (
  overrides: Partial<Record<string, Partial<FieldAnswers['fields'][number]>>> = {},
): FieldAnswers => ({
  summary: 'Four fields; evidence covers the first.',
  fields: [
    {
      ref: 'e1',
      decision: 'answer',
      value: '6',
      rests: 'stated',
      basis: ['m1'],
      reason: 'from m1',
    },
    {
      ref: 'e2',
      decision: 'answer',
      value: 'Yes',
      rests: 'inferred',
      basis: [],
      reason: 'likely',
    },
    {
      ref: 'e3',
      decision: 'answer',
      value: 'https://x',
      rests: 'stated',
      basis: [],
      reason: 'oops',
    },
    {
      ref: 'e4',
      decision: 'leave-blank',
      value: null,
      rests: 'none',
      basis: [],
      reason: 'bait',
    },
  ].map((answer) => ({ ...answer, ...(overrides[answer.ref] ?? {}) })) as FieldAnswers['fields'],
});

describe('routeFields', () => {
  it('[QL-37] [BRW-16] fills a value whose declared kind the settings fill, asks for one they do not, and blanks a hidden field whatever the model said', () => {
    const routes = route(decided(judgedRun({ artifact: answers() })), fields());
    expect(routes.map((r) => [r.field.ref, r.route, r.source])).toEqual([
      ['e1', 'fill', 'memory'],
      ['e2', 'ask-operator', 'loop'],
      ['e3', 'leave-blank', 'blank'],
      ['e4', 'leave-blank', 'blank'],
    ]);
    expect(routes[0].value).toBe('6');
    expect(routes[1].reason).toBe('rests inferred: likely');
    expect(routes[2].reason).toContain('trap-skipped');
    // The settings are the one lever: the same answers under a table that fills inferred values type e2.
    const filling = route(decided(judgedRun({ artifact: answers() })), fields(), []);
    expect(filling[1]).toMatchObject({ route: 'fill', source: 'loop', value: 'Yes' });
    // A value declared to rest on nothing is never typed, whatever the table says.
    const nothing = route(
      decided(judgedRun({ artifact: answers({ e1: { rests: 'none' } }) })),
      fields(),
      [],
    );
    expect(nothing[0]).toMatchObject({ route: 'ask-operator', reason: 'rests none: from m1' });
  });

  it('[QL-37] never fills a field the report withholds, carries what withheld it for the operator, and reads nothing off the findings itself', () => {
    // The run's own findings and warnings are NOT read here: a finding whose
    // type the pipeline declares withholds nothing — a needless ask — reaches
    // the session only through the report, which lists nothing for it.
    const run = judgedRun({
      artifact: answers(),
      findings: [
        { type: 'ungrounded', locationRefs: ['field.1'], rationale: 'no evidence says 6' },
        { type: 'needless_ask', locationRefs: ['field.2'], rationale: 'the evidence settles it' },
      ],
      validation: [
        {
          validatorId: 'limits',
          gate: 'warn',
          problems: [{ severity: 'medium', locationRefs: ['field.2'], message: 'not an option' }],
        },
      ],
    });
    const limits: WithheldRef = {
      ref: 'field.2',
      source: 'validator',
      by: 'limits',
      note: 'not an option',
    };
    const routes = route(
      decided(run, 'admitted', [byFinding('field.1', 'ungrounded', 'no evidence says 6'), limits]),
      fields(),
    );
    expect(routes[0]).toMatchObject({ route: 'ask-operator', source: 'loop', reason: 'withheld' });
    expect(routes[0].withheld).toEqual([byFinding('field.1', 'ungrounded', 'no evidence says 6')]);
    expect(routes[0].value).toBe('6');
    expect(routes[1].withheld).toEqual([limits]);
    // The same run with nothing withheld: the findings on it change no route.
    const unwithheld = route(decided(run), fields());
    expect(unwithheld[0].route).toBe('fill');
    expect(unwithheld.every((route) => route.withheld.length === 0)).toBe(true);
  });

  it('[QL-37] a run that fell short demotes nothing by itself; a page nothing judged asks for its required fields and blanks the optional ones; a required field left blank is asked', () => {
    const fellShort = route(decided(judgedRun({ artifact: answers() }), 'fell-short'), fields());
    expect(fellShort.map((r) => r.route)).toEqual([
      'fill',
      'ask-operator',
      'leave-blank',
      'leave-blank',
    ]);
    const unjudged = route(decided(judgedRun({ artifact: answers() }), 'no-rubric'), fields());
    expect(unjudged.map((r) => [r.route, r.source])).toEqual([
      ['ask-operator', 'engine'],
      ['ask-operator', 'engine'],
      ['leave-blank', 'blank'],
      ['leave-blank', 'engine'],
    ]);
    expect(unjudged[0].reason).toBe('page-escalated: no-rubric');
    expect(unjudged[3].reason).toBe('optional, left blank: page-escalated: no-rubric');

    const blankRequired = route(
      decided(judgedRun({ artifact: answers({ e1: { decision: 'leave-blank', value: null } }) })),
      fields(),
    );
    expect(blankRequired[0].route).toBe('ask-operator');
    expect(blankRequired[0].reason).toContain('required field left blank');
  });

  it('[QL-37] keeps what a field holds when the model says so or answers with the same value, asks when a keep has nothing to keep, and blanks an optional field a judge faulted', () => {
    const holding = fields().map((field) =>
      field.ref === 'e1' ? { ...field, value: '6' } : field,
    );
    const kept = route(
      decided(judgedRun({ artifact: answers({ e1: { decision: 'keep', value: null } }) })),
      holding,
    );
    expect(kept[0]).toMatchObject({ route: 'keep', value: '6', source: 'memory' });
    const same = route(decided(judgedRun({ artifact: answers() })), holding);
    expect(same[0]).toMatchObject({
      route: 'keep',
      value: '6',
      reason: 'holds it already: from m1',
    });
    const empty = route(
      decided(judgedRun({ artifact: answers({ e1: { decision: 'keep', value: null } }) })),
      fields(),
    );
    expect(empty[0]).toMatchObject({ route: 'ask-operator', reason: 'nothing to keep: from m1' });
    // The report withheld an optional field: left blank with the withholding on the row, never the operator's.
    const withheld = route(
      decided(
        judgedRun({ artifact: answers({ e4: { decision: 'answer', value: 'none' } }) }),
        'admitted',
        [byFinding('field.4', 'ungrounded', 'invented')],
      ),
      fields(),
    );
    expect(withheld[3]).toMatchObject({
      route: 'leave-blank',
      source: 'loop',
      reason: 'optional, left blank: withheld',
      withheld: [byFinding('field.4', 'ungrounded', 'invented')],
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
    const asked = route(
      decided(judgedRun({ artifact: answers({ e4: { decision: 'ask-operator', value: null } }) })),
      question(null),
    );
    expect(asked[3]).toMatchObject({ route: 'ask-operator', source: 'loop' });
    const blanked = route(decided(judgedRun({ artifact: answers() })), question(null));
    expect(blanked[3]).toMatchObject({
      route: 'ask-operator',
      reason: 'unanswered choice left blank: bait',
    });
    const answered = route(decided(judgedRun({ artifact: answers() })), question('Yes'));
    expect(answered[3]).toMatchObject({ route: 'leave-blank', source: 'blank' });
  });

  it('[QL-37] asks when the model answered resting on a kind the settings do not fill, or did not answer at all', () => {
    const asked = route(
      decided(judgedRun({ artifact: answers({ e1: { rests: 'derived' } }) })),
      fields(),
      ['derived'],
    );
    expect(asked[0].route).toBe('ask-operator');
    expect(asked[0]).toMatchObject({ value: '6', reason: 'rests derived: from m1' });

    const partial = answers();
    partial.fields = partial.fields.filter((f) => f.ref !== 'e2');
    const missing = route(decided(judgedRun({ artifact: partial })), fields());
    expect(missing[1]).toMatchObject({
      route: 'ask-operator',
      reason: 'unanswered',
      source: 'engine',
    });
  });

  it('[QL-37] [QL-58] routes every answer of a page whose reason the seam kept just past its ceiling', () => {
    const reason = 'r'.repeat(ANSWER_REASON_BOUND.ceiling + 1);
    const routes = route(decided(judgedRun({ artifact: answers({ e1: { reason } }) })), fields());
    expect(routes.map((r) => [r.field.ref, r.route, r.source])).toEqual([
      ['e1', 'fill', 'memory'],
      ['e2', 'ask-operator', 'loop'],
      ['e3', 'leave-blank', 'blank'],
      ['e4', 'leave-blank', 'blank'],
    ]);
    expect(routes[0]).toMatchObject({ value: '6', reason });
  });
});
