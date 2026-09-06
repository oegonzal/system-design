import type { IterationTrace, RunTrace } from '@sysdesign/contracts';
import type { LlmExchange } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { toRunDto, type RunRecord } from '../../../core/contracts';
import { fromRows, toRows, toSummary, type RunRows } from './run-mapper';

const exchange = (scope: string): LlmExchange => ({
  scope,
  ordinal: 1,
  model: 'test-model',
  system: 'sys',
  user: 'usr',
  schema: {},
  maxTokens: 10,
  startedAt: '2026-09-06T00:00:00.000Z',
  durationMs: 12,
  outcome: 'ok',
  stopReason: null,
  usage: null,
  requestId: null,
  text: '{}',
  response: {},
  error: null,
});

const iteration = (overrides: Partial<IterationTrace> = {}): IterationTrace => ({
  iteration: 1,
  mode: 'initial',
  artifact: { text: 'made', parts: ['one'] },
  locations: [
    { id: 'text', label: 'Text' },
    { id: 'part.1', label: 'one' },
  ],
  rendered: '[text] made\n[part.1] one',
  validation: [{ validatorId: 'schema', gate: 'block', problems: [] }],
  critics: [
    {
      report: {
        criticId: 'critic.tiny',
        sample: 1,
        findings: [
          {
            type: 'gap',
            severity: 'high',
            confidence: 'high',
            fixability: 'fixable_local',
            locationRefs: ['part.1'],
            criterionIds: ['c2'],
            rationale: 'missing',
          },
        ],
      },
      diagnostic: null,
    },
  ],
  evaluators: [
    {
      report: null,
      diagnostic: { stage: 'evaluator.tiny', sample: 1, reason: 'llm-failed', detail: null },
    },
  ],
  ledger: {
    artifactPresent: true,
    validation: [{ validatorId: 'schema', gate: 'block', problems: [] }],
    criteria: [
      {
        criterionId: 'c1',
        kind: 'must',
        result: 'pass',
        hits: 1,
        confidence: 'high',
        locationRefs: ['text'],
      },
      {
        criterionId: 'c2',
        kind: 'nice',
        result: 'unassessed',
        hits: 0,
        confidence: null,
        locationRefs: [],
      },
    ],
    findings: [
      {
        key: 'gap|part.1',
        type: 'gap',
        severity: 'high',
        confidence: 'high',
        fixability: 'fixable_local',
        locationRefs: ['part.1'],
        criterionIds: ['c2'],
        hits: 1,
        lenses: ['critic.tiny'],
        reconciledTo: 'c2',
      },
      {
        key: 'wrong|text',
        type: 'wrong',
        severity: 'medium',
        confidence: 'medium',
        fixability: 'requires_retry',
        locationRefs: ['text'],
        criterionIds: [],
        hits: 2,
        lenses: ['critic.tiny', 'critic.other'],
        reconciledTo: null,
      },
    ],
    discarded: [{ lens: 'critic.tiny', key: 'x|y', reason: 'below-min-hits', detail: '1 < 2' }],
    diagnostics: [],
  },
  decision: {
    finalDecision: 'revise',
    gates: {
      artifactPresent: true,
      validatorsPassed: true,
      evidenceSufficient: true,
      policyAllowed: true,
    },
    scores: { dimensions: { correctness: 62, completeness: 80 }, overall: 71 },
    selectedRemediations: [
      {
        subject: { finding: 'wrong|text' },
        action: 'retry',
        severity: 'medium',
        targetRefs: ['text'],
      },
    ],
    reason: 'below acceptAt',
    trace: { steps: [], dimensions: [], weightSum: 1, weightedTotal: 71 },
  },
  remediations: [
    {
      subject: { finding: 'wrong|text' },
      action: 'retry',
      severity: 'medium',
      targetRefs: ['text'],
      note: 'the text states the wrong thing',
    },
  ],
  durationMs: 1200,
  ...overrides,
});

const trace = (overrides: Partial<RunTrace> = {}): RunTrace => ({
  pipeline: { id: 'tiny', version: '0.0.1' },
  contract: {
    goal: '# Goal',
    criteria: [
      { id: 'c1', kind: 'must', statement: 'has text' },
      { id: 'c2', kind: 'nice', statement: 'has parts' },
    ],
  },
  iterations: [iteration()],
  bestIteration: 1,
  finalDecision: 'revise',
  stopReason: 'max-iterations',
  lessons: [{ kind: 'persisted', subject: 'wrong|text', iterations: [1], detail: 'still there' }],
  ...overrides,
});

