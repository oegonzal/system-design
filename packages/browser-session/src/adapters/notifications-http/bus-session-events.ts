import type { SessionEvent } from '@sysdesign/contracts';
import type { BusClient } from '@sysdesign/notifications-client';

import type { SessionEventsPort } from '../../core/session-events';
import { SESSION_SOURCE } from './notifications-operator';

/** The session's events on the notifications bus, each under the session's own name as publisher. */
export class BusSessionEvents implements SessionEventsPort {
  constructor(private readonly bus: Pick<BusClient, 'publish'>) {}

  async publish(event: SessionEvent): Promise<void> {
    await this.bus.publish({ topic: event.topic, source: SESSION_SOURCE, payload: event.payload });
  }
}
