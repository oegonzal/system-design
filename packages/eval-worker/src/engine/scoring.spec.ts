import { describe, expect, it } from 'vitest';

import { EVAL_DIMENSIONS, SEVERITIES } from '@sysdesign/contracts';

import {
  DIMENSION_WEIGHTS,
  ENGINE_VERSION,
  gradeFor,
  overallScore,
  scoreDimensions,
  SEVERITY_WEIGHTS,
} from './scoring';
import type { RuleFinding } from './types';

function findingOf(
  dimension: RuleFinding['dimension'],
  severity: RuleFinding['severity'],
): RuleFinding {
  return {
    ruleId: `${dimension}.test`,
    dimension,
    severity,
    title: 'test',
    message: 'test',
    affectedNodeIds: [],
    affectedEdgeIds: [],
    suggestion: null,
  };
}

describe('scoring', () => {
  it('dimension weights cover every dimension and sum to 1', () => {
    const total = EVAL_DIMENSIONS.reduce((sum, dimension) => sum + DIMENSION_WEIGHTS[dimension], 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('severity weights cover every severity and info costs nothing', () => {
    for (const severity of SEVERITIES) {
      expect(SEVERITY_WEIGHTS[severity]).toBeGreaterThanOrEqual(0);
    }
    expect(SEVERITY_WEIGHTS.info).toBe(0);
    expect(SEVERITY_WEIGHTS.critical).toBeGreaterThan(SEVERITY_WEIGHTS.high);
  });

  it('subtracts severity weights per dimension and floors at 0', () => {
    const scores = scoreDimensions([
      findingOf('reliability', 'critical'),
      findingOf('reliability', 'critical'),
      findingOf('reliability', 'critical'),
      findingOf('scalability', 'high'),
      findingOf('security', 'info'),
    ]);
    expect(scores.reliability).toBe(0);
    expect(scores.scalability).toBe(75);
    expect(scores.security).toBe(100);
    expect(scores.hygiene).toBe(100);
  });

  it('blends dimensions into a one-decimal overall', () => {
    const perfect = scoreDimensions([]);
    expect(overallScore(perfect)).toBe(100);
    expect(
      overallScore({ ...perfect, reliability: 35, scalability: 75, messaging: 60, security: 75 }),
    ).toBe(74.3);
  });

  it('maps overall scores onto grade band edges', () => {
    expect(gradeFor(100)).toBe('A');
    expect(gradeFor(90)).toBe('A');
    expect(gradeFor(89.9)).toBe('B');
    expect(gradeFor(75)).toBe('B');
    expect(gradeFor(74.9)).toBe('C');
    expect(gradeFor(60)).toBe('C');
    expect(gradeFor(59.9)).toBe('D');
    expect(gradeFor(45)).toBe('D');
    expect(gradeFor(44.9)).toBe('F');
    expect(gradeFor(0)).toBe('F');
  });

  it('pins the engine version', () => {
    expect(ENGINE_VERSION).toBe('1.0.0');
  });
});
