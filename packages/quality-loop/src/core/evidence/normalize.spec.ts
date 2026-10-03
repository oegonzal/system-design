import { describe, expect, it } from 'vitest';

import type { EvaluationReport } from '@sysdesign/contracts';
import { STANDARD } from '../controllers';
import { findingKey } from './identity';
import { normalize, type NormalizeInput } from './normalize';
import {
  criterion,
  finding,
  reported,
  result,
  tinyPipeline,
  tinyPolicy,
  type TinyOutput,
} from '../testing';

const contract = {
  ...tinyPipeline().task,
  goal: 'g',
  criteria: [criterion('c1'), criterion('c2', 'nice')],
};
const locations = [
  { id: 'text', label: 'Text' },
  { id: 'part.1', label: 'one' },
];

const input = (
  overrides: Partial<NormalizeInput<TinyOutput>> = {},
): NormalizeInput<TinyOutput> => ({
  contract,
  artifactPresent: true,
  locations,
  validation: [],
  critics: [],
  evaluators: [],
  diagnostics: [],
  ...overrides,
});

const critic = (sample: number, ...findings: ReturnType<typeof finding>[]) =>
  reported({ criticId: 'critic.tiny', sample, findings });
const evaluation = (
  sample: number,
  results: ReturnType<typeof result>[],
  advisoryVerdict: EvaluationReport['advisoryVerdict'] = null,
) => reported({ evaluatorId: 'evaluator.tiny', sample, results, advisoryVerdict });

