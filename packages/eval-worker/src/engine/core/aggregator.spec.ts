import { describe, expect, it } from 'vitest';

import type { Severity } from '@sysdesign/contracts';

import { DIMENSION_WEIGHTS } from '../scoring';
import { DEFAULT_PROFILE } from '../profiles/default.profile';
import { aggregate } from './aggregator';
import type {
  AxisArtifact,
  CoverageArtifact,
  EngineFinding,
  EvidenceArtifact,
  ScenarioArtifact,
} from './artifacts';
import type { EvalProfile } from './profile';

/** The retired 1.0.0 rubric, kept as a spec value: the subtractive policy variant stays supported. */
const LEGACY_PROFILE: EvalProfile = {
  id: 'legacy',
  version: '1.0.0',
  passes: [],
  scoring: {
    model: 'subtractive',
    severityPenalties: { critical: 40, high: 25, medium: 12, low: 5, info: 0 },
    dimensionWeights: DIMENSION_WEIGHTS,
    gradeBands: { A: 90, B: 75, C: 60, D: 45 },
  },
};

function finding(overrides: Partial<EngineFinding> = {}): EngineFinding {
  return {
    ruleId: 'reliability.single-db-no-replica',
    dimension: 'reliability',
    severity: 'critical' as Severity,
    title: 'Single database with no replica',
    message: 'One database instance is a single point of failure at this availability target.',
    affectedNodeIds: ['n-3'],
    affectedEdgeIds: [],
    suggestion: null,
    countsAsViolation: true,
    expectationId: null,
    nfrId: null,
    ...overrides,
  };
}

function findingsArtifact(findings: EngineFinding[]): EvidenceArtifact {
  return { passId: 'rules.core', kind: 'findings', findings };
}

describe('aggregate', () => {
  it('reproduces the subtractive model exactly', () => {
    const result = aggregate(
      [
        findingsArtifact([
          finding(), // critical reliability −40
          finding({ ruleId: 'reliability.service-no-lb', severity: 'high' }), // −25
          finding({ ruleId: 'security.no-gateway', dimension: 'security', severity: 'high' }),
        ]),
      ],
      LEGACY_PROFILE,
    );

    expect(result.dimensionScores.reliability).toBe(35);
    expect(result.dimensionScores.security).toBe(75);
    expect(result.dimensionScores.hygiene).toBe(100);
    // 35·.2 + 100·.25 + 100·.15 + 100·.15 + 100·.1 + 75·.1 + 100·.05 = 84.5
    expect(result.overallScore).toBe(84.5);
    expect(result.grade).toBe('B');
    expect(result.bandGrade).toBe('B');
    expect(result.capApplied).toBeNull();
    expect(result.summary).toContain('grade B');
  });

  it('is order-independent: shuffled artifacts deep-equal', () => {
    const a = findingsArtifact([finding({ ruleId: 'security.no-gateway', dimension: 'security' })]);
    const b = findingsArtifact([
      finding(),
      finding({ ruleId: 'hygiene.orphan-node', dimension: 'hygiene', severity: 'info' }),
    ]);
    expect(aggregate([a, b], LEGACY_PROFILE)).toEqual(aggregate([b, a], LEGACY_PROFILE));
  });

  it('sorts findings by rule id, then affected node ids', () => {
    const result = aggregate(
      [
        findingsArtifact([
          finding({ ruleId: 'z.rule', affectedNodeIds: ['n-1'] }),
          finding({ ruleId: 'a.rule', affectedNodeIds: ['n-9'] }),
          finding({ ruleId: 'a.rule', affectedNodeIds: ['n-2'] }),
        ]),
      ],
      LEGACY_PROFILE,
    );
    expect(result.findings.map((f) => `${f.ruleId}:${f.affectedNodeIds[0]}`)).toEqual([
      'a.rule:n-2',
      'a.rule:n-9',
      'z.rule:n-1',
    ]);
  });

  it('[EVAL-6] never lets axis or scenario artifacts move the score', () => {
    const base: EvidenceArtifact[] = [findingsArtifact([finding()])];
    const axis: AxisArtifact = {
      passId: 'llm.depth',
      kind: 'axis',
      axisId: 'depth',
      label: 'Depth & justification',
      score: 0,
      subScores: null,
      summary: 'The model thinks this is terrible.',
      model: 'claude-sonnet-5',
    };
    const scenarios: ScenarioArtifact = {
      passId: 'llm.scenarios',
      kind: 'scenarios',
      reports: [
        {
          scenarioId: 'region-loss',
          title: 'A region dies mid-on-sale',
          verdict: 'fails',
          story: 'Everything falls over.',
          weakestNodeIds: ['n-3'],
        },
      ],
      model: 'claude-sonnet-5',
    };

    const without = aggregate(base, LEGACY_PROFILE);
    const withLlm = aggregate([...base, axis, scenarios], LEGACY_PROFILE);

    expect(withLlm.dimensionScores).toEqual(without.dimensionScores);
    expect(withLlm.overallScore).toBe(without.overallScore);
    expect(withLlm.grade).toBe(without.grade);
    expect(withLlm.summary).toBe(without.summary);
    // …but the artifacts ride along for display and audit.
    expect(withLlm.axes).toEqual([axis]);
    expect(withLlm.scenarios).toEqual(scenarios);
  });

  it('ignores non-violation findings in the subtractive model', () => {
    const result = aggregate(
      [
        findingsArtifact([
          finding({ countsAsViolation: false, expectationId: 'exp.fst.db-failover', ruleId: null }),
        ]),
      ],
      LEGACY_PROFILE,
    );
    expect(result.dimensionScores.reliability).toBe(100);
    expect(result.findings).toHaveLength(1); // still reported, still teaches
  });

  it('collects annotations and diagnostics without scoring them', () => {
    const result = aggregate(
      [
        findingsArtifact([]),
        {
          passId: 'llm.critic',
          kind: 'annotations',
          findings: [
            {
              dimension: 'data',
              severity: 'high',
              title: 'Consistency trap',
              message: 'The cache and database can disagree about inventory.',
              affectedNodeIds: [],
            },
          ],
          summary: 'A model opinion.',
          model: 'claude-sonnet-5',
        },
        {
          passId: 'llm.depth',
          kind: 'diagnostics',
          skipped: true,
          reason: 'llm-disabled',
          detail: null,
        },
      ],
      LEGACY_PROFILE,
    );
    expect(result.dimensionScores.data).toBe(100);
    expect(result.overallScore).toBe(100);
    expect(result.annotations?.summary).toBe('A model opinion.');
    expect(result.diagnostics).toHaveLength(1);
  });
});