const record = (overrides: Partial<RunRecord> = {}): RunRecord => ({
  runId: '2026-09-06T00-00-00-000-abc123-quality',
  pipeline: 'tiny',
  status: 'complete',
  startedAt: '2026-09-06T00:00:00.000Z',
  finishedAt: '2026-09-06T00:00:05.000Z',
  llm: { enabled: true, model: 'test-model', reason: null },
  git: { branch: 'main', headSha: 'abc' },
  request: { goal: '# Goal', outputProvided: false, maxIterations: 1 },
  trace: trace(),
  exchanges: [exchange('criteria'), exchange('producer')],
  error: null,
  ...overrides,
});

/** Feed every list backwards so the sort inside `fromRows` is what restores the order. */
const roundtrip = (rows: RunRows) =>
  fromRows(
    rows.run,
    [...rows.criteria].reverse(),
    rows.iterations.map((entry) => entry.row).reverse(),
    rows.iterations.flatMap((entry) => entry.findings).reverse(),
    rows.iterations.flatMap((entry) => entry.results).reverse(),
  );

describe('run-mapper', () => {
  it('[QL-13] splits a complete record into rows and reassembles the wire record exactly', () => {
    const source = record();
    let n = 0;
    const rows = toRows(source, () => `iteration-${++n}`);

    expect(rows.run).toMatchObject({
      id: source.runId,
      pipelineVersion: '0.0.1',
      finalDecision: 'revise',
      stopReason: 'max-iterations',
      overall: 71,
      bestIteration: 1,
      exchangeCount: 2,
      lessons: [
        { kind: 'persisted', subject: 'wrong|text', iterations: [1], detail: 'still there' },
      ],
    });
    expect(rows.criteria.map((row) => [row.position, row.criterionId])).toEqual([
      [0, 'c1'],
      [1, 'c2'],
    ]);
    expect(rows.iterations[0]?.row.id).toBe('iteration-1');
    expect(
      rows.iterations[0]?.findings.map((row) => [row.iterationId, row.position, row.key]),
    ).toEqual([
      ['iteration-1', 0, 'gap|part.1'],
      ['iteration-1', 1, 'wrong|text'],
    ]);
    expect(
      rows.iterations[0]?.results.map((row) => [row.position, row.criterionId, row.confidence]),
    ).toEqual([
      [0, 'c1', 'high'],
      [1, 'c2', null],
    ]);

    expect(roundtrip(rows)).toEqual(toRunDto(source));
  });

  it('[QL-13] keeps an escalated run honest: no criteria, no artifact, the diagnostics intact', () => {
    const source = record({
      llm: { enabled: false, model: null, reason: 'deterministic' },
      exchanges: [],
      trace: trace({
        contract: { goal: '# Goal', criteria: [] },
        finalDecision: 'escalate',
        stopReason: 'escalated',
        lessons: [],
        iterations: [
          iteration({
            artifact: null,
            rendered: null,
            locations: [],
            validation: [],
            critics: [],
            evaluators: [],
            ledger: {
              artifactPresent: false,
              validation: [],
              criteria: [],
              findings: [],
              discarded: [],
              diagnostics: [
                { stage: 'producer', sample: null, reason: 'llm-disabled', detail: null },
              ],
            },
            remediations: [],
          }),
        ],
      }),
    });
    const rows = toRows(source);

    expect(rows.criteria).toEqual([]);
    expect(rows.iterations[0]?.findings).toEqual([]);
    expect(roundtrip(rows)).toEqual(toRunDto(source));
  });

  it('[QL-13] a failed run with no trace stays a header only', () => {
    const source = record({
      status: 'failed',
      trace: null,
      exchanges: [exchange('criteria')],
      error: { name: 'Error', message: 'boom', stack: null },
    });
    const rows = toRows(source);

    expect(rows.iterations).toEqual([]);
    expect(rows.run).toMatchObject({
      finalDecision: null,
      lessons: null,
      overall: null,
      exchangeCount: 1,
    });
    expect(roundtrip(rows)).toEqual(toRunDto(source));
    expect(roundtrip(rows).trace).toBeNull();
  });

  it('projects the list row from the header and the counts', () => {
    const rows = toRows(record());
    expect(toSummary(rows.run, { iterations: 1, criteria: 2 })).toEqual({
      runId: '2026-09-06T00-00-00-000-abc123-quality',
      pipeline: 'tiny',
      pipelineVersion: '0.0.1',
      status: 'complete',
      startedAt: '2026-09-06T00:00:00.000Z',
      finishedAt: '2026-09-06T00:00:05.000Z',
      finalDecision: 'revise',
      stopReason: 'max-iterations',
      overall: 71,
      iterations: 1,
      criteria: 2,
      exchangeCount: 2,
      llm: { enabled: true, model: 'test-model', reason: null },
    });
  });
});
