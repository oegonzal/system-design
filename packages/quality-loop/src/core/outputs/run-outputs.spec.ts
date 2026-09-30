import type { Decision, RunTrace } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { decision, evidence, ledger, traceOf } from '../testing';
import { admits, outputsOf } from './run-outputs';

const trace = (finalDecision: Decision, overall = 90): RunTrace =>
  traceOf({
    artifact: { summary: 'a design' },
    ledger: ledger({ criteria: [evidence({ criterionId: 'c1', locationRefs: ['summary'] })] }),
    decision: decision({ finalDecision, scores: { dimensions: {}, overall } }),
  });

describe('outputsOf', () => {
  it('[QL-18] names the crowned iteration and its projections once', () => {
    const outputs = outputsOf(trace('accept'));
    expect(outputs.best?.iteration).toBe(outputs.trace.bestIteration);
    expect(outputs.artifact).toEqual({ summary: 'a design' });
    expect(outputs.criteria.map((evidence) => evidence.criterionId)).toEqual(['c1']);
    expect(outputs.decision?.finalDecision).toBe('accept');
    expect(outputs.lessons).toEqual(outputs.trace.lessons);
  });

  it('[QL-18] a trace with no iterations has no best, and nothing to read', () => {
    const empty: RunTrace = { ...trace('escalate'), iterations: [], bestIteration: 1 };
    const outputs = outputsOf(empty);
    expect(outputs.best).toBeNull();
    expect(outputs.artifact).toBeNull();
    expect(outputs.ledger).toBeNull();
    expect(outputs.findings).toEqual([]);
    expect(admits(outputs, 0)).toBe(false);
  });

  it('[QL-18] admits an accept always, a revise only over the bar with its gates open', () => {
    expect(admits(outputsOf(trace('accept', 10)), 75)).toBe(true);
    expect(admits(outputsOf(trace('revise', 80)), 75)).toBe(true);
    expect(admits(outputsOf(trace('revise', 50)), 75)).toBe(false);
  });
});
