import { WITHHOLDINGS } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { validatePipeline } from './validate-pipeline';
import { tinyPipeline } from './testing';

const asAny = (definition: ReturnType<typeof tinyPipeline>) => definition as never;

/** What boot refuses of a pipeline's own validators: an id the engine runs itself, and a withholding no reader could act on. */
describe('validatePipeline, on the validators a pipeline declares', () => {
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
    for (const withholds of WITHHOLDINGS.filter(
      (each) => each !== 'every-ref-when-requires-user',
    )) {
      expect(() =>
        validatePipeline(asAny(tinyPipeline({ validators: [declaring('warn', withholds)] }))),
      ).not.toThrow();
    }
    expect(() =>
      validatePipeline(asAny(tinyPipeline({ validators: [declaring('warn', 'some-refs')] }))),
    ).toThrow(
      /validator own withholds some-refs, not one of every-ref, every-ref-when-requires-user, none/,
    );
    // A validator's problem carries no fixability, so a withholding that reads one is refused on it.
    expect(() =>
      validatePipeline(
        asAny(tinyPipeline({ validators: [declaring('warn', 'every-ref-when-requires-user')] })),
      ),
    ).toThrow(/reads a finding's fixability, and a validator's problem has none/);
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
});
