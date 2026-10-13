import { describe, expect, it } from 'vitest';

import { HttpLoopClient } from './http-loop-client';
import { DerivationFailed, LoopRefused, LoopTimeout, LoopUnreachable } from './loop-errors';

type Call = { url: string; init: RequestInit | undefined };

/** A fetch that answers by script and records what it was asked. */
function scripted(answer: (call: Call) => Response | Error): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    const result = answer(call);
    if (result instanceof Error) throw result;
    return result;
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('HttpLoopClient', () => {
  it('[LC-1] starts a run and reads it back, unwrapping the envelope; a missing run is null', async () => {
    const { fetch, calls } = scripted(({ url }) =>
      url.endsWith('/runs')
        ? json(202, { data: { runId: 'r1', status: 'running' } })
        : url.endsWith('/runs/r1')
          ? json(200, { data: { runId: 'r1', status: 'running', trace: null } })
          : json(404, { statusCode: 404, message: 'run r2 not found' }),
    );
    const client = new HttpLoopClient('http://loop', fetch);

    const started = await client.startRun({ pipeline: 'p', goal: 'g', maxIterations: 1 });
    expect(started).toEqual({ runId: 'r1', status: 'running' });
    expect(calls[0]).toMatchObject({ url: 'http://loop/runs', init: { method: 'POST' } });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      pipeline: 'p',
      goal: 'g',
      maxIterations: 1,
    });

    expect((await client.getRun('r1'))?.runId).toBe('r1');
    expect(await client.getRun('r2')).toBeNull();
  });

  it('[LC-1] starts an orchestration on a goal or from a run, and reads one back; a missing one is null', async () => {
    const { fetch, calls } = scripted(({ url }) =>
      url.endsWith('/orchestrations/form-memory')
        ? json(202, { data: { orchestrationRunId: 'o1', status: 'running' } })
        : url.endsWith('/orchestrations/memory/from-run')
          ? json(202, { data: { orchestrationRunId: 'o2', status: 'running' } })
          : url.endsWith('/orchestrations/o1')
            ? json(200, { data: { orchestrationRunId: 'o1', status: 'complete', steps: {} } })
            : json(404, { message: 'no such orchestration' }),
    );
    const client = new HttpLoopClient('http://loop', fetch);

    expect(await client.startOrchestration('form-memory', { goal: 'g' })).toEqual({
      orchestrationRunId: 'o1',
      status: 'running',
    });
    expect(await client.startOrchestrationFromRun('memory', { runId: 'r1' })).toEqual({
      orchestrationRunId: 'o2',
      status: 'running',
    });
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ runId: 'r1' });
    expect((await client.getOrchestration('o1'))?.status).toBe('complete');
    expect(await client.getOrchestration('o9')).toBeNull();
  });

  it('[LC-1] raises its own errors: a derivation that yielded nothing, a refusal with the route, a timeout, a dead socket', async () => {
    const llm = { model: 'm' };
    const diagnostic = { stage: 'criteria', sample: null, reason: 'llm-failed', detail: null };
    const failed = new HttpLoopClient(
      'http://loop',
      scripted(() => json(503, { message: 'the model derived no criteria', llm, diagnostic }))
        .fetch,
    );
    await expect(failed.deriveCriteria({ pipeline: 'p', goal: 'g' })).rejects.toMatchObject({
      constructor: DerivationFailed,
      llm,
      diagnostic,
    });

    const refusing = new HttpLoopClient(
      'http://loop',
      scripted(() => json(400, { message: 'invalid criteria' })).fetch,
    );
    await expect(refusing.startRun({ pipeline: 'p', goal: 'g' })).rejects.toMatchObject({
      constructor: LoopRefused,
      status: 400,
      message: 'invalid criteria',
      route: 'POST /runs',
    });

    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    const slow = new HttpLoopClient('http://loop', scripted(() => timeout).fetch);
    await expect(slow.health()).rejects.toMatchObject({
      constructor: LoopTimeout,
      route: 'GET /health',
    });

    const dead = new HttpLoopClient(
      'http://loop',
      scripted(() => new TypeError('fetch failed')).fetch,
    );
    await expect(dead.health()).rejects.toBeInstanceOf(LoopUnreachable);
    await expect(dead.health()).rejects.toThrow(/unreachable: TypeError: fetch failed/);
  });

  it('[LC-3] rides out a restarting loop within a declared window: asks again what never arrived and a read the loop failed, never a timeout or an answered start', async () => {
    let clock = 0;
    const slept: number[] = [];
    const recovery = { windowMs: 10_000, pauseMs: 2_000 };
    const ticking = {
      now: () => clock,
      sleep: async (ms: number) => {
        slept.push(ms);
        clock += ms;
      },
    };
    const dead = () => new TypeError('fetch failed');
    const run = { runId: 'r1', status: 'running', trace: null };

    // A read that cannot connect twice, then answers.
    let reads = 0;
    const reading = scripted(() => (++reads <= 2 ? dead() : json(200, { data: run })));
    expect(
      await new HttpLoopClient('http://loop', reading.fetch, recovery, ticking).getRun('r1'),
    ).toEqual(run);
    expect([reading.calls.length, slept]).toEqual([3, [2_000, 2_000]]);

    // A read the loop failed while it came back, then answered.
    let failed = 0;
    const failing = scripted(() =>
      ++failed === 1
        ? json(503, { statusCode: 503, message: 'starting' })
        : json(200, { data: run }),
    );
    expect(
      await new HttpLoopClient('http://loop', failing.fetch, recovery, ticking).getRun('r1'),
    ).toEqual(run);
    expect(failing.calls).toHaveLength(2);

    // A start that never connected is asked again; one the loop answered is not.
    let starts = 0;
    const connecting = scripted(() =>
      ++starts === 1 ? dead() : json(202, { data: { runId: 'r2', status: 'running' } }),
    );
    expect(
      await new HttpLoopClient('http://loop', connecting.fetch, recovery, ticking).startRun({
        pipeline: 'p',
        goal: 'g',
      }),
    ).toEqual({ runId: 'r2', status: 'running' });
    const refusing = scripted(() =>
      json(500, { statusCode: 500, message: 'Internal server error' }),
    );
    await expect(
      new HttpLoopClient('http://loop', refusing.fetch, recovery, ticking).startRun({
        pipeline: 'p',
        goal: 'g',
      }),
    ).rejects.toMatchObject({ constructor: LoopRefused, status: 500 });
    expect(refusing.calls).toHaveLength(1);

    // A timeout may have reached the loop: never asked again.
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    const slow = scripted(() => timeout);
    await expect(
      new HttpLoopClient('http://loop', slow.fetch, recovery, ticking).health(),
    ).rejects.toBeInstanceOf(LoopTimeout);
    expect(slow.calls).toHaveLength(1);

    // Past the window — a pause at 0, 2, 4, 6 and 8 s of a 10 s window — the error it would have raised at once.
    const down = scripted(dead);
    await expect(
      new HttpLoopClient('http://loop', down.fetch, recovery, ticking).health(),
    ).rejects.toBeInstanceOf(LoopUnreachable);
    expect(down.calls).toHaveLength(5);

    // A caller that declares nothing is never kept waiting.
    const once = scripted(dead);
    await expect(new HttpLoopClient('http://loop', once.fetch).health()).rejects.toBeInstanceOf(
      LoopUnreachable,
    );
    expect(once.calls).toHaveLength(1);
  });

  it('reads health unwrapped, and a library document by a path id encoded segment by segment', async () => {
    const { fetch, calls } = scripted(({ url }) =>
      url.endsWith('/health')
        ? json(200, {
            status: 'ok',
            llm: { model: 'm' },
            heartbeat: { heartbeatEveryMs: 60_000, staleAfterMs: 180_000 },
          })
        : url.endsWith('/prompts/agentic/workflow%20graph')
          ? json(200, { data: { id: 'agentic/workflow graph', title: 't', markdown: '# t' } })
          : json(404, {}),
    );
    const client = new HttpLoopClient('http://loop', fetch);

    expect(await client.health()).toEqual({
      status: 'ok',
      llm: { model: 'm' },
      heartbeat: { heartbeatEveryMs: 60_000, staleAfterMs: 180_000 },
    });
    expect((await client.getPrompt('agentic/workflow graph'))?.title).toBe('t');
    expect(calls[1]?.url).toBe('http://loop/prompts/agentic/workflow%20graph');
    expect(await client.getPrompt('missing')).toBeNull();
  });
  it('[LC-1] retracts a digest run’s memories by DELETE, unwrapping the envelope; a refusal names the route', async () => {
    const { fetch, calls } = scripted(({ url }) =>
      url.endsWith('/memory/d1')
        ? json(200, { data: { runId: 'd1', removed: 4 } })
        : json(404, { statusCode: 404, message: 'no such run' }),
    );
    const client = new HttpLoopClient('http://loop', fetch);

    expect(await client.retractMemory('d1')).toEqual({ runId: 'd1', removed: 4 });
    expect(calls[0]).toMatchObject({ url: 'http://loop/memory/d1', init: { method: 'DELETE' } });
    await expect(client.retractMemory('d 2')).rejects.toMatchObject({
      status: 404,
      route: 'DELETE /memory/:id',
    });
    expect(calls[1]?.url).toBe('http://loop/memory/d%202');
  });
});
