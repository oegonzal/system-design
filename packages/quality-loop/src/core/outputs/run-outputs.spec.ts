import type { Decision, RunTrace } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { criterion, decision, evidence, ledger, traceOf } from '../testing';
import { admission, admits, outputsOf } from './run-outputs';

const trace = (finalDecision: Decision, overall = 90): RunTrace =>
  traceOf({
    artifact: { summary: 'a design' },
    criteria: [criterion('c1')],
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
    expect(admission(outputs, 0)).toBe('no-artifact');
  });

  it('[QL-18] admits an accept always, a revise only over the bar with its gates open', () => {
    expect(admits(outputsOf(trace('accept', 10)), 75)).toBe(true);
    expect(admits(outputsOf(trace('revise', 80)), 75)).toBe(true);
    expect(admits(outputsOf(trace('revise', 50)), 75)).toBe(false);
    expect(admission(outputsOf(trace('revise', 50)), 75)).toBe('fell-short');
  });

  it('[QL-18] a run that was never judged says so, and is never read as having fallen short', () => {
    // The live failure this rule exists for: a digest whose deriver missed the
    // schema three times ran with no rubric, scored the controller's zero, and
    // was reported as "not accepted" — a length miss read as a quality verdict.
    const unjudged = trace('escalate', 0);
    const noRubric: RunTrace = { ...unjudged, contract: { ...unjudged.contract, criteria: [] } };
    expect(admission(outputsOf(noRubric), 75)).toBe('no-rubric');
    expect(admits(outputsOf(noRubric), 75)).toBe(false);

    const [only] = unjudged.iterations;
    const nothingProduced: RunTrace = {
      ...unjudged,
      iterations: [{ ...only, artifact: null, ledger: { ...only.ledger, artifactPresent: false } }],
    };
    expect(admission(outputsOf(nothingProduced), 75)).toBe('no-artifact');

    // An accept is an accept, whatever else the trace says.
    const accepted: RunTrace = { ...noRubric, finalDecision: 'accept' };
    expect(admission(outputsOf(accepted), 75)).toBe('admitted');
  });
});
