import { describe, expect, it } from 'vitest';

import { EVAL_DIMENSIONS, type Severity } from '@sysdesign/contracts';

import { DEFAULT_PROFILE } from '../profiles/default.profile';
import { aggregate } from './aggregator';
import type {
  AxisArtifact,
  CoverageArtifact,
  EngineFinding,
  EvidenceArtifact,
  GradedEvidenceArtifact,
  GradedEvidenceItem,
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

function gradedItem(overrides: Partial<GradedEvidenceItem> = {}): GradedEvidenceItem {
  return {
    dimension: 'reliability',
    level: 'high',
    confidence: 'high',
    severity: 'high',
    requirementId: 'ohi-con-no-dupes',
    affectedNodeIds: ['n-3'],
    rationale: 'The write path has no idempotency guard, so a retried checkout double-writes.',
    suggestion: null,
    ...overrides,
  };
}

function gradedArtifact(items: GradedEvidenceItem[], lens = 'critic'): GradedEvidenceArtifact {
  return { passId: 'llm.critic', kind: 'graded-evidence', lens, items, summary: null, model: 'm' };
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
      factors: null,
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

  it('merges annotation artifacts: findings concatenate, the first summary and model win', () => {
    const criticFinding = {
      dimension: 'data' as const,
      severity: 'high' as const,
      title: 'Consistency trap',
      message: 'The cache and database can disagree about inventory.',
      affectedNodeIds: [],
    };
    const narrativeFinding = {
      dimension: 'explanation' as const,
      severity: 'medium' as const,
      title: 'The story caches reads the diagram never draws',
      message: '"reads are cached" — no cache node exists.',
      affectedNodeIds: ['n-2'],
    };
    const result = aggregate(
      [
        {
          passId: 'llm.critic',
          kind: 'annotations',
          findings: [criticFinding],
          summary: 'The general critic speaks first.',
          model: 'claude-sonnet-5',
        },
        {
          passId: 'llm.narrative',
          kind: 'annotations',
          findings: [narrativeFinding],
          summary: null,
          model: 'claude-sonnet-5',
        },
      ],
      DEFAULT_PROFILE,
    );
    expect(result.annotations?.findings).toEqual([criticFinding, narrativeFinding]);
    expect(result.annotations?.summary).toBe('The general critic speaks first.');
    expect(result.annotations?.passId).toBe('llm.critic');
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
    // 100 − 35×hygiene(.0405) = 98.5825 → 98.6 (was 98.4 before the product
    // dimension shrank hygiene's slice — re-pinned with the 3.1.0 rescale).
    expect(one.overallScore).toBe(98.6);
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
    // Two zeroed dimensions: reliability alone (weight .162) leaves the
    // numeric grade at 83.8/B — above the cap.
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

/**
 * The ledger behind the number. None of this was recoverable from the result:
 * `findings` is re-sorted without a severity term, so the decay position each
 * penalty was charged at existed only inside the loop that applied it, and a
 * suppressed finding left no trace of having been suppressed at all.
 */
describe('aggregate — scoring trace', () => {
  it('records each penalty at the decay position it was actually charged at', () => {
    const result = aggregate(
      [
        findingsArtifact([
          // Deliberately not in penalty order, and `findings` will not end up
          // in penalty order either — only the trace knows.
          finding({ ruleId: 'z.low', severity: 'low' }),
          finding({ ruleId: 'a.high', severity: 'high' }),
          finding({ ruleId: 'm.critical', severity: 'critical' }),
        ]),
      ],
      DEFAULT_PROFILE,
    );

    const reliability = result.trace.dimensions.find((d) => d.dimension === 'reliability');
    expect(reliability?.penalties.map((p) => [p.position, p.ruleId, p.points])).toEqual([
      [0, 'm.critical', 35],
      [1, 'a.high', 22 * 0.7 ** 1],
      [2, 'z.low', 4 * 0.7 ** 2],
    ]);

    // The result's own order is different — which is exactly why position
    // cannot be read off it.
    expect(result.findings.map((f) => f.ruleId)).toEqual(['a.high', 'm.critical', 'z.low']);
  });

  it('reproduces the dimension score from base minus the recorded penalties', () => {
    const result = aggregate(
      [
        coverageArtifact([
          coverageEntry({ expectationId: 'a', met: true, weight: 3 }),
          coverageEntry({ expectationId: 'b', met: false, weight: 1 }),
        ]),
        findingsArtifact([finding({ severity: 'high' }), finding({ ruleId: 'b.two' })]),
      ],
      DEFAULT_PROFILE,
    );

    const reliability = result.trace.dimensions.find((d) => d.dimension === 'reliability');
    expect(reliability?.base).toBe(75);
    const charged = (reliability?.penalties ?? []).reduce((sum, p) => sum + p.points, 0);
    expect(Math.round(Math.max(0, (reliability?.base ?? 0) - charged) * 10) / 10).toBe(
      result.dimensionScores.reliability,
    );
  });

  it('reproduces the overall from the recorded weights', () => {
    const result = aggregate(
      [
        coverageArtifact([
          coverageEntry({ expectationId: 'a', dimension: 'reliability', met: true, weight: 1 }),
          coverageEntry({ expectationId: 'b', dimension: 'security', met: false, weight: 1 }),
        ]),
      ],
      DEFAULT_PROFILE,
    );

    const assessed = result.trace.dimensions.filter((d) => d.score !== null);
    expect(assessed.map((d) => d.dimension)).toEqual(['reliability', 'security']);
    expect(result.trace.weightSum).toBeCloseTo(
      assessed.reduce((sum, d) => sum + (d.weight ?? 0), 0),
      10,
    );
    expect(Math.round((result.trace.weightedTotal / result.trace.weightSum) * 10) / 10).toBe(
      result.overallScore,
    );
  });

  it('names the suppression that fired and what it silenced', () => {
    const result = aggregate(
      [
        findingsArtifact([
          finding({ ruleId: 'security.no-gateway', dimension: 'security', severity: 'high' }),
        ]),
        coverageArtifact([
          coverageEntry({
            expectationId: 'exp.fst.edge-front-door',
            dimension: 'security',
            met: false,
          }),
        ]),
      ],
      DEFAULT_PROFILE,
    );

    expect(result.findings).toEqual([]);
    expect(result.trace.suppressions).toEqual([
      {
        ruleId: 'security.no-gateway',
        whenExpectationUnmet: 'exp.fst.edge-front-door',
        droppedTitle: 'Single database with no replica',
      },
    ]);
  });

  it('lists every cap the policy evaluated, not only the one that bound', () => {
    const result = aggregate(
      [fullCoverage(), findingsArtifact([finding({ dimension: 'hygiene' })])],
      DEFAULT_PROFILE,
    );

    expect(result.trace.caps.length).toBe(DEFAULT_PROFILE.scoring.gradeCaps.length);
    expect(result.trace.caps.filter((cap) => cap.binding)).toHaveLength(1);
    // A cap that did not bind still reports what it counted — the thing that
    // vanished entirely before.
    expect(result.trace.caps.every((cap) => typeof cap.count === 'number')).toBe(true);
  });

  it('marks no cap binding when the band grade is already at or below it', () => {
    const result = aggregate([findingsArtifact([finding({ severity: 'high' })])], DEFAULT_PROFILE);
    expect(result.capApplied).toBeNull();
    expect(result.trace.caps.some((cap) => cap.binding)).toBe(false);
  });

  it('leaves an unassessed dimension null throughout the ledger', () => {
    const result = aggregate(
      [coverageArtifact([coverageEntry({ expectationId: 'a', met: true, weight: 1 })])],
      DEFAULT_PROFILE,
    );
    const hygiene = result.trace.dimensions.find((d) => d.dimension === 'hygiene');
    expect(hygiene).toMatchObject({ entries: 0, base: null, score: null, weight: null });
    expect(hygiene?.penalties).toEqual([]);
  });
});

/**
 * The graded path: a critic/evaluator lens's grounded ordinal evidence subtracts
 * from a dimension through a generic, bounded, weakness-only scorer — the ONE way
 * an LLM lens moves the deterministic score, and only downward. [EVAL-16]
 */
describe('aggregate — graded evidence', () => {
  const oneReliability = coverageArtifact([
    coverageEntry({ expectationId: 'a', dimension: 'reliability', met: true, weight: 1 }),
  ]);

  it('[EVAL-16] a single high/high weakness lowers its dimension by the per-item price', () => {
    const result = aggregate([oneReliability, gradedArtifact([gradedItem()])], DEFAULT_PROFILE);
    // base 100 − 8 (maxPointsPerItem × w(high) × w(high) × decay^0) = 92.
    expect(result.dimensionScores.reliability).toBe(92);
    expect(result.overallScore).toBe(92);
  });

  it('scales the price by BOTH the weakness magnitude and the lens confidence', () => {
    const result = aggregate(
      [oneReliability, gradedArtifact([gradedItem({ level: 'medium', confidence: 'low' })])],
      DEFAULT_PROFILE,
    );
    // 100 − 8 × 0.67 × 0.33 = 98.2312 → 98.2. A hedged, low-magnitude call barely counts.
    expect(result.dimensionScores.reliability).toBe(98.2);
  });

  it('charges stacked weaknesses worst-first with geometric decay', () => {
    const result = aggregate(
      [
        oneReliability,
        gradedArtifact([
          gradedItem({ requirementId: 'r-1' }),
          gradedItem({ requirementId: 'r-2' }),
        ]),
      ],
      DEFAULT_PROFILE,
    );
    // 100 − (8 + 8×0.7) = 86.4.
    expect(result.dimensionScores.reliability).toBe(86.4);
  });

  it('clamps a dimension to maxPenaltyPerDimension no matter how many weaknesses stack', () => {
    const many = Array.from({ length: 5 }, (_unused, index) =>
      gradedItem({ requirementId: `r-${index}` }),
    );
    const result = aggregate([oneReliability, gradedArtifact(many)], DEFAULT_PROFILE);
    // Undecayed the five would subtract >22; the per-dimension clamp holds it to 20.
    expect(result.dimensionScores.reliability).toBe(80);
    const reliability = result.trace.dimensions.find((d) => d.dimension === 'reliability');
    const charged = (reliability?.gradedPenalties ?? []).reduce((sum, p) => sum + p.points, 0);
    // The clamp is distributed pro rata, so the recorded points sum to the actual subtraction.
    expect(charged).toBeCloseTo(20, 6);
  });

  it('is weakness-only: evidence never lifts an unassessed dimension out of null', () => {
    // hygiene has no deterministic baseline; a lens must not decide it was assessed.
    const result = aggregate(
      [oneReliability, gradedArtifact([gradedItem({ dimension: 'hygiene' })])],
      DEFAULT_PROFILE,
    );
    expect(result.dimensionScores.hygiene).toBeNull();
    expect(result.dimensionScores.reliability).toBe(100);
    expect(result.overallScore).toBe(100);
  });

  it("'none' items and an empty evidence set leave the result byte-identical to baseline", () => {
    const baseline = aggregate([oneReliability], DEFAULT_PROFILE);
    expect(aggregate([oneReliability, gradedArtifact([])], DEFAULT_PROFILE)).toEqual(baseline);
    const inert = aggregate(
      [oneReliability, gradedArtifact([gradedItem({ level: 'none', confidence: 'none' })])],
      DEFAULT_PROFILE,
    );
    expect(inert.dimensionScores).toEqual(baseline.dimensionScores);
    expect(inert.overallScore).toBe(baseline.overallScore);
    expect(inert.grade).toBe(baseline.grade);
  });

  it('records each graded subtraction in the trace, grounded and attributed', () => {
    const result = aggregate([oneReliability, gradedArtifact([gradedItem()])], DEFAULT_PROFILE);
    const reliability = result.trace.dimensions.find((d) => d.dimension === 'reliability');
    expect(reliability?.gradedPenalties).toEqual([
      {
        position: 0,
        lens: 'critic',
        level: 'high',
        confidence: 'high',
        requirementId: 'ohi-con-no-dupes',
        affectedNodeIds: ['n-3'],
        listPoints: 8,
        points: 8,
      },
    ]);
  });

  it('never touches a letter cap — caps read deterministic evidence only', () => {
    // A pile of graded weaknesses tanks the number but cannot cap the grade the
    // way a single deterministic critical does.
    const many = Array.from({ length: 5 }, (_unused, index) =>
      gradedItem({ requirementId: `r-${index}` }),
    );
    const result = aggregate([oneReliability, gradedArtifact(many)], DEFAULT_PROFILE);
    expect(result.capApplied).toBeNull();
    expect(result.trace.caps.some((cap) => cap.binding)).toBe(false);
  });
});

/**
 * A teaching tool that overclaims at full marks teaches the wrong lesson. The
 * summary used to say a clean run "covers the load-bearing concerns for this
 * prompt", which asserts something the engine cannot know.
 */
describe('aggregate — the summary does not overclaim', () => {
  it('says nothing it checks is missing, not that the design is good', () => {
    const result = aggregate([fullCoverage()], DEFAULT_PROFILE);

    expect(result.overallScore).toBe(100);
    expect(result.summary).toContain('Nothing this rubric checks is missing');
    expect(result.summary).not.toContain('covers the load-bearing concerns');
    // …and it names the edge of the map rather than leaving it implied.
    expect(result.summary).toMatch(/cost|rollout|outside what this can see/i);
  });
});
