import type { LlmExchange } from '@sysdesign/llm';
import { describe, expect, it } from 'vitest';

import { toRunDto, type RunRecord } from './run-record';

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
  llm: { enabled: true, model: 'test-model', reason: null },
  git: { branch: 'main', headSha: 'abc' },
  request: { goal: '# Goal', outputProvided: false, criteriaProvided: false, maxIterations: 1 },
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
      llm: { enabled: true, model: 'test-model', reason: null },
      request: { goal: '# Goal', outputProvided: false, criteriaProvided: false, maxIterations: 1 },
      trace: null,
      error: { name: 'Error', message: 'boom', stack: null },
      exchanges: [
        {
          scope: 'critic.tiny.s1',
          ordinal: 1,
          outcome: 'ok',
          durationMs: 12,
          startedAt: '2026-09-06T00:00:00.000Z',
        },
      ],
    });
    expect(dto).not.toHaveProperty('git');
    expect(JSON.stringify(dto)).not.toContain('the system prompt');
  });
});
