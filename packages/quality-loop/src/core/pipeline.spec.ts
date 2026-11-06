import {
  bound,
  CRITERION_STATEMENT_BOUND,
  keptAtMost,
  LARGEST_STATEMENT_BOUND,
  MAX_PROVIDED_STATEMENT_LENGTH,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { criterionLengthBound } from './contracts';
import { describePipeline } from './describe-pipeline';
import { validatePipeline } from './validate-pipeline';
import { tinyPipeline } from './testing';

const asAny = (definition: ReturnType<typeof tinyPipeline>) => definition as never;

describe('validatePipeline', () => {
  it('[QL-1] accepts a well-formed pipeline', () => {
    expect(() => validatePipeline(asAny(tinyPipeline()))).not.toThrow();
  });

  it('[QL-81] a carried part is a key the output schema declares, named once', () => {
    const base = tinyPipeline();
    const carrying = (carried: string[]) =>
      asAny(tinyPipeline({ task: { ...base.task, carried } }));
    expect(() => validatePipeline(carrying(['parts']))).not.toThrow();
    expect(() => validatePipeline(carrying(['transcript']))).toThrow(
      /task.carried names transcript, which the output schema does not declare/,
    );
    expect(() => validatePipeline(carrying(['parts', 'parts']))).toThrow(/names a key twice/);
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

  it('[QL-5] under cited corroboration, refuses an evaluator of a gating kind that reads the critics first — the veto needs a second reading, not an echo', () => {
    const base = tinyPipeline();
    const gatingMust = {
      ...base.policy,
      criterionKinds: {
        ...base.policy.criterionKinds,
        must: { ...base.policy.criterionKinds['must'], gate: true },
      },
    };
    const cited = {
      ...gatingMust,
      evidence: { ...gatingMust.evidence, corroboration: 'cited' as const },
    };
    const afterCritics = [{ ...base.evaluators[0], consumes: ['findings' as const] }];
    expect(() =>
      validatePipeline(asAny(tinyPipeline({ policy: cited, evaluators: afterCritics }))),
    ).toThrow(/evaluator .* judges gating kind\(s\) must under cited corroboration/);
    // Beside the critics it is a second reading; and where nothing is held to
    // a citation, nothing is lost by reading the critics first.
    expect(() => validatePipeline(asAny(tinyPipeline({ policy: cited })))).not.toThrow();
    expect(() =>
      validatePipeline(asAny(tinyPipeline({ policy: gatingMust, evaluators: afterCritics }))),
    ).not.toThrow();
  });

  it('[QL-1] holds every model-facing stage to a persona and a cap — a lens, the producer and the deriver alike', () => {
    const base = tinyPipeline();
    const refused: [string, Partial<ReturnType<typeof tinyPipeline>>, RegExp][] = [
      [
        'an empty lens persona',
        { critics: [{ ...base.critics[0], persona: ' ' }] },
        /lens .* has an empty persona/,
      ],
      [
        'a lens with no room',
        { evaluators: [{ ...base.evaluators[0], maxTokens: 0 }] },
        /lens .* needs maxTokens/,
      ],
      [
        'an empty producer persona',
        { producer: { ...base.producer, persona: '' } },
        /producer has an empty persona/,
      ],
      [
        'a producer with no room',
        { producer: { ...base.producer, maxTokens: 0 } },
        /producer needs maxTokens/,
      ],
      [
        'an empty producer ask',
        { producer: { ...base.producer, instruction: ' ' } },
        /producer instruction is empty/,
      ],
      [
        'an empty deriver persona',
        { deriveCriteria: { ...base.deriveCriteria, persona: '\n' } },
        /deriveCriteria has an empty persona/,
      ],
      [
        'a deriver with no room',
        { deriveCriteria: { ...base.deriveCriteria, maxTokens: 0 } },
        /deriveCriteria needs maxTokens/,
      ],
    ];
    for (const [label, override, message] of refused) {
      expect(() => validatePipeline(asAny(tinyPipeline(override))), label).toThrow(message);
    }
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

  it('[QL-1] [QL-2] fixed criteria must be gradable — a declared kind, a statement within the deriver’s target — and must leave the deriver room', () => {
    const base = tinyPipeline();
    const fixed = (criteria: { kind: string; statement: string }[], maxCriteria = 6) =>
      asAny(tinyPipeline({ task: { ...base.task, maxCriteria, fixedCriteria: criteria } }));
    expect(() =>
      validatePipeline(fixed([{ kind: 'must', statement: 'The text names its subject.' }])),
    ).not.toThrow();
    expect(() => validatePipeline(fixed([{ kind: 'bogus', statement: 'x' }]))).toThrow(
      /fixedCriteria\[0\] has unknown kind bogus/,
    );
    expect(() => validatePipeline(fixed([{ kind: 'must', statement: '   ' }]))).toThrow(
      /fixedCriteria\[0\] must be 1 to/,
    );
    const { target } = criterionLengthBound(base.task);
    expect(() =>
      validatePipeline(fixed([{ kind: 'must', statement: 'x'.repeat(target + 1) }])),
    ).toThrow(/must be 1 to/);
    // Six of six: the deriver would have nothing to derive into.
    expect(() =>
      validatePipeline(
        fixed(Array.from({ length: 6 }, (_, i) => ({ kind: 'must', statement: `fixed ${i}` }))),
      ),
    ).toThrow(/leaving none to derive/);
  });

  it('[QL-1] a critic that declares its finding types declares known ones, and every task type has an owner', () => {
    const base = tinyPipeline();
    const critic = (findingTypes?: string[]) => ({
      ...base.critics[0],
      ...(findingTypes ? { findingTypes } : {}),
    });
    expect(() =>
      validatePipeline(asAny(tinyPipeline({ critics: [critic(['gap', 'wrong'])] }))),
    ).not.toThrow();
    expect(() =>
      validatePipeline(asAny(tinyPipeline({ critics: [critic(['gap', 'bogus'])] }))),
    ).toThrow(/unknown finding type bogus/);
    expect(() => validatePipeline(asAny(tinyPipeline({ critics: [critic([])] })))).toThrow(
      /declares no finding types/,
    );
    // One critic owns `gap` and nothing owns `wrong`: a type no lens can emit.
    expect(() => validatePipeline(asAny(tinyPipeline({ critics: [critic(['gap'])] })))).toThrow(
      /finding type wrong .* owned by no critic/,
    );
    // Two critics splitting the vocabulary is the intended shape.
    expect(() =>
      validatePipeline(
        asAny(
          tinyPipeline({
            critics: [critic(['gap']), { ...critic(['wrong']), id: 'critic.other' }],
          }),
        ),
      ),
    ).not.toThrow();
  });

  it('[QL-5] refuses a corroboration the policy does not know, and accepts each declared one', () => {
    const base = tinyPipeline();
    const withCorroboration = (corroboration: string) =>
      asAny(
        tinyPipeline({
          policy: {
            ...base.policy,
            evidence: { ...base.policy.evidence, corroboration: corroboration as never },
          },
        }),
      );
    expect(() => validatePipeline(withCorroboration('none'))).not.toThrow();
    expect(() => validatePipeline(withCorroboration('cited'))).not.toThrow();
    expect(() => validatePipeline(withCorroboration('vibes'))).toThrow(/evidence.corroboration/);
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
        asAny(
          tinyPipeline({
            evaluators: [{ ...base.evaluators[0], consumes: ['memories' as never] }],
          }),
        ),
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

  it('[QL-62] refuses an output schema a strict endpoint would refuse, naming the fault, and takes one the conversion closes', () => {
    // 2026-10-07: one `.optional()` on the step plan, and the endpoint refused
    // every producer call of a twelve-step session in under 200 ms each. The
    // conversion now shows an optional key as required and nullable; an open
    // object — a record — is what the endpoint still refuses.
    const tiny = tinyPipeline();
    const withSchema = (schema: z.ZodType) =>
      tinyPipeline({
        task: { ...tiny.task, output: { ...tiny.task.output, schema: schema as never } },
      });
    const optional = withSchema(
      z.strictObject({ text: z.string(), serves: z.array(z.string()).optional() }),
    );
    expect(() => validatePipeline(asAny(optional))).not.toThrow();
    const open = withSchema(
      z.strictObject({ text: z.string(), byKey: z.record(z.string(), z.string()) }),
    );
    expect(() => validatePipeline(asAny(open))).toThrow(/not strict.*byKey: open object/);
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
          tinyPipeline({ evaluators: [{ ...base.evaluators[0], consumes: ['vibes' as never] }] }),
        ),
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
