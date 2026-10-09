import { describe, expect, it } from 'vitest';
import { STANDARD } from '../core/controllers';
import { runLoop } from '../core/loop/run-pipeline';
import { describePipeline } from '../core/describe-pipeline';
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
import { content, record } from './build-run-dump.testing';

describe('buildRunDump', () => {
  it('[QL-10] writes the goal verbatim, the contract, every iteration and every attributed exchange', async () => {
    const trace = await runLoop(
      {
        deriveCriteria: () =>
          Promise.resolve({ criteria: [criterion('c1')], diagnostic: null, overruns: [] }),
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

  it('[QL-10] run.md keeps every table row to its columns and says why a model call missed', async () => {
    const trace = await runLoop(
      {
        deriveCriteria: () =>
          Promise.resolve({ criteria: [criterion('c1')], diagnostic: null, overruns: [] }),
        producer: scriptedProducer([{ text: 't', parts: [] }]),
        validators: [],
        controller: STANDARD,
        critics: [],
        evaluators: [],
      },
      tinyPipeline(),
      { goal: 'g', maxIterations: 1 },
      () => 0,
    );
    // A reason quoting a structural finding key, whose `|` would open a column.
    trace.iterations[0].decision.reason = 'blockers to fix: missing_requirement|binding.1,edge.2';
    const missed = {
      scope: 'producer',
      ordinal: 1,
      model: 'test-model',
      system: 's',
      user: 'u',
      schema: {},
      maxTokens: 28_000,
      startedAt: '2026-10-01T00:00:00.000Z',
      durationMs: 5,
      outcome: 'schema-miss' as const,
      stopReason: 'end_turn',
      usage: { inputTokens: 4, outputTokens: 21_122 },
      requestId: null,
      text: '"id":"n-3"}',
      response: null,
      error: { name: 'SchemaMiss', message: 'no complete JSON object in the reply' },
    };
    const page = content(
      buildRunDump(record({ trace, exchanges: [missed] }), null),
      'run.md',
    ).split('\n');

    const reasonRow = page.find((line) => line.startsWith('| 1 |')) ?? '';
    expect(reasonRow).toContain('missing_requirement\\|binding.1,edge.2');
    const header = page.find((line) => line.startsWith('| # |')) ?? '';
    const columns = (line: string) => line.split(/(?<!\\)\|/).length;
    expect(columns(reasonRow)).toBe(columns(header));
    expect(page).toContain(
      '- `producer` #1 — schema-miss, 5 ms, 4 in / 21122 out — SchemaMiss: no complete JSON object in the reply',
    );
  });
});
