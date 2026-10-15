import {
  interactionAnswerSchema,
  SOURCE_MAX_LENGTH,
  type InteractionPrompt,
} from '@sysdesign/contracts';
import { z, type ZodType } from 'zod';

/**
 * What every notification channel is to the service: something that puts a
 * prompt in front of people, shows on what it sent how the prompt ended, and
 * hands the service what people send back. A channel never reads a reply
 * itself — the service reads every reply the one declared way — and never
 * learns who asked, or why: which publishers' prompts it carries is the
 * service's to know, beside it.
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
  /** The instance's id: the channel every delivery through it and every answer taken on it records. */
  readonly id: string;
  /** Starts taking what people send, handing each message to the sink; resolves once it is taking them. */
  start(sink: InboundSink): Promise<void>;
  stop(): Promise<void>;
  /** Puts a prompt in front of the channel's people: where it went, or nothing when there is no one to send to. */
  deliver(prompt: InteractionPrompt): Promise<ChannelDelivery[]>;
  /** Shows on a message it sent how its prompt ended, in the words given. */
  close(delivery: ChannelDelivery, prompt: InteractionPrompt, outcome: string): Promise<void>;
}

/** A channel as the service runs it: the channel, and the publishers whose prompts it carries. */
export interface ChannelInstance {
  channel: NotificationChannel;
  /** Publishers, by the `source` their events carry. */
  carries: readonly string[];
}

/** An instance's id: dotted lowercase words, no longer than an answer may name the channel it came by. */
export const CHANNEL_ID = interactionAnswerSchema.shape.via.shape.channel.regex(
  /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*$/,
  { message: 'an instance id is dotted lowercase words' },
);

/** A publisher, as the `source` of the events it publishes. */
export const PUBLISHER = z.string().min(1).max(SOURCE_MAX_LENGTH);

/** Where a channel says what it is doing. */
export interface ChannelLog {
  log(message: string): void;
  warn(message: string): void;
}

/** A variable a channel kind reads, by the key `create` finds its value under; each instance binds the variable's name. */
export interface ChannelVariable {
  /** It must be set: an instance whose variable is unset refuses boot. */
  required: boolean;
  /** No two instances of the kind may read one value, as when one value may hold only one connection. */
  distinct: boolean;
}

/**
 * A channel kind as declared, so the service composes it without naming it:
 * its id, the settings every instance of it shares, the variables an instance
 * reads — each by the key `create` finds it under — and how an instance is
 * built.
 */
export interface ChannelDefinition<S = unknown> {
  id: string;
  settings: ZodType<S>;
  env: Readonly<Record<string, ChannelVariable>>;
  create(input: {
    /** The instance's id. */
    id: string;
    settings: S;
    /** Each key's value, unset as undefined. */
    env: Readonly<Record<string, string | undefined>>;
    /** The variable the instance binds to each key, for what the channel says about it. */
    variables: Readonly<Record<string, string>>;
    log: ChannelLog;
  }): NotificationChannel;
}
