import type { INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { MemoryDesignCycle, truncateTestTables } from '@sysdesign/db';
import { MEMORY_DESIGN_CYCLE_STATUSES } from '@sysdesign/contracts';

import { bootApp } from './testing';
import type { FakeLoopClient } from '../designs/testing';

type Envelope<T> = { data: T };
const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;

describe('the agentic-system HTTP surface', () => {
  let app: INestApplication;
  let url: string;
  let loop: FakeLoopClient;
  beforeAll(async () => {
    ({ app, url, loop } = await bootApp());
    await truncateTestTables(app.get(EntityManager).fork(), [MemoryDesignCycle]);
  });
  afterAll(async () => {
    await truncateTestTables(app.get(EntityManager).fork(), [MemoryDesignCycle]);
    await app.close();
  });

  const send = (method: string, path: string, body?: unknown): Promise<Response> =>
    fetch(`${url}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  /** Poll the row off the request path until the detached cycle reaches a terminal status. */
  const settle = async (id: string): Promise<{ status: string }> => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const got = await json<Envelope<{ status: string }>>(await send('GET', `/designs/${id}`));
      if (got.data.status === 'stored' || got.data.status === 'failed') return got.data;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`cycle ${id} did not settle`);
  };

  it('[AGS-4] health is ok', async () => {
    expect((await send('GET', '/health')).status).toBe(200);
  });

  it('[AGS-4] starts a cycle from a brief (202, running), coaches it, and reads it back', async () => {
    const started = await send('POST', '/designs', { goal: '# Design a memory service' });
    expect(started.status).toBe(202);
    const body = await json<Envelope<{ id: string; status: string }>>(started);
    expect(body.data.status).toBe('running');
    expect(MEMORY_DESIGN_CYCLE_STATUSES as readonly string[]).toContain(body.data.status);

    // The cycle runs off the request path: the loop coaches a strategy, then the run is digested.
    const final = await settle(body.data.id);
    expect(final.status).toBe('stored');
    // The loop was asked to run the memory-architecture pipeline, straight from the brief.
    expect(loop.runs.map((request) => request.pipeline)).toContain('memory-architecture');
  });

  it('[AGS-4] 404s an unknown cycle and 400s a request with no goal', async () => {
    expect((await send('GET', '/designs/00000000-0000-0000-0000-000000000000')).status).toBe(404);
    expect((await send('POST', '/designs', {})).status).toBe(400);
  });
});
