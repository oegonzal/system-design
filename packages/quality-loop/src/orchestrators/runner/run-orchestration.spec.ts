import type { PipelineSummary, QualityRunDto, StartQualityRunRequest } from '@sysdesign/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { RunRecord } from '../../core/contracts';
import type { OrchestratorDefinition, StepContext, StepResult } from './definition';
import { openRecord, pendingStep } from './record';
import { runOrchestration, type OrchestrationDeps } from './run-orchestration';
import { orchestrationDeps, summaryOf } from './testing';

type Outputs = { a: string; b: string; c: undefined };
type Ports = { log: string[] };

const request: StartQualityRunRequest = { pipeline: 'tiny', goal: 'g' };

const child = (runId = 'tiny-run', failed = false): RunRecord => ({
  runId,
  pipeline: 'tiny',
  status: failed ? 'failed' : 'complete',
  startedAt: '2026-09-09T00:00:00.000Z',
  finishedAt: '2026-09-09T00:01:00.000Z',
  llm: { model: 'test-model' },
  request: {
    goal: 'g',
    outputProvided: false,
    criteriaProvided: false,
    adoptedFrom: null,
    maxIterations: 1,
  },
  parentRunId: null,
  recall: null,
  trace: null,
  exchanges: [],
  error: failed ? { name: 'Boom', message: 'the model went away', stack: null } : null,
  git: { branch: 'spec', headSha: 'spec' },
});

const stepA = (result: () => StepResult<string>) => ({
  id: 'a' as const,
  pipeline: 'tiny',
  run: async (ctx: { execute: (input: { goal: string }) => Promise<QualityRunDto> }) => {
    const run = await ctx.execute({ goal: 'from a' });
    return { ...result(), runIds: [run.runId] };
  },
  provided: (run: QualityRunDto): StepResult<string> => ({
    status: 'skipped',
    reason: 'provided-run',
    runIds: [run.runId],
    output: `provided:${run.runId}`,
  }),
});

const definition = (
  a: () => StepResult<string> = () => ({ status: 'complete', output: 'a!' }),
): OrchestratorDefinition<Outputs, Ports> => ({
  id: 'tiny',
  version: '0.0.1',
  description: 'three steps',
  takesTarget: true,
  reasons: ['because'],
  context: () => Promise.resolve({ seen: true }),
  steps: [
    stepA(a) as never,
    {
      id: 'b',
      needs: ['a'],
      run: (ctx) => Promise.resolve({ status: 'complete', output: `${ctx.outputs.a}+b` }),
    },
    { id: 'c', needs: ['b'], run: () => Promise.resolve({ status: 'skipped', reason: 'because' }) },
  ],
});

const harness = (execute: OrchestrationDeps<Ports>['execute'] = () => Promise.resolve(child())) =>
  orchestrationDeps<Ports>({ log: [] }, execute);

const open = (def: OrchestratorDefinition<Outputs, Ports>, provided: QualityRunDto | null = null) =>
  openRecord(def, request, provided, { seen: true }, 1, () => 'now');

