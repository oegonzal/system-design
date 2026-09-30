import {
  BadGatewayException,
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { HttpQualityLoopClient } from './http-quality-loop.client';

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

describe('HttpQualityLoopClient', () => {
  it('[DEL-1] starts a run and reads it back, unwrapping the envelope; a missing run is null', async () => {
    const { fetch, calls } = scripted(({ url }) =>
      url.endsWith('/runs')
        ? json(202, { data: { runId: 'r1', status: 'running' } })
        : url.endsWith('/runs/r1')
          ? json(200, { data: { runId: 'r1', status: 'running', trace: null } })
          : json(404, { statusCode: 404, message: 'run r2 not found' }),
    );
    const client = new HttpQualityLoopClient('http://loop', fetch);

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

  it('[DEL-6] a 503 from /criteria is a 503 carrying the availability; a refusal is 502; a timeout is 504; a dead socket is 502', async () => {
    const llm = { enabled: false, model: null, reason: 'no-key' };
    const noModel = new HttpQualityLoopClient(
      'http://loop',
      scripted(() => json(503, { message: 'no model', llm })).fetch,
    );
    await expect(noModel.deriveCriteria({ pipeline: 'p', goal: 'g' })).rejects.toMatchObject({
      constructor: ServiceUnavailableException,
      response: { llm },
    });

    const refusing = new HttpQualityLoopClient(
      'http://loop',
      scripted(() => json(400, { message: 'invalid criteria' })).fetch,
    );
    await expect(refusing.startRun({ pipeline: 'p', goal: 'g' })).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    await expect(refusing.startRun({ pipeline: 'p', goal: 'g' })).rejects.toThrow(
      /refused POST \/runs \(400\): invalid criteria/,
    );

    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    const slow = new HttpQualityLoopClient('http://loop', scripted(() => timeout).fetch);
    await expect(slow.health()).rejects.toBeInstanceOf(GatewayTimeoutException);

    const dead = new HttpQualityLoopClient(
      'http://loop',
      scripted(() => new TypeError('fetch failed')).fetch,
    );
    await expect(dead.health()).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('reads health unwrapped, and a library document by a path id encoded segment by segment', async () => {
    const { fetch, calls } = scripted(({ url }) =>
      url.endsWith('/health')
        ? json(200, { status: 'ok', llm: { enabled: true, model: 'm', reason: null } })
        : url.endsWith('/prompts/agentic/workflow%20graph')
          ? json(200, { data: { id: 'agentic/workflow graph', title: 't', markdown: '# t' } })
          : json(404, {}),
    );
    const client = new HttpQualityLoopClient('http://loop', fetch);

    expect(await client.health()).toEqual({
      status: 'ok',
      llm: { enabled: true, model: 'm', reason: null },
    });
    expect((await client.getPrompt('agentic/workflow graph'))?.title).toBe('t');
    expect(calls[1]?.url).toBe('http://loop/prompts/agentic/workflow%20graph');
    expect(await client.getPrompt('missing')).toBeNull();
  });
});
