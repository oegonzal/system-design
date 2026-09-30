import { describe, expect, it } from 'vitest';

import type { RunRecord } from '../core/contracts';
import { STANDARD } from '../core/controllers';
import { describePipeline } from '../core/pipeline';
import { runLoop } from '../core/loop/run-pipeline';
import {
  criterion,
  finding,
  result,
  scriptedCritic,
  scriptedEvaluator,
  scriptedProducer,
  tinyPipeline,
} from '../core/testing';
import { buildRunDump } from './build-run-dump';

const record = (overrides: Partial<RunRecord>): RunRecord => ({
  runId: '2026-09-06T00-00-00-000-abc123-quality',
  pipeline: 'tiny',
  status: 'complete',
  startedAt: '2026-09-06T00:00:00.000Z',
  finishedAt: '2026-09-06T00:00:01.000Z',
  llm: { model: 'test-model' },
  git: { branch: 'main', headSha: 'abc' },
  request: {
    goal: '# Goal\n\nDo it.',
    outputProvided: false,
    criteriaProvided: false,

    adoptedFrom: null,
    maxIterations: 3,
  },
  trace: null,
  exchanges: [],
  error: null,
  ...overrides,
});

const content = (dump: ReturnType<typeof buildRunDump>, path: string): string => {
  const file = dump.files.find((candidate) => candidate.path === path);
  if (!file) throw new Error(`no file ${path}`);
  return file.content;
};

describe('buildRunDump', () => {
  it('[QL-10] writes the goal verbatim, the contract, every iteration and every attributed exchange', async () => {
    const trace = await runLoop(
      {
        deriveCriteria: () => Promise.resolve({ criteria: [criterion('c1')], diagnostic: null }),
        producer: scriptedProducer([{ text: 't', parts: [] }]),
        validators: [],
        controller: STANDARD,
        critics: [scriptedCritic('critic.tiny', [[[finding({ criterionIds: ['c1'] })]]])],
        evaluators: [
          scriptedEvaluator('evaluator.tiny', [
            [[result({ criterionId: 'c1', result: 'partial' })]],
          ]),
        ],
      },
      tinyPipeline(),
      { goal: '# Goal\n\nDo it.', maxIterations: 1 },
      () => 0,
    );
    const exchange = {
      scope: 'critic.tiny.s1',
      ordinal: 1,
      model: 'test-model',
      system: 'sys',
      user: 'usr',
      schema: {},
      maxTokens: 10,
      startedAt: '2026-09-06T00:00:00.000Z',
      durationMs: 1,
      outcome: 'ok' as const,
      stopReason: null,
      usage: null,
      requestId: null,
      text: null,
      response: { findings: [] },
      error: null,
    };
    const dump = buildRunDump(
      record({ trace, exchanges: [exchange] }),
      describePipeline(tinyPipeline() as never),
    );

    const paths = dump.files.map((file) => file.path);
    const manifest = JSON.parse(dump.files[0].content) as {
      criteriaProvided: boolean;
      adoptedFrom: unknown;
    };
    expect(manifest.criteriaProvided).toBe(false);
    expect(manifest.adoptedFrom).toBeNull();
    expect(paths).toEqual([
      'manifest.json',
      'run.md',
      '01-goal.md',
      '02-contract.json',
      '03-pipeline.json',
      '04-iterations/01/iteration.json',
      '04-iterations/01/artifact.json',
      '04-iterations/01/artifact.md',
      '04-iterations/01/validation.json',
      '04-iterations/01/critics.json',
      '04-iterations/01/evaluators.json',
      '04-iterations/01/ledger.json',
      '04-iterations/01/decision.json',
      '04-iterations/01/remediations.json',
      '05-llm/01.critic.tiny.s1.1.system.txt',
      '05-llm/01.critic.tiny.s1.1.user.txt',
      '05-llm/01.critic.tiny.s1.1.response.json',
      '05-llm/01.critic.tiny.s1.1.meta.json',
      '06-lessons.json',
    ]);
    expect(content(dump, '01-goal.md')).toBe('# Goal\n\nDo it.\n');
    const row = JSON.parse(dump.indexRow) as Record<string, unknown>;
    expect(row).toMatchObject({
      kind: 'quality',
      pipeline: 'tiny@0.0.1',
      finalDecision: 'revise',
      iterations: 1,
      exchangeCount: 1,
    });
    expect(content(dump, 'run.md')).toContain('| 1 | initial | revise |');
  });

  it('[QL-10] a run that failed before any trace still gets a manifest, the goal and the error', () => {
    const dump = buildRunDump(
      record({ status: 'failed', error: { name: 'Error', message: 'boom', stack: null } }),
      null,
    );
    expect(dump.files.map((file) => file.path)).toEqual([
      'manifest.json',
      'run.md',
      '01-goal.md',
      '02-contract.json',
      '03-pipeline.json',
      '06-lessons.json',
    ]);
    expect(JSON.parse(dump.files[0].content)).toMatchObject({
      status: 'failed',
      error: { message: 'boom' },
      finalDecision: null,
    });
    expect(content(dump, 'run.md')).toContain('boom');
  });
});
