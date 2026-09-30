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

  it('[QL-1] refuses a lens consuming evidence nothing produces before it, and evidence it does not know', () => {
    const base = tinyPipeline();
    expect(() =>
      validatePipeline(
        asAny(
          tinyPipeline({
            critics: [],
            evaluators: [{ ...base.evaluators[0], consumes: ['findings'] }],
          }),
        ),
      ),
    ).toThrow(/consumes findings but no critic/);
    expect(() =>
      validatePipeline(
        asAny(
          tinyPipeline({
            critics: [{ ...base.critics[0], consumes: ['results'] }],
            evaluators: [{ ...base.evaluators[0], consumes: ['results'] }],
          }),
        ),
      ),
    ).toThrow(/consumes results but no evaluator/);
    expect(() =>
      validatePipeline(
        asAny(tinyPipeline({ critics: [{ ...base.critics[0], consumes: ['vibes' as never] }] })),
      ),
    ).toThrow(/unknown evidence/);
    expect(() =>
      validatePipeline(
        asAny(tinyPipeline({ producer: { ...base.producer, consumes: ['scores' as never] } })),
      ),
    ).toThrow(/unknown briefing/);
  });

  it('[QL-1] refuses a controller that consults nothing, a factor twice, or the engine’s factor', () => {
    const base = tinyPipeline();
    const withSteps = (steps: { factor: string }[]) =>
      tinyPipeline({
        controller: { ...base.controller, summary: { id: 'hand-written', steps } },
      });
    expect(() => validatePipeline(asAny(withSteps([])))).toThrow(/consults no factor/);
    expect(() =>
      validatePipeline(asAny(withSteps([{ factor: 'one' }, { factor: 'one' }]))),
    ).toThrow(/consults a factor twice/);
    expect(() => validatePipeline(asAny(withSteps([{ factor: 'scores' }])))).toThrow(
      /engine's factor/,
    );
    expect(() =>
      validatePipeline(asAny(withSteps([{ factor: 'artifact' }, { factor: 'route' }]))),
    ).not.toThrow();
  });

  it('[QL-1] describes a pipeline as plain data that round-trips through JSON, declarations included', () => {
    const summary = describePipeline(asAny(tinyPipeline()));
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    expect(summary.critics.map((lens) => lens.id)).toEqual(['critic.tiny']);
    expect(summary.producer).toEqual({ consumes: ['criteria'] });
    expect(summary.evaluators[0].consumes).toEqual([]);
    expect(summary.controller.id).toBe('standard');
    expect(summary.controller.steps.map((step) => step.factor)).toEqual([
      'artifact',
      'validators',
      'evidence',
      'policy-allowed',
      'accept-threshold',
      'reject-floor',
      'route',
    ]);
    expect(JSON.stringify(summary)).not.toContain('persona');
  });

  it('[QL-24] declares its goal source, refuses one it does not know, and projects it into the summary', () => {
    expect(describePipeline(asAny(tinyPipeline())).goalSource).toBe('brief');
    expect(describePipeline(asAny(tinyPipeline({ goalSource: 'composed' }))).goalSource).toBe(
      'composed',
    );
    expect(() => validatePipeline(asAny(tinyPipeline({ goalSource: 'typed' as never })))).toThrow(
      /goalSource typed is not one of brief, composed/,
    );
  });
});
