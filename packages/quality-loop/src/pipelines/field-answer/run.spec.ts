import { routeFields } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { runPipeline } from '../../core/loop/run-pipeline';
import { admission, outputsOf } from '../../core/outputs';
import { fill, runDto, sequencedLlm } from '../../core/testing';
import { FIELD_ANSWER } from './definition';
import { answer, fieldGoal, policyCriteria, sampleAnswers, sampleFields } from './testing';

const result = (criterionId: string, locationRefs: string[]) => ({
  criterionId,
  result: 'pass',
  confidence: 'high',
  locationRefs,
  rationale: 'as the policy asks',
});
const results = {
  results: [
    result('c1', ['field.1', 'field.2']),
    result('c2', ['field.4']),
    result('c3', ['summary']),
  ],
  advisoryVerdict: null,
};
const clean = { findings: [] };
const ungrounded = {
  findings: [
    {
      type: 'ungrounded',
      severity: 'high',
      confidence: 'high',
      fixability: 'requires_user',
      locationRefs: ['field.3'],
      criterionIds: ['c1'],
      rationale: 'no listed evidence names an employer; the value rests on nothing',
    },
  ],
};

/** The page answered with one invented fact and one value the field cannot take. */
const faultyAnswers = () => {
  const sample = sampleAnswers();
  return {
    ...sample,
    fields: sample.fields.map((item) => {
      if (item.ref === 'e3')
        return answer('e3', { value: 'Acme', reason: 'the most recent employer' });
      if (item.ref === 'e5') return answer('e5', { value: fill(220, 'w'), reason: 'a motivation' });
      return item;
    }),
  };
};

describe('the field-answer loop', () => {
  it('[QL-37] an ungrounded value and a located warning leave their optional fields blank with the fault on the row, the hidden field stays blank, the rest are filled', async () => {
    const goal = fieldGoal();
    // The critics share one schema: the grounding critic takes the first canned answer, the form critic the next.
    const trace = await runPipeline(
      FIELD_ANSWER,
      { goal, criteria: policyCriteria() },
      {
        llm: sequencedLlm(faultyAnswers(), ungrounded, clean, results),
        sink: () => undefined,
        now: () => 0,
      },
    );

    expect(trace.iterations).toHaveLength(1);
    const [only] = trace.iterations;
    // The over-long value is a warning located at its field, so the page is still judged.
    expect(only.validation.map((report) => [report.validatorId, report.gate])).toEqual([
      ['schema', 'block'],
      ['bounds', 'warn'],
      ['references', 'block'],
      ['limits', 'warn'],
    ]);
    expect(only.validation.flatMap((report) => report.problems)).toEqual([
      {
        severity: 'medium',
        locationRefs: ['field.5'],
        message: 'e5 takes at most 200 characters; the value runs to 220',
      },
    ]);
    expect(only.ledger.findings).toMatchObject([
      {
        key: 'ungrounded|field.3',
        lenses: ['critic.grounding'],
        fixability: 'requires_user',
        criterionIds: ['c1'],
      },
    ]);
    // Priced, not gated: the page is accepted and the caller reads it field by field.
    expect(only.decision.gates.policyAllowed).toBe(true);
    expect(only.decision.scores.dimensions['grounding']).toBe(75);
    expect(only.decision.finalDecision).toBe('accept');
    expect(trace.stopReason).toBe('accepted');

    const verdict = admission(outputsOf(trace), FIELD_ANSWER.policy.thresholds.acceptAt);
    expect(verdict).toBe('admitted');
    const routed = routeFields(runDto('answers', trace), verdict, sampleFields());
    expect(routed.map((field) => [field.field.ref, field.route, field.source])).toEqual([
      ['e1', 'fill', 'memory'],
      ['e2', 'fill', 'memory'],
      ['e3', 'leave-blank', 'loop'],
      ['e4', 'leave-blank', 'blank'],
      ['e5', 'leave-blank', 'loop'],
    ]);
    expect(routed[2]).toMatchObject({
      reason: 'optional, left blank: faulted',
      value: 'Acme',
      faults: [expect.stringContaining('ungrounded')],
    });
    expect(routed[4]).toMatchObject({
      reason: 'optional, left blank: faulted',
      faults: ['limits: e5 takes at most 200 characters; the value runs to 220'],
    });
    expect(routed[3].reason).toContain('trap-skipped');
    expect(routed[0].value).toBe('6');
    expect(routed[1].value).toBe('Yes');
  });

  it('[QL-37] a page whose run fell short is still routed field by field: the score alone demotes nothing', async () => {
    const trace = await runPipeline(
      FIELD_ANSWER,
      { goal: fieldGoal(), criteria: policyCriteria() },
      {
        // No evaluator answer: nothing is assessed, so the evidence gate escalates the page.
        llm: sequencedLlm(sampleAnswers(), clean),
        sink: () => undefined,
        now: () => 0,
      },
    );
    expect(trace.finalDecision).toBe('escalate');
    const verdict = admission(outputsOf(trace), FIELD_ANSWER.policy.thresholds.acceptAt);
    expect(verdict).toBe('fell-short');
    // The judges' objections arrive as faults at the fields they are about; with none, each field is read on its own merits.
    const routed = routeFields(runDto('answers', trace), verdict, sampleFields());
    expect(routed.map((field) => field.route)).toEqual([
      'fill',
      'fill',
      'leave-blank',
      'leave-blank',
      'fill',
    ]);
    expect(routed.every((field) => !field.reason.includes('page-escalated'))).toBe(true);
  });
});
