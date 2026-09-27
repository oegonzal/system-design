import { Injectable } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/postgresql';
import type { Opportunity } from '@sysdesign/contracts';
import { GovconOpportunity } from '@sysdesign/db';

import type {
  CandidateFilter,
  FetchedOpportunity,
  OpportunityRepository,
  UpsertSummary,
} from '../../../core/ports';
import { fromRow, toRow } from './opportunity-mapper';

/** Rows per statement — well inside Postgres's parameter ceiling for a 30-column row. */
const BATCH = 250;

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

  async upsertMany(items: readonly FetchedOpportunity[], seenAt: Date): Promise<UpsertSummary> {
    const byId = new Map<string, FetchedOpportunity>();
    for (const item of items) byId.set(item.opportunity.noticeId, item);
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

  async findCandidates(filter: CandidateFilter): Promise<Opportunity[]> {
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
    const rows = await this.em
      .fork()
      .find(GovconOpportunity, conditions.length > 0 ? { $and: conditions } : {}, {
        orderBy: { postedAt: 'desc', noticeId: 'asc' },
      });
    return rows.map(fromRow);
  }

  async findOne(noticeId: string): Promise<Opportunity | null> {
    const row = await this.em.fork().findOne(GovconOpportunity, { noticeId });
    return row ? fromRow(row) : null;
  }
}
