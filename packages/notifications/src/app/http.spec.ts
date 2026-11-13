import type { INestApplication } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  INTERACTION_TOPICS,
  type EventEnvelope,
  type InteractionAnswer,
  type Subscription,
} from '@sysdesign/contracts';
import {
  BusEvent,
  BusSubscription,
  Interaction,
  InteractionDelivery,
  truncateTestTables,
} from '@sysdesign/db';

import { carrying, FakeChannel, promptOf } from '../channels/testing';
import { until } from '../interactions/testing';
import { bootApp } from './testing';

type Envelope<T> = { data: T };

const send = (url: string, method: string, path: string, body?: unknown) =>
  fetch(`${url}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;

/**
 * The real service over real HTTP and the real tables, one fake channel with
 * one person on it: an asker subscribes, puts a prompt, the person answers on
 * the channel, and the answer comes back to the asker as an event.
 */
describe('the notifications HTTP surface', () => {
  let app: INestApplication;
  let url: string;
  const phone = new FakeChannel('phone');

  beforeAll(async () => {
    ({ app, url } = await bootApp({
      channels: carrying('spec', phone),
      interactions: { pullWaitMs: 100 },
    }));
  });

  afterAll(async () => {
    await truncateTestTables(app.get(EntityManager).fork(), [
      InteractionDelivery,
      Interaction,
      BusSubscription,
      BusEvent,
    ]);
    await app.close();
  });

  it('[NTF-1] [NTF-5] carries a prompt to the channel and the answer a person gives there back to its asker', async () => {
    const prompt = promptOf();
    const name = `ask.${prompt.id}`;
    const subscribed = await send(url, 'PUT', `/subscriptions/${name}`, {
      topics: [INTERACTION_TOPICS.answered, INTERACTION_TOPICS.withdrawn],
    });
    expect(subscribed.status).toBe(200);
    expect((await json<Envelope<Subscription>>(subscribed)).data.name).toBe(name);

    const put = await send(url, 'POST', '/events', {
      topic: INTERACTION_TOPICS.prompted,
      source: 'spec',
      payload: prompt,
    });
    expect(put.status).toBe(201);
    await until(() => phone.delivered.some((delivered) => delivered.id === prompt.id));
    // The channel's record comes before the service's: a typed answer finds its prompt through the
    // delivery the service recorded, so the answer waits for that row (a loaded runner reached
    // the gap, 2026-11-13).
    const em = app.get(EntityManager);
    await until(
      async () => (await em.fork().count(InteractionDelivery, { interaction: prompt.id })) > 0,
    );

    expect(await phone.send('b', 'reply-1')).toEqual({
      kind: 'accepted',
      text: 'Taken: b: Female.',
    });
    const pulled = await send(url, 'GET', `/subscriptions/${name}/events?waitMs=3000`);
    const [event] = (await json<Envelope<EventEnvelope<InteractionAnswer>[]>>(pulled)).data;
    expect(event).toMatchObject({
      topic: INTERACTION_TOPICS.answered,
      source: 'notifications',
      payload: { promptId: prompt.id, reply: { kind: 'choice', choiceId: 'female' } },
    });
    const acked = await send(url, 'POST', `/subscriptions/${name}/ack`, { seq: event?.seq });
    expect((await json<Envelope<Subscription>>(acked)).data.cursor).toBe(event?.seq);
    await until(() => phone.closed.some((closed) => closed.outcome === 'Answered: b: Female'));
    expect((await send(url, 'DELETE', `/subscriptions/${name}`)).status).toBe(204);
  });

  it('[NTF-1] refuses an undeclared topic, a payload its schema refuses, and an answer from anyone but the service', async () => {
    const undeclared = await send(url, 'POST', '/events', {
      topic: 'no.such',
      source: 'spec',
      payload: {},
    });
    expect(undeclared.status).toBe(400);
    const malformed = await send(url, 'POST', '/events', {
      topic: INTERACTION_TOPICS.prompted,
      source: 'spec',
      payload: { ...promptOf(), choices: 'none' },
    });
    expect(malformed.status).toBe(400);
    expect(await json(malformed)).toMatchObject({
      issues: [expect.objectContaining({ path: 'choices' })],
    });
    const forged = await send(url, 'POST', '/events', {
      topic: INTERACTION_TOPICS.answered,
      source: 'spec',
      payload: {
        promptId: promptOf().id,
        reply: { kind: 'text', text: 'yes' },
        via: { channel: 'phone', ref: 'x' },
      },
    });
    expect(forged.status).toBe(403);
  });

  it('[NTF-2] wakes a waiting pull with the event published while it waits, and names a missing subscription', async () => {
    const prompt = promptOf();
    const name = `ask.${prompt.id}`;
    await send(url, 'PUT', `/subscriptions/${name}`, { topics: [INTERACTION_TOPICS.withdrawn] });
    const waiting = send(url, 'GET', `/subscriptions/${name}/events?waitMs=10000`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const started = Date.now();
    await send(url, 'POST', '/events', {
      topic: INTERACTION_TOPICS.withdrawn,
      source: 'spec',
      payload: { promptId: prompt.id, reason: 'abandoned', note: null },
    });
    const events = (await json<Envelope<EventEnvelope[]>>(await waiting)).data;
    expect(events.map((event) => event.topic)).toEqual([INTERACTION_TOPICS.withdrawn]);
    expect(Date.now() - started).toBeLessThan(5_000);

    expect((await send(url, 'DELETE', `/subscriptions/${name}`)).status).toBe(204);
    const missing = await send(url, 'GET', `/subscriptions/${name}/events`);
    expect(missing.status).toBe(404);
    expect(await json(missing)).toMatchObject({ missing: 'subscription' });
    expect((await send(url, 'DELETE', `/subscriptions/${name}`)).status).toBe(404);
    expect((await send(url, 'GET', `/subscriptions/${name}/events?waitMs=999999`)).status).toBe(
      400,
    );
  });
});
