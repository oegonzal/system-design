import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/postgresql';
import { GovconTarget } from '@sysdesign/db';

import type {
  TargetFilter,
  TargetInput,
  TargetKey,
  TargetRecord,
  TargetRepository,
} from '../../../core/ports';

const toRecord = (row: GovconTarget): TargetRecord => ({
  id: row.id,
  kind: row.kind,
  subject: row.subject,
  label: row.label,
  stage: row.stage,
  notes: row.notes,
  contact: row.contact,
  reminderAt: row.reminderAt,
  endsAt: row.endsAt,
  stageChangedAt: row.stageChangedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const NEWEST_FIRST = { updatedAt: 'desc', subject: 'asc' } as const;

/** Targets in Postgres; the unique (kind, subject) is the row a save lands on. */
@Injectable()
export class MikroOrmTargetRepository implements TargetRepository {
  constructor(private readonly em: EntityManager) {}

  async find(key: TargetKey): Promise<TargetRecord | null> {
    const row = await this.em.fork().findOne(GovconTarget, key);
    return row ? toRecord(row) : null;
  }

  async save(key: TargetKey, input: TargetInput, at: Date): Promise<TargetRecord> {
    const em = this.em.fork();
    const existing = await em.findOne(GovconTarget, key);
    if (existing) {
      Object.assign(existing, {
        ...input,
        stageChangedAt: existing.stage === input.stage ? existing.stageChangedAt : at,
        updatedAt: at,
      });
      await em.flush();
      return toRecord(existing);
    }
    const row = em.create(GovconTarget, {
      id: randomUUID(),
      ...key,
      ...input,
      endsAt: null,
      stageChangedAt: at,
      createdAt: at,
      updatedAt: at,
    });
    await em.flush();
    return toRecord(row);
  }

  async remove(key: TargetKey): Promise<boolean> {
    return (await this.em.fork().nativeDelete(GovconTarget, key)) > 0;
  }

  async list(filter: TargetFilter): Promise<[TargetRecord[], number]> {
    const where: FilterQuery<GovconTarget> = {
      ...(filter.kind === null ? {} : { kind: filter.kind }),
      ...(filter.stage === null ? {} : { stage: filter.stage }),
    };
    const [rows, total] = await this.em.fork().findAndCount(GovconTarget, where, {
      orderBy: NEWEST_FIRST,
      limit: filter.limit,
      offset: filter.offset,
    });
    return [rows.map(toRecord), total];
  }

  async listAll(): Promise<TargetRecord[]> {
    return (await this.em.fork().find(GovconTarget, {}, { orderBy: NEWEST_FIRST })).map(toRecord);
  }

  /** One column of one row: a warm's reading never touches what a person wrote, or when. */
  async observe(key: TargetKey, endsAt: string | null): Promise<boolean> {
    return (await this.em.fork().nativeUpdate(GovconTarget, key, { endsAt })) > 0;
  }
}
