import {
  INTERACTION_TOPICS,
  type InteractionAnswer,
  type InteractionPrompt,
} from '@sysdesign/contracts';
import type { BusClient, InteractionClient } from '@sysdesign/notifications-client';

import type { OperatorPort, SessionEventsPort, SessionLog } from './ports';

/**
 * The session's events on the bus, under the program's source, one after
 * another: writes are chained and never awaited by the loop, so order is
 * kept and a slow bus never stalls a step; a failed publish is reported,
 * never thrown; `flush` is what the program awaits when it shuts down.
 */
export class BusSessionEvents implements SessionEventsPort {
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly bus: Pick<BusClient, 'publish'>,
    private readonly source: string,
    private readonly log: SessionLog,
  ) {}

  publish(topic: string, payload: unknown): Promise<void> {
    this.chain = this.chain
      .then(() => this.bus.publish({ topic, source: this.source, payload }))
      .then(
        () => undefined,
        (error: unknown) => {
          this.log.warn(`${topic} was not published: ${String(error)}`);
        },
      );
    return Promise.resolve();
  }

  flush(): Promise<void> {
    return this.chain;
  }
}

/**
 * The operator reached through the notifications service: a question goes
 * out as an interaction prompt on every channel that carries the source it
 * is asked under — the program's own, or a peer's for a call of the peer's
 * tool — and the answer comes back as the event that names it; a notice is
 * published and never waited for.
 */
export class InteractionOperator implements OperatorPort {
  constructor(
    private readonly interactions: Pick<InteractionClient, 'ask'>,
    private readonly bus: Pick<BusClient, 'publish'>,
    private readonly source: string,
  ) {}

  ask(
    prompt: InteractionPrompt,
    signal?: AbortSignal,
    source?: string,
  ): Promise<InteractionAnswer> {
    return this.interactions.ask(prompt, signal, source);
  }

  async notify(prompt: InteractionPrompt): Promise<void> {
    await this.bus.publish({
      topic: INTERACTION_TOPICS.prompted,
      source: this.source,
      payload: prompt,
    });
  }
}
