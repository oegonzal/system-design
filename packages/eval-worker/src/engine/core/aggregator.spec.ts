import { describe, expect, it } from 'vitest';

import type { Severity } from '@sysdesign/contracts';

import { LEGACY_PROFILE } from '../profiles/legacy.profile';
import { aggregate } from './aggregator';
import type { AxisArtifact, EngineFinding, EvidenceArtifact, ScenarioArtifact } from './artifacts';

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

  it('never lets axis or scenario artifacts move the score', () => {
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
