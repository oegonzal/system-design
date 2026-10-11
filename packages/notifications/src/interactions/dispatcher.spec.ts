import { INTERACTION_TOPICS, type InteractionPrompt } from '@sysdesign/contracts';

import { inMemoryBus } from '../bus/testing';
import { FakeChannel } from '../channels/testing';
import { DISPATCHER_SUBSCRIPTION, Dispatcher, sweepInteractions } from './dispatcher';
import { Inbound } from './inbound';
import type { InteractionSettings } from './settings';
import { InMemoryInteractionStore, promptOf, until } from './testing';

const NOW = new Date('2026-10-11T12:00:00Z');
const SETTINGS: InteractionSettings = {
  pullWaitMs: 50,
  eventsPerPull: 20,
  deliveryAttempts: 3,
  retryPauseMs: 5,
  closedRetentionMs: 60_000,
  sweepEveryMs: null,
};

function harness(channels: FakeChannel[]) {
  let now = NOW;
  const clock = () => now;
  const { bus, subscriptions } = inMemoryBus(clock);
  const store = new InMemoryInteractionStore();
  const warnings: string[] = [];
  const dispatcher = new Dispatcher(bus, store, channels, SETTINGS, clock, {
    log: () => undefined,
    warn: (message) => warnings.push(message),
  });
  const inbound = new Inbound(bus, store, clock);
  return {
    bus,
    store,
    subscriptions,
    dispatcher,
    inbound,
    warnings,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
    put: (prompt: InteractionPrompt) =>
      bus.publish(
        { topic: INTERACTION_TOPICS.prompted, source: 'spec', payload: prompt },
        'anyone',
      ),
    withdraw: (prompt: InteractionPrompt, note: string) =>
      bus.publish(
        {
          topic: INTERACTION_TOPICS.withdrawn,
          source: 'spec',
          payload: { promptId: prompt.id, reason: 'answered-elsewhere', note },
        },
        'anyone',
      ),
  };
}

describe('the dispatcher', () => {
  it('[NTF-4] delivers a prompt once on every channel, however often its event comes round', async () => {
    const phone = new FakeChannel('phone');
    const desk = new FakeChannel('desk');
    const { dispatcher, inbound, put } = harness([phone, desk]);
    await dispatcher.start(inbound);
    const prompt = promptOf();
    const event = await put(prompt);
    await until(() => phone.delivered.length === 1 && desk.delivered.length === 1);

    // The same event again — a replay, a restart — reaches no one twice.
    await dispatcher.handle(event);
    await dispatcher.stop();
    expect(phone.delivered.map((p) => p.id)).toEqual([prompt.id]);
    expect(desk.delivered.map((p) => p.id)).toEqual([prompt.id]);
  });

  it('[NTF-4] tries a failing channel the declared number of times, then passes over it without holding back the events behind', async () => {
    const down = new FakeChannel('down');
    const up = new FakeChannel('up');
    down.failures = 10;
    const { dispatcher, inbound, put, warnings, subscriptions } = harness([down, up]);
    await dispatcher.start(inbound);
    const first = promptOf();
    const second = promptOf();
    await put(first);
    const last = await put(second);
    await until(() => up.delivered.length === 2 && warnings.length === 2);
    await dispatcher.stop();

    expect(down.delivered).toEqual([]);
    // Three tries each: the channel was tried, then passed over.
    expect(down.failures).toBe(4);
    expect(warnings[0]).toBe(
      'interaction.prompted #1 passed over after 3 tries: Error: down: Error: down is down',
    );
    expect((await subscriptions.find(DISPATCHER_SUBSCRIPTION))?.cursor).toBe(last.seq);
  });

  it('[NTF-6] closes every delivery with the answer, again when a withdrawal says it went unused, and not again for a replay', async () => {
    const phone = new FakeChannel('phone');
    const desk = new FakeChannel('desk');
    const { dispatcher, inbound, put, withdraw } = harness([phone, desk]);
    await dispatcher.start(inbound);
    const prompt = promptOf();
    await put(prompt);
    await until(() => phone.delivered.length === 1 && desk.delivered.length === 1);

    expect(await phone.send('b', 'reply-1')).toEqual({
      kind: 'accepted',
      text: 'Taken: b: Female.',
    });
    await until(() => phone.closed.length === 1 && desk.closed.length === 1);
    expect(desk.closed).toEqual([{ messageRef: 'desk-m1', outcome: 'Answered: b: Female' }]);

    await withdraw(prompt, 'answered at the terminal: Male');
    await until(() => phone.closed.length === 2 && desk.closed.length === 2);
    expect(phone.closed[1]).toEqual({
      messageRef: 'phone-m1',
      outcome: 'Answered elsewhere — answered at the terminal: Male',
    });

    await withdraw(prompt, 'answered at the terminal: Male');
    await new Promise((resolve) => setTimeout(resolve, 100));
    await dispatcher.stop();
    expect(phone.closed).toHaveLength(2);
  });

  it('[NTF-6] withdraws a prompt past its time, which then closes wherever it was delivered', async () => {
    const phone = new FakeChannel('phone');
    const { dispatcher, inbound, put, bus, store, advance } = harness([phone]);
    await dispatcher.start(inbound);
    const prompt = promptOf({ expiresAt: new Date(NOW.getTime() + 60_000).toISOString() });
    await put(prompt);
    await until(() => phone.delivered.length === 1);

    expect(await sweepInteractions(bus, store, SETTINGS, NOW)).toEqual({ expired: 0, purged: 0 });
    advance(120_000);
    const later = new Date(NOW.getTime() + 120_000);
    expect(await sweepInteractions(bus, store, SETTINGS, later)).toEqual({ expired: 1, purged: 0 });
    await until(() => phone.closed.length === 1);
    expect(phone.closed[0]?.outcome).toBe('Expired with no answer taken');

    // Closed long enough: purged.
    expect(
      await sweepInteractions(bus, store, SETTINGS, new Date(later.getTime() + 61_000)),
    ).toEqual({ expired: 0, purged: 1 });
    await dispatcher.stop();
  });
});
