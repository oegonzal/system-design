import {
  recallOf,
  recallWithout,
  withRecallNovelty,
  type Overrun,
  type RecallNoveltyDto,
} from '@sysdesign/contracts';
import type { LlmExchange } from '@sysdesign/llm';
import { DUMP_SCHEMA_VERSION } from '@sysdesign/run-dump';
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
  heartbeatAt: '2026-09-06T00:00:01.000Z',
  llm: { model: 'test-model' },
  git: { branch: 'main', headSha: 'abc' },
  request: {
    goal: '# Goal\n\nDo it.',
    outputProvided: false,
    criteriaProvided: false,

    adoptedFrom: null,
    maxIterations: 3,
  },
  parentRunId: null,
  recall: null,
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

  it('[QL-32] a run that recalled records the lessons its producer saw, where they came from, and why there were none', () => {
    const lesson = {
      ref: 'm2',
      serves: 'the read path',
      insight: 'Cache the read path before sharding it.',
      caveat: 'the earlier run had no POS feed',
      text: 'When reads dominate, cache before you shard.',
      sourceRunId: 'earlier-quality',
    };
    const recall = recallOf([lesson], 'recall-quality');
    const dump = buildRunDump(record({ recall }), null);
    expect(dump.files.map((file) => file.path)).toContain('recall.json');
    expect(JSON.parse(content(dump, 'recall.json'))).toEqual(recall);
    expect(JSON.parse(content(dump, 'manifest.json'))).toMatchObject({
      recall: { status: 'recalled', count: 1, recallRunId: 'recall-quality', reason: null },
    });
    const page = content(dump, 'run.md');
    expect(page).toContain('## Recall');
    expect(page).toContain(
      'recalled · 1 lesson(s) handed to the producer · recall run recall-quality',
    );
    expect(page).toContain(
      '- [m2] Cache the read path before sharding it. — serves: the read path; caveat: the earlier run had no POS feed (from run earlier-quality)',
    );

    const skipped = buildRunDump(
      record({ recall: recallWithout('embeddings-disabled', 'no-key') }),
      null,
    );
    expect(content(skipped, 'run.md')).toContain(
      'skipped (embeddings-disabled: no-key) · 0 lesson(s) handed to the producer',
    );
    // A run that never asked to recall says nothing about it.
    const plain = buildRunDump(record({}), null);
    expect(plain.files.map((file) => file.path)).not.toContain('recall.json');
    expect(content(plain, 'run.md')).not.toContain('## Recall');
    expect(JSON.parse(content(plain, 'manifest.json'))).toMatchObject({ recall: null });
  });

  it('[QL-52] a recall that screened what its producer held says what it set aside and why, the chain, and each lesson’s origin', () => {
    const lesson = {
      ref: 'm1',
      serves: 'the cache outage',
      insight: 'Serve redirects from the database while the cache is down.',
      caveat: null,
      text: 'Fall back to the database when the cache is down.',
      sourceRunId: 'elsewhere-quality',
    };
    const novelty: RecallNoveltyDto = {
      chain: [
        { runId: 'coach-quality', iteration: 2 },
        { runId: 'grade-quality', iteration: 1 },
      ],
      known: { findings: 9, criteria: 10, remediations: 17 },
      pool: 48,
      collapsed: 1,
      offered: 16,
      excluded: [
        {
          sourceRunId: 'grade-quality',
          ref: 'memory.3',
          iteration: 1,
          reason: 'chain-iteration',
          matched: ['grade-quality@1'],
        },
        {
          sourceRunId: 'sibling-quality',
          ref: 'memory.1',
          iteration: 1,
          reason: 'sibling-copy',
          matched: ['coach-quality@2'],
        },
        {
          sourceRunId: 'sibling-quality',
          ref: 'memory.2',
          iteration: 1,
          reason: 'sibling-copy',
          matched: ['coach-quality@2'],
        },
      ],
      demoted: [],
      origins: [{ ref: 'm1', sourceRunId: 'elsewhere-quality', origin: 'other-pipeline' }],
    };
    const recall = withRecallNovelty(recallOf([lesson], 'recall-quality'), novelty);
    const dump = buildRunDump(record({ recall }), null);
    expect(JSON.parse(content(dump, 'recall.json'))).toEqual(recall);
    const page = content(dump, 'run.md');
    expect(page).toContain(
      'novelty: pool 48 → excluded 3 as already known (chain-iteration 1 · sibling-copy 2) · collapsed 1 · offered 16 · chain coach-quality@2 → grade-quality@1',
    );
    expect(page).toContain(
      '- excluded `grade-quality` memory.3 (iteration 1) — chain-iteration: grade-quality@1',
    );
    expect(page).toContain(
      '- excluded `sibling-quality` memory.2 (iteration 1) — sibling-copy: coach-quality@2',
    );
    expect(page).toContain(
      '- [m1] Serve redirects from the database while the cache is down. — serves: the cache outage (from run elsewhere-quality · origin other-pipeline)',
    );

    // Everything it found was already held: the line says so, and no lesson follows.
    const nothingNew = withRecallNovelty(recallWithout('nothing-new'), {
      ...novelty,
      collapsed: 0,
      offered: 0,
      origins: [],
    });
    expect(content(buildRunDump(record({ recall: nothingNew }), null), 'run.md')).toContain(
      'empty (nothing-new) · 0 lesson(s) handed to the producer\n\nnovelty: pool 48 → excluded 3 as already known',
    );
    // A recall that screened nothing has no novelty line, and its lessons no origin.
    const unscreened = content(
      buildRunDump(record({ recall: recallOf([lesson], 'r') }), null),
      'run.md',
    );
    expect(unscreened).not.toContain('novelty:');
    expect(unscreened).not.toContain('· origin');
  });

  it('[QL-32] a run opened for another names it, in its manifest and on its page; one started on its own does not', () => {
    const child = buildRunDump(record({ parentRunId: 'coach-quality' }), null);
    expect(JSON.parse(content(child, 'manifest.json'))).toMatchObject({
      parentRunId: 'coach-quality',
    });
    expect(content(child, 'run.md')).toContain('Opened for run coach-quality.');

    const own = buildRunDump(record({}), null);
    expect(JSON.parse(content(own, 'manifest.json'))).toMatchObject({ parentRunId: null });
    expect(content(own, 'run.md')).not.toContain('Opened for run');
  });

  describe('what the model seam kept', () => {
    const overrun = (fields: Partial<Overrun> & Pick<Overrun, 'path' | 'handling'>): Overrun => ({
      at: [],
      kind: 'text',
      target: 300,
      ceiling: 375,
      actual: 358,
      ...fields,
    });
    const exchange = (fields: Partial<LlmExchange>): LlmExchange => ({
      scope: 'producer',
      ordinal: 1,
      model: 'test-model',
      system: 's',
      user: 'u',
      schema: {},
      maxTokens: 48_000,
      startedAt: '2026-10-03T00:00:00.000Z',
      durationMs: 5,
      outcome: 'ok',
      stopReason: 'end_turn',
      usage: { inputTokens: 4, outputTokens: 40_173 },
      requestId: null,
      text: null,
      response: {},
      error: null,
      ...fields,
    });
    const salvage = {
      repairs: [],
      issues: [],
      from: 'result' as const,
      feedback: false,
    };
    const exchanges: LlmExchange[] = [
      exchange({
        apiCalls: 2,
        salvage: {
          ...salvage,
          overruns: [
            overrun({ path: 'brief.bindings[2].claim', handling: 'accepted' }),
            overrun({
              path: 'narrative.overview',
              target: 1_400,
              ceiling: 1_750,
              actual: 4_400,
              handling: 'cut',
            }),
            overrun({
              path: 'graph.nodes[3].responsibilities',
              kind: 'list',
              target: 6,
              ceiling: 8,
              actual: 13,
              handling: 'trimmed',
              dropped: 5,
            }),
          ],
        },
      }),
      exchange({
        scope: 'critic.scale.s1',
        ordinal: 2,
        error: { name: 'Salvaged', message: 'Timeout: the call outlived its limit' },
        salvage: {
          ...salvage,
          from: 'transcript',
          feedback: true,
          overruns: [
            overrun({
              path: 'findings[0].rationale',
              target: 900,
              ceiling: 1_125,
              actual: 1_210,
              handling: 'kept-over-ceiling',
            }),
          ],
        },
      }),
      // A record from before the seam salvaged: nothing kept, nothing counted.
      exchange({ scope: 'critic.scale.s2', ordinal: 1 }),
    ];

    it('[QL-48] the manifest and the index row count every field written past its target, and each exchange records its salvage and API calls', () => {
      const dump = buildRunDump(record({ exchanges }), null);
      const manifest = JSON.parse(content(dump, 'manifest.json')) as Record<string, unknown>;
      expect(manifest['schemaVersion']).toBe(DUMP_SCHEMA_VERSION);
      expect(DUMP_SCHEMA_VERSION).toBe(2);
      expect(manifest['overruns']).toEqual({
        overruns: 4,
        calls: 2,
        overCeiling: 3,
        cut: 1,
        trimmed: 1,
        salvaged: 1,
        feedback: 1,
      });
      expect(JSON.parse(dump.indexRow)).toMatchObject({ overruns: 4, exchangeCount: 3 });

      const meta = JSON.parse(content(dump, '05-llm/01.producer.1.meta.json')) as Record<
        string,
        unknown
      >;
      expect(meta['apiCalls']).toBe(2);
      expect(meta['salvage']).toEqual(exchanges[0].salvage);
      const old = JSON.parse(content(dump, '05-llm/03.critic.scale.s2.1.meta.json')) as Record<
        string,
        unknown
      >;
      expect(old).toMatchObject({ salvage: null, apiCalls: null });
    });

    it('[QL-48] run.md lists every overrun — asked, accepted, written and how it was handled — and names a resumed, salvaged or re-asked call on its line', () => {
      const page = content(buildRunDump(record({ exchanges }), null), 'run.md').split('\n');
      const at = page.indexOf('## Overruns');
      expect(at).toBeGreaterThan(0);
      expect(page[at + 2]).toBe(
        '4 overrun(s) in 2 call(s) — 3 over the ceiling, 1 cut, 1 list(s) trimmed, 1 salvaged from a cut transcript, 1 feedback ask(s)',
      );
      expect(page.slice(at + 4, at + 10)).toEqual([
        '| call | field | asked | accepted | written | handling |',
        '| --- | --- | --- | --- | --- | --- |',
        '| producer #1 | brief.bindings[2].claim | 300 | 375 | 358 characters | accepted |',
        '| producer #1 | narrative.overview | 1,400 | 1,750 | 4,400 characters | cut |',
        '| producer #1 | graph.nodes[3].responsibilities | 6 | 8 | 13 items | trimmed, 5 dropped |',
        '| critic.scale.s1 #2 | findings[0].rationale | 900 | 1,125 | 1,210 characters | kept-over-ceiling |',
      ]);
      // The section sits with the calls it reports on.
      expect(page.indexOf('## Model calls')).toBeGreaterThan(at);
      expect(page).toContain('- `producer` #1 — ok, 5 ms, 4 in / 40173 out, 2 API calls');
      expect(page).toContain(
        '- `critic.scale.s1` #2 — ok, 5 ms, 4 in / 40173 out (salvaged from transcript) (asked with the previous reply’s faults) — Salvaged: Timeout: the call outlived its limit',
      );
      expect(page).toContain('- `critic.scale.s2` #1 — ok, 5 ms, 4 in / 40173 out');
    });

    it('[QL-48] a run whose calls kept nothing past a target says nothing about overruns, and counts none', () => {
      const dump = buildRunDump(record({ exchanges: [exchanges[2]] }), null);
      expect(content(dump, 'run.md')).not.toContain('## Overruns');
      expect(JSON.parse(dump.indexRow)).toMatchObject({ overruns: 0 });
      // A turn that took one API call does not say so.
      const single = buildRunDump(record({ exchanges: [exchange({ apiCalls: 1 })] }), null);
      expect(content(single, 'run.md')).not.toContain('API calls');
    });
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
