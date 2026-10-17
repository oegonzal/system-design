import type { INestApplication } from '@nestjs/common';
import { TOOL_MISSION_FIXTURE, type ToolPlan, type ToolSessionRecord } from '@sysdesign/contracts';

import { InMemoryCalendar, sampleEvent } from '../calendar/testing';
import { bootApp } from './testing';

type Envelope<T> = { data: T };
const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;

const listing: ToolPlan = {
  assessment: 'See the calendars.',
  calls: [
    { tool: 'list_calendars', argumentsJson: '{}', reason: 'first', expect: null, serves: [] },
  ],
  ask: null,
  finish: null,
};
const finishing: ToolPlan = {
  assessment: 'Done.',
  calls: [],
  ask: null,
  finish: { cause: 'nothing-left', detail: 'listed' },
};

describe('the calendar service over HTTP', () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await bootApp(new InMemoryCalendar([sampleEvent({ id: 'e1' })]), [
      { artifact: listing },
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

  it('[GCL-7] serves health, the nine tools, and a tool run directly', async () => {
    expect((await send('GET', '/health')).status).toBe(200);
    const tools = await json<Envelope<{ name: string }[]>>(await send('GET', '/tools'));
    expect(tools.data.map((tool) => tool.name)).toHaveLength(9);
    const ran = await send('POST', '/tools/get_event', {
      arguments: { eventId: 'e1', calendarId: null },
    });
    expect(ran.status).toBe(200);
    expect(
      (await json<Envelope<{ outcome: string; summary: string }>>(ran)).data.summary,
    ).toContain('Summary: Design review');
    expect((await send('POST', '/tools/get_event', { arguments: { eventId: 1 } })).status).toBe(
      400,
    );
  });

  it('[GCL-7] runs a session the loop decides over the calendar and reads it back', async () => {
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
    expect(record.service).toBe('google-calendar');
    expect(record.steps[0]?.calls[0]).toMatchObject({ tool: 'list_calendars', outcome: 'ok' });
    expect(record.steps[0]?.calls[0]?.summary).toContain('calendar primary');
  });
});
