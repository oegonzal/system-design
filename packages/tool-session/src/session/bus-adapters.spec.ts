import type { InteractionPrompt } from '@sysdesign/contracts';

import { BusSessionEvents, InteractionOperator } from './bus-adapters';

/** A bus whose publishes settle only when the spec says. */
const deferredBus = () => {
  const pending: {
    request: { topic: string; source: string; payload: unknown };
    resolve: () => void;
    reject: (error: Error) => void;
  }[] = [];
  return {
    pending,
    publish: (request: { topic: string; source: string; payload: unknown }) =>
      new Promise<never>((resolve, reject) => {
        pending.push({ request, resolve: () => resolve(undefined as never), reject });
      }),
  };
};

describe('the session events on the bus', () => {
  it('[TSS-9] queues each publish behind the last, settles the caller at once, reports a refusal without throwing, and flushes when told', async () => {
    const bus = deferredBus();
    const warnings: string[] = [];
    const events = new BusSessionEvents(bus, 'example', {
      info: () => undefined,
      warn: (line) => warnings.push(line),
    });
    let settled = 0;
    void events.publish('a', 1).then(() => settled++);
    void events.publish('b', 2).then(() => settled++);
    await Promise.resolve();
    // The loop is never held: both publishes have settled while the bus has answered neither.
    expect(settled).toBe(2);
    expect(bus.pending.map((each) => each.request.topic)).toEqual(['a']);
    bus.pending[0]?.reject(new Error('bus down'));
    const flushed = events.flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The first was reported, and only then the second sent, in order.
    expect(warnings).toEqual(['a was not published: Error: bus down']);
    expect(bus.pending.map((each) => each.request)).toEqual([
      { topic: 'a', source: 'example', payload: 1 },
      { topic: 'b', source: 'example', payload: 2 },
    ]);
    bus.pending[1]?.resolve();
    await flushed;
    expect(warnings).toHaveLength(1);
  });

  it('[TSS-9] asks under the program’s source unless a call names another, and publishes a notice under its own', async () => {
    const asks: { prompt: InteractionPrompt; source: string | undefined }[] = [];
    const published: { topic: string; source: string }[] = [];
    const operator = new InteractionOperator(
      {
        ask: (prompt, _signal, source) => {
          asks.push({ prompt, source });
          return Promise.resolve({
            promptId: prompt.id,
            reply: { kind: 'choice', choiceId: 'yes' },
            via: { channel: 'spec', ref: '1' },
          });
        },
      },
      {
        publish: (request) => {
          published.push({ topic: request.topic, source: request.source });
          return Promise.resolve({ seq: '1', ...request, publishedAt: '' });
        },
      },
      'example',
    );
    const prompt = {
      id: '11111111-1111-4111-8111-111111111111',
      origin: { kind: 'spec', id: 'x', label: '' },
      title: 'Run it?',
      details: [],
      choices: [{ id: 'yes', label: 'Yes', note: null }],
      freeText: null,
      commands: [],
      expiresAt: '2026-10-17T00:00:00.000Z',
    } satisfies InteractionPrompt;
    await operator.ask(prompt);
    await operator.ask(prompt, undefined, 'peer');
    await operator.notify(prompt);
    expect(asks.map((ask) => ask.source)).toEqual([undefined, 'peer']);
    expect(published).toEqual([{ topic: 'interaction.prompted', source: 'example' }]);
  });
});
