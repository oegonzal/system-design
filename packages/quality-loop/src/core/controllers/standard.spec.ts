import { describe, expect, it } from 'vitest';

import type { ConfirmedFinding, QualityControlDecision } from '@sysdesign/contracts';
import { confirmed, evidence, ledger, tinyPolicy } from '../testing';
import { STANDARD } from './index';

const decide = STANDARD.decide;

const dimensionOf = (decision: QualityControlDecision, name: string) => {
  const trace = decision.trace.dimensions.find((candidate) => candidate.dimension === name);
  if (!trace) throw new Error(`no dimension ${name}`);
  return trace;
};

const steps = (decision: QualityControlDecision) =>
  decision.trace.steps.map((step) => `${step.factor}:${step.outcome}`);

describe('the standard controller', () => {
  it('[QL-8] consults the doctrine’s factors in the doctrine’s order, and says so', () => {
    expect(STANDARD.summary).toEqual({
      id: 'standard',
      steps: [
        { factor: 'artifact' },
        { factor: 'validators' },
        { factor: 'evidence' },
        { factor: 'policy-allowed' },
        { factor: 'accept-threshold' },
        { factor: 'reject-floor' },
        { factor: 'route' },
      ],
    });
  });

  it('[QL-6] prices criteria and findings from the policy alone, renormalising unassessed dimensions out', () => {
    const decision = decide(
      ledger({
        criteria: [
          evidence({ criterionId: 'c1' }),
          evidence({ criterionId: 'c2', result: 'fail' }),
        ],
        findings: [
          confirmed({}),
          confirmed({ key: 'gap|part.1', severity: 'low', locationRefs: ['part.1'] }),
        ],
      }),
      tinyPolicy(),
    );
    const substance = dimensionOf(decision, 'substance');
    expect(substance.base).toBe(50);
    // medium×high = 12, then low×high = 5 decayed by 0.7 → 3.5
    expect(substance.penalties.map((penalty) => penalty.points)).toEqual([12, 3.5]);
    expect(substance.score).toBe(34.5);
    expect(decision.scores.dimensions['form']).toBeNull();
    expect(decision.scores.overall).toBe(34.5);
    expect(decision.trace.weightSum).toBe(0.6);
  });

  it('[QL-6] a findings-only dimension starts at 100; unassessed criteria earn nothing; reconciled findings are not priced', () => {
    const decision = decide(
      ledger({
        criteria: [
          evidence({ criterionId: 'c1', result: 'unassessed', hits: 0, confidence: null }),
          evidence({ criterionId: 'c2', result: 'fail' }),
        ],
        findings: [
          confirmed({ type: 'wrong', key: 'wrong|text' }),
          confirmed({ reconciledTo: 'c2' }),
        ],
      }),
      { ...tinyPolicy(), evidence: { minHits: 1, minAssessedShare: 0 } },
    );
    expect(decision.scores.dimensions['substance']).toBe(0);
    expect(decision.scores.dimensions['form']).toBe(88);
    expect(dimensionOf(decision, 'substance').penalties).toEqual([]);
  });

  it('[QL-6] clamps a dimension’s penalties pro rata so the trace sums to what was subtracted', () => {
    const findings = ['a', 'b', 'c'].map((suffix) =>
      confirmed({ key: `gap|${suffix}`, severity: 'critical', locationRefs: [suffix] }),
    );
    const policy = { ...tinyPolicy(), blockingSeverities: [] as never[] };
    const decision = decide(ledger({ criteria: [evidence({})], findings }), policy);
    const substance = dimensionOf(decision, 'substance');
    // 40 + 28 + 19.6 = 87.6 → clamped to 60
    expect(substance.penaltyTotal).toBe(60);
    expect(substance.penalties.reduce((sum, penalty) => sum + penalty.points, 0)).toBeCloseTo(
      60,
      0,
    );
    expect(substance.score).toBe(40);
  });

  it('[QL-8] gates fire in order, each step is traced, and later steps are skipped', () => {
    const noArtifact = decide(ledger({ artifactPresent: false }), tinyPolicy());
    expect(noArtifact.finalDecision).toBe('escalate');
    expect(steps(noArtifact)).toEqual([
      'scores:computed',
      'artifact:decided',
      'validators:skipped',
      'evidence:skipped',
      'policy-allowed:skipped',
      'accept-threshold:skipped',
      'reject-floor:skipped',
      'route:skipped',
    ]);

    const blocked = decide(
      ledger({
        validation: [
          {
            validatorId: 'schema',
            gate: 'block',
            problems: [{ severity: 'critical', locationRefs: [], message: 'bad' }],
          },
        ],
      }),
      tinyPolicy(),
    );
    expect(blocked.finalDecision).toBe('retry');
    expect(blocked.gates.validatorsPassed).toBe(false);

    const noCriteria = decide(ledger({}), tinyPolicy());
    expect(noCriteria.finalDecision).toBe('escalate');
    expect(noCriteria.gates.evidenceSufficient).toBe(false);
  });

  it('[QL-8] a deciding gate records what it decided on as data: the numbers it compared, the ids it named', () => {
    const policy = tinyPolicy();
    const decidedOn = (decision: QualityControlDecision) =>
      decision.trace.steps.find((step) => step.outcome === 'decided')?.facts;
    const perfect = [evidence({})];

    expect(decidedOn(decide(ledger({ criteria: perfect }), policy))).toEqual({
      overall: 100,
      acceptAt: 80,
    });
    expect(decidedOn(decide(ledger({ criteria: [evidence({ result: 'fail' })] }), policy))).toEqual(
      { overall: 0, floor: 35 },
    );
    expect(
      decidedOn(
        decide(
          ledger({ criteria: perfect, findings: [confirmed({ severity: 'critical' })] }),
          policy,
        ),
      ),
    ).toEqual({ findings: ['gap|text'], criteria: [] });
    expect(
      decidedOn(
        decide(
          ledger({
            validation: [
              {
                validatorId: 'schema',
                gate: 'block',
                problems: [{ severity: 'critical', locationRefs: [], message: 'bad' }],
              },
            ],
          }),
          policy,
        ),
      ),
    ).toEqual({ validators: ['schema'] });

    // The route's basis is the remediations it selected, already on the decision;
    // a step that passed or was skipped decided nothing.
    const routed = decide(
      ledger({
        criteria: [...perfect, evidence({ criterionId: 'c2', kind: 'nice', result: 'partial' })],
        findings: [confirmed({ type: 'wrong', key: 'wrong|text' })],
      }),
      policy,
    );
    expect(routed.trace.steps.find((step) => step.outcome === 'decided')?.factor).toBe('route');
    expect(decidedOn(routed)).toBeUndefined();
    expect(routed.trace.steps.filter((step) => step.facts !== undefined)).toEqual([]);
  });

  it('[QL-8] a blocking finding never accepts and routes by fixability', () => {
    const perfect = [evidence({ criterionId: 'c1' })];
    const route = (fixability: ConfirmedFinding['fixability']) =>
      decide(
        ledger({ criteria: perfect, findings: [confirmed({ severity: 'critical', fixability })] }),
        tinyPolicy(),
      ).finalDecision;
    expect(route('fixable_local')).toBe('revise');
    expect(route('requires_retry')).toBe('retry');
    expect(route('requires_user')).toBe('escalate');
    expect(route('unfixable')).toBe('reject');

    const gatedKind = {
      ...tinyPolicy(),
      criterionKinds: {
        ...tinyPolicy().criterionKinds,
        must: { dimension: 'substance', weight: 1, gate: true },
      },
    };
    expect(
      decide(ledger({ criteria: [evidence({ result: 'fail' })] }), gatedKind).finalDecision,
    ).toBe('revise');
    const gatedType = {
      ...tinyPolicy(),
      findingTypes: { ...tinyPolicy().findingTypes, wrong: { dimension: 'form', gate: true } },
    };
    expect(
      decide(
        ledger({ criteria: perfect, findings: [confirmed({ type: 'wrong', key: 'wrong|text' })] }),
        gatedType,
      ).gates.policyAllowed,
    ).toBe(false);
  });

  it('[QL-8] thresholds: accept at or above acceptAt, retry below the floor, else route by remediations', () => {
    expect(decide(ledger({ criteria: [evidence({})] }), tinyPolicy()).finalDecision).toBe('accept');
    expect(
      decide(ledger({ criteria: [evidence({ result: 'fail' })] }), tinyPolicy()).finalDecision,
    ).toBe('retry');
    const middling = ledger({
      criteria: [evidence({}), evidence({ criterionId: 'c2', kind: 'nice', result: 'partial' })],
    });
    const routed = decide(middling, tinyPolicy());
    expect(routed.scores.overall).toBe(80);
    expect(routed.finalDecision).toBe('accept');
    const lower = decide(
      {
        ...middling,
        findings: [confirmed({ type: 'wrong', key: 'wrong|text', fixability: 'requires_retry' })],
      },
      tinyPolicy(),
    );
    expect(lower.finalDecision).toBe('revise');
    // Equal severity: ordered by subject key, so the criterion shortfall precedes the finding.
    expect(lower.selectedRemediations.map((remediation) => remediation.action)).toEqual([
      'revise',
      'retry',
    ]);
    const stuck = decide(
      {
        ...middling,
        findings: [
          confirmed({
            type: 'wrong',
            key: 'wrong|text',
            fixability: 'requires_user',
            severity: 'high',
          }),
        ],
      },
      tinyPolicy(),
    );
    expect(stuck.selectedRemediations).toHaveLength(1);
  });

  it('[QL-7] is a pure function: the same ledger decides byte-identically', () => {
    const input = ledger({
      criteria: [evidence({}), evidence({ criterionId: 'c2', kind: 'nice', result: 'partial' })],
      findings: [confirmed({})],
    });
    expect(JSON.stringify(decide(input, tinyPolicy()))).toBe(
      JSON.stringify(decide(input, tinyPolicy())),
    );
  });
});
