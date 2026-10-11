import {
  INTERACTION_TOPICS,
  type InteractionAnswer,
  type InteractionPrompt,
} from '@sysdesign/contracts';

import {
  InvalidPayload,
  InvalidSubscriptionName,
  SeqBeyondHead,
  TopicNotYours,
  UndeclaredTopic,
  UnknownSubscription,
} from './errors';
import { inMemoryBus } from './testing';

const PROMPT: InteractionPrompt = {
  id: '9d3c4a5e-2f0b-4c8a-8f6e-1a2b3c4d5e6f',
  origin: { kind: 'browser-session', id: 's1', label: 'step 3' },
  title: 'Gender',
  details: [],
  choices: [
    { id: 'male', label: 'Male', note: null },
    { id: 'female', label: 'Female', note: null },
  ],
  freeText: null,
  commands: [],
  expiresAt: '2026-10-12T00:00:00.000Z',
};
const ANSWER: InteractionAnswer = {
  promptId: PROMPT.id,
  reply: { kind: 'choice', choiceId: 'female' },
  via: { channel: 'fake', ref: 'm1' },
};
const prompted = (payload: unknown = PROMPT) => ({
  topic: INTERACTION_TOPICS.prompted,
  source: 'spec',
  payload,
});

function busAt(start = new Date('2026-10-11T00:00:00Z')) {
  let now = start;
  return {
    ...inMemoryBus(() => now),
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

describe('the bus', () => {
  it('[NTF-1] takes only a declared topic, with a payload its schema accepts, from a publisher it allows', async () => {
    const { bus } = busAt();
    await expect(bus.publish({ ...prompted(), topic: 'nothing.here' }, 'anyone')).rejects.toEqual(
      new UndeclaredTopic(['nothing.here']),
    );
    const refused = bus.publish(prompted({ ...PROMPT, choices: 'none' }), 'anyone');
    await expect(refused).rejects.toBeInstanceOf(InvalidPayload);
    await expect(refused).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: 'choices' })],
    });

    // An answer is the service's word alone.
    const answer = { topic: INTERACTION_TOPICS.answered, source: 'spec', payload: ANSWER };
    await expect(bus.publish(answer, 'anyone')).rejects.toEqual(
      new TopicNotYours(INTERACTION_TOPICS.answered, 'service'),
    );
    expect(await bus.publish(answer, 'service')).toMatchObject({ seq: '1', topic: answer.topic });
    expect(await bus.publish(prompted(), 'anyone')).toMatchObject({
      seq: '2',
      source: 'spec',
      payload: PROMPT,
      publishedAt: '2026-10-11T00:00:00.000Z',
    });
  });

  it('[NTF-2] starts a subscription at the head and keeps its cursor when it is asked for again', async () => {
    const { bus } = busAt();
    await bus.publish(prompted(), 'anyone');
    expect(await bus.subscribe('ask.one', { topics: [INTERACTION_TOPICS.prompted] })).toEqual({
      name: 'ask.one',
      topics: [INTERACTION_TOPICS.prompted],
      cursor: '1',
    });
    // What was published before it is not its business.
    expect(await bus.pull('ask.one', { waitMs: 0, max: 10 })).toEqual([]);

    await bus.publish(prompted(), 'anyone');
    await bus.ack('ask.one', '2');
    const again = await bus.subscribe('ask.one', {
      topics: [
        INTERACTION_TOPICS.prompted,
        INTERACTION_TOPICS.withdrawn,
        INTERACTION_TOPICS.prompted,
      ],
    });
    expect(again).toEqual({
      name: 'ask.one',
      topics: [INTERACTION_TOPICS.prompted, INTERACTION_TOPICS.withdrawn],
      cursor: '2',
    });

    await expect(
      bus.subscribe('Not A Name', { topics: [INTERACTION_TOPICS.prompted] }),
    ).rejects.toEqual(new InvalidSubscriptionName('Not A Name'));
    await expect(bus.subscribe('ask.two', { topics: ['nothing.here'] })).rejects.toEqual(
      new UndeclaredTopic(['nothing.here']),
    );
  });

  it('[NTF-2] hands out what lies past the cursor until it is acknowledged, and moves the cursor only forward', async () => {
    const { bus } = busAt();
    await bus.subscribe('ask.one', { topics: [INTERACTION_TOPICS.prompted] });
    await bus.publish(prompted(), 'anyone');
    await bus.publish(
      { topic: INTERACTION_TOPICS.answered, source: 'spec', payload: ANSWER },
      'service',
    );
    await bus.publish(prompted(), 'anyone');

    const seqs = async () =>
      (await bus.pull('ask.one', { waitMs: 0, max: 10 })).map((event) => event.seq);
    // Oldest first, its topics only; unacknowledged, the same events again.
    expect(await seqs()).toEqual(['1', '3']);
    expect(await seqs()).toEqual(['1', '3']);
    expect((await bus.pull('ask.one', { waitMs: 0, max: 1 })).map((event) => event.seq)).toEqual([
      '1',
    ]);

    expect((await bus.ack('ask.one', '1')).cursor).toBe('1');
    expect(await seqs()).toEqual(['3']);
    // Acknowledging an earlier event again changes nothing.
    expect((await bus.ack('ask.one', '3')).cursor).toBe('3');
    expect((await bus.ack('ask.one', '1')).cursor).toBe('3');
    await expect(bus.ack('ask.one', '9')).rejects.toEqual(new SeqBeyondHead('9', '3'));
    await expect(bus.ack('ask.none', '1')).rejects.toEqual(new UnknownSubscription('ask.none'));
    await expect(bus.pull('ask.none', { waitMs: 0, max: 1 })).rejects.toEqual(
      new UnknownSubscription('ask.none'),
    );
    expect(await bus.unsubscribe('ask.one')).toBe(true);
    expect(await bus.unsubscribe('ask.one')).toBe(false);
  });

  it('[NTF-2] waits for an event, woken by a publish, and answers empty on its time, its caller leaving or the bus closing', async () => {
    const { bus, wakeup } = busAt();
    await bus.subscribe('ask.one', { topics: [INTERACTION_TOPICS.prompted] });

    const waiting = bus.pull('ask.one', { waitMs: 5_000, max: 10 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await bus.publish(prompted(), 'anyone');
    expect((await waiting).map((event) => event.seq)).toEqual(['1']);
    await bus.ack('ask.one', '1');

    const started = Date.now();
    expect(await bus.pull('ask.one', { waitMs: 50, max: 10 })).toEqual([]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(45);

    const leaving = new AbortController();
    const abandoned = bus.pull('ask.one', { waitMs: 5_000, max: 10 }, leaving.signal);
    leaving.abort();
    expect(await abandoned).toEqual([]);

    const closing = bus.pull('ask.one', { waitMs: 5_000, max: 10 });
    wakeup.close();
    expect(await closing).toEqual([]);
  });

  it('[NTF-3] forgets events only past their retention and behind every cursor, keeps the newest, and drops idle subscriptions', async () => {
    const { bus, log, advance } = busAt();
    const retention = { retentionMs: 60_000, idleSubscriptionMs: 600_000 };
    await bus.subscribe('slow', { topics: [INTERACTION_TOPICS.prompted] });
    await bus.subscribe('fast', { topics: [INTERACTION_TOPICS.prompted] });
    for (let i = 0; i < 4; i += 1) await bus.publish(prompted(), 'anyone');
    await bus.ack('fast', '4');
    await bus.ack('slow', '2');

    // Nothing is old enough yet.
    expect(await bus.sweep(retention)).toEqual({ subscriptions: 0, events: 0 });
    advance(120_000);
    // Old enough, but only what the slowest cursor passed may go.
    expect(await bus.sweep(retention)).toEqual({ subscriptions: 0, events: 2 });
    expect(log.events.map((event) => event.seq)).toEqual(['3', '4']);

    // Both idle past their age: removed, and the log keeps its newest so the head stays.
    advance(600_001);
    expect(await bus.sweep(retention)).toEqual({ subscriptions: 2, events: 1 });
    expect(log.events.map((event) => event.seq)).toEqual(['4']);
    expect(await bus.subscribe('late', { topics: [INTERACTION_TOPICS.prompted] })).toMatchObject({
      cursor: '4',
    });
  });
});
