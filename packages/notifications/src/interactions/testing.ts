import { randomUUID } from 'node:crypto';

import type { InteractionOutcome, InteractionPrompt } from '@sysdesign/contracts';

import type { ChannelDelivery } from '../channels/port';
import type { DeliveryRecord, InteractionRecord, InteractionStore } from './ports';

/** A prompt a specs can put: a closed question with two choices and one command, its time a day away. */
export const promptOf = (overrides: Partial<InteractionPrompt> = {}): InteractionPrompt => ({
  id: randomUUID(),
  origin: { kind: 'spec', id: 'asker-1', label: 'step 3 · Acme' },
  title: 'Gender',
  details: ['Field: "Gender" (combobox, required)'],
  choices: [
    { id: 'male', label: 'Male', note: null },
    { id: 'female', label: 'Female', note: null },
  ],
  freeText: null,
  commands: [{ id: 'blank', label: 'Leave it empty' }],
  expiresAt: '2026-10-12T00:00:00.000Z',
  ...overrides,
});

/** Polls until `holds` is true, for what a background consumer does; fails after `ms`. */
export async function until(holds: () => boolean, ms = 3_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!holds()) {
    if (Date.now() > deadline) throw new Error('the condition never held');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** The interaction store in memory, for specs: the same transitions the Postgres store makes. */
export class InMemoryInteractionStore implements InteractionStore {
  readonly records = new Map<string, InteractionRecord & { expiresAt: Date }>();
  readonly deliveryRows: (DeliveryRecord & { promptId: string })[] = [];

  async open(prompt: InteractionPrompt, at: Date): Promise<void> {
    if (this.records.has(prompt.id)) return;
    this.records.set(prompt.id, {
      prompt,
      state: 'open',
      outcome: null,
      openedAt: at,
      closedAt: null,
      expiresAt: new Date(prompt.expiresAt),
    });
  }

  async find(id: string): Promise<InteractionRecord | null> {
    return this.records.get(id) ?? null;
  }

  async close(id: string, outcome: InteractionOutcome, at: Date): Promise<boolean> {
    const record = this.records.get(id);
    if (record === undefined) return false;
    const unusedAnswer = record.state === 'answered' && outcome.kind === 'withdrawn';
    if (record.state !== 'open' && !unusedAnswer) return false;
    record.state = outcome.kind;
    record.outcome = outcome;
    record.closedAt = at;
    return true;
  }

  async recordDelivery(id: string, channel: string, delivery: ChannelDelivery): Promise<void> {
    this.deliveryRows.push({
      ...delivery,
      id: `${channel}:${delivery.address}:${delivery.messageRef}`,
      channel,
      promptId: id,
      closedAt: null,
    });
  }

  async deliveries(id: string): Promise<DeliveryRecord[]> {
    return this.deliveryRows.filter((row) => row.promptId === id);
  }

  async markClosed(deliveryId: string, at: Date): Promise<void> {
    const row = this.deliveryRows.find((candidate) => candidate.id === deliveryId);
    if (row !== undefined) row.closedAt = at;
  }

  async byMessage(
    channel: string,
    address: string,
    messageRef: string,
  ): Promise<InteractionRecord | null> {
    const row = this.deliveryRows.find(
      (candidate) =>
        candidate.channel === channel &&
        candidate.address === address &&
        candidate.messageRef === messageRef,
    );
    return row === undefined ? null : (this.records.get(row.promptId) ?? null);
  }

  async openAt(channel: string, address: string): Promise<InteractionRecord[]> {
    const ids = new Set(
      this.deliveryRows
        .filter((row) => row.channel === channel && row.address === address)
        .map((row) => row.promptId),
    );
    return [...this.records.values()]
      .filter((record) => ids.has(record.prompt.id) && record.state === 'open')
      .sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
  }

  async answeredBy(channel: string, ref: string): Promise<InteractionRecord | null> {
    return (
      [...this.records.values()].find(
        (record) =>
          record.outcome?.kind === 'answered' &&
          record.outcome.answer.via.channel === channel &&
          record.outcome.answer.via.ref === ref,
      ) ?? null
    );
  }

  async expired(now: Date): Promise<InteractionRecord[]> {
    return [...this.records.values()].filter(
      (record) => record.state === 'open' && record.expiresAt <= now,
    );
  }

  async purgeClosed(before: Date): Promise<number> {
    let purged = 0;
    for (const [id, record] of this.records) {
      if (record.closedAt !== null && record.closedAt < before) {
        this.records.delete(id);
        purged += 1;
      }
    }
    return purged;
  }
}
