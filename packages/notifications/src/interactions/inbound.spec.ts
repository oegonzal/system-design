import { INTERACTION_TOPICS, type InteractionPrompt } from '@sysdesign/contracts';

import { inMemoryBus } from '../bus/testing';
import type { ChannelInstance } from '../channels/port';
import { carrying, FakeChannel, promptOf, SPEC_NOW as NOW } from '../channels/testing';
import { Dispatcher } from './dispatcher';
import { Inbound } from './inbound';
import { InMemoryInteractionStore } from './testing';

/** Prompts put, each by its publisher, on the channels given: the dispatcher's consumer never started, each event handled by hand. */
async function dispatched(
  channels: ChannelInstance[],
  ...prompts: (readonly [prompt: InteractionPrompt, publisher: string])[]
) {
  const clock = () => NOW;
  const { bus, log } = inMemoryBus(clock);
  const store = new InMemoryInteractionStore();
  const inbound = new Inbound(bus, store, clock);
  const dispatcher = new Dispatcher(
    bus,
    store,
    channels,
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
  for (const { channel } of channels) await channel.start(inbound);
  for (const [prompt, source] of prompts) {
    await dispatcher.handle(
      await bus.publish({ topic: INTERACTION_TOPICS.prompted, source, payload: prompt }, 'anyone'),
    );
  }
  const answers = () => log.events.filter((event) => event.topic === INTERACTION_TOPICS.answered);
  return { store, answers };
}

/** Prompts delivered on one fake channel. */
async function delivered(...prompts: InteractionPrompt[]) {
  const phone = new FakeChannel('phone');
  const put = prompts.map((prompt) => [prompt, 'spec'] as const);
  return { phone, ...(await dispatched(carrying('spec', phone), ...put)) };
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
      text: '"maybe" is none of the choices. Reply with a letter (a, b) or the option as written, or /blank.',
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

  it('[NTF-11] keeps two channels that reach one address apart: a reply answers only what its own channel showed', async () => {
    // Two bots in one person's private chats reach that person at one chat id.
    const north = new FakeChannel('north', 'person-1');
    const south = new FakeChannel('south', 'person-1');
    const fromNorth = promptOf({ title: 'North' });
    const fromSouth = promptOf({ title: 'South' });
    const { answers } = await dispatched(
      [...carrying('north-desk', north), ...carrying('south-desk', south)],
      [fromNorth, 'north-desk'],
      [fromSouth, 'south-desk'],
    );

    expect(await north.send('b', 'n1')).toEqual({ kind: 'accepted', text: 'Taken: b: Female.' });
    expect(await south.send('a', 's1')).toEqual({ kind: 'accepted', text: 'Taken: a: Male.' });
    expect(
      answers().map((event) => {
        const answer = event.payload as { promptId: string; via: { channel: string } };
        return [answer.promptId, answer.via.channel];
      }),
    ).toEqual([
      [fromNorth.id, 'north'],
      [fromSouth.id, 'south'],
    ]);
  });
});
