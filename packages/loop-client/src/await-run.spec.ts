import {
  bound,
  bounded,
  type IterationTrace,
  type OrchestrationRunDto,
  type QualityLoopHealthDto,
  type QualityRunDto,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { awaitOrchestration, awaitRun, bestArtifact } from './await-run';
import { LoopClient } from './loop-client';
import { LoopRunLost, LoopRunStale } from './loop-errors';

const T0 = Date.parse('2026-10-02T12:00:00.000Z');
const at = (offsetMs: number): string => new Date(T0 + offsetMs).toISOString();

const run = (overrides: Partial<QualityRunDto>): QualityRunDto => ({
  runId: 'r1',
  pipeline: 'p',
  status: 'running',
  startedAt: at(0),
  finishedAt: null,
  heartbeatAt: at(0),
  llm: { model: 'm' },
  request: {
    goal: 'g',
    outputProvided: false,
    criteriaProvided: true,
    adoptedFrom: null,
    maxIterations: 1,
  },
  parentRunId: null,
  openedBy: null,
  recall: null,
  trace: null,
  exchanges: [],
  error: null,
  ...overrides,
});

const orchestration = (overrides: Partial<OrchestrationRunDto>): OrchestrationRunDto => ({
  orchestrationRunId: 'o1',
  orchestrator: 'form-memory',
  pipeline: null,
  status: 'running',
  startedAt: at(0),
  finishedAt: null,
  request: {
    goal: 'g',
    outputProvided: false,
    criteriaProvided: true,
    adoptedFrom: null,
    maxIterations: 1,
    samples: null,
  },
  openedBy: null,
  context: {},
  steps: {},
  error: null,
  ...overrides,
});

/** A client that answers each read from a script and counts its calls; nothing else is ever asked. */
class ScriptedClient extends LoopClient {
  reads = 0;
  constructor(
    private readonly runs: (QualityRunDto | null)[] = [],
    private readonly orchestrations: (OrchestrationRunDto | null)[] = [],
  ) {
    super();
  }
  async health(): Promise<QualityLoopHealthDto> {
    return {
      status: 'ok',
      llm: { model: 'm' },
      heartbeat: { heartbeatEveryMs: 60_000, staleAfterMs: 180_000 },
    };
  }
  async getRun(): Promise<QualityRunDto | null> {
    this.reads += 1;
    return this.runs.length > 1 ? (this.runs.shift() ?? null) : (this.runs[0] ?? null);
  }
  async getOrchestration(): Promise<OrchestrationRunDto | null> {
    return this.orchestrations.length > 1
      ? (this.orchestrations.shift() ?? null)
      : (this.orchestrations[0] ?? null);
  }
  deriveCriteria(): never {
    throw new Error('not asked');
  }
  startRun(): never {
    throw new Error('not asked');
  }
  listPrompts(): never {
    throw new Error('not asked');
  }
  getPrompt(): never {
    throw new Error('not asked');
  }
  startOrchestration(): never {
    throw new Error('not asked');
  }
  startOrchestrationFromRun(): never {
    throw new Error('not asked');
  }
}

/** Fake time: each sleep advances the clock, so a heartbeat can go stale without waiting. */
function clock() {
  let now = T0;
  return {
    now: () => now,
    sleep: async (ms: number) => {
      now += ms;
    },
  };
}

describe('awaitRun', () => {
  it('[LC-2] returns the run once it settles, polling at the given pace and reading the window from /health', async () => {
    const client = new ScriptedClient([
      run({ status: 'running', heartbeatAt: at(0) }),
      run({ status: 'running', heartbeatAt: at(3_000) }),
      run({ status: 'complete', finishedAt: at(6_000), heartbeatAt: at(6_000) }),
    ]);
    const settled = await awaitRun(client, 'r1', { pollEveryMs: 3_000, ...clock() });
    expect(settled.status).toBe('complete');
    expect(client.reads).toBe(3);
  });

  it('[LC-2] judges liveness by the heartbeat, not the status: a run still saying running past the window is stale', async () => {
    const client = new ScriptedClient([run({ status: 'running', heartbeatAt: at(0) })]);
    await expect(
      awaitRun(client, 'r1', { pollEveryMs: 60_000, staleAfterMs: 180_000, ...clock() }),
    ).rejects.toBeInstanceOf(LoopRunStale);
  });

  it('[LC-2] a run the loop no longer has is lost, not awaited forever', async () => {
    const client = new ScriptedClient([null]);
    await expect(awaitRun(client, 'r1', clock())).rejects.toBeInstanceOf(LoopRunLost);
  });
});

describe('awaitOrchestration', () => {
  it('[LC-2] reads liveness off the child run its running step has open, and settles with the record', async () => {
    const child = run({ runId: 'c1', heartbeatAt: at(0) });
    const client = new ScriptedClient(
      [child],
      [
        orchestration({
          steps: {
            target: {
              status: 'running',
              reason: null,
              runIds: ['c1'],
              note: null,
              counts: {},
              report: null,
              startedAt: at(0),
              finishedAt: null,
            },
          },
        }),
        orchestration({ status: 'complete', finishedAt: at(3_000) }),
      ],
    );
    const settled = await awaitOrchestration(client, 'o1', { pollEveryMs: 3_000, ...clock() });
    expect(settled.status).toBe('complete');
    expect(client.reads).toBe(1);
  });

  it('[LC-2] a stalled child fails the wait as stale, naming the child', async () => {
    const client = new ScriptedClient(
      [run({ runId: 'c1', heartbeatAt: at(0) })],
      [
        orchestration({
          steps: {
            target: {
              status: 'running',
              reason: null,
              runIds: ['c1'],
              note: null,
              counts: {},
              report: null,
              startedAt: at(0),
              finishedAt: null,
            },
          },
        }),
      ],
    );
    const time = clock();
    await time.sleep(200_000);
    await expect(
      awaitOrchestration(client, 'o1', { pollEveryMs: 3_000, staleAfterMs: 180_000, ...time }),
    ).rejects.toMatchObject({ constructor: LoopRunStale, runId: 'c1' });
  });
});

describe('bestArtifact', () => {
  it('finds the best iteration by its number and reads it through the schema', () => {
    const iteration = (n: number, artifact: unknown) =>
      ({ iteration: n, artifact }) as QualityRunDto['trace'] extends infer T
        ? T extends { iterations: (infer I)[] }
          ? I
          : never
        : never;
    const settled = run({
      status: 'complete',
      trace: {
        pipeline: { id: 'p', version: '1' },
        contract: { goal: 'g', criteria: [] },
        iterations: [iteration(1, { a: 'first' }), iteration(2, { a: 'second' })],
        bestIteration: 2,
        finalDecision: 'accept',
        stopReason: 'accepted',
        lessons: [],
      },
    });
    expect(bestArtifact(settled, z.object({ a: z.string() }))).toEqual({ a: 'second' });
    expect(bestArtifact(settled, z.object({ b: z.string() }))).toBeNull();
    expect(bestArtifact(run({}), z.object({}))).toBeNull();
  });

  it('[QL-58] reads a field the seam kept past its ceiling as kept, and refuses only a structural fault', () => {
    const NOTE = bound(20);
    const schema = z.strictObject({ note: bounded.text(NOTE) });
    const note = 'n'.repeat(NOTE.ceiling + 1);
    const settled = (artifact: unknown) =>
      run({
        status: 'complete',
        trace: {
          pipeline: { id: 'p', version: '1' },
          contract: { goal: 'g', criteria: [] },
          iterations: [{ iteration: 1, artifact } as IterationTrace],
          bestIteration: 1,
          finalDecision: 'accept',
          stopReason: 'accepted',
          lessons: [],
        },
      });
    expect(bestArtifact(settled({ note }), schema)).toEqual({ note });
    expect(bestArtifact(settled({ note: 7 }), schema)).toBeNull();
  });
});
