import { WITHHOLDINGS } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { validatePolicy } from './policy';
import { tinyPipeline, tinyPolicy } from './testing';

const task = tinyPipeline().task;

describe('validatePolicy', () => {
  it('[QL-1] accepts the tiny policy', () => {
    expect(() => validatePolicy(tinyPolicy(), task, 'tiny')).not.toThrow();
  });

  it.each([
    ['weights that do not sum to 1', { dimensionWeights: { substance: 0.6, form: 0.6 } }],
    [
      'a kind on an unknown dimension',
      {
        criterionKinds: {
          ...tinyPolicy().criterionKinds,
          must: { dimension: 'nowhere', weight: 1, gate: false },
        },
      },
    ],
    [
      'a kind the task does not declare',
      {
        criterionKinds: {
          ...tinyPolicy().criterionKinds,
          extra: { dimension: 'form', weight: 1, gate: false },
        },
      },
    ],
    [
      'a finding type left unmapped',
      { findingTypes: { gap: { dimension: 'substance', gate: false } } },
    ],
    ['inverted thresholds', { thresholds: { acceptAt: 30, rejectBelow: 50 } }],
    ['a decay outside (0,1]', { penalties: { ...tinyPolicy().penalties, decay: 0 } }],
    [
      'minHits below 1',
      { evidence: { ...tinyPolicy().evidence, minHits: 0, minAssessedShare: 1 } },
    ],
    [
      'non-monotone confidence weights',
      { confidenceWeights: { none: 0, low: 0.9, medium: 0.5, high: 1 } },
    ],
    [
      'a lost-sample policy it does not know',
      { evidence: { ...tinyPolicy().evidence, lostSample: 'ignore' as never } },
    ],
    [
      'a contradicted discount where no finding is ever contradicted',
      { penalties: { ...tinyPolicy().penalties, contradicted: 0.5 } },
    ],
    ['a negative lost-produce allowance', { loop: { ...tinyPolicy().loop, lostProduces: -1 } }],
    ['a fractional lost-produce allowance', { loop: { ...tinyPolicy().loop, lostProduces: 0.5 } }],
  ])('[QL-1] rejects %s, naming the pipeline', (_label, override) => {
    expect(() => validatePolicy({ ...tinyPolicy(), ...override }, task, 'tiny@0')).toThrow(
      /pipeline tiny@0/,
    );
  });

  it('[QL-53] takes what a finding type withholds as a declared withholding, or nothing at all', () => {
    const withholding = (withholds: unknown) => ({
      ...tinyPolicy(),
      findingTypes: {
        ...tinyPolicy().findingTypes,
        gap: { dimension: 'substance', gate: false, withholds: withholds as never },
      },
    });
    for (const withholds of WITHHOLDINGS) {
      expect(() => validatePolicy(withholding(withholds), task, 'tiny')).not.toThrow();
    }
    // Undeclared is today's rule, every ref; a word the vocabulary lacks is a typo, refused at boot.
    expect(() => validatePolicy(tinyPolicy(), task, 'tiny')).not.toThrow();
    expect(() => validatePolicy(withholding('some-refs'), task, 'tiny@0')).toThrow(
      /pipeline tiny@0: finding type gap withholds some-refs/,
    );
  });
});
