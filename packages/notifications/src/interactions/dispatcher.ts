import {
  INTERACTION_TOPICS,
  interactionAnswerSchema,
  interactionPromptSchema,
  interactionWithdrawnSchema,
  type EventEnvelope,
  type InteractionOutcome,
  type InteractionPrompt,
} from '@sysdesign/contracts';

import { UnknownSubscription, type Bus } from '../bus';
import type { ChannelLog, InboundSink, NotificationChannel } from '../channels/port';
import { SERVICE_SOURCE } from './inbound';
import { outcomeText } from './outcome';
import type { InteractionStore } from './ports';
import type { InteractionSettings } from './settings';

/** The dispatcher's own subscription: an ordinary subscriber of the bus, in-process. */
export const DISPATCHER_SUBSCRIPTION = 'notifications.interactions';

/**
 * Each channel's part run on its own, so one that fails never keeps the
 * others from theirs; what failed is thrown together once every part ran, and
 * a retry finds the parts that succeeded already done.
 */
async function eachOnItsOwn<T>(
  parts: readonly T[],
  run: (part: T) => Promise<void>,
  name: (part: T) => string,
): Promise<void> {
  const failures: string[] = [];
  for (const part of parts) {
    try {
      await run(part);
    } catch (error) {
      failures.push(`${name(part)}: ${String(error)}`);
    }
  }
  if (failures.length > 0) throw new Error(failures.join('; '));
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
 * Puts each prompt in front of people on every channel the service runs, and
 * shows on every message it sent how the prompt ended. It consumes the
 * interaction topics as one subscriber of the bus: a prompt is opened once and
 * delivered once per channel however often its event comes round; an answer,
 * a withdrawal or an expiry closes every delivery, and a withdrawal after an
 * answer marks that answer unused. A channel that keeps failing is tried the
 * declared number of times and then passed over with a warning, and its event
 * acknowledged, so it never holds back the events behind it.
 */
export class Dispatcher {
  private readonly stopping = new AbortController();
  private running: Promise<void> | null = null;

  constructor(
    private readonly bus: Bus,
    private readonly store: InteractionStore,
    private readonly channels: readonly NotificationChannel[],
    private readonly settings: InteractionSettings,
    private readonly now: () => Date,
    private readonly log: ChannelLog,
  ) {}

  /** Subscribes, starts every channel handing what people send to the sink, then consumes until stopped. */
  async start(sink: InboundSink): Promise<void> {
    await this.subscribe();
    for (const channel of this.channels) await channel.start(sink);
    this.running = this.consume();
  }

  async stop(): Promise<void> {
    this.stopping.abort();
    await this.running;
    for (const channel of this.channels) await channel.stop();
  }

  /** One event's effect, tried the declared number of times; the event is acknowledged either way. */
  async handle(event: EventEnvelope): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await this.apply(event);
        return;
      } catch (error) {
        if (attempt >= this.settings.deliveryAttempts) {
          this.log.warn(
            `${event.topic} #${event.seq} passed over after ${attempt} tries: ${String(error)}`,
          );
          return;
        }
        await pause(this.settings.retryPauseMs, this.stopping.signal);
      }
    }
  }

  private subscribe(): Promise<unknown> {
    return this.bus.subscribe(DISPATCHER_SUBSCRIPTION, {
      topics: Object.values(INTERACTION_TOPICS),
    });
  }

  private async consume(): Promise<void> {
    const { signal } = this.stopping;
    while (!signal.aborted) {
      try {
        const events = await this.bus.pull(
          DISPATCHER_SUBSCRIPTION,
          { waitMs: this.settings.pullWaitMs, max: this.settings.eventsPerPull },
          signal,
        );
        for (const event of events) {
          await this.handle(event);
          await this.bus.ack(DISPATCHER_SUBSCRIPTION, event.seq);
        }
      } catch (error) {
        if (signal.aborted) return;
        // Swept while the service was down: subscribe again, from the head.
        if (error instanceof UnknownSubscription) await this.subscribe().catch(() => undefined);
        this.log.warn(`consuming the interactions failed: ${String(error)}`);
        await pause(this.settings.retryPauseMs, signal);
      }
    }
  }

  private async apply(event: EventEnvelope): Promise<void> {
    switch (event.topic) {
      case INTERACTION_TOPICS.prompted:
        return this.deliver(interactionPromptSchema.parse(event.payload), event.source);
      case INTERACTION_TOPICS.answered: {
        const answer = interactionAnswerSchema.parse(event.payload);
        return this.close(answer.promptId, { kind: 'answered', answer });
      }
      case INTERACTION_TOPICS.withdrawn: {
        const withdrawal = interactionWithdrawnSchema.parse(event.payload);
        return this.close(withdrawal.promptId, { kind: 'withdrawn', withdrawal });
      }
    }
  }

  private async deliver(prompt: InteractionPrompt, source: string): Promise<void> {
    const at = this.now();
    // Already past its time: the asker has stopped waiting, and there is nothing to offer.
    if (Date.parse(prompt.expiresAt) <= at.getTime()) return;
    await this.store.open(prompt, at);
    const record = await this.store.find(prompt.id);
    if (record === null || record.state !== 'open') return;
    const reached = new Set((await this.store.deliveries(prompt.id)).map((d) => d.channel));
    await eachOnItsOwn(
      this.channels.filter((channel) => !reached.has(channel.id)),
      async (channel) => {
        const deliveries = await channel.deliver(prompt);
        for (const delivery of deliveries) {
          await this.store.recordDelivery(prompt.id, channel.id, delivery, at);
        }
        if (deliveries.length === 0) {
          this.log.warn(`${channel.id} reached no one with a prompt from ${source}`);
        }
      },
      (channel) => channel.id,
    );
  }

  private async close(promptId: string, outcome: InteractionOutcome): Promise<void> {
    const at = this.now();
    const changed = await this.store.close(promptId, outcome, at);
    const record = await this.store.find(promptId);
    // A prompt this service never opened has no message to show it on.
    if (record === null) return;
    const text = outcomeText(record);
    const showing = (await this.store.deliveries(promptId)).filter(
      (delivery) => changed || delivery.closedAt === null,
    );
    await eachOnItsOwn(
      showing,
      async (delivery) => {
        // A channel no longer run has no message to edit.
        const channel = this.channels.find((candidate) => candidate.id === delivery.channel);
        if (channel === undefined) return;
        await channel.close(delivery, record.prompt, text);
        await this.store.markClosed(delivery.id, at);
      },
      (delivery) => `${delivery.channel} ${delivery.messageRef}`,
    );
  }
}

/** Withdraws the open prompts whose time ran out, and purges the closed ones past their retention. */
export async function sweepInteractions(
  bus: Bus,
  store: InteractionStore,
  settings: InteractionSettings,
  now: Date,
): Promise<{ expired: number; purged: number }> {
  const expired = await store.expired(now);
  for (const record of expired) {
    await bus.publish(
      {
        topic: INTERACTION_TOPICS.withdrawn,
        source: SERVICE_SOURCE,
        payload: { promptId: record.prompt.id, reason: 'expired', note: null },
      },
      'service',
    );
  }
  const purged = await store.purgeClosed(new Date(now.getTime() - settings.closedRetentionMs));
  return { expired: expired.length, purged };
}
