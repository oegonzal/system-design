import {
  bound,
  CRITERION_STATEMENT_BOUND,
  keptAtMost,
  LARGEST_STATEMENT_BOUND,
  MAX_PROVIDED_STATEMENT_LENGTH,
  WITHHOLDINGS,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

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
            policy: {
              ...base.policy,
              evidence: { ...base.policy.evidence, minHits: 2, minAssessedShare: 1 },
            },
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

  it('[QL-32] a producer may be briefed with memories; a lens has no way to ask for them', () => {
    const base = tinyPipeline();
    const briefed = tinyPipeline({
      producer: { ...base.producer, consumes: ['criteria', 'memories'] },
    });
    expect(() => validatePipeline(asAny(briefed))).not.toThrow();
    expect(describePipeline(asAny(briefed)).producer).toEqual({
      consumes: ['criteria', 'memories'],
    });
    expect(() =>
      validatePipeline(
        asAny(tinyPipeline({ critics: [{ ...base.critics[0], consumes: ['memories' as never] }] })),
      ),
    ).toThrow(/consumes unknown evidence memories/);
    expect(() =>
      validatePipeline(
        asAny(
          tinyPipeline({
            evaluators: [{ ...base.evaluators[0], consumes: ['memories' as never] }],
          }),
        ),
      ),
    ).toThrow(/consumes unknown evidence memories/);
  });

  it('[QL-1] [QL-47] refuses a validator that takes the id of one the engine runs on every artifact', () => {
    for (const id of ['schema', 'bounds']) {
      const own = {
        id,
        gate: 'warn' as const,
        validate: () => ({ validatorId: id, gate: 'warn' as const, problems: [] }),
      };
      expect(() => validatePipeline(asAny(tinyPipeline({ validators: [own] })))).toThrow(
        `validator id ${id} is the engine's own`,
      );
    }
  });

  it('[QL-53] takes what a warning validator withholds as a declared withholding, and refuses one on a blocking validator', () => {
    const declaring = (gate: 'block' | 'warn', withholds: unknown) => ({
      id: 'own',
      gate,
      withholds: withholds as never,
      validate: () => ({ validatorId: 'own', gate, problems: [] }),
    });
    for (const withholds of WITHHOLDINGS) {
      expect(() =>
        validatePipeline(asAny(tinyPipeline({ validators: [declaring('warn', withholds)] }))),
      ).not.toThrow();
    }
    expect(() =>
      validatePipeline(asAny(tinyPipeline({ validators: [declaring('warn', 'some-refs')] }))),
    ).toThrow(/validator own withholds some-refs, not one of every-ref, all-but-one, none/);
    // A failing blocking validator closes admission, so no reader ever sees its
    // problems: what it would withhold is a declaration about nothing.
    for (const withholds of WITHHOLDINGS) {
      expect(() =>
        validatePipeline(asAny(tinyPipeline({ validators: [declaring('block', withholds)] }))),
      ).toThrow(/validator own blocks, so no reader sees its problems/);
    }
    expect(() =>
      validatePipeline(asAny(tinyPipeline({ validators: [declaring('block', undefined)] }))),
    ).not.toThrow();
  });

  it('[QL-47] converts the output schema for the model at boot: a schema with no JSON form never boots', () => {
    const tiny = tinyPipeline();
    const broken = tinyPipeline({
      task: {
        ...tiny.task,
        output: { ...tiny.task.output, schema: z.strictObject({ at: z.date() }) as never },
      },
    });
    expect(() => validatePipeline(asAny(broken))).toThrow();
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

  it('[QL-2] [QL-47] projects the longest statement its deriver can return — of the contract’s bound unless declared — and refuses a bound a caller could never hand back', () => {
    expect(describePipeline(asAny(tinyPipeline())).task.maxStatementLength).toBe(
      keptAtMost(CRITERION_STATEMENT_BOUND),
    );
    // The largest bound a pipeline may declare is exactly what the HTTP edge takes back.
    const declared = tinyPipeline();
    declared.task = { ...declared.task, statementBound: LARGEST_STATEMENT_BOUND };
    expect(describePipeline(asAny(declared)).task.maxStatementLength).toBe(
      MAX_PROVIDED_STATEMENT_LENGTH,
    );
    expect(() => validatePipeline(asAny(declared))).not.toThrow();
    // A bound whose ceiling the edge takes, but whose kept statements it would not.
    const kept = bound(LARGEST_STATEMENT_BOUND.target + 1);
    expect(kept.ceiling).toBeLessThan(MAX_PROVIDED_STATEMENT_LENGTH);
    for (const statementBound of [bound(0), bound(1.5), kept]) {
      const malformed = tinyPipeline();
      malformed.task = { ...malformed.task, statementBound };
      expect(() => validatePipeline(asAny(malformed))).toThrow(/statementBound/);
    }
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
