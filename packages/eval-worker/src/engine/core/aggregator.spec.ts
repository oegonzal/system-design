import { describe, expect, it } from 'vitest';

import { EVAL_DIMENSIONS, type Severity } from '@sysdesign/contracts';

import { DEFAULT_PROFILE } from '../profiles/default.profile';
import { aggregate } from './aggregator';
import type {
  AxisArtifact,
  CoverageArtifact,
  EngineFinding,
  EvidenceArtifact,
  ScenarioArtifact,
} from './artifacts';

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

/** One met expectation per dimension — a prompt that assesses everything. */
function fullCoverage(): EvidenceArtifact {
  return coverageArtifact(
    EVAL_DIMENSIONS.map((dimension) =>
      coverageEntry({ expectationId: `exp.test.${dimension}`, dimension, weight: 1, met: true }),
    ),
  );
}

describe('aggregate', () => {
  it('is order-independent: shuffled artifacts deep-equal', () => {
    const a = findingsArtifact([finding({ ruleId: 'security.no-gateway', dimension: 'security' })]);
    const b = findingsArtifact([
      finding(),
      finding({ ruleId: 'hygiene.orphan-node', dimension: 'hygiene', severity: 'info' }),
    ]);
    expect(aggregate([a, b], DEFAULT_PROFILE)).toEqual(aggregate([b, a], DEFAULT_PROFILE));
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
      DEFAULT_PROFILE,
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

    const without = aggregate(base, DEFAULT_PROFILE);
    const withLlm = aggregate([...base, axis, scenarios], DEFAULT_PROFILE);

    expect(withLlm.dimensionScores).toEqual(without.dimensionScores);
    expect(withLlm.overallScore).toBe(without.overallScore);
    expect(withLlm.grade).toBe(without.grade);
    expect(withLlm.summary).toBe(without.summary);
    // …but the artifacts ride along for display and audit.
    expect(withLlm.axes).toEqual([axis]);
    expect(withLlm.scenarios).toEqual(scenarios);
  });

  it('collects annotations and diagnostics without scoring them', () => {
    const result = aggregate(
      [
        coverageArtifact([coverageEntry({ expectationId: 'a', dimension: 'data', met: true })]),
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
      DEFAULT_PROFILE,
    );
    expect(result.dimensionScores.data).toBe(100);
    expect(result.overallScore).toBe(100);
    expect(result.annotations?.summary).toBe('A model opinion.');
    expect(result.diagnostics).toHaveLength(1);
  });
});

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
    // A dimension nothing examined is not assessed — never a free 100.
    expect(result.dimensionScores.hygiene).toBeNull();
  });

  it('scores an uncovered dimension null and excludes it from the overall', () => {
    const result = aggregate(
      [coverageArtifact([coverageEntry({ expectationId: 'a', met: true, weight: 2 })])],
      DEFAULT_PROFILE,
    );
    expect(result.dimensionScores.reliability).toBe(100);
    for (const dimension of EVAL_DIMENSIONS.filter((d) => d !== 'reliability')) {
      expect(result.dimensionScores[dimension]).toBeNull();
    }
    // Weights renormalize over covered dimensions: 100, not 100 × 0.2.
    expect(result.overallScore).toBe(100);
  });

  it('treats a violation-only dimension as covered', () => {
    const result = aggregate(
      [
        findingsArtifact([
          finding({ ruleId: 'security.no-rate-limit', dimension: 'security', severity: 'high' }),
        ]),
      ],
      DEFAULT_PROFILE,
    );
    expect(result.dimensionScores.security).toBe(78);
    expect(result.dimensionScores.reliability).toBeNull();
    expect(result.overallScore).toBe(78);
  });

  it('grades 0 when no dimension is covered at all', () => {
    const result = aggregate([], DEFAULT_PROFILE);
    for (const dimension of EVAL_DIMENSIONS) {
      expect(result.dimensionScores[dimension]).toBeNull();
    }
    expect(result.overallScore).toBe(0);
    expect(result.grade).toBe('F');
    expect(result.summary).toContain('No dimension was assessed');
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
    const one = aggregate(
      [fullCoverage(), findingsArtifact([finding({ dimension: 'hygiene' })])],
      DEFAULT_PROFILE,
    );
    expect(one.overallScore).toBe(98.4);
    expect(one.bandGrade).toBe('A');
    expect(one.grade).toBe('C');
    expect(one.capApplied).toEqual({ severity: 'critical', count: 1, maxGrade: 'C' });

    const two = aggregate(
      [
        fullCoverage(),
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
    // Two zeroed dimensions: with communication in the rubric, reliability
    // alone (weight .18) leaves the numeric grade at 82/B — above the cap.
    const zeroed = new Set(['reliability', 'performance']);
    const alreadyLow = aggregate(
      [
        coverageArtifact([
          coverageEntry({ expectationId: 'exp.unpaired', met: false }),
          coverageEntry({
            expectationId: 'exp.test.performance-unmet',
            dimension: 'performance',
            weight: 1,
            met: false,
          }),
          ...EVAL_DIMENSIONS.filter((dimension) => !zeroed.has(dimension)).map((dimension) =>
            coverageEntry({
              expectationId: `exp.test.${dimension}`,
              dimension,
              weight: 1,
              met: true,
            }),
          ),
        ]),
        findingsArtifact([finding({ ruleId: 'reliability.unpaired' })]),
      ],
      DEFAULT_PROFILE,
    );
    expect(alreadyLow.bandGrade).toBe('C');
    expect(alreadyLow.grade).toBe('C');
    expect(alreadyLow.capApplied).toBeNull();
  });
});
