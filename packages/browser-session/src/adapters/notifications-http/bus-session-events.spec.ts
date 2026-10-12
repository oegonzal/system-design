import { SESSION_TOPICS, type PublishEventRequest } from '@sysdesign/contracts';

import { BusSessionEvents } from './bus-session-events';
import { SESSION_SOURCE } from './notifications-operator';

describe('the session’s events on the bus', () => {
  it('[BRW-15] publishes each event under its topic, as the session, with the payload as given', async () => {
    const published: PublishEventRequest[] = [];
    const bus = {
      publish: async (request: PublishEventRequest) => (published.push(request), {} as never),
    };
    const payload = { sessionId: crypto.randomUUID() };
    await new BusSessionEvents(bus).publish({ topic: SESSION_TOPICS.ended, payload });
    expect(published).toEqual([{ topic: SESSION_TOPICS.ended, source: SESSION_SOURCE, payload }]);
  });
});
