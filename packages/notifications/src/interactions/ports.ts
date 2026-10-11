import type { InteractionOutcome, InteractionPrompt, InteractionState } from '@sysdesign/contracts';

import type { ChannelDelivery } from '../channels/port';

/** A prompt as the service keeps it, from the event that opened it until it closed. */
export interface InteractionRecord {
  prompt: InteractionPrompt;
  state: InteractionState;
  outcome: InteractionOutcome | null;
  openedAt: Date;
  closedAt: Date | null;
}

/** One message a channel sent a prompt as, and whether it shows yet how the prompt ended. */
export interface DeliveryRecord extends ChannelDelivery {
  id: string;
  channel: string;
  closedAt: Date | null;
}

/** The prompts and their deliveries, kept apart from the bus so they outlive its retention. */
export interface InteractionStore {
  /** Keeps a prompt open; one already kept is left as it is. */
  open(prompt: InteractionPrompt, at: Date): Promise<void>;
  find(id: string): Promise<InteractionRecord | null>;
  /**
   * Closes a prompt with its outcome — an open one either way, an answered one
   * only by a withdrawal, which says the answer went unused. False when it
   * changed nothing.
   */
  close(id: string, outcome: InteractionOutcome, at: Date): Promise<boolean>;
  recordDelivery(id: string, channel: string, delivery: ChannelDelivery, at: Date): Promise<void>;
  deliveries(id: string): Promise<DeliveryRecord[]>;
  markClosed(deliveryId: string, at: Date): Promise<void>;
  /** The prompt a channel's message carried. */
  byMessage(
    channel: string,
    address: string,
    messageRef: string,
  ): Promise<InteractionRecord | null>;
  /** The open prompts delivered to one address on one channel, oldest first. */
  openAt(channel: string, address: string): Promise<InteractionRecord[]>;
  /** The prompt a channel's message answered, so a replay of that message is known. */
  answeredBy(channel: string, ref: string): Promise<InteractionRecord | null>;
  /** The open prompts whose time ran out. */
  expired(now: Date): Promise<InteractionRecord[]>;
  /** Removes the prompts closed before `before`; how many. */
  purgeClosed(before: Date): Promise<number>;
}
