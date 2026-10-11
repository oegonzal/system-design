import type { InteractionPrompt } from '@sysdesign/contracts';

import type { ChannelDelivery, InboundSink, InboundVerdict, NotificationChannel } from './port';

/**
 * A channel with one person on it, for specs: it records what it delivered and
 * how each message closed, fails the deliveries it is told to, and sends what
 * the person types back through the sink the service gave it.
 */
export class FakeChannel implements NotificationChannel {
  readonly delivered: InteractionPrompt[] = [];
  readonly closed: { messageRef: string; outcome: string }[] = [];
  /** Deliveries still to fail, one each, before they succeed. */
  failures = 0;
  private sink: InboundSink | null = null;
  private sent = 0;

  constructor(
    readonly id = 'fake',
    readonly address = 'person-1',
  ) {}

  async start(sink: InboundSink): Promise<void> {
    this.sink = sink;
  }

  async stop(): Promise<void> {
    this.sink = null;
  }

  async deliver(prompt: InteractionPrompt): Promise<ChannelDelivery[]> {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error(`${this.id} is down`);
    }
    this.delivered.push(prompt);
    this.sent += 1;
    return [{ address: this.address, messageRef: `${this.id}-m${this.sent}` }];
  }

  async close(
    delivery: ChannelDelivery,
    _prompt: InteractionPrompt,
    outcome: string,
  ): Promise<void> {
    this.closed.push({ messageRef: delivery.messageRef, outcome });
  }

  /** What the person sends: typed, or as a reply to one of the messages delivered. */
  send(text: string, ref: string, inReplyTo: string | null = null): Promise<InboundVerdict> {
    if (this.sink === null) throw new Error(`${this.id} was never started`);
    return this.sink.receive({ channel: this.id, address: this.address, ref, inReplyTo, text });
  }
}