function coverageEntry(
  overrides: Partial<CoverageArtifact['entries'][number]> = {},
): CoverageArtifact['entries'][number] {
  return {
    expectationId: 'exp.fst.db-failover',
    dimension: 'reliability',
    weight: 2,
    met: false,
    nfrId: null,
    evidenceNodeIds: [],
    evidenceEdgeIds: [],
    ...overrides,
  };
}

function coverageArtifact(entries: CoverageArtifact['entries']): EvidenceArtifact {
  return { passId: 'expectations.banks', kind: 'coverage', entries };
}

describe('aggregate — coverage model', () => {
  it('earns each dimension base from met expectation weight', () => {
    const result = aggregate(
      [
        coverageArtifact([
          coverageEntry({ expectationId: 'a', met: true, weight: 2 }),
          coverageEntry({ expectationId: 'b', met: false, weight: 2 }),
        ]),
      ],
      DEFAULT_PROFILE,
    );
    expect(result.dimensionScores.reliability).toBe(50);
    // A dimension the prompt demands nothing of stays at par.
    expect(result.dimensionScores.hygiene).toBe(100);
  });

  it('decays stacked violations instead of flooring the dimension', () => {
    const result = aggregate(
      [
        findingsArtifact([
          finding({ ruleId: 'a.one' }),
          finding({ ruleId: 'b.two' }),
          finding({ ruleId: 'c.three' }),
        ]),
      ],
      DEFAULT_PROFILE,
    );
    // 100 − (35 + 35·0.7 + 35·0.49) = 23.35 → 23.3 — the third critical still hurts.
    expect(result.dimensionScores.reliability).toBe(23.3);
  });

  it('suppresses a rule finding when its paired expectation is unmet', () => {
    const gateway = finding({
      ruleId: 'security.no-gateway',
      dimension: 'security',
      severity: 'high',
    });
    const unmetDoor = coverageArtifact([
      coverageEntry({
        expectationId: 'exp.fst.edge-front-door',
        dimension: 'security',
        met: false,
      }),
    ]);
    const metDoor = coverageArtifact([
      coverageEntry({ expectationId: 'exp.fst.edge-front-door', dimension: 'security', met: true }),
    ]);

    const suppressed = aggregate([findingsArtifact([gateway]), unmetDoor], DEFAULT_PROFILE);
    expect(suppressed.findings).toEqual([]);

    const kept = aggregate([findingsArtifact([gateway]), metDoor], DEFAULT_PROFILE);
    expect(kept.findings.map((f) => f.ruleId)).toEqual(['security.no-gateway']);
  });

  it('caps the grade on critical findings no matter the numeric score', () => {
    const one = aggregate([findingsArtifact([finding({ dimension: 'hygiene' })])], DEFAULT_PROFILE);
    expect(one.overallScore).toBe(98.3);
    expect(one.bandGrade).toBe('A');
    expect(one.grade).toBe('C');
    expect(one.capApplied).toEqual({ severity: 'critical', count: 1, maxGrade: 'C' });

    const two = aggregate(
      [
        findingsArtifact([
          finding({ dimension: 'hygiene', ruleId: 'a.one' }),
          finding({ dimension: 'hygiene', ruleId: 'b.two' }),
        ]),
      ],
      DEFAULT_PROFILE,
    );
    expect(two.grade).toBe('D');
    expect(two.capApplied?.count).toBe(2);

    // A grade already at or below the cap reports no cap at all.
    const alreadyLow = aggregate(
      [
        coverageArtifact([coverageEntry({ expectationId: 'exp.unpaired', met: false })]),
        findingsArtifact([finding({ ruleId: 'reliability.unpaired' })]),
      ],
      DEFAULT_PROFILE,
    );
    expect(alreadyLow.bandGrade).toBe('C');
    expect(alreadyLow.grade).toBe('C');
    expect(alreadyLow.capApplied).toBeNull();
  });
});
