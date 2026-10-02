/**
 * A complete record with every column populated, for the row mappers: an
 * iteration with a confirmed finding, an unassessed criterion, a discarded
 * item, a remediation and a diagnostic; a trace with two criteria and a
 * lesson; two exchanges. Pure helpers only — no vitest imports.
 */
import type { IterationTrace, RunTrace } from '@sysdesign/contracts';
import type { LlmExchange } from '@sysdesign/llm';

import type { RunRecord } from '../../../core/contracts';
import { fromRows } from './from-rows';
import type { RunRows } from './rows';

export const fullExchange = (scope: string): LlmExchange => ({
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

export const fullIteration = (overrides: Partial<IterationTrace> = {}): IterationTrace => ({
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
        rationale: null,
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
        rationale: null,
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

export const fullTrace = (overrides: Partial<RunTrace> = {}): RunTrace => ({
  pipeline: { id: 'tiny', version: '0.0.1' },
  contract: {
    goal: '# Goal',
    criteria: [
      { id: 'c1', kind: 'must', statement: 'has text' },
      { id: 'c2', kind: 'nice', statement: 'has parts' },
    ],
  },
  iterations: [fullIteration()],
  bestIteration: 1,
  finalDecision: 'revise',
  stopReason: 'max-iterations',
  lessons: [{ kind: 'persisted', subject: 'wrong|text', iterations: [1], detail: 'still there' }],
  ...overrides,
});

export const fullRecord = (overrides: Partial<RunRecord> = {}): RunRecord => ({
  runId: '2026-09-06T00-00-00-000-abc123-quality',
  pipeline: 'tiny',
  status: 'complete',
  startedAt: '2026-09-06T00:00:00.000Z',
  finishedAt: '2026-09-06T00:00:05.000Z',
  llm: { model: 'test-model' },
  git: { branch: 'main', headSha: 'abc' },
  request: {
    goal: '# Goal',
    outputProvided: false,
    criteriaProvided: false,
    adoptedFrom: null,
    maxIterations: 1,
  },
  parentRunId: null,
  recall: null,
  trace: fullTrace(),
  exchanges: [fullExchange('criteria'), fullExchange('producer')],
  error: null,
  ...overrides,
});

/** Feed every list backwards so the sort inside `fromRows` is what restores the order. */
export const roundtrip = (rows: RunRows) =>
  fromRows(
    rows.run,
    [...rows.criteria].reverse(),
    rows.iterations.map((entry) => entry.row).reverse(),
    rows.iterations.flatMap((entry) => entry.findings).reverse(),
    rows.iterations.flatMap((entry) => entry.results).reverse(),
  );
