import type { INestApplication } from '@nestjs/common';
import { TOOL_MISSION_FIXTURE, type ToolPlan, type ToolSessionRecord } from '@sysdesign/contracts';

import { InMemoryMailbox, sampleMessage } from '../mailbox/testing';
import { InboxWatch } from './app.module';
import { bootApp } from './testing';

type Envelope<T> = { data: T };
const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;

const searching: ToolPlan = {
  assessment: 'Find the thread.',
  calls: [
    {
      tool: 'search_threads',
      argumentsJson: '{"query":"lunch","max":null}',
      reason: 'first',
      expect: null,
      serves: [],
    },
  ],
  ask: null,
  finish: null,
};
const finishing: ToolPlan = {
  assessment: 'Done.',
  calls: [],
  ask: null,
  finish: { cause: 'nothing-left', detail: 'found' },
};

describe('the mailbox service over HTTP', () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await bootApp(new InMemoryMailbox([sampleMessage({ id: 'm1' })]), [
      { artifact: searching },
      { artifact: finishing },
    ]));
  });
  afterAll(async () => {
    await app.close();
  });

  const send = (method: string, path: string, body?: unknown): Promise<Response> =>
    fetch(`${url}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it('[GML-7] serves health, the ten tools, and a tool run directly', async () => {
    expect((await send('GET', '/health')).status).toBe(200);
    // A process that does not serve watches nothing: the served one is the inbox's watcher.
    expect(() => app.get(InboxWatch)).toThrow();
    const tools = await json<Envelope<{ name: string }[]>>(await send('GET', '/tools'));
    expect(tools.data.map((tool) => tool.name)).toHaveLength(10);
    const ran = await send('POST', '/tools/get_message', { arguments: { id: 'm1' } });
    expect(ran.status).toBe(200);
    expect(
      (await json<Envelope<{ outcome: string; summary: string }>>(ran)).data.summary,
    ).toContain('Subject: Lunch next week?');
    expect((await send('POST', '/tools/get_message', { arguments: { id: 1 } })).status).toBe(400);
  });

  it('[GML-7] runs a session the loop decides over the mailbox and reads it back', async () => {
    const started = await send('POST', '/sessions', { mission: TOOL_MISSION_FIXTURE, maxSteps: 3 });
    expect(started.status).toBe(202);
    const { data } = await json<Envelope<ToolSessionRecord>>(started);
    let record = data;
    for (let tries = 0; tries < 200 && record.status === 'running'; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      record = (await json<Envelope<ToolSessionRecord>>(await send('GET', `/sessions/${data.id}`)))
        .data;
    }
    expect(record.status).toBe('complete');
    expect(record.service).toBe('gmail');
    expect(record.steps[0]?.calls[0]).toMatchObject({ tool: 'search_threads', outcome: 'ok' });
    expect(record.steps[0]?.calls[0]?.summary).toContain('thread t1');
  });
});