describe('runOrchestration', () => {
  it('[QL-18] runs the steps in declared order, hands outputs on, and records a child id as soon as it opens', async () => {
    const def = definition();
    const record = open(def);
    const deps = harness((_, onOpened) => {
      onOpened?.(child());
      return Promise.resolve(child());
    });
    await runOrchestration(def, record, request, null, deps);

    expect(record.status).toBe('complete');
    expect(record.steps['a']).toMatchObject({ status: 'complete', runIds: ['tiny-run'] });
    expect(record.steps['b']).toMatchObject({ status: 'complete', reason: null });
    expect(record.steps['c']).toMatchObject({ status: 'skipped', reason: 'because' });
    // The child id reached the ledger while a was still running.
    expect(
      deps.flushed.some(
        (snap) => snap.steps['a'].status === 'running' && snap.steps['a'].runIds[0] === 'tiny-run',
      ),
    ).toBe(true);
    expect(deps.flushed.map((snap) => snap.steps['b'].status)).toContain('running');
  });

  it('[QL-18] a step that yields nothing blocks what needs it, naming itself; a fatal failure fails the run', async () => {
    const def = definition(() => ({
      status: 'failed',
      reason: 'run-failed',
      error: { name: 'Boom', message: 'a died', stack: null },
    }));
    const record = open(def);
    await runOrchestration(def, record, request, null, harness());
    expect(record.steps['a']).toMatchObject({ status: 'failed', reason: 'run-failed' });
    expect(record.steps['b']).toMatchObject({
      status: 'skipped',
      reason: 'upstream-failed',
      note: 'a',
    });
    expect(record.steps['c']).toMatchObject({
      status: 'skipped',
      reason: 'upstream-skipped',
      note: 'b',
    });
    expect(record.status).toBe('failed');
    expect(record.error?.message).toBe('a died');
  });

  it('[QL-18] a completed step with no output still blocks, and the run is complete', async () => {
    const def = definition(() => ({ status: 'complete', reason: 'because' }));
    const record = open(def);
    await runOrchestration(def, record, request, null, harness());
    expect(record.steps['a']).toMatchObject({ status: 'complete', reason: 'because' });
    expect(record.steps['b']).toMatchObject({
      status: 'skipped',
      reason: 'upstream-skipped',
      note: 'a',
    });
    expect(record.status).toBe('complete');
  });

  it('[QL-18] an undeclared reason fails the step as errored; a missing pipeline skips it', async () => {
    const def = definition(() => ({ status: 'complete', reason: 'made-up', output: 'a!' }));
    const record = open(def);
    await runOrchestration(def, record, request, null, harness());
    expect(record.steps['a']).toMatchObject({ status: 'failed', reason: 'errored' });
    expect(record.steps['a'].note).toContain('made-up');

    const gone = definition();
    const deps = harness();
    deps.pipelines = () => [];
    const second = open(gone);
    await runOrchestration(gone, second, request, null, deps);
    expect(second.steps['a']).toMatchObject({
      status: 'skipped',
      reason: 'pipeline-unavailable',
      note: 'tiny',
    });
  });

  it('[QL-18] an error nobody expected closes the record: running failed, pending skipped, one reason', async () => {
    const def = definition(() => {
      throw new Error('kaboom');
    });
    const record = open(def);
    await runOrchestration(def, record, request, null, harness());
    expect(record.status).toBe('failed');
    expect(record.error?.message).toBe('kaboom');
    expect(record.steps['a']).toMatchObject({
      status: 'failed',
      reason: 'errored',
      note: 'kaboom',
    });
    expect(record.steps['b']).toMatchObject({ status: 'skipped', reason: 'errored' });
    expect(record.finishedAt).toBe('now');
  });

  it('[QL-18] a provided run stands in for the steps that declare it, and its output feeds the rest', async () => {
    const def = definition();
    const provided: QualityRunDto = { ...child('given'), exchanges: [] };
    const record = open(def, provided);
    expect(record.steps['a']).toMatchObject({
      status: 'skipped',
      reason: 'provided-run',
      runIds: ['given'],
    });
    const execute = vi.fn();
    await runOrchestration(def, record, request, provided, harness(execute));
    expect(execute).not.toHaveBeenCalled();
    expect(record.steps['b']).toMatchObject({ status: 'complete' });
    expect(record.status).toBe('complete');
  });
});

