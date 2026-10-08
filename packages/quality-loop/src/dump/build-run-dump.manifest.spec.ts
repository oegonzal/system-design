import type { Overrun } from '@sysdesign/contracts';
import type { LlmExchange } from '@sysdesign/llm';
import { DUMP_SCHEMA_VERSION } from '@sysdesign/run-dump';
import { describe, expect, it } from 'vitest';
import { STANDARD } from '../core/controllers';
import { runLoop } from '../core/loop/run-pipeline';
import {
  criterion,
  DRAFT_1,
  finding,
  result,
  scriptedCritic,
  scriptedEvaluator,
  scriptedProducer,
  tinyPipeline,
} from '../core/testing';
import { buildRunDump } from './build-run-dump';
import { content, record } from './build-run-dump.testing';

describe('buildRunDump: the manifest, the verdict and a run without a trace', () => {
  it("[QL-57] the manifest, the index row and the verdict give the best iteration's score, and a last one that fell short only beside it", async () => {
    // Iteration 1 is judged and decided revise; iteration 2's produce answers
    // nothing, so it scores 0 and the run stops on it, standing on iteration 1.
    const stages = {
      deriveCriteria: () =>
        Promise.resolve({ criteria: [criterion('c1')], diagnostic: null, overruns: [] }),
      producer: scriptedProducer([DRAFT_1, null]),
      validators: [],
      controller: STANDARD,
      critics: [scriptedCritic('critic.tiny', [[[finding({ criterionIds: ['c1'] })]]])],
      evaluators: [
        scriptedEvaluator('evaluator.tiny', [[[result({ criterionId: 'c1', result: 'partial' })]]]),
      ],
    };
    const trace = await runLoop(stages, tinyPipeline(), { goal: 'g', maxIterations: 2 }, () => 0);
    const [best, last] = trace.iterations;
    expect(trace.bestIteration).toBe(1);
    expect(last.decision.scores.overall).toBe(0);
    expect(best.decision.scores.overall).toBeGreaterThan(0);

    const dump = buildRunDump(record({ trace }), null);
    expect(JSON.parse(content(dump, 'manifest.json'))).toMatchObject({
      overall: best.decision.scores.overall,
      bestIteration: 1,
    });
    expect(JSON.parse(dump.indexRow)).toMatchObject({ overall: best.decision.scores.overall });
    const verdict = content(dump, 'run.md')
      .split('\n')
      .find((line) => line.startsWith(`**${trace.finalDecision}**`));
    expect(verdict).toBe(
      `**${trace.finalDecision}** (stopped: produce-lost) · overall ${best.decision.scores.overall}/100 · best iteration 1 · last iteration 2 0/100`,
    );

    // A run whose last iteration is its best says its score once.
    const single = await runLoop(
      { ...stages, producer: scriptedProducer([DRAFT_1]) },
      tinyPipeline(),
      { goal: 'g', maxIterations: 1 },
      () => 0,
    );
    expect(content(buildRunDump(record({ trace: single }), null), 'run.md')).toContain(
      `· overall ${single.iterations[0].decision.scores.overall}/100 · best iteration 1\n`,
    );
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
        queuedMs: 120,
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
      // The wait for a permit is recorded apart from the call's own duration.
      expect(meta['queuedMs']).toBe(120);
      expect(meta['salvage']).toEqual(exchanges[0].salvage);
      const old = JSON.parse(content(dump, '05-llm/03.critic.scale.s2.1.meta.json')) as Record<
        string,
        unknown
      >;
      expect(old).toMatchObject({ salvage: null, apiCalls: null, queuedMs: null });
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
