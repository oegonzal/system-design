import {
  BusCallAborted,
  BusRefused,
  BusTimeout,
  BusUnreachable,
  SubscriptionMissing,
} from './bus-errors';
import { HttpBusClient } from './http-bus-client';

type Script = { status: number; body?: unknown } | Error | 'hang';

/** Fetch answering from a script, call by call; `hang` answers only when the call is abandoned. */
function scripted(answers: Script[]) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      method: String(init?.method),
      url: String(url),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    const answer = answers.shift() ?? 'hang';
    if (answer instanceof Error) throw answer;
    if (answer === 'hang') {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    }
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status: answer.status,
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const SUBSCRIPTION = { name: 'ask.x', topics: ['interaction.answered'], cursor: '4' };

describe('the bus over HTTP', () => {
  it('[NTC-1] makes each call on its route and unwraps the envelope, a missing subscription named as such', async () => {
    const { calls, fetchImpl } = scripted([
      { status: 200, body: { data: SUBSCRIPTION } },
      { status: 201, body: { data: { seq: '5', topic: 'interaction.prompted' } } },
      { status: 200, body: { data: [] } },
      { status: 200, body: { data: { ...SUBSCRIPTION, cursor: '5' } } },
      { status: 204 },
      { status: 404, body: { message: 'no such subscription: ask.x', missing: 'subscription' } },
      { status: 404, body: { message: 'no such subscription: ask.x', missing: 'subscription' } },
    ]);
    const bus = new HttpBusClient('http://bus.test', { fetchImpl });
    expect(await bus.subscribe('ask.x', { topics: ['interaction.answered'] })).toEqual(
      SUBSCRIPTION,
    );
    expect(
      await bus.publish({ topic: 'interaction.prompted', source: 'spec', payload: {} }),
    ).toEqual({
      seq: '5',
      topic: 'interaction.prompted',
    });
    expect(await bus.pull('ask.x', { waitMs: 250, max: 5 })).toEqual([]);
    expect((await bus.ack('ask.x', '5')).cursor).toBe('5');
    await bus.unsubscribe('ask.x');
    await expect(bus.pull('ask.x', { waitMs: 0, max: 1 })).rejects.toEqual(
      new SubscriptionMissing('ask.x'),
    );
    // Removing one already gone is not a failure.
    await bus.unsubscribe('ask.x');
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      'PUT http://bus.test/subscriptions/ask.x',
      'POST http://bus.test/events',
      'GET http://bus.test/subscriptions/ask.x/events?waitMs=250&max=5',
      'POST http://bus.test/subscriptions/ask.x/ack',
      'DELETE http://bus.test/subscriptions/ask.x',
      'GET http://bus.test/subscriptions/ask.x/events?waitMs=0&max=1',
      'DELETE http://bus.test/subscriptions/ask.x',
    ]);
    expect(calls[3]?.body).toEqual({ seq: '5' });
  });

  it('[NTC-1] says why a call failed: refused with the service’s own words, unreachable, timed out past its wait, or abandoned', async () => {
    const refused = scripted([
      { status: 403, body: { message: 'interaction.answered is published by the service only' } },
    ]);
    await expect(
      new HttpBusClient('http://bus.test', { fetchImpl: refused.fetchImpl }).publish({
        topic: 'interaction.answered',
        source: 'spec',
        payload: {},
      }),
    ).rejects.toEqual(
      new BusRefused(403, 'interaction.answered is published by the service only', 'POST /events'),
    );

    const down = scripted([new TypeError('fetch failed')]);
    await expect(
      new HttpBusClient('http://bus.test', { fetchImpl: down.fetchImpl }).ack('ask.x', '1'),
    ).rejects.toBeInstanceOf(BusUnreachable);

    // A pull is given its own wait on top of a call's.
    const slow = scripted(['hang']);
    const started = Date.now();
    await expect(
      new HttpBusClient('http://bus.test', { fetchImpl: slow.fetchImpl, callTimeoutMs: 50 }).pull(
        'ask.x',
        {
          waitMs: 100,
          max: 1,
        },
      ),
    ).rejects.toBeInstanceOf(BusTimeout);
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);

    const leaving = new AbortController();
    const hanging = scripted(['hang']);
    const pulling = new HttpBusClient('http://bus.test', { fetchImpl: hanging.fetchImpl }).pull(
      'ask.x',
      { waitMs: 1_000, max: 1 },
      leaving.signal,
    );
    leaving.abort();
    await expect(pulling).rejects.toBeInstanceOf(BusCallAborted);
  });

  it('[NTC-1] asks again while the service is unreachable within the recovery window, and gives up past it', async () => {
    let clock = 0;
    const recovery = { windowMs: 1_000, pauseMs: 300 };
    const ticking = {
      now: () => clock,
      sleep: async (ms: number) => {
        clock += ms;
      },
    };
    const restarting = scripted([
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
      { status: 200, body: { data: SUBSCRIPTION } },
    ]);
    const bus = new HttpBusClient('http://bus.test', {
      recovery,
      clock: ticking,
      fetchImpl: restarting.fetchImpl,
    });
    expect(await bus.subscribe('ask.x', { topics: ['interaction.answered'] })).toEqual(
      SUBSCRIPTION,
    );
    expect(restarting.calls).toHaveLength(3);

    clock = 0;
    const gone = scripted(Array.from({ length: 10 }, () => new TypeError('fetch failed')));
    await expect(
      new HttpBusClient('http://bus.test', {
        recovery,
        clock: ticking,
        fetchImpl: gone.fetchImpl,
      }).subscribe('ask.x', { topics: ['interaction.answered'] }),
    ).rejects.toBeInstanceOf(BusUnreachable);
    expect(gone.calls).toHaveLength(4);
  });

  it('[NTC-1] asks a pull again when the service did not answer it in time, within the recovery window, and a call that is not a pull once only', async () => {
    let clock = 0;
    const recovery = { windowMs: 1_000, pauseMs: 100 };
    const ticking = {
      now: () => clock,
      sleep: async (ms: number) => {
        clock += ms;
      },
    };
    const event = { seq: '6', topic: 'interaction.answered', payload: {} };
    // The first pull hangs past its own wait; the second answers.
    const slow = scripted(['hang', { status: 200, body: { data: [event] } }]);
    const bus = new HttpBusClient('http://bus.test', {
      recovery,
      clock: ticking,
      callTimeoutMs: 50,
      fetchImpl: slow.fetchImpl,
    });
    expect(await bus.pull('ask.x', { waitMs: 100, max: 5 })).toEqual([event]);
    expect(slow.calls.map((call) => call.method)).toEqual(['GET', 'GET']);

    // A prompt published twice is one prompt to the service — but a publish that timed out may have landed, so it is not asked again.
    clock = 0;
    const mute = scripted(['hang', { status: 201, body: { data: event } }]);
    await expect(
      new HttpBusClient('http://bus.test', {
        recovery,
        clock: ticking,
        callTimeoutMs: 50,
        fetchImpl: mute.fetchImpl,
      }).publish({ topic: 'interaction.prompted', source: 'spec', payload: {} }),
    ).rejects.toBeInstanceOf(BusTimeout);
    expect(mute.calls).toHaveLength(1);
  });
});