describe('declared pipelines', () => {
  const summaries = (...ids: string[]): PipelineSummary[] => ids.map((id) => summaryOf(id));

  it('[QL-19] a step that opens several children keeps every id, in the order they opened', async () => {
    const def: OrchestratorDefinition<Outputs, Ports> = {
      ...definition(),
      steps: [
        {
          id: 'a',
          pipeline: 'tiny',
          run: async (ctx) => {
            await ctx.execute({ goal: '1' });
            await ctx.execute({ goal: '2' });
            return { status: 'complete', output: 'a!' };
          },
        },
      ],
    };
    let opened = 0;
    const deps = harness((_, onOpened) => {
      const run = child(`r-${++opened}`);
      onOpened?.(run);
      return Promise.resolve(run);
    });
    const record = open(def);
    await runOrchestration(def, record, request, null, deps);
    expect(record.steps['a'].runIds).toEqual(['r-1', 'r-2']);
    expect(
      deps.flushed.some(
        (snap) => snap.steps['a'].status === 'running' && snap.steps['a'].runIds.length === 1,
      ),
    ).toBe(true);
  });

  it('[QL-19] a chooser sees what earlier steps produced; an unregistered choice skips the step, naming it', async () => {
    const chooser = (answer: string): OrchestratorDefinition<Outputs, Ports> => ({
      ...definition(),
      steps: [
        { id: 'a', run: () => Promise.resolve({ status: 'complete', output: answer }) },
        {
          id: 'b',
          needs: ['a'],
          pipeline: (_, outputs) => (outputs.a === 'x' ? 'tiny' : 'other'),
          run: async (ctx) => {
            await ctx.execute({ goal: 'b' });
            return { status: 'complete', output: 'b!' };
          },
        },
      ],
    });
    const asked: string[] = [];
    const deps = harness((req, onOpened) => {
      asked.push(req.pipeline);
      onOpened?.(child());
      return Promise.resolve(child());
    });

    const routed = open(chooser('x'));
    await runOrchestration(chooser('x'), routed, request, null, deps);
    expect(asked).toEqual(['tiny']);
    expect(routed.steps['b']).toMatchObject({ status: 'complete', runIds: ['tiny-run'] });

    const unrouted = open(chooser('y'));
    await runOrchestration(chooser('y'), unrouted, request, null, deps);
    expect(unrouted.steps['b']).toMatchObject({
      status: 'skipped',
      reason: 'pipeline-unavailable',
      note: 'other',
    });
    expect(asked).toEqual(['tiny']);
  });

  it('[QL-19] a step that declares several pipelines must name the one it runs, and only one it declared', async () => {
    let seen: readonly string[] = [];
    const withList = (
      run: (ctx: StepContext<Outputs, Ports>) => Promise<StepResult<string>>,
    ): OrchestratorDefinition<Outputs, Ports> => ({
      ...definition(),
      steps: [
        {
          id: 'a',
          pipeline: ['tiny', 'other'],
          run: (ctx) => {
            seen = ctx.pipelines;
            return run(ctx);
          },
        },
      ],
    });
    const asked: string[] = [];
    const deps = harness((req, onOpened) => {
      asked.push(req.pipeline);
      onOpened?.(child());
      return Promise.resolve(child());
    });
    deps.pipelines = () => summaries('tiny', 'other');

    const named = withList(async (ctx) => {
      await ctx.execute({ goal: 'g' }, 'other');
      return { status: 'complete', output: 'a!' };
    });
    const ok = open(named);
    await runOrchestration(named, ok, request, null, deps);
    expect(seen).toEqual(['tiny', 'other']);
    expect(asked).toEqual(['other']);
    expect(ok.steps['a']).toMatchObject({ status: 'complete', runIds: ['tiny-run'] });

    const unnamed = withList(async (ctx) => {
      await ctx.execute({ goal: 'g' });
      return { status: 'complete', output: 'a!' };
    });
    const ambiguous = open(unnamed);
    await runOrchestration(unnamed, ambiguous, request, null, deps);
    expect(ambiguous.status).toBe('failed');
    expect(ambiguous.steps['a']).toMatchObject({ status: 'failed', reason: 'errored' });
    expect(ambiguous.error?.message).toContain('name one');

    const undeclared = withList(async (ctx) => {
      await ctx.execute({ goal: 'g' }, 'nope');
      return { status: 'complete', output: 'a!' };
    });
    const refused = open(undeclared);
    await runOrchestration(undeclared, refused, request, null, deps);
    expect(refused.error?.message).toContain('not declared');
    expect(asked).toEqual(['other']);
  });

  it('[QL-19] a step may report, and the report stays on its ledger entry', async () => {
    const def: OrchestratorDefinition<Outputs, Ports> = {
      ...definition(),
      steps: [
        {
          id: 'a',
          run: () => Promise.resolve({ status: 'complete', output: 'a!', report: { runs: 2 } }),
        },
      ],
    };
    const record = open(def);
    await runOrchestration(def, record, request, null, harness());
    expect(record.steps['a'].report).toEqual({ runs: 2 });
    expect(record.steps['a'].runIds).toEqual([]);
    expect(pendingStep().report).toBeNull();
  });
});
