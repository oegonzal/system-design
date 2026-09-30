import { Injectable } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/postgresql';
import { GovconBid, GovconOpportunity } from '@sysdesign/db';

import type {
  BidInput,
  BidRecord,
  BidRepository,
  BidWithNotice,
  PipelineFilter,
} from '../../../core/ports';
import { fromRow } from './opportunity-mapper';

const toRecord = (row: GovconBid): BidRecord => ({
  noticeId: row.notice.noticeId,
  stage: row.stage,
  notes: row.notes,
  reminderAt: row.reminderAt,
  estimatedValue: row.estimatedValue === null ? null : Number(row.estimatedValue),
  stageChangedAt: row.stageChangedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Bids in Postgres, keyed by the notice; a listing joins the notice row it tracks. */
@Injectable()
export class MikroOrmBidRepository implements BidRepository {
  constructor(private readonly em: EntityManager) {}

  async find(noticeId: string): Promise<BidRecord | null> {
    const row = await this.em.fork().findOne(GovconBid, { notice: noticeId });
    return row ? toRecord(row) : null;
  }

  async save(noticeId: string, input: BidInput, at: Date): Promise<BidRecord> {
    const em = this.em.fork();
    const existing = await em.findOne(GovconBid, { notice: noticeId });
    const estimatedValue = input.estimatedValue === null ? null : input.estimatedValue.toFixed(2);
    if (existing) {
      Object.assign(existing, {
        stage: input.stage,
        notes: input.notes,
        reminderAt: input.reminderAt,
        estimatedValue,
        stageChangedAt: existing.stage === input.stage ? existing.stageChangedAt : at,
        updatedAt: at,
      });
      await em.flush();
      return toRecord(existing);
    }
    const row = em.create(GovconBid, {
      notice: em.getReference(GovconOpportunity, noticeId),
      stage: input.stage,
      notes: input.notes,
      reminderAt: input.reminderAt,
      estimatedValue,
      stageChangedAt: at,
      createdAt: at,
      updatedAt: at,
    });
    await em.flush();
    return toRecord(row);
  }

  async remove(noticeId: string): Promise<boolean> {
    return (await this.em.fork().nativeDelete(GovconBid, { notice: noticeId })) > 0;
  }

  async list(filter: PipelineFilter): Promise<[BidWithNotice[], number]> {
    const where: FilterQuery<GovconBid> = filter.stage === null ? {} : { stage: filter.stage };
    const [rows, total] = await this.em.fork().findAndCount(GovconBid, where, {
      populate: ['notice'],
      orderBy: { updatedAt: 'desc', notice: 'asc' },
      limit: filter.limit,
      offset: filter.offset,
    });
    return [rows.map(join), total];
  }

  async listAll(): Promise<BidWithNotice[]> {
    const rows = await this.em
      .fork()
      .find(GovconBid, {}, { populate: ['notice'], orderBy: { updatedAt: 'desc', notice: 'asc' } });
    return rows.map(join);
  }
}

const join = (row: GovconBid): BidWithNotice => ({
  bid: toRecord(row),
  opportunity: fromRow(row.notice),
});
