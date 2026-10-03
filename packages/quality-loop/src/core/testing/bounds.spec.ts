import { describe, expect, it } from 'vitest';

import { allStages, CAP_HEADROOM, capsAgainstMeasured, seededCaps } from './bounds';

const definition = {
  deriveCriteria: { maxTokens: 4_000 },
  producer: { maxTokens: 48_000 },
  critics: [{ id: 'critic.scale', maxTokens: 30_000 }],
  evaluators: [{ id: 'evaluator.quality', maxTokens: 16_000 }],
};

const cap = (max: number) => ({ n: 40, max, p99: max, maxApiCalls: 1 });

describe('capsAgainstMeasured', () => {
  it('[QL-49] passes caps a fifth above the most each stage wrote, and fails one that is not', () => {
    expect(CAP_HEADROOM).toBe(1.2);
    const measured = {
      criteria: cap(1_377),
      producer: cap(40_000),
      'critic.scale': cap(24_646),
      'evaluator.quality': cap(11_958),
    };
    expect(capsAgainstMeasured(definition, measured)).toEqual([]);
    // The coached canvas of 2026-10-02: 40,173 output tokens against 48,000 leaves less than a fifth.
    expect(capsAgainstMeasured(definition, { ...measured, producer: cap(40_173) })).toEqual([
      'producer: cap 48000 < 1.2 × measured max 40173 (48208)',
    ]);
  });

  it('[QL-49] fails a measured stage the definition no longer declares and a declared one nothing measured, unless exempt with its reason', () => {
    const measured = { producer: cap(9_000), 'critic.gone': cap(9_000) };
    expect(capsAgainstMeasured(definition, measured)).toEqual([
      'critic.gone: measured, but the definition declares no such stage',
      'criteria: declared, never measured',
      'critic.scale: declared, never measured',
      'evaluator.quality: declared, never measured',
    ]);
    const { 'critic.gone': _gone, ...declared } = measured;
    expect(
      capsAgainstMeasured(definition, declared, {
        exempt: {
          criteria: 'the rubric is supplied',
          'critic.scale': 'new lens',
          'evaluator.quality': 'new lens',
        },
      }),
    ).toEqual([]);
  });

  it('[QL-49] holds a pipeline no run recorded to its seeds, every stage exempt from the empty measurement', () => {
    const seeds = { criteria: 2_500, producer: 4_000, 'critic.scale': 4_000 };
    expect(capsAgainstMeasured(definition, seededCaps(seeds))).toEqual([
      'evaluator.quality: declared, never measured',
    ]);
    expect(
      capsAgainstMeasured(definition, {}, { exempt: allStages(definition, 'no run recorded') }),
    ).toEqual([]);
  });
});
