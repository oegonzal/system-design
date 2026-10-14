import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { alertKeyOf, type AlertKey } from '@sysdesign/contracts';
import { GovconAlert } from '@sysdesign/db';

import type { AlertLedger, RaisedAlert, StoredAlert } from '../../../core/ports';

/** Raised alerts in Postgres, one row per key, written only for what was published, each with its payload. */
@Injectable()
export class MikroOrmAlertLedger implements AlertLedger {
  constructor(private readonly em: EntityManager) {}

  async raised(keys: readonly AlertKey[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const rows = await this.em
      .fork()
      .find(
        GovconAlert,
        { $or: keys.map(({ kind, subject }) => ({ kind, subject })) },
        { fields: ['kind', 'subject'] },
      );
    return new Set(rows.map((row) => alertKeyOf({ kind: row.kind, subject: row.subject })));
  }

  async record(rows: readonly RaisedAlert[]): Promise<void> {
    if (rows.length === 0) return;
    await this.em.fork().insertMany(
      GovconAlert,
      rows.map((row) => ({
        id: randomUUID(),
        kind: row.key.kind,
        subject: row.key.subject,
        scopeKey: row.scopeKey,
        payload: row.payload,
        position: row.position,
        profileId: row.profileId,
        raisedAt: row.raisedAt,
        eventSeq: row.eventSeq,
        promptId: row.promptId,
      })),
    );
  }

  async list(page: { limit: number; offset: number }): Promise<[StoredAlert[], number]> {
    const [rows, total] = await this.em.fork().findAndCount(
      GovconAlert,
      {},
      // The alerts of one warm share an instant: their place in it orders them, and the key settles a tie.
      { orderBy: { raisedAt: 'desc', position: 'asc', kind: 'asc', subject: 'asc' }, ...page },
    );
    return [
      rows.map((row) => ({
        id: row.id,
        key: { kind: row.kind, subject: row.subject },
        profileId: row.profileId,
        raisedAt: row.raisedAt,
        payload: row.payload,
      })),
      total,
    ];
  }
}
