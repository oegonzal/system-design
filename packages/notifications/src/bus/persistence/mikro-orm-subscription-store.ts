import { Injectable } from '@nestjs/common';
import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import type { Subscription } from '@sysdesign/contracts';
import { BusSubscription } from '@sysdesign/db';

import type { SubscriptionStore } from '../ports';

/** The bus's subscriptions in Postgres: one row each, the cursor moved forward by a guarded update. */
@Injectable()
export class MikroOrmSubscriptionStore implements SubscriptionStore {
  constructor(private readonly em: EntityManager) {}

  upsert(name: string, topics: readonly string[], head: bigint, at: Date): Promise<Subscription> {
    return this.em.fork().transactional(async (em) => {
      const existing = await em.findOne(
        BusSubscription,
        { name },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (existing !== null) {
        existing.topics = [...topics];
        existing.pulledAt = at;
        return subscriptionOf(existing);
      }
      const created = em.create(BusSubscription, {
        name,
        topics: [...topics],
        cursorSeq: head.toString(),
        createdAt: at,
        pulledAt: at,
      });
      return subscriptionOf(created);
    });
  }

  async find(name: string): Promise<Subscription | null> {
    const row = await this.em.fork().findOne(BusSubscription, { name });
    return row === null ? null : subscriptionOf(row);
  }

  async touch(name: string, at: Date): Promise<void> {
    await this.em.fork().nativeUpdate(BusSubscription, { name }, { pulledAt: at });
  }

  async advance(name: string, seq: bigint): Promise<Subscription | null> {
    const em = this.em.fork();
    // Guarded in the statement itself, so two acknowledgements racing can only move it forward.
    await em.nativeUpdate(
      BusSubscription,
      { name, cursorSeq: { $lt: seq.toString() } },
      { cursorSeq: seq.toString() },
    );
    return this.find(name);
  }

  async remove(name: string): Promise<boolean> {
    return (await this.em.fork().nativeDelete(BusSubscription, { name })) > 0;
  }

  removeIdle(before: Date): Promise<number> {
    return this.em.fork().nativeDelete(BusSubscription, { pulledAt: { $lt: before } });
  }

  async lowestCursor(): Promise<bigint | null> {
    const [row] = await this.em
      .fork()
      .execute<{ lowest: string | null }[]>(
        'select min(cursor_seq)::text as lowest from bus_subscription',
      );
    return row === undefined || row.lowest === null ? null : BigInt(row.lowest);
  }
}

const subscriptionOf = (row: BusSubscription): Subscription => ({
  name: row.name,
  topics: [...row.topics],
  cursor: String(row.cursorSeq),
});
