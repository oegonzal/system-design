import { Injectable } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/postgresql';
import type { Opportunity } from '@sysdesign/contracts';
import { GovconOpportunity } from '@sysdesign/db';

import type {
  CandidateFilter,
  CandidateSet,
  OpportunityRepository,
  StoredDescription,
  UpsertSummary,
} from '../../../core/ports';
import { fromRow, toRow } from './opportunity-mapper';

/** Rows per statement — well inside Postgres's parameter ceiling for a 30-column row. */
const BATCH = 250;

/** `%` and `_` in a user's substring must match themselves. */
const like = (text: string): string => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

/**
 * The feed in Postgres. Every method forks the entity manager (a CLI command
 * has no request context). `upsertMany` is the one write: the batch is deduped
 * by notice id first — Postgres refuses to touch the same row twice in one
 * `ON CONFLICT` — existing ids are read so the report can say inserted versus
 * updated, and `firstSeenAt` is excluded from the merge so it holds.
 */
@Injectable()
export class MikroOrmOpportunityRepository implements OpportunityRepository {
  constructor(private readonly em: EntityManager) {}

  async upsertMany(items: readonly Opportunity[], seenAt: Date): Promise<UpsertSummary> {
    const byId = new Map<string, Opportunity>();
    for (const item of items) byId.set(item.noticeId, item);
    const ids = [...byId.keys()];
    if (ids.length === 0) return { inserted: 0, updated: 0 };

    const em = this.em.fork();
    const existing = await em.find(
      GovconOpportunity,
      { noticeId: { $in: ids } },
      { fields: ['noticeId'] },
    );
    const rows = [...byId.values()].map((item) => toRow(item, seenAt));
    for (let start = 0; start < rows.length; start += BATCH) {
      await em.upsertMany(GovconOpportunity, rows.slice(start, start + BATCH), {
        onConflictFields: ['noticeId'],
        onConflictExcludeFields: ['firstSeenAt'],
      });
    }
    return { inserted: ids.length - existing.length, updated: existing.length };
  }

  /** Every gate and filter in SQL; one row past the limit says whether it cut the set. */
  async findCandidates(filter: CandidateFilter): Promise<CandidateSet> {
    const conditions: FilterQuery<GovconOpportunity>[] = [];
    // `active != false` would drop the unknowns: SQL's null never compares.
    if (filter.activeOnly) conditions.push({ $or: [{ active: true }, { active: null }] });
    if (filter.deadlineOnOrAfter !== null) {
      conditions.push({
        $or: [
          { responseDeadlineAt: null },
          { responseDeadlineAt: { $gte: filter.deadlineOnOrAfter } },
        ],
      });
    }
    if (filter.deadlineOnOrBefore !== null) {
      conditions.push({ responseDeadlineAt: { $lte: filter.deadlineOnOrBefore } });
    }
    if (filter.setAsideCodes !== null) {
      conditions.push({
        $or: [{ setAsideCode: null }, { setAsideCode: { $in: [...filter.setAsideCodes] } }],
      });
    }
    if (filter.excludeNoticeTypes.length > 0) {
      conditions.push({
        $or: [{ noticeType: null }, { noticeType: { $nin: [...filter.excludeNoticeTypes] } }],
      });
    }
    if (filter.naicsPrefix !== null)
      conditions.push({ naicsCode: { $like: `${filter.naicsPrefix}%` } });
    if (filter.setAsideCode !== null) conditions.push({ setAsideCode: filter.setAsideCode });
    if (filter.noticeType !== null) conditions.push({ noticeType: filter.noticeType });
    if (filter.agencyContains !== null) {
      conditions.push({ agencyPath: { $ilike: like(filter.agencyContains) } });
    }
    if (filter.textContains !== null) {
      const pattern = like(filter.textContains);
      conditions.push({
        $or: [{ title: { $ilike: pattern } }, { solicitationNumber: { $ilike: pattern } }],
      });
    }
    const rows = await this.em
      .fork()
      .find(GovconOpportunity, conditions.length > 0 ? { $and: conditions } : {}, {
        exclude: ['descriptionText', 'descriptionFetchedAt'],
        orderBy: { postedAt: 'desc', noticeId: 'asc' },
        limit: filter.limit + 1,
      });
    return {
      opportunities: rows.slice(0, filter.limit).map(fromRow),
      capped: rows.length > filter.limit,
    };
  }

  async findOne(noticeId: string): Promise<Opportunity | null> {
    const row = await this.em
      .fork()
      .findOne(
        GovconOpportunity,
        { noticeId },
        { exclude: ['descriptionText', 'descriptionFetchedAt'] },
      );
    return row ? fromRow(row) : null;
  }

  async findDescription(noticeId: string): Promise<StoredDescription | null> {
    const row = await this.em
      .fork()
      .findOne(
        GovconOpportunity,
        { noticeId },
        { fields: ['descriptionText', 'descriptionFetchedAt'] },
      );
    return row && row.descriptionText !== null && row.descriptionFetchedAt !== null
      ? { text: row.descriptionText, fetchedAt: row.descriptionFetchedAt }
      : null;
  }

  /** The one writer of the description columns; the pull's upsert never names them. */
  async saveDescription(noticeId: string, description: StoredDescription): Promise<void> {
    await this.em
      .fork()
      .nativeUpdate(
        GovconOpportunity,
        { noticeId },
        { descriptionText: description.text, descriptionFetchedAt: description.fetchedAt },
      );
  }
}
