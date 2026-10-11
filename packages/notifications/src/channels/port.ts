import type { InteractionPrompt } from '@sysdesign/contracts';
import type { ZodType } from 'zod';

/**
 * What every notification channel is to the service: something that puts a
 * prompt in front of people, shows on what it sent how the prompt ended, and
 * hands the service what people send back. A channel never reads a reply
 * itself — the service reads every reply the one declared way — and never
 * learns who asked, or why.
 */

/** Where a channel put one prompt: the address it reached, and the channel's own reference for the message. */
export interface ChannelDelivery {
  address: string;
  messageRef: string;
}

/** What a person sent on a channel, before it is read against any prompt. */
export interface InboundMessage {
  channel: string;
  /** Who sent it, as the channel addresses them. */
  address: string;
  /** The channel's reference for this message, so a replay of it is known. */
  ref: string;
  /** The message it replies to, when the person replied to one. */
  inReplyTo: string | null;
  text: string;
}

/** What the service made of it: taken, refused with the reason a person reads, or none of its business. */
export type InboundVerdict = { kind: 'accepted' | 'refused'; text: string } | { kind: 'ignored' };

export interface InboundSink {
  receive(message: InboundMessage): Promise<InboundVerdict>;
}

export interface NotificationChannel {
  readonly id: string;
  /** Starts taking what people send, handing each message to the sink; resolves once it is taking them. */
  start(sink: InboundSink): Promise<void>;
  stop(): Promise<void>;
  /** Puts a prompt in front of the channel's people: where it went, or nothing when there is no one to send to. */
  deliver(prompt: InteractionPrompt): Promise<ChannelDelivery[]>;
  /** Shows on a message it sent how its prompt ended, in the words given. */
  close(delivery: ChannelDelivery, prompt: InteractionPrompt, outcome: string): Promise<void>;
}

/** Where a channel says what it is doing. */
export interface ChannelLog {
  log(message: string): void;
  warn(message: string): void;
}

/**
 * A channel as declared, so the service composes it without naming it: its
 * id, the settings it is configured with, the environment variables it reads
 * — each by the key `create` finds it under — and how it is built.
 */
export interface ChannelDefinition<S = unknown> {
  id: string;
  settings: ZodType<S>;
  env: Readonly<Record<string, { name: string; required: boolean }>>;
  create(input: {
    settings: S;
    env: Readonly<Record<string, string | undefined>>;
    log: ChannelLog;
  }): NotificationChannel;
}
