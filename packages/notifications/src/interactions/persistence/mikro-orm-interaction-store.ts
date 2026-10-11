import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { InteractionOutcome, InteractionPrompt } from '@sysdesign/contracts';
import { Interaction, InteractionDelivery } from '@sysdesign/db';

import type { ChannelDelivery } from '../../channels/port';
import type { DeliveryRecord, InteractionRecord, InteractionStore } from '../ports';

/**
 * The prompts and their deliveries in Postgres. A close is a guarded update —
 * open to either outcome, answered only to a withdrawal — so two outcomes
 * racing cannot both win; an answer's message reference is read from the
 * stored outcome itself.
 */
@Injectable()
export class MikroOrmInteractionStore implements InteractionStore {
  constructor(private readonly em: EntityManager) {}

  async open(prompt: InteractionPrompt, at: Date): Promise<void> {
    const em = this.em.fork();
    if ((await em.findOne(Interaction, { id: prompt.id })) !== null) return;
    em.create(Interaction, {
      id: prompt.id,
      prompt,
      state: 'open',
      outcome: null,
      openedAt: at,
      expiresAt: new Date(prompt.expiresAt),
      closedAt: null,
    });
    await em.flush();
  }

  async find(id: string): Promise<InteractionRecord | null> {
    const row = await this.em.fork().findOne(Interaction, { id });
    return row === null ? null : recordOf(row);
  }

  async close(id: string, outcome: InteractionOutcome, at: Date): Promise<boolean> {
    const em = this.em.fork();
    const closing = { state: outcome.kind, outcome, closedAt: at };
    if ((await em.nativeUpdate(Interaction, { id, state: 'open' }, closing)) > 0) return true;
    if (outcome.kind !== 'withdrawn') return false;
    return (await em.nativeUpdate(Interaction, { id, state: 'answered' }, closing)) > 0;
  }

  async recordDelivery(
    id: string,
    channel: string,
    delivery: ChannelDelivery,
    at: Date,
  ): Promise<void> {
    const em = this.em.fork();
    em.create(InteractionDelivery, {
      id: randomUUID(),
      interaction: id,
      channel,
      address: delivery.address,
      messageRef: delivery.messageRef,
      deliveredAt: at,
      closedAt: null,
    });
    await em.flush();
  }

  async deliveries(id: string): Promise<DeliveryRecord[]> {
    const rows = await this.em
      .fork()
      .find(InteractionDelivery, { interaction: id }, { orderBy: { deliveredAt: 'asc' } });
    return rows.map(deliveryOf);
  }

  async markClosed(deliveryId: string, at: Date): Promise<void> {
    await this.em.fork().nativeUpdate(InteractionDelivery, { id: deliveryId }, { closedAt: at });
  }

  async byMessage(
    channel: string,
    address: string,
    messageRef: string,
  ): Promise<InteractionRecord | null> {
    const em = this.em.fork();
    const delivery = await em.findOne(InteractionDelivery, { channel, address, messageRef });
    if (delivery === null) return null;
    const row = await em.findOne(Interaction, { id: delivery.interaction });
    return row === null ? null : recordOf(row);
  }

  async openAt(channel: string, address: string): Promise<InteractionRecord[]> {
    const em = this.em.fork();
    const deliveries = await em.find(InteractionDelivery, { channel, address });
    if (deliveries.length === 0) return [];
    const rows = await em.find(
      Interaction,
      { id: { $in: deliveries.map((delivery) => delivery.interaction) }, state: 'open' },
      { orderBy: { openedAt: 'asc' } },
    );
    return rows.map(recordOf);
  }

  async answeredBy(channel: string, ref: string): Promise<InteractionRecord | null> {
    const row = await this.em.fork().findOne(Interaction, {
      outcome: { kind: 'answered', answer: { via: { channel, ref } } },
    });
    return row === null ? null : recordOf(row);
  }

  async expired(now: Date): Promise<InteractionRecord[]> {
    const rows = await this.em
      .fork()
      .find(
        Interaction,
        { state: 'open', expiresAt: { $lte: now } },
        { orderBy: { expiresAt: 'asc' } },
      );
    return rows.map(recordOf);
  }

  purgeClosed(before: Date): Promise<number> {
    return this.em.fork().nativeDelete(Interaction, { closedAt: { $lt: before } });
  }
}

const recordOf = (row: Interaction): InteractionRecord => ({
  prompt: row.prompt,
  state: row.state,
  outcome: row.outcome,
  openedAt: row.openedAt,
  closedAt: row.closedAt,
});

const deliveryOf = (row: InteractionDelivery): DeliveryRecord => ({
  id: row.id,
  channel: row.channel,
  address: row.address,
  messageRef: row.messageRef,
  closedAt: row.closedAt,
});
