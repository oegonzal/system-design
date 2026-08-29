import { describe, expect, it } from 'vitest';

import type { EngineFinding } from '../../core/artifacts';
import { applySeverityPolicy, readSeverityOverrides } from './severity-policy';

function finding(ruleId: string | null, severity: EngineFinding['severity']): EngineFinding {
  return {
    ruleId,
    expectationId: ruleId ? null : 'exp.test.something',
    nfrId: null,
    dimension: 'messaging',
    severity,
    title: 'a lesson',
    message: 'a message long enough to count as teaching prose',
    affectedNodeIds: [],
    affectedEdgeIds: [],
    suggestion: null,
    countsAsViolation: ruleId !== null,
  };
}

const OVERRIDES = { 'messaging.queue-no-dlq': { advanced: 'high' as const } };

describe('applySeverityPolicy', () => {
  it('swaps severity when the rule and difficulty match', () => {
    const input = [finding('messaging.queue-no-dlq', 'low')];
    const output = applySeverityPolicy(input, 'advanced', OVERRIDES);
    expect(output).toHaveLength(1);
    expect(output[0].severity).toBe('high');
    // Pure: the input finding is untouched.
    expect(input[0].severity).toBe('low');
  });

  it('leaves the finding alone at a difficulty the override does not name', () => {
    const input = [finding('messaging.queue-no-dlq', 'low')];
    expect(applySeverityPolicy(input, 'standard', OVERRIDES)[0].severity).toBe('low');
    expect(applySeverityPolicy(input, 'intro', OVERRIDES)[0].severity).toBe('low');
  });

  it('leaves unknown rules and expectation findings untouched', () => {
    const unknown = finding('reliability.some-other-rule', 'medium');
    const expectation = finding(null, 'critical');
    const output = applySeverityPolicy([unknown, expectation], 'advanced', OVERRIDES);
    expect(output[0]).toBe(unknown);
    expect(output[1]).toBe(expectation);
  });
});

describe('readSeverityOverrides', () => {
  it('accepts the well-formed shape verbatim', () => {
    expect(readSeverityOverrides(OVERRIDES)).toEqual(OVERRIDES);
  });

  it('degrades malformed input to no overrides instead of throwing', () => {
    expect(readSeverityOverrides(undefined)).toEqual({});
    expect(readSeverityOverrides('advanced')).toEqual({});
    expect(readSeverityOverrides(['messaging.queue-no-dlq'])).toEqual({});
    expect(readSeverityOverrides({ 'messaging.queue-no-dlq': 'high' })).toEqual({});
  });

  it('drops unknown difficulties and severities entry by entry', () => {
    expect(
      readSeverityOverrides({
        'messaging.queue-no-dlq': { advanced: 'high', nightmare: 'high', standard: 'harsh' },
        'reliability.lb-single-target': { sideways: 'low' },
      }),
    ).toEqual({ 'messaging.queue-no-dlq': { advanced: 'high' } });
  });
});
