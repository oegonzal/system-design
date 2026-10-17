import {
  INTERACTION_TOPICS,
  type EventEnvelope,
  type InteractionAnswer,
  type InteractionPrompt,
  type PublishEventRequest,
  type SubscribeRequest,
  type Subscription,
} from '@sysdesign/contracts';

import { BusClient } from './bus-client';
import { BusCallAborted, PromptExpired } from './bus-errors';
import { InteractionClient } from './interaction-client';

/** The bus in memory: every call recorded, a pull answered from what was published past the cursor. */
class InMemoryBus extends BusClient {
  readonly calls: string[] = [];
  readonly published: PublishEventRequest[] = [];
  private readonly events: EventEnvelope[] = [];
  private readonly cursors = new Map<string, { topics: string[]; cursor: number }>();

  /** Publishes as the service would: the person's answer, another asker's, an expiry. */
  serve(topic: string, payload: unknown): void {
    this.events.push({
      seq: String(this.events.length + 1),
      topic,
      source: 'notifications',
      payload,
      publishedAt: '2026-10-11T00:00:00.000Z',
    });
  }

  async publish(request: PublishEventRequest): Promise<EventEnvelope> {
    this.calls.push(`publish ${request.topic}`);
    this.published.push(request);
    this.serve(request.topic, request.payload);
    return this.events[this.events.length - 1] as EventEnvelope;
  }

  async subscribe(name: string, request: SubscribeRequest): Promise<Subscription> {
    this.calls.push(`subscribe ${name}`);
    this.cursors.set(name, { topics: request.topics, cursor: this.events.length });
    return { name, topics: request.topics, cursor: String(this.events.length) };
  }

  async pull(
    name: string,
    options: { waitMs: number; max: number },
    signal?: AbortSignal,
  ): Promise<EventEnvelope[]> {
    const subscription = this.cursors.get(name);
    if (subscription === undefined) throw new Error(`no ${name}`);
    const ready = this.events
      .filter(
        (event) =>
          Number(event.seq) > subscription.cursor && subscription.topics.includes(event.topic),
      )
      .slice(0, options.max);
    if (ready.length > 0) return ready;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5);
      signal?.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
    });
    if (signal?.aborted) throw new BusCallAborted('pull');
    return [];
  }

  async ack(name: string, seq: string): Promise<Subscription> {
    const subscription = this.cursors.get(name);
    if (subscription === undefined) throw new Error(`no ${name}`);
    subscription.cursor = Math.max(subscription.cursor, Number(seq));
    return { name, topics: subscription.topics, cursor: String(subscription.cursor) };
  }

  async unsubscribe(name: string): Promise<void> {
    this.calls.push(`unsubscribe ${name}`);
    this.cursors.delete(name);
  }
}

const PROMPT: InteractionPrompt = {
  id: '3b9c1d2e-6f70-4a81-92b3-c4d5e6f70812',
  origin: { kind: 'spec', id: 's1', label: 'step 1' },
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
const answerTo = (promptId: string, choiceId: string): InteractionAnswer => ({
  promptId,
  reply: { kind: 'choice', choiceId },
  via: { channel: 'telegram', ref: 'm9' },
});

const OPTIONS = { source: 'spec', pullWaitMs: 10, eventsPerPull: 10 };
const until = async (holds: () => boolean): Promise<void> => {
  while (!holds()) await new Promise((resolve) => setTimeout(resolve, 2));
};

describe('asking a person through the bus', () => {
  it('[NTC-2] subscribes before it publishes, passes over other prompts’ answers, takes its own and unsubscribes', async () => {
    const bus = new InMemoryBus();
    const asking = new InteractionClient(bus, OPTIONS).ask(PROMPT);
    await until(() => bus.published.length === 1);
    bus.serve(
      INTERACTION_TOPICS.answered,
      answerTo('11111111-2222-4333-8444-555555555555', 'male'),
    );
    bus.serve(INTERACTION_TOPICS.answered, answerTo(PROMPT.id, 'female'));
    expect(await asking).toEqual(answerTo(PROMPT.id, 'female'));
    expect(bus.calls).toEqual([
      `subscribe ask.${PROMPT.id}`,
      'publish interaction.prompted',
      `unsubscribe ask.${PROMPT.id}`,
    ]);
    expect(bus.published[0]).toEqual({
      topic: INTERACTION_TOPICS.prompted,
      source: 'spec',
      payload: PROMPT,
    });
  });

  it('[NTC-2] asks under another source when the call names one, so the channel carrying that source shows the prompt', async () => {
    const bus = new InMemoryBus();
    const asking = new InteractionClient(bus, OPTIONS).ask(PROMPT, undefined, 'peer');
    await until(() => bus.published.length === 1);
    bus.serve(INTERACTION_TOPICS.answered, answerTo(PROMPT.id, 'female'));
    expect(await asking).toEqual(answerTo(PROMPT.id, 'female'));
    expect(bus.published[0]).toMatchObject({ topic: INTERACTION_TOPICS.prompted, source: 'peer' });
  });

  it('[NTC-2] ends as expired when the service withdraws the prompt for its time', async () => {
    const bus = new InMemoryBus();
    const asking = new InteractionClient(bus, OPTIONS).ask(PROMPT);
    await until(() => bus.published.length === 1);
    bus.serve(INTERACTION_TOPICS.withdrawn, { promptId: PROMPT.id, reason: 'expired', note: null });
    await expect(asking).rejects.toEqual(new PromptExpired(PROMPT.id));
    expect(bus.calls.at(-1)).toBe(`unsubscribe ask.${PROMPT.id}`);
  });

  it('[NTC-2] withdraws the prompt with the reason its abort carries, or as abandoned when it carries none', async () => {
    const bus = new InMemoryBus();
    const answered = new AbortController();
    const asking = new InteractionClient(bus, OPTIONS).ask(PROMPT, answered.signal);
    await until(() => bus.published.length === 1);
    answered.abort({ reason: 'answered-elsewhere', note: 'answered via terminal: b: Female' });
    await expect(asking).rejects.toBeInstanceOf(BusCallAborted);
    expect(bus.published[1]).toEqual({
      topic: INTERACTION_TOPICS.withdrawn,
      source: 'spec',
      payload: {
        promptId: PROMPT.id,
        reason: 'answered-elsewhere',
        note: 'answered via terminal: b: Female',
      },
    });

    const plain = new AbortController();
    const second = { ...PROMPT, id: '4c0d2e3f-7081-4b92-a3c4-d5e6f7081923' };
    const leaving = new InteractionClient(bus, OPTIONS).ask(second, plain.signal);
    await until(() => bus.published.length === 3);
    plain.abort();
    await expect(leaving).rejects.toBeInstanceOf(BusCallAborted);
    expect(bus.published[3]?.payload).toEqual({
      promptId: second.id,
      reason: 'abandoned',
      note: null,
    });
  });
});
