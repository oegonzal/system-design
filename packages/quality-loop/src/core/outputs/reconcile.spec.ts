import { describe, expect, it } from 'vitest';

import { outputsOf, type RunOutputs } from './run-outputs';
import { reconcile, spread } from './reconcile';
import { confirmed, decision, ledger, traceOf } from '../testing';

const run = (
  overrides: {
    finalDecision?: 'accept' | 'revise' | 'escalate';
    overall?: number;
    dimensions?: Record<string, number | null>;
    findings?: { key: string; type: string }[];
    gates?: Partial<ReturnType<typeof decision>['gates']>;
    iterations?: number;
    stopReason?: 'accepted' | 'max-iterations' | 'escalated';
  } = {},
): RunOutputs => {
  const judged = decision({
    finalDecision: overrides.finalDecision ?? 'accept',
    scores: { dimensions: overrides.dimensions ?? {}, overall: overrides.overall ?? 80 },
    gates: { ...decision().gates, ...overrides.gates },
  });
  return outputsOf(
    traceOf({
      decision: judged,
      ledger: ledger({
        findings: (overrides.findings ?? []).map((finding) => confirmed(finding)),
      }),
      iterations: overrides.iterations,
      stopReason: overrides.stopReason,
    }),
  );
};

describe('spread', () => {
  it('[QL-19] is null with nothing to spread, counts only the numbers present, and rounds to a tenth', () => {
    expect(spread([])).toBeNull();
    expect(spread([null, undefined])).toBeNull();
    expect(spread([70.04, null, 80.16])).toEqual({
      n: 2,
      min: 70,
      max: 80.2,
      mean: 75.1,
      range: 10.1,
    });
  });
});

describe('reconcile', () => {
  it('[QL-19] under produced alignment it compares decisions, gates, spreads and finding types — never keys', () => {
    const report = reconcile(
      [
        run({
          finalDecision: 'accept',
          overall: 80,
          dimensions: { a: 90, b: 70 },
          findings: [{ key: 'gap|x', type: 'gap' }],
          iterations: 1,
        }),
        run({
          finalDecision: 'revise',
          overall: 70,
          dimensions: { a: 80, b: null },
          findings: [
            { key: 'gap|y', type: 'gap' },
            { key: 'leak|z', type: 'leak' },
          ],
          gates: { policyAllowed: false },
          iterations: 2,
          stopReason: 'max-iterations',
        }),
      ],
      'produced',
    );
    expect(report).toMatchObject({
      alignment: 'produced',
      runs: 2,
      decisions: { accept: 1, revise: 1 },
      stopReasons: { accepted: 1, 'max-iterations': 1 },
      gates: { artifactPresent: 2, validatorsPassed: 2, evidenceSufficient: 2, policyAllowed: 1 },
      iterations: { n: 2, min: 1, max: 2, mean: 1.5, range: 1 },
      overall: { n: 2, min: 70, max: 80, mean: 75, range: 10 },
      dimensions: {
        a: { n: 2, min: 80, max: 90, mean: 85, range: 10 },
        b: { n: 1, min: 70, max: 70, mean: 70, range: 0 },
      },
      findingTypes: { gap: 2, leak: 1 },
      unanimous: { findingTypes: ['gap'], findings: [] },
      contested: { decision: true, findingTypes: ['leak'], findings: [] },
    });
  });

  it('[QL-19] under provided alignment the finding keys are compared too, and each contested one says who saw it', () => {
    const report = reconcile(
      [
        run({
          findings: [
            { key: 'gap|x', type: 'gap' },
            { key: 'leak|z', type: 'leak' },
          ],
        }),
        run({ findings: [{ key: 'gap|x', type: 'gap' }] }),
        run({
          findings: [
            { key: 'gap|x', type: 'gap' },
            { key: 'leak|w', type: 'leak' },
          ],
        }),
      ],
      'provided',
    );
    expect(report.unanimous).toEqual({ findingTypes: ['gap'], findings: ['gap|x'] });
    expect(report.contested).toEqual({
      decision: false,
      findingTypes: ['leak'],
      findings: [
        { key: 'leak|w', type: 'leak', seenBy: [2] },
        { key: 'leak|z', type: 'leak', seenBy: [0] },
      ],
    });
  });

  it('[QL-19] a finding type counts once per run however many findings of it the run confirmed', () => {
    const report = reconcile(
      [
        run({
          findings: [
            { key: 'gap|x', type: 'gap' },
            { key: 'gap|y', type: 'gap' },
          ],
        }),
        run(),
      ],
      'produced',
    );
    expect(report.findingTypes).toEqual({ gap: 1 });
    expect(report.contested.findingTypes).toEqual(['gap']);
  });

  it('[QL-19] runs that agree on everything contest nothing', () => {
    const same = () =>
      run({ overall: 75, dimensions: { a: 75 }, findings: [{ key: 'gap|x', type: 'gap' }] });
    const report = reconcile([same(), same(), same()], 'provided');
    expect(report.contested).toEqual({ decision: false, findingTypes: [], findings: [] });
    expect(report.unanimous).toEqual({ findingTypes: ['gap'], findings: ['gap|x'] });
    expect(report.overall).toEqual({ n: 3, min: 75, max: 75, mean: 75, range: 0 });
  });

  it('[QL-19] a run still going counts as a run, but has no stop reason to tally', () => {
    const going = outputsOf({ ...traceOf(), stopReason: null });
    const report = reconcile([going, run({ stopReason: 'max-iterations' })], 'produced');
    expect(report.runs).toBe(2);
    expect(report.stopReasons).toEqual({ 'max-iterations': 1 });
  });

  it('[QL-19] a run without a decision still counts, and contributes no scores', () => {
    const bare = outputsOf({ ...traceOf(), iterations: [], bestIteration: 0 });
    const report = reconcile([bare, run({ overall: 60 })], 'produced');
    expect(report.runs).toBe(2);
    expect(report.overall).toEqual({ n: 1, min: 60, max: 60, mean: 60, range: 0 });
    expect(report.gates).toEqual({
      artifactPresent: 1,
      validatorsPassed: 1,
      evidenceSufficient: 1,
      policyAllowed: 1,
    });
  });
});
