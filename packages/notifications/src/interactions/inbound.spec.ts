import { INTERACTION_TOPICS, type InteractionPrompt } from '@sysdesign/contracts';

import { inMemoryBus } from '../bus/testing';
import { FakeChannel } from '../channels/testing';
import { Dispatcher } from './dispatcher';
import { Inbound } from './inbound';
import { InMemoryInteractionStore, promptOf } from './testing';

const NOW = new Date('2026-10-11T12:00:00Z');

/** Prompts delivered on one fake channel, the dispatcher's consumer never started: each event handled by hand. */
async function delivered(...prompts: InteractionPrompt[]) {
  const clock = () => NOW;
  const { bus, log } = inMemoryBus(clock);
  const store = new InMemoryInteractionStore();
  const phone = new FakeChannel('phone');
  const inbound = new Inbound(bus, store, clock);
  const dispatcher = new Dispatcher(
    bus,
    store,
    [phone],
    {
      pullWaitMs: 10,
      eventsPerPull: 10,
      deliveryAttempts: 1,
      retryPauseMs: 1,
      closedRetentionMs: 1,
      sweepEveryMs: null,
    },
    clock,
    { log: () => undefined, warn: () => undefined },
  );
  await phone.start(inbound);
  for (const prompt of prompts) {
    await dispatcher.handle(
      await bus.publish(
        { topic: INTERACTION_TOPICS.prompted, source: 'spec', payload: prompt },
        'anyone',
      ),
    );
  }
  const answers = () => log.events.filter((event) => event.topic === INTERACTION_TOPICS.answered);
  return { phone, store, answers };
}

describe('what people send back', () => {
  it('[NTF-5] takes a reply as the one answer to the one prompt waiting, and publishes it once', async () => {
    const prompt = promptOf();
    const { phone, store, answers } = await delivered(prompt);
    expect(await phone.send('B', 'r1')).toEqual({ kind: 'accepted', text: 'Taken: b: Female.' });
    expect(answers().map((event) => event.payload)).toEqual([
      {
        promptId: prompt.id,
        reply: { kind: 'choice', choiceId: 'female' },
        via: { channel: 'phone', ref: 'r1' },
      },
    ]);
    expect((await store.find(prompt.id))?.state).toBe('answered');

    // The same message handed over again is ignored; a reply to the closed question is told
    // so, and one to nothing in particular finds nothing waiting.
    expect(await phone.send('B', 'r1')).toEqual({ kind: 'ignored' });
    expect(await phone.send('a', 'r2', 'phone-m1')).toEqual({
      kind: 'refused',
      text: 'That question is closed. Answered: b: Female.',
    });
    expect(await phone.send('a', 'r3')).toEqual({
      kind: 'refused',
      text: 'Nothing is waiting for an answer.',
    });
    expect(answers()).toHaveLength(1);
  });

  it('[NTF-5] refuses what the prompt does not take, saying how it is answered, and keeps it open', async () => {
    const prompt = promptOf();
    const { phone, store, answers } = await delivered(prompt);
    expect(await phone.send('maybe', 'r1')).toEqual({
      kind: 'refused',
      text: '"maybe" is none of the choices. Reply with a letter (a, b), or /blank.',
    });
    expect(answers()).toEqual([]);
    expect((await store.find(prompt.id))?.state).toBe('open');
    expect(await phone.send('/blank', 'r2')).toMatchObject({ kind: 'accepted' });
  });

  it('[NTF-5] finds the prompt by the message replied to, and asks which when several wait and none was replied to', async () => {
    const first = promptOf({ title: 'First' });
    const second = promptOf({ title: 'Second' });
    const { phone, answers } = await delivered(first, second);
    expect(await phone.send('a', 'r1')).toEqual({
      kind: 'refused',
      text: 'Several questions are waiting: reply to the one you are answering.',
    });
    expect(await phone.send('a', 'r2', 'phone-m2')).toMatchObject({ kind: 'accepted' });
    expect(answers().map((event) => (event.payload as { promptId: string }).promptId)).toEqual([
      second.id,
    ]);
    // One left waiting: a reply to nothing in particular is its.
    expect(await phone.send('b', 'r3')).toMatchObject({ kind: 'accepted' });
    expect(await phone.send('b', 'r4')).toEqual({
      kind: 'refused',
      text: 'Nothing is waiting for an answer.',
    });
  });
});
