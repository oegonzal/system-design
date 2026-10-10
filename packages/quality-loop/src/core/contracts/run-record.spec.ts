import type { Overrun, OverrunHandling } from '@sysdesign/contracts';
import type { LlmExchange } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { summariseExchange, toRunDto, type RunRecord } from './run-record';

const exchange: LlmExchange = {
  scope: 'critic.tiny.s1',
  ordinal: 1,
  model: 'test-model',
  system: 'the system prompt',
  user: 'the user prompt',
  schema: {},
  maxTokens: 10,
  startedAt: '2026-09-06T00:00:00.000Z',
  durationMs: 12,
  outcome: 'ok',
  stopReason: null,
  usage: null,
  requestId: null,
  text: '{}',
  response: { findings: [] },
  error: null,
};

const record: RunRecord = {
  runId: 'r1',
  pipeline: 'tiny',
  status: 'failed',
  startedAt: '2026-09-06T00:00:00.000Z',
  finishedAt: '2026-09-06T00:00:01.000Z',
  heartbeatAt: '2026-09-06T00:00:01.000Z',
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
  openedBy: null,
  recall: null,
  trace: null,
  exchanges: [exchange],
  error: { name: 'Error', message: 'boom', stack: null },
};

describe('toRunDto', () => {
  it('[QL-12] keeps the run as the wire contract: exchanges summarised, git and prompts left to the dump', () => {
    const dto = toRunDto(record);

    expect(dto).toEqual({
      runId: 'r1',
      pipeline: 'tiny',
      status: 'failed',
      startedAt: '2026-09-06T00:00:00.000Z',
      finishedAt: '2026-09-06T00:00:01.000Z',
      heartbeatAt: '2026-09-06T00:00:01.000Z',
      llm: { model: 'test-model' },
      request: {
        goal: '# Goal',
        outputProvided: false,
        criteriaProvided: false,
        adoptedFrom: null,
        maxIterations: 1,
      },
      parentRunId: null,
      openedBy: null,
      recall: null,
      trace: null,
      error: { name: 'Error', message: 'boom', stack: null },
      exchanges: [
        {
          scope: 'critic.tiny.s1',
          ordinal: 1,
          outcome: 'ok',
          durationMs: 12,
          startedAt: '2026-09-06T00:00:00.000Z',
          attempt: 1,
          errorName: null,
          // A call recorded before the seam salvaged reads as one that kept nothing.
          overruns: 0,
          overCeiling: 0,
          cut: 0,
          trimmed: 0,
          salvagedFrom: null,
          feedback: false,
          apiCalls: null,
        },
      ],
    });
    expect(dto).not.toHaveProperty('git');
    expect(JSON.stringify(dto)).not.toContain('the system prompt');
  });
});

describe('summariseExchange', () => {
  it('[QL-59] counts what the seam kept — past the target, past the ceiling, cut, trimmed — and leaves the fields to the dump', () => {
    const overrun = (handling: OverrunHandling, actual: number): Overrun => ({
      path: 'findings[0].rationale',
      at: ['findings', 0, 'rationale'],
      kind: handling === 'trimmed' ? 'list' : 'text',
      target: 100,
      ceiling: 140,
      actual,
      handling,
    });
    const summary = summariseExchange({
      ...exchange,
      error: { name: 'Salvaged', message: 'Timeout: no answer within 60 s' },
      salvage: {
        overruns: [
          overrun('accepted', 120),
          overrun('kept-over-ceiling', 200),
          overrun('cut', 900),
          overrun('trimmed', 160),
        ],
        repairs: [],
        issues: [],
        from: 'transcript',
        feedback: true,
      },
      apiCalls: 2,
    });

    expect(summary).toMatchObject({
      errorName: 'Salvaged',
      overruns: 4,
      overCeiling: 3,
      cut: 1,
      trimmed: 1,
      salvagedFrom: 'transcript',
      feedback: true,
      apiCalls: 2,
    });
    expect(JSON.stringify(summary)).not.toContain('findings[0].rationale');
  });
});
