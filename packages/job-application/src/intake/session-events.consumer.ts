import {
  SESSION_TOPICS,
  sessionEndedSchema,
  sessionStartedSchema,
  sessionUnitClosedSchema,
  sessionUnitOpenedSchema,
  type EventEnvelope,
} from '@sysdesign/contracts';
import {
  BusCallAborted,
  SubscriptionMissing,
  type BusClient,
} from '@sysdesign/notifications-client';

import type { SessionRecord } from '../applications';
import type { IntakeSettings } from './settings';

/** Where the intake says what it did and what it passed over. */
export interface IntakeLog {
  log(message: string): void;
  warn(message: string): void;
}

const pause = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

/**
 * The record fed from the bus, as one subscriber of it: subscribed before the
 * first pull, each event applied and then acknowledged, a payload its topic's
 * schema refuses passed over and acknowledged rather than holding the events
 * behind it. A subscription the bus swept while nobody pulled is made again,
 * with one warning that a gap may exist — `replay-events` on the session
 * catches the record up.
 */
export class SessionIntake {
  private readonly stopping = new AbortController();
  private running: Promise<void> | null = null;
  private gapWarned = false;

  constructor(
    private readonly bus: BusClient,
    private readonly record: SessionRecord,
    private readonly settings: IntakeSettings,
    private readonly log: IntakeLog,
  ) {}

  async start(): Promise<void> {
    await this.subscribe();
    this.running = this.consume();
  }

  async stop(): Promise<void> {
    this.stopping.abort();
    await this.running;
  }

  /** One event's effect on the record; one the schema refuses is said and passed over. */
  async apply(event: EventEnvelope): Promise<void> {
    const at = new Date(event.publishedAt);
    try {
      switch (event.topic) {
        case SESSION_TOPICS.started: {
          const dead = await this.record.started(sessionStartedSchema.parse(event.payload), at);
          if (dead > 0)
            this.log.log(`#${event.seq}: ${dead} unit(s) of an earlier session abandoned`);
          return;
        }
        case SESSION_TOPICS.unitOpened: {
          const change = await this.record.opened(sessionUnitOpenedSchema.parse(event.payload), at);
          this.log.log(`#${event.seq} ${event.topic}: ${change}`);
          return;
        }
        case SESSION_TOPICS.unitClosed: {
          const change = await this.record.closed(sessionUnitClosedSchema.parse(event.payload), at);
          this.log.log(`#${event.seq} ${event.topic}: ${change}`);
          return;
        }
        case SESSION_TOPICS.ended: {
          const left = await this.record.ended(sessionEndedSchema.parse(event.payload), at);
          if (left > 0) this.log.log(`#${event.seq}: ${left} unit(s) left in progress abandoned`);
          return;
        }
        default:
          return;
      }
    } catch (error) {
      this.log.warn(`${event.topic} #${event.seq} passed over: ${String(error)}`);
    }
  }

  private subscribe(): Promise<unknown> {
    return this.bus.subscribe(this.settings.subscription, {
      topics: Object.values(SESSION_TOPICS),
    });
  }

  private async consume(): Promise<void> {
    const { signal } = this.stopping;
    while (!signal.aborted) {
      try {
        const events = await this.bus.pull(
          this.settings.subscription,
          { waitMs: this.settings.pullWaitMs, max: this.settings.eventsPerPull },
          signal,
        );
        for (const event of events) {
          await this.apply(event);
          await this.bus.ack(this.settings.subscription, event.seq);
        }
      } catch (error) {
        if (signal.aborted || error instanceof BusCallAborted) return;
        if (error instanceof SubscriptionMissing) {
          if (!this.gapWarned) {
            this.log.warn(
              `the bus swept ${this.settings.subscription}: events published while nobody pulled are missed — replay-events on the sessions since catches the record up`,
            );
            this.gapWarned = true;
          }
          await this.subscribe().catch(() => undefined);
        } else {
          this.log.warn(`consuming the session events failed: ${String(error)}`);
        }
        await pause(this.settings.retryPauseMs, signal);
      }
    }
  }
}