describe('normalize', () => {
  it('[QL-4] drops an unknown finding type, and strips unknown refs while keeping the item', () => {
    const ledger = normalize(
      input({
        critics: [
          critic(
            1,
            finding({ type: 'style' }),
            finding({ locationRefs: ['text', 'ghost'], criterionIds: ['c1', 'c9'] }),
          ),
        ],
      }),
      tinyPolicy(),
    );
    expect(ledger.discarded).toEqual([
      expect.objectContaining({ lens: 'critic.tiny', reason: 'inadmissible' }),
    ]);
    expect(ledger.findings).toHaveLength(1);
    expect(ledger.findings[0]).toMatchObject({ locationRefs: ['text'], criterionIds: ['c1'] });
  });

  it('[QL-5] confirms only what recurs in enough samples, merging ordinals by a conservative median', () => {
    const policy = {
      ...tinyPolicy(),
      evidence: { ...tinyPolicy().evidence, minHits: 2, minAssessedShare: 1 },
    };
    const ledger = normalize(
      input({
        critics: [
          critic(
            1,
            finding({ severity: 'high', confidence: 'high' }),
            finding({ locationRefs: ['part.1'] }),
          ),
          critic(2, finding({ severity: 'medium', confidence: 'medium' })),
        ],
      }),
      policy,
    );
    expect(ledger.findings).toHaveLength(1);
    expect(ledger.findings[0]).toMatchObject({
      key: findingKey('gap', ['text']),
      hits: 2,
      severity: 'medium',
      confidence: 'medium',
    });
    expect(ledger.discarded).toEqual([
      expect.objectContaining({ key: findingKey('gap', ['part.1']), reason: 'below-min-hits' }),
    ]);
  });

  it('[QL-5] reconciles a finding to the failed criterion it names, never to a passing one', () => {
    const ledger = normalize(
      input({
        critics: [
          critic(
            1,
            finding({ criterionIds: ['c1'] }),
            finding({ type: 'wrong', criterionIds: ['c2'] }),
          ),
        ],
        evaluators: [
          evaluation(1, [
            result({ criterionId: 'c1', result: 'fail' }),
            result({ criterionId: 'c2', result: 'pass' }),
          ]),
        ],
      }),
      tinyPolicy(),
    );
    const byType = Object.fromEntries(
      ledger.findings.map((item) => [item.type, item.reconciledTo]),
    );
    expect(byType).toEqual({ gap: 'c1', wrong: null });
  });

  it('[QL-5] a criterion its judge never returned is unassessed; a tie resolves against the claim', () => {
    const ledger = normalize(
      input({
        evaluators: [
          evaluation(1, [result({ criterionId: 'c1', result: 'pass' })]),
          evaluation(2, [result({ criterionId: 'c1', result: 'fail', confidence: 'low' })]),
        ],
      }),
      tinyPolicy(),
    );
    expect(ledger.criteria).toEqual([
      expect.objectContaining({ criterionId: 'c1', result: 'fail', hits: 2, confidence: 'low' }),
      expect.objectContaining({
        criterionId: 'c2',
        result: 'unassessed',
        hits: 0,
        confidence: null,
      }),
    ]);
  });

  it('[QL-5] merges the same finding from two critics: hits add up and both lenses are named', () => {
    const ledger = normalize(
      input({
        critics: [
          critic(1, finding()),
          reported({
            criticId: 'critic.other',
            sample: 1,
            findings: [finding({ severity: 'high' })],
          }),
        ],
      }),
      tinyPolicy(),
    );
    expect(ledger.findings).toEqual([
      expect.objectContaining({
        hits: 2,
        lenses: ['critic.tiny', 'critic.other'],
        severity: 'medium',
      }),
    ]);
  });

  it('[QL-5] two samples that cite overlapping evidence confirm one defect, not two singletons', () => {
    const policy = {
      ...tinyPolicy(),
      evidence: { ...tinyPolicy().evidence, minHits: 2, minAssessedShare: 1 },
    };
    const ledger = normalize(
      input({
        locations: [
          { id: 'text', label: 'Text' },
          { id: 'part.1', label: 'one' },
          { id: 'part.2', label: 'two' },
        ],
        critics: [
          critic(1, finding({ locationRefs: ['text', 'part.1'] })),
          critic(2, finding({ locationRefs: ['part.1', 'part.2'] })),
        ],
      }),
      policy,
    );
    // Identical sets were once required, so this pair used to be discarded twice.
    expect(ledger.discarded).toEqual([]);
    expect(ledger.findings).toHaveLength(1);
    expect(ledger.findings[0]).toMatchObject({
      hits: 2,
      locationRefs: ['part.1', 'part.2', 'text'],
    });
  });

  it('[QL-5] sharing a location is not enough: a different type is a different defect', () => {
    const ledger = normalize(
      input({
        critics: [
          critic(1, finding({ type: 'gap' }), finding({ type: 'wrong' })),
          critic(2, finding({ type: 'gap' }), finding({ type: 'wrong' })),
        ],
      }),
      { ...tinyPolicy(), evidence: { ...tinyPolicy().evidence, minHits: 2, minAssessedShare: 1 } },
    );
    expect(ledger.findings.map((item) => item.type).sort()).toEqual(['gap', 'wrong']);
  });

  it('[QL-5] agreement is still within one lens: two lenses seeing it once each is not agreement', () => {
    const ledger = normalize(
      input({
        critics: [
          critic(1, finding()),
          reported({ criticId: 'critic.other', sample: 1, findings: [finding()] }),
        ],
      }),
      { ...tinyPolicy(), evidence: { ...tinyPolicy().evidence, minHits: 2, minAssessedShare: 1 } },
    );
    expect(ledger.findings).toEqual([]);
    expect(ledger.discarded.map((item) => item.lens).sort()).toEqual([
      'critic.other',
      'critic.tiny',
    ]);
  });

  it('[QL-5] grouping is a function of the findings, not of the order they arrived in', () => {
    const locations = [
      { id: 'text', label: 'Text' },
      { id: 'part.1', label: 'one' },
      { id: 'part.2', label: 'two' },
    ];
    const one = finding({ locationRefs: ['text', 'part.1'] });
    const two = finding({ locationRefs: ['part.1', 'part.2'] });
    const three = finding({ locationRefs: ['part.2'] });
    const forward = normalize(
      input({ locations, critics: [critic(1, one, two), critic(2, three)] }),
      tinyPolicy(),
    );
    const backward = normalize(
      input({ locations, critics: [critic(2, three), critic(1, two, one)] }),
      tinyPolicy(),
    );
    expect(forward.findings).toEqual(backward.findings);
  });

  it('[QL-7] the advisory verdict never reaches the ledger, so flipping it cannot move the decision', () => {
    const results = [
      result({ criterionId: 'c1' }),
      result({ criterionId: 'c2', result: 'partial' }),
    ];
    const accept = normalize(
      input({ evaluators: [evaluation(1, results, 'accept')] }),
      tinyPolicy(),
    );
    const reject = normalize(
      input({ evaluators: [evaluation(1, results, 'reject')] }),
      tinyPolicy(),
    );
    expect(JSON.stringify(accept)).not.toContain('advisoryVerdict');
    expect(JSON.stringify(accept)).not.toContain('rationale');
    expect(accept).toEqual(reject);
    expect(STANDARD.decide(accept, tinyPolicy())).toEqual(STANDARD.decide(reject, tinyPolicy()));
  });
});

