import { describe, expect, it } from 'vitest';

import { confirmed, evidence, ledger, traceOf } from '../../../core/testing';
import type { RecallBase } from '../../../modules/runs/recall/run-recall';
import { MAX_FOCUS } from '../../../pipelines/memory-recall/input';
import {
  FOCUS_LINE_MAX,
  focusLines,
  focusOf,
  MAX_FOCUS_CRITERIA,
  MAX_FOCUS_FINDINGS,
} from './focus';

const CRITERIA = [
  { id: 'c1', kind: 'functional', statement: 'Redirect a short link to its target.' },
  { id: 'c2', kind: 'scale', statement: 'Serve 10,000 redirects per second at peak.' },
  { id: 'c3', kind: 'non_functional', statement: 'Never lose a click count on a crash.' },
];

/** The iteration a coach adopts: three findings of mixed severity, one criterion failed, one partial. */
const base = (): RecallBase => {
  const [iteration] = traceOf({
    ledger: ledger({
      findings: [
        confirmed({
          key: 'operability_gap|overview',
          type: 'operability_gap',
          severity: 'medium',
          rationale: 'No alert watches the p99.',
        }),
        confirmed({
          key: 'unhandled_failure|node.3',
          type: 'unhandled_failure',
          severity: 'high',
          rationale: 'No fallback when the cache is down.',
        }),
        confirmed({
          key: 'scale_mismatch|edge.4',
          type: 'scale_mismatch',
          severity: 'critical',
          rationale: `${'Every redirect writes the counter row. '.repeat(20)}`,
        }),
      ],
      criteria: [
        evidence({ criterionId: 'c1', result: 'pass' }),
        evidence({ criterionId: 'c2', result: 'partial' }),
        evidence({ criterionId: 'c3', result: 'fail' }),
      ],
    }),
  }).iterations;
  return {
    runId: 'run-adopted',
    pipeline: 'system-design-canvas',
    iteration,
    criteria: CRITERIA,
    adoptedFrom: null,
  };
};

describe('what a coach’s recall is focused on', () => {
  it('[QL-34] is the adopted iteration’s confirmed findings, worst first, and the criteria it fell short on, fails first', () => {
    const focus = focusOf(base());
    expect(focus.runId).toBe('run-adopted');
    expect(focus.iteration).toBe(1);
    expect(focus.findings.map((finding) => [finding.type, finding.severity])).toEqual([
      ['scale_mismatch', 'critical'],
      ['unhandled_failure', 'high'],
      ['operability_gap', 'medium'],
    ]);
    expect(focus.findings[1]?.rationale).toBe('No fallback when the cache is down.');
    expect(focus.criteria).toEqual([
      { criterionId: 'c3', statement: 'Never lose a click count on a crash.', result: 'fail' },
      {
        criterionId: 'c2',
        statement: 'Serve 10,000 redirects per second at peak.',
        result: 'partial',
      },
    ]);
  });

  it('[QL-34] reads as lines a store is searched with: a defect in words with why, a criterion with how it fell short', () => {
    const lines = focusLines(focusOf(base()));
    expect(lines[1]).toBe('unhandled failure (high): No fallback when the cache is down.');
    expect(lines[3]).toBe('c3 fail: Never lose a click count on a crash.');
    for (const line of lines) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(FOCUS_LINE_MAX);
    expect(focusLines(null)).toEqual([]);
  });

  it('[QL-34] names at most as many defects as the curator’s query takes', () => {
    expect(MAX_FOCUS_FINDINGS + MAX_FOCUS_CRITERIA).toBe(MAX_FOCUS);
    const many = base();
    const findings = Array.from({ length: 13 }, (_, index) =>
      confirmed({ key: `gap|node.${index}`, type: 'gap', locationRefs: [`node.${index}`] }),
    );
    const criteria = Array.from({ length: 13 }, (_, index) =>
      evidence({ criterionId: `c${index + 1}`, result: 'fail' }),
    );
    const focus = focusOf({
      ...many,
      iteration: { ...many.iteration, ledger: ledger({ findings, criteria }) },
    });
    expect(focus.findings).toHaveLength(MAX_FOCUS_FINDINGS);
    expect(focus.criteria).toHaveLength(MAX_FOCUS_CRITERIA);
  });
});
