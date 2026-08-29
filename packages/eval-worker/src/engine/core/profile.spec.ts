import { describe, expect, it } from 'vitest';

import { DEFAULT_PROFILE } from '../profiles/default.profile';
import {
  gradeForScore,
  validateProfile,
  type CoverageScoringPolicy,
  type EvalProfile,
} from './profile';

const defaultScoring = DEFAULT_PROFILE.scoring;

function withScoring(patch: Partial<CoverageScoringPolicy>): EvalProfile {
  return { ...DEFAULT_PROFILE, scoring: { ...defaultScoring, ...patch } };
}

describe('validateProfile', () => {
  it('accepts the shipped profiles', () => {
    expect(() => validateProfile(DEFAULT_PROFILE)).not.toThrow();
  });

  it('rejects a pass listed twice', () => {
    const profile: EvalProfile = {
      ...DEFAULT_PROFILE,
      passes: [
        { pass: 'rules.core', enabled: true },
        { pass: 'rules.core', enabled: false },
      ],
    };
    expect(() => validateProfile(profile)).toThrow(/lists pass twice/);
  });

  it('rejects dimension weights that do not sum to 1', () => {
    const profile = withScoring({
      dimensionWeights: { ...DEFAULT_PROFILE.scoring.dimensionWeights, hygiene: 0.5 },
    });
    expect(() => validateProfile(profile)).toThrow(/sum to/);
  });

  it('rejects grade bands that do not strictly descend', () => {
    const profile = withScoring({ gradeBands: { A: 90, B: 90, C: 60, D: 45 } });
    expect(() => validateProfile(profile)).toThrow(/strictly descend/);
  });

  it('rejects a violation decay outside (0, 1]', () => {
    const profile = withScoring({ violationDecay: 0 });
    expect(() => validateProfile(profile)).toThrow(/violation decay/);
  });
});

describe('gradeForScore', () => {
  const bands = { A: 92, B: 82, C: 68, D: 50 };

  it('maps band edges inclusively', () => {
    expect(gradeForScore(92, bands)).toBe('A');
    expect(gradeForScore(91.9, bands)).toBe('B');
    expect(gradeForScore(82, bands)).toBe('B');
    expect(gradeForScore(68, bands)).toBe('C');
    expect(gradeForScore(50, bands)).toBe('D');
    expect(gradeForScore(49.9, bands)).toBe('F');
    expect(gradeForScore(0, bands)).toBe('F');
  });
});