describe('a lost sample', () => {
  /** Two samples to agree, a critical finding that blocks, and a gating kind: everything a lone sample could gate. */
  const base = tinyPolicy();
  const policy = (lostSample: 'score-only' | 'discard') => ({
    ...base,
    evidence: { ...base.evidence, minHits: 2, lostSample },
    criterionKinds: { ...base.criterionKinds, must: { ...base.criterionKinds.must, gate: true } },
  });
  const lost = (lens: string) => ({
    report: null,
    diagnostic: { stage: lens, sample: 2, reason: 'llm-failed' as const, detail: null },
  });
  const critical = finding({ severity: 'critical' });
  const results = [result({ criterionId: 'c1', result: 'fail' }), result({ criterionId: 'c2' })];
  const oneAnswered = input({
    critics: [critic(1, critical), lost('critic.tiny')],
    evaluators: [evaluation(1, results), lost('evaluator.tiny')],
  });

  it('[QL-46] scores but cannot gate: what the samples left agree on is confirmed with the hits it has, and blocks nothing', () => {
    const scoreOnly = policy('score-only');
    const ledger = normalize(oneAnswered, scoreOnly);
    expect(ledger.findings).toEqual([
      expect.objectContaining({ key: 'gap|text', severity: 'critical', hits: 1 }),
    ]);
    expect(ledger.criteria.map((entry) => [entry.criterionId, entry.result, entry.hits])).toEqual([
      ['c1', 'fail', 1],
      ['c2', 'pass', 1],
    ]);
    expect(ledger.discarded).toEqual([]);

    const decision = STANDARD.decide(ledger, scoreOnly);
    // It prices: the finding is charged and the failed criterion earns nothing …
    const substance = decision.trace.dimensions.find((trace) => trace.dimension === 'substance');
    expect(substance?.penalties.map((penalty) => penalty.key)).toEqual(['gap|text']);
    expect(substance?.base).toBe(0);
    // … and neither the critical finding nor the failed gating criterion blocks.
    expect(decision.gates.policyAllowed).toBe(true);

    // The same evidence from both samples is agreement, and blocks.
    const agreed = normalize(
      input({
        critics: [critic(1, critical), critic(2, critical)],
        evaluators: [evaluation(1, results), evaluation(2, results)],
      }),
      scoreOnly,
    );
    expect(agreed.findings[0].hits).toBe(2);
    expect(STANDARD.decide(agreed, scoreOnly).gates.policyAllowed).toBe(false);
  });

  it('[QL-46] under discard, minHits stands: the lens that lost a sample confirms nothing', () => {
    const ledger = normalize(oneAnswered, policy('discard'));
    expect(ledger.findings).toEqual([]);
    expect(ledger.criteria.map((entry) => entry.result)).toEqual(['unassessed', 'unassessed']);
    expect(ledger.discarded).toEqual([
      expect.objectContaining({
        key: 'gap|text',
        reason: 'below-min-hits',
        detail: '1 of 2 samples',
      }),
    ]);
  });
});
