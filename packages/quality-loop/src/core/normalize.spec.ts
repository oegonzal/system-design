import { describe, expect, it } from 'vitest';

import type { EvaluationReport } from './contracts';
import { decide } from './decide';
import { findingKey, normalize, type NormalizeInput } from './normalize';
import {
  criterion,
  finding,
  reported,
  result,
  tinyPipeline,
  tinyPolicy,
  type TinyOutput,
} from './testing';

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
    const policy = { ...tinyPolicy(), evidence: { minHits: 2, minAssessedShare: 1 } };
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
    expect(decide(accept, tinyPolicy())).toEqual(decide(reject, tinyPolicy()));
  });
});
