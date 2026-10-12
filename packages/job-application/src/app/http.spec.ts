import type { INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { SESSION_TOPICS, type ApplicationDto, type UnitAdvice } from '@sysdesign/contracts';
import { JobApplication, truncateTestTables } from '@sysdesign/db';

import type { FakeBusClient } from '../intake/testing';
import { bootApp } from './testing';

type Envelope<T> = { data: T };

const send = (url: string, method: string, path: string, body?: unknown) =>
  fetch(`${url}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;
const SUBJECT = 'Alex Example';
const ASKER = { kind: 'browser-session', id: crypto.randomUUID(), label: 'step 2' };

async function until(holds: () => Promise<boolean>, ms = 3_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await holds())) {
    if (Date.now() > deadline) throw new Error('the condition never held');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** The real service over real HTTP and the real table, fed by a fake bus. */
describe('the job-application HTTP surface', () => {
  let app: INestApplication;
  let url: string;
  let bus: FakeBusClient;

  beforeAll(async () => {
    ({ app, url, bus } = await bootApp());
    await truncateTestTables(app.get(EntityManager).fork(), [JobApplication]);
  });

  afterAll(async () => {
    await truncateTestTables(app.get(EntityManager).fork(), [JobApplication]);
    await app.close();
  });

  it('[JA-6] answers the advisor protocol: who it is, and the units on record for a subject — refusing an asker that compares on something else', async () => {
    expect(await json(await send(url, 'GET', '/health'))).toEqual({ status: 'ok' });
    expect(await json(await send(url, 'GET', '/advisor'))).toEqual({
      data: { id: 'job-application', facets: ['company'] },
    });
    const entered = await send(url, 'POST', '/applications', {
      subject: SUBJECT,
      company: 'Acme',
      appliedAt: '2026-10-03T10:00:00.000Z',
    });
    expect(entered.status).toBe(201);
    const advice = await send(url, 'POST', '/advice', {
      subject: SUBJECT,
      asker: ASKER,
      facets: ['company'],
    });
    expect(advice.status).toBe(200);
    expect((await json<Envelope<UnitAdvice>>(advice)).data).toEqual({
      advisor: 'job-application',
      units: [
        {
          identity: [{ name: 'company', value: 'Acme' }],
          stance: 'avoid',
          note: 'applied 2026-10-03',
        },
      ],
      omitted: 0,
    });
    const nobody = await send(url, 'POST', '/advice', {
      subject: 'Someone Else',
      asker: ASKER,
      facets: ['company'],
    });
    expect((await json<Envelope<UnitAdvice>>(nobody)).data.units).toEqual([]);
    const elsewhere = await send(url, 'POST', '/advice', {
      subject: SUBJECT,
      asker: ASKER,
      facets: ['role'],
    });
    expect(elsewhere.status).toBe(400);
    expect(await json(elsewhere)).toMatchObject({ message: expect.stringContaining('company') });
    const malformed = await send(url, 'POST', '/advice', { subject: SUBJECT, facets: ['company'] });
    expect(malformed.status).toBe(400);
    expect(await json(malformed)).toMatchObject({
      issues: [expect.objectContaining({ path: 'asker' })],
    });
  });

  it('[JA-6] lists a subject’s applications by company under the shared key, sums its companies, takes an entry by hand and a correction, and names an unknown id', async () => {
    const listed = await send(
      url,
      'GET',
      `/applications?subject=${encodeURIComponent(SUBJECT)}&company=ACME`,
    );
    const rows = (await json<Envelope<ApplicationDto[]>>(listed)).data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      company: 'Acme',
      status: 'submitted',
      source: 'manual',
      label: 'Acme',
    });
    const companies = await send(url, 'GET', `/companies?subject=${encodeURIComponent(SUBJECT)}`);
    expect((await json<Envelope<unknown>>(companies)).data).toEqual([
      {
        company: 'Acme',
        applications: 1,
        latestAt: '2026-10-03T10:00:00.000Z',
        status: 'submitted',
      },
    ]);
    const corrected = await send(url, 'PATCH', `/applications/${rows[0]?.id}`, {
      status: 'abandoned',
    });
    expect((await json<Envelope<ApplicationDto>>(corrected)).data.status).toBe('abandoned');
    expect(
      (await send(url, 'PATCH', `/applications/${crypto.randomUUID()}`, { status: 'failed' }))
        .status,
    ).toBe(404);
    const bad = await send(url, 'POST', '/applications', { subject: SUBJECT });
    expect(bad.status).toBe(400);
    expect(await json(bad)).toMatchObject({
      issues: [expect.objectContaining({ path: 'company' })],
    });
    expect((await send(url, 'GET', '/applications')).status).toBe(400);
  });

  it('[JA-4] [JA-6] is fed by the bus through the wiring that ships: a unit opened on the bus is on record in progress and forbidden to another session', async () => {
    const session = { sessionId: crypto.randomUUID(), subject: SUBJECT, profile: 'spec' };
    const unit = {
      id: crypto.randomUUID(),
      ordinal: 1,
      label: 'Staff Engineer at Globex',
      url: 'https://jobs.example.test/7',
      facets: [{ name: 'company', value: 'Globex' }],
    };
    await bus.publish({
      topic: SESSION_TOPICS.unitOpened,
      source: 'browser-session',
      payload: { ...session, maxMinutes: 90, unit },
    });
    await until(async () => {
      const found = await send(
        url,
        'GET',
        `/applications?subject=${encodeURIComponent(SUBJECT)}&company=globex`,
      );
      return (await json<Envelope<ApplicationDto[]>>(found)).data.length === 1;
    });
    const advice = await send(url, 'POST', '/advice', {
      subject: SUBJECT,
      asker: ASKER,
      facets: ['company'],
    });
    expect((await json<Envelope<UnitAdvice>>(advice)).data.units[0]).toMatchObject({
      identity: [{ name: 'company', value: 'Globex' }],
      stance: 'forbid',
    });
    // To the session that opened it, its own open unit is not on record at all.
    const own = await send(url, 'POST', '/advice', {
      subject: SUBJECT,
      asker: { ...ASKER, id: session.sessionId },
      facets: ['company'],
    });
    expect(
      (await json<Envelope<UnitAdvice>>(own)).data.units.some(
        (unit) => unit.identity[0]?.value === 'Globex',
      ),
    ).toBe(false);
    expect(bus.acked).toEqual(['1']);
  });
});
