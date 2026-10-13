import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { alertKeyOf, type AlertKey } from '@sysdesign/contracts';
import { GovconAlert } from '@sysdesign/db';

import type { AlertLedger, RaisedAlert } from '../../../core/ports';

/** Raised alerts in Postgres, one row per key, written only for what was published. */
@Injectable()
export class MikroOrmAlertLedger implements AlertLedger {
  constructor(private readonly em: EntityManager) {}

  async raised(keys: readonly AlertKey[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const rows = await this.em
      .fork()
      .find(
        GovconAlert,
        { $or: keys.map(({ kind, subject, scopeKey }) => ({ kind, subject, scopeKey })) },
        { fields: ['kind', 'subject', 'scopeKey'] },
      );
    return new Set(
      rows.map((row) =>
        alertKeyOf({ kind: row.kind, subject: row.subject, scopeKey: row.scopeKey }),
      ),
    );
  }

  async record(rows: readonly RaisedAlert[]): Promise<void> {
    if (rows.length === 0) return;
    await this.em.fork().insertMany(
      GovconAlert,
      rows.map((row) => ({
        id: randomUUID(),
        kind: row.key.kind,
        subject: row.key.subject,
        scopeKey: row.key.scopeKey,
        profileId: row.profileId,
        raisedAt: row.raisedAt,
        eventSeq: row.eventSeq,
        promptId: row.promptId,
      })),
    );
  }
}
