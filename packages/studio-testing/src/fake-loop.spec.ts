import {
  CANVAS_PIPELINE_ID,
  recallInProgress,
  recallOf,
  recallWithout,
  type StartQualityRunRequest,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { criteriaFromMarkdown } from './criteria-from-markdown';
import { FakeLoop } from './fake-loop';
import { FAKE_RECALLED_LESSONS, fakeRecallRunId } from './fake-recall';
import { DerivationFailed, LoopRefused, LoopUnreachable } from './loop-errors';

const GOAL = [
  '# Order history',
  '',
  '## Functional requirements',
  '',
  '1. Read orders.',
  '2. Ingest orders.',
].join('\n');

const graph = (nodes: number) => ({
  graph: {
    nodes: Array.from({ length: nodes }, (_, i) => ({
      id: `n-${i + 1}`,
      kind: 'service',
      label: `S${i + 1}`,
    })),
    edges: [],
  },
  brief: null,
  narrative: null,
});

const request = (overrides: Partial<StartQualityRunRequest> = {}): StartQualityRunRequest => ({
  pipeline: CANVAS_PIPELINE_ID,
  goal: GOAL,
  output: graph(3),
  criteria: criteriaFromMarkdown(GOAL),
  maxIterations: 1,
  ...overrides,
});

describe('FakeLoop', () => {
  it('[QL-32] a run that asks to recall opens recalling and settles to the fixed lessons before any iteration lands; one that did not never recalls', () => {
    const loop = new FakeLoop();
    const { runId } = loop.startRun(request({ recall: true, maxIterations: 2 }));
    expect(loop.getRun(runId)?.recall).toEqual(recallInProgress());

    loop.progress(runId, []);
    expect(loop.getRun(runId)?.recall).toEqual(
      recallOf(FAKE_RECALLED_LESSONS, fakeRecallRunId(runId)),
    );
    loop.complete(runId, 'auto');
    expect(loop.getRun(runId)?.recall?.count).toBe(FAKE_RECALLED_LESSONS.length);

    const scripted = loop.startRun(request({ recall: true })).runId;
    loop.recall(scripted, recallWithout('store-empty'));
    loop.settle(scripted);
    expect(loop.getRun(scripted)?.recall).toMatchObject({ status: 'empty', reason: 'store-empty' });

    const grade = loop.startRun(request()).runId;
    loop.settle(grade);
    expect(loop.getRun(grade)?.recall).toBeNull();
    expect(() => loop.recall(grade)).toThrow(/did not ask to recall/);
  });

  it('starts a run running, records the request, and settles it by the goal’s scenario — none means the stub’s own grade', () => {
    const loop = new FakeLoop();
    expect(loop.startRun(request())).toEqual({ runId: 'fake-run-1', status: 'running' });
    expect(loop.startRequests).toHaveLength(1);
    expect(loop.getRun('fake-run-1')?.status).toBe('running');

    loop.settle('fake-run-1');
    const run = loop.getRun('fake-run-1');
    expect(run?.status).toBe('complete');
    expect(run?.trace?.iterations[0].decision.scores.overall).toBe(64);
    expect(run?.trace?.iterations[0].decision.finalDecision).toBe('revise');
    expect(run?.trace?.contract.criteria.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('a fail scenario fails the run once; the next run on the same goal completes', () => {
    const loop = new FakeLoop();
    loop.scenario(GOAL, { outcome: 'fail', message: 'the model went away', once: true });
    loop.startRun(request());
    loop.settle('fake-run-1');
    expect(loop.getRun('fake-run-1')).toMatchObject({
      status: 'failed',
      error: { message: 'the model went away' },
    });

    loop.startRun(request());
    loop.settle('fake-run-2');
    expect(loop.getRun('fake-run-2')?.status).toBe('complete');
  });

  it('a refuse scenario refuses the start; unreachable and derivation failures are typed errors', () => {
    const loop = new FakeLoop();
    loop.scenario(GOAL, { outcome: 'refuse', status: 409, message: 'busy' });
    expect(() => loop.startRun(request())).toThrow(LoopRefused);
    expect(loop.startRequests).toHaveLength(0);

    loop.unreachable = true;
    expect(() => loop.health()).toThrow(LoopUnreachable);
    expect(() => loop.getRun('x')).toThrow(LoopUnreachable);
    expect(() => loop.deriveCriteria({ pipeline: CANVAS_PIPELINE_ID, goal: GOAL })).toThrow(
      LoopUnreachable,
    );
    loop.unreachable = false;

    loop.derivationFails = true;
    let caught: unknown;
    try {
      loop.deriveCriteria({ pipeline: CANVAS_PIPELINE_ID, goal: GOAL });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DerivationFailed);
    expect((caught as DerivationFailed).diagnostic).toMatchObject({
      stage: 'criteria',
      reason: 'llm-failed',
    });
    expect((caught as DerivationFailed).llm.model).toBe('fake-model');
  });

  it('a scripted iteration with a blocking validator report reads as blocked, exactly as the real loop records it', () => {
    const loop = new FakeLoop();
    loop.startRun(request({ maxIterations: 2 }));
    loop.complete('fake-run-1', [
      { overall: 40 },
      {
        overall: 0,
        validation: [
          {
            validatorId: 'references',
            gate: 'block',
            problems: [
              {
                severity: 'critical',
                locationRefs: [],
                message: 'binding references unknown criterion: c9',
              },
            ],
          },
        ],
      },
    ]);
    const second = loop.getRun('fake-run-1')?.trace?.iterations[1];
    expect(second?.decision.gates.validatorsPassed).toBe(false);
    expect(second?.decision.reason).toContain('blocked by validator(s) references');
    expect(second?.ledger.criteria.every((c) => c.result === 'unassessed')).toBe(true);
  });

  it('adopts a judged iteration verbatim as iteration 1 in mode adopted, and refuses a different rubric or an unknown run', () => {
    const loop = new FakeLoop();
    loop.startRun(request());
    loop.complete('fake-run-1', 'auto');
    const judged = loop.getRun('fake-run-1')?.trace?.iterations[0];

    loop.startRun({
      ...request({ maxIterations: 2 }),
      output: undefined,
      adopt: { runId: 'fake-run-1', iteration: 1 },
    });
    loop.complete('fake-run-2', [{ overall: 72, artifact: graph(4) }]);
    const trace = loop.getRun('fake-run-2')?.trace;
    expect(trace?.iterations[0]).toEqual({ ...judged, iteration: 1, mode: 'adopted' });
    expect(trace?.iterations[1]).toMatchObject({ iteration: 2, mode: 'revise' });
    expect(trace?.bestIteration).toBe(2);

    expect(() =>
      loop.startRun({
        ...request({ criteria: [{ id: 'c1', kind: 'functional', statement: 'other' }] }),
        output: undefined,
        adopt: { runId: 'fake-run-1', iteration: 1 },
      }),
    ).toThrow(/rubric/);
    expect(() =>
      loop.startRun({ ...request(), output: undefined, adopt: { runId: 'nope', iteration: 1 } }),
    ).toThrow(LoopRefused);
  });

  it('publishes a running run’s finished iterations as the loop does, and settles it later', () => {
    const loop = new FakeLoop();
    loop.startRun(request({ maxIterations: 3 }));
    loop.progress('fake-run-1');
    expect(loop.getRun('fake-run-1')).toMatchObject({ status: 'running', trace: null });

    loop.progress('fake-run-1', [{ overall: 40 }, { overall: 55, artifact: graph(4) }]);
    const running = loop.getRun('fake-run-1');
    expect(running?.status).toBe('running');
    expect(running?.finishedAt).toBeNull();
    expect(running?.trace?.iterations.map((it) => it.decision.scores.overall)).toEqual([40, 55]);
    expect(running?.trace).toMatchObject({ bestIteration: 2, stopReason: null });
    // A running run's iterations so far are not a verdict to adopt.
    expect(() =>
      loop.startRun({
        ...request(),
        output: undefined,
        adopt: { runId: 'fake-run-1', iteration: 1 },
      }),
    ).toThrow(/still running/);

    loop.complete('fake-run-1', [
      { overall: 40 },
      { overall: 55, artifact: graph(4) },
      { overall: 60, artifact: graph(5) },
    ]);
    expect(loop.getRun('fake-run-1')?.trace?.iterations).toHaveLength(3);
    expect(loop.getRun('fake-run-1')?.trace?.stopReason).toBe('max-iterations');
    expect(() => loop.progress('fake-run-1', [{ overall: 1 }])).toThrow(/settled/);
  });

  it('a run that fails after publishing progress keeps what it recorded, with no stop reason', () => {
    const loop = new FakeLoop();
    loop.startRun(request({ maxIterations: 3 }));
    loop.progress('fake-run-1', [{ overall: 40 }, { overall: 55, artifact: graph(4) }]);
    const recorded = loop.getRun('fake-run-1')?.trace;

    loop.fail('fake-run-1', 'the model went away');
    const failed = loop.getRun('fake-run-1');
    expect(failed).toMatchObject({ status: 'failed', error: { message: 'the model went away' } });
    expect(failed?.trace).toEqual(recorded);
    expect(failed?.trace).toMatchObject({ bestIteration: 2, stopReason: null });

    // Final, so adoptable — as the loop adopts any stopped run's recorded iteration.
    loop.startRun({
      ...request(),
      output: undefined,
      adopt: { runId: 'fake-run-1', iteration: 2 },
    });
    loop.complete('fake-run-2', []);
    expect(loop.getRun('fake-run-2')?.trace?.iterations[0]).toEqual({
      ...recorded?.iterations[1],
      iteration: 1,
      mode: 'adopted',
    });
  });

  it('forgets a run as a loop whose store lost it: a read of it answers nothing', () => {
    const loop = new FakeLoop();
    loop.startRun(request());
    loop.forget('fake-run-1');
    expect(loop.getRun('fake-run-1')).toBeNull();
    expect(loop.requests.has('fake-run-1')).toBe(false);
    expect(() => loop.forget('fake-run-1')).toThrow(/no run/);
  });

  it('reset clears every run, request and scenario', () => {
    const loop = new FakeLoop();
    loop.scenario(GOAL, { outcome: 'fail', message: 'x' });
    loop.startRun(request());
    loop.unreachable = true;
    loop.reset();
    expect(loop.runs.size).toBe(0);
    expect(loop.startRequests).toEqual([]);
    expect(loop.unreachable).toBe(false);
    loop.startRun(request());
    loop.settle('fake-run-1');
    expect(loop.getRun('fake-run-1')?.status).toBe('complete');
  });
});
