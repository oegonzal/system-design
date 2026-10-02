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
});
