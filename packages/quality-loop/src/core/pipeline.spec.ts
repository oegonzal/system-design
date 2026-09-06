import { describe, expect, it } from 'vitest';

import { describePipeline, validatePipeline } from './pipeline';
import { tinyPipeline } from './testing';

const asAny = (definition: ReturnType<typeof tinyPipeline>) => definition as never;

describe('validatePipeline', () => {
  it('[QL-1] accepts a well-formed pipeline', () => {
    expect(() => validatePipeline(asAny(tinyPipeline()))).not.toThrow();
  });

  it('[QL-1] refuses two evaluators judging one kind, and a kind with no judge', () => {
    const base = tinyPipeline();
    const twice = tinyPipeline({
      evaluators: [
        base.evaluators[0],
        { ...base.evaluators[0], id: 'evaluator.other', criterionKinds: ['must'] },
      ],
    });
    expect(() => validatePipeline(asAny(twice))).toThrow(/judged by both/);
    const none = tinyPipeline({
      evaluators: [{ ...base.evaluators[0], criterionKinds: ['must'] }],
    });
    expect(() => validatePipeline(asAny(none))).toThrow(/kind nice has no evaluator/);
  });

  it('[QL-1] refuses a lens that could never reach minHits, a reserved id, and a duplicate id', () => {
    const base = tinyPipeline();
    expect(() =>
      validatePipeline(
        asAny(
          tinyPipeline({
            policy: { ...base.policy, evidence: { minHits: 2, minAssessedShare: 1 } },
          }),
        ),
      ),
    ).toThrow(/minHits/);
    expect(() =>
      validatePipeline(asAny(tinyPipeline({ critics: [{ ...base.critics[0], id: 'producer' }] }))),
    ).toThrow(/reserved/);
    expect(() =>
      validatePipeline(asAny(tinyPipeline({ critics: [base.critics[0], { ...base.critics[0] }] }))),
    ).toThrow(/unique/);
  });

  it('[QL-1] describes a pipeline as plain data that round-trips through JSON', () => {
    const summary = describePipeline(asAny(tinyPipeline()));
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    expect(summary.critics.map((lens) => lens.id)).toEqual(['critic.tiny']);
    expect(JSON.stringify(summary)).not.toContain('persona');
  });
});
