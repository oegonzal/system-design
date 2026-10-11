import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { EventEnvelope } from '@sysdesign/contracts';
import { BusEvent } from '@sysdesign/db';

import type { EventLog, NewEvent } from '../ports';

/**
 * The advisory lock every append takes: one writer from the moment its seq is
 * drawn until it commits, so events commit in seq order and a cursor never
 * passes an event still being written. No other code in the database takes
 * an advisory lock.
 */
export const APPEND_LOCK = 7_261_011_001;

/** The event log in Postgres: one row per event, its seq drawn from the table's own sequence. */
@Injectable()
export class MikroOrmEventLog implements EventLog {
  constructor(private readonly em: EntityManager) {}

  append(event: NewEvent, at: Date): Promise<EventEnvelope> {
    return this.em.fork().transactional(async (em) => {
      await em.execute(`select pg_advisory_xact_lock(${APPEND_LOCK})`);
      const row = em.create(BusEvent, {
        topic: event.topic,
        source: event.source,
        payload: event.payload,
        publishedAt: at,
      });
      await em.flush();
      return envelopeOf(row);
    });
  }

  async after(cursor: bigint, topics: readonly string[], max: number): Promise<EventEnvelope[]> {
    const rows = await this.em
      .fork()
      .find(
        BusEvent,
        { seq: { $gt: cursor.toString() }, topic: { $in: [...topics] } },
        { orderBy: { seq: 'asc' }, limit: max },
      );
    return rows.map(envelopeOf);
  }

  async head(): Promise<bigint> {
    const [row] = await this.em
      .fork()
      .execute<{ head: string | null }[]>('select max(seq)::text as head from bus_event');
    return BigInt(row?.head ?? 0);
  }

  prune(before: Date, below: bigint): Promise<number> {
    return this.em
      .fork()
      .nativeDelete(BusEvent, { publishedAt: { $lt: before }, seq: { $lt: below.toString() } });
  }
}

const envelopeOf = (row: BusEvent): EventEnvelope => ({
  seq: String(row.seq),
  topic: row.topic,
  source: row.source,
  payload: row.payload,
  publishedAt: row.publishedAt.toISOString(),
});
