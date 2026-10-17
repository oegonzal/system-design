import type { INestApplication } from '@nestjs/common';
import { TOOL_MISSION_FIXTURE, type ToolPlan, type ToolSessionRecord } from '@sysdesign/contracts';

import { okTool } from '../session/testing';
import { bootToolSessionApp } from './testing';

type Envelope<T> = { data: T };
const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;

const listing: ToolPlan = {
  assessment: 'List.',
  calls: [
    { tool: 'list_items', argumentsJson: '{"id":"i1"}', reason: 'first', expect: null, serves: [] },
  ],
  ask: null,
  finish: null,
};
const finishing: ToolPlan = {
  assessment: 'Done.',
  calls: [],
  ask: null,
  finish: { cause: 'nothing-left', detail: 'all noted' },
};

describe('the tool-session HTTP surface', () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await bootToolSessionApp(
      [okTool('list_items')],
      [{ artifact: listing }, { artifact: finishing }],
    ));
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

  const settled = async (id: string): Promise<ToolSessionRecord> => {
    for (let tries = 0; tries < 200; tries += 1) {
      const record = (await json<Envelope<ToolSessionRecord>>(await send('GET', `/sessions/${id}`)))
        .data;
      if (record.status !== 'running') return record;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('the session did not settle');
  };

  it('[TSS-4] starts a session (202, running), reads it back as it runs, lists it, and 404s one it does not have', async () => {
    const started = await send('POST', '/sessions', { mission: TOOL_MISSION_FIXTURE, maxSteps: 3 });
    expect(started.status).toBe(202);
    const { data } = await json<Envelope<ToolSessionRecord>>(started);
    expect(data).toMatchObject({ service: 'example', status: 'running', steps: [] });
    const ended = await settled(data.id);
    expect(ended.status).toBe('complete');
    expect(ended.steps.map((step) => step.calls.map((call) => call.outcome))).toEqual([['ok'], []]);
    const listed = await json<Envelope<ToolSessionRecord[]>>(await send('GET', '/sessions'));
    expect(listed.data.map((record) => record.id)).toContain(data.id);
    expect((await send('GET', '/sessions/nope')).status).toBe(404);
    expect((await send('POST', '/sessions/nope/stop')).status).toBe(404);
    expect((await send('POST', '/sessions', {})).status).toBe(400);
    expect(
      (await send('POST', '/sessions', { mission: TOOL_MISSION_FIXTURE, maxSteps: 0 })).status,
    ).toBe(400);
  });

  it('[TSS-4] lists the tools as declared and runs one: 200 with the outcome, 400 with issues for arguments the tool refuses, 404 for a tool it does not have', async () => {
    const tools = await json<Envelope<{ name: string; provider: string }[]>>(
      await send('GET', '/tools'),
    );
    expect(tools.data).toEqual([
      expect.objectContaining({ name: 'list_items', provider: 'fake', effect: 'read' }),
    ]);
    const ran = await send('POST', '/tools/list_items', { arguments: { id: 'i1' } });
    expect(ran.status).toBe(200);
    expect((await json<Envelope<{ outcome: string; summary: string }>>(ran)).data).toMatchObject({
      outcome: 'ok',
      summary: 'list_items ran with {"id":"i1"}',
    });
    const refused = await send('POST', '/tools/list_items', { arguments: { id: 1 } });
    expect(refused.status).toBe(400);
    expect(await json<{ issues: unknown[] }>(refused)).toMatchObject({ issues: [{ path: 'id' }] });
    expect((await send('POST', '/tools/nope', { arguments: {} })).status).toBe(404);
    expect((await send('POST', '/tools/list_items', { args: {} })).status).toBe(400);
  });
});
