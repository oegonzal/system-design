import type { QualityRunDto } from '@sysdesign/contracts';
import { DEFAULT_PANEL_SAMPLES } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import type { RunInput } from '../../core/loop/run-pipeline';
import { confirmed, decision, ledger, runDto, traceOf } from '../../core/testing';
import type { StepContext } from '../definition';
import { panelStep, reconcileStep, type PanelSource } from './steps';

type Outputs = { first: QualityRunDto; panel: QualityRunDto[]; reconcile: unknown };
type Ctx = StepContext<Outputs, unknown>;

const judged = (id: string, overall: number, findings: string[] = []): QualityRunDto =>
  runDto(
    id,
    traceOf({
      decision: decision({ scores: { dimensions: {}, overall } }),
      ledger: ledger({
        findings: findings.map((key) => confirmed({ key, type: key.split('|')[0] })),
      }),
    }),
  );

/** A context whose `execute` answers from a script, recording what it was asked. */
function contextOf(
  script: (call: number) => QualityRunDto,
  overrides: { pipelines?: string[]; samples?: number; outputs?: Partial<Outputs> } = {},
): { ctx: Ctx; executed: { pipeline: string | undefined; input: RunInput }[] } {
  const executed: { pipeline: string | undefined; input: RunInput }[] = [];
  const ctx: Ctx = {
    request: { pipeline: 'tiny', goal: 'g', samples: overrides.samples },
    context: {},
    outputs: overrides.outputs ?? {},
    ports: undefined,
    pipelines: overrides.pipelines ?? ['tiny'],
    registry: [],
    acceptAtOf: () => 80,
    execute: (input, pipeline) => {
      executed.push({ pipeline, input });
      return Promise.resolve(script(executed.length));
    },
  };
  return { ctx, executed };
}

const source = (): PanelSource => ({ input: { goal: 'g', maxIterations: 1 } });

describe('panelStep', () => {
  it('[QL-19] runs each declared pipeline `samples` times, one after another, and hands the runs on', async () => {
    const { ctx, executed } = contextOf((call) => judged(`r-${call}`, 70 + call), {
      pipelines: ['tiny', 'other'],
      samples: 2,
    });
    const result = await panelStep<Outputs, unknown>(source)(ctx);
    expect(executed.map((call) => call.pipeline)).toEqual(['tiny', 'tiny', 'other', 'other']);
    expect(executed.every((call) => call.input.goal === 'g')).toBe(true);
    expect(result).toMatchObject({
      status: 'complete',
      counts: { lenses: 2, samples: 2, completed: 4, failed: 0 },
    });
    expect(result.output?.map((run) => run.runId)).toEqual(['r-1', 'r-2', 'r-3', 'r-4']);
    expect(result.reason).toBeUndefined();
  });

  it('[QL-19] the request may leave samples unsaid; the declared default runs', async () => {
    const { ctx, executed } = contextOf((call) => judged(`r-${call}`, 80));
    await panelStep<Outputs, unknown>(source)(ctx);
    expect(executed).toHaveLength(DEFAULT_PANEL_SAMPLES);
  });

  it('[QL-19] a failed sample is counted and left out, and the panel says so', async () => {
    const { ctx } = contextOf(
      (call) => (call === 2 ? runDto('r-2', null) : judged(`r-${call}`, 80)),
      {
        samples: 3,
      },
    );
    const result = await panelStep<Outputs, unknown>(source)(ctx);
    expect(result).toMatchObject({
      status: 'complete',
      reason: 'sample-failed',
      note: '1 of 3 sample(s) failed',
      counts: { completed: 2, failed: 1 },
    });
    expect(result.output?.map((run) => run.runId)).toEqual(['r-1', 'r-3']);
  });

  it("[QL-19] when no sample completes the panel is the run's failure, carrying the last error", async () => {
    const { ctx } = contextOf((call) => runDto(`r-${call}`, null), { samples: 2 });
    const result = await panelStep<Outputs, unknown>(source)(ctx);
    expect(result).toMatchObject({
      status: 'failed',
      reason: 'run-failed',
      note: '2 of 2 sample(s) failed',
      counts: { completed: 0, failed: 2 },
      error: { name: 'Boom' },
    });
    expect(result.output).toBeUndefined();
  });

  it('[QL-19] a source that cannot supply an input skips the panel with its declared reason', async () => {
    const { ctx, executed } = contextOf(() => judged('r', 80));
    const result = await panelStep<Outputs, unknown>(() => ({
      skip: 'no-artifact',
      note: 'first',
    }))(ctx);
    expect(result).toEqual({ status: 'skipped', reason: 'no-artifact', note: 'first' });
    expect(executed).toHaveLength(0);
  });
});

describe('reconcileStep', () => {
  it('[QL-19] fewer than two runs is a skip, not a report that everything agreed', async () => {
    const { ctx } = contextOf(() => judged('r', 80), { outputs: { panel: [judged('r-1', 80)] } });
    const result = await reconcileStep<Outputs, unknown>(
      (c) => c.outputs.panel ?? [],
      'produced',
    )(ctx);
    expect(result).toEqual({
      status: 'skipped',
      reason: 'too-few-runs',
      note: '1 run(s) to reconcile',
      counts: { runs: 1 },
    });
  });

  it('[QL-19] reads the runs the definition names, ignores what is missing, and reports with counts', async () => {
    const first = judged('first', 82, ['gap|x', 'leak|z']);
    const panel = [judged('p-1', 76, ['gap|x']), judged('p-2', 79, ['gap|x', 'leak|z'])];
    const { ctx } = contextOf(() => judged('r', 80), { outputs: { first, panel } });
    const result = await reconcileStep<Outputs, unknown>(
      (c) => [c.outputs.first, undefined, ...(c.outputs.panel ?? [])],
      'provided',
    )(ctx);
    expect(result.status).toBe('complete');
    expect(result.counts).toEqual({
      runs: 3,
      decisions: 1,
      contestedTypes: 1,
      contestedFindings: 1,
      overallRange: 6,
    });
    expect(result.report).toMatchObject({
      alignment: 'provided',
      runs: 3,
      overall: { n: 3, min: 76, max: 82, mean: 79, range: 6 },
      unanimous: { findingTypes: ['gap'], findings: ['gap|x'] },
      contested: { findings: [{ key: 'leak|z', type: 'leak', seenBy: [0, 2] }] },
    });
  });
});
