import { describe, expect, it } from 'vitest';

import { EVAL_DIMENSIONS } from '@sysdesign/contracts';

import { DIMENSION_WEIGHTS, ENGINE_VERSION } from './scoring';

describe('scoring constants', () => {
  it('dimension weights cover every dimension and sum to 1', () => {
    const total = EVAL_DIMENSIONS.reduce((sum, dimension) => sum + DIMENSION_WEIGHTS[dimension], 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('pins the engine version', () => {
    expect(ENGINE_VERSION).toBe('2.0.0');
  });
});
