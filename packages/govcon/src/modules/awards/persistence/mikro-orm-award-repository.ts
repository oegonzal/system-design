import { Injectable } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/postgresql';
import type { Award } from '@sysdesign/contracts';
import { GovconAward } from '@sysdesign/db';
import { escapeLike } from '@sysdesign/nest-kit';

import type { AwardFilter, AwardRepository, HistoryRow, UpsertSummary } from '../../../core/ports';

const BATCH = 250;

const toRow = (
  award: Award,
): Omit<GovconAward, typeof import('@mikro-orm/core').PrimaryKeyProp> => ({
  source: award.source,
  externalId: award.externalId,
  piid: award.piid,
  awardType: award.awardType,
  solicitationNumber: award.solicitationNumber,
  naicsCode: award.naicsCode,
  pscCode: award.pscCode,
  agencyPath: award.agencyPath,
  agencyCode: award.agencyCode,
  awardeeName: award.awardeeName,
  awardeeUei: award.awardeeUei,
  amount: award.amount === null ? null : award.amount.toFixed(2),
  offersReceived: award.offersReceived,
  extentCompeted: award.extentCompeted,
  setAsideCode: award.setAsideCode,
  signedAt: award.signedAt,
  popStartAt: award.popStartAt,
  completionAt: award.completionAt,
  placeOfPerformance: award.placeOfPerformance ? { ...award.placeOfPerformance } : null,
  fetchedAt: new Date(award.fetchedAt),
});

const fromRow = (row: GovconAward): Award => ({
  source: row.source,
  externalId: row.externalId,
  piid: row.piid,
  awardType: row.awardType,
  solicitationNumber: row.solicitationNumber,
  naicsCode: row.naicsCode,
  pscCode: row.pscCode,
  agencyPath: row.agencyPath,
  agencyCode: row.agencyCode,
  awardeeName: row.awardeeName,
  awardeeUei: row.awardeeUei,
  amount: row.amount === null ? null : Number(row.amount),
  offersReceived: row.offersReceived,
  extentCompeted: row.extentCompeted,
  setAsideCode: row.setAsideCode,
  signedAt: String(row.signedAt).slice(0, 10),
  popStartAt: row.popStartAt === null ? null : String(row.popStartAt).slice(0, 10),
  completionAt: row.completionAt === null ? null : String(row.completionAt).slice(0, 10),
  placeOfPerformance: row.placeOfPerformance ? { ...row.placeOfPerformance } : null,
  fetchedAt: row.fetchedAt.toISOString(),
});

const whereOf = (filter: AwardFilter): FilterQuery<GovconAward> => {
  const conditions: FilterQuery<GovconAward>[] = [];
  if (filter.naicsPrefix !== null)
    conditions.push({ naicsCode: { $like: `${filter.naicsPrefix}%` } });
  if (filter.pscPrefix !== null) conditions.push({ pscCode: { $like: `${filter.pscPrefix}%` } });
  if (filter.agencyContains !== null)
    conditions.push({ agencyPath: { $ilike: `%${escapeLike(filter.agencyContains)}%` } });
  if (filter.solicitationNumber !== null)
    conditions.push({ solicitationNumber: filter.solicitationNumber });
  if (filter.awardeeUei !== null) conditions.push({ awardeeUei: filter.awardeeUei });
  if (filter.signedFrom !== null) conditions.push({ signedAt: { $gte: filter.signedFrom } });
  if (filter.signedTo !== null) conditions.push({ signedAt: { $lte: filter.signedTo } });
  if (filter.source !== null) conditions.push({ source: filter.source });
  return conditions.length > 0 ? { $and: conditions } : {};
};

/** Awards in Postgres, upserted by `(source, external_id)`, read newest signed first. */
@Injectable()
export class MikroOrmAwardRepository implements AwardRepository {
  constructor(private readonly em: EntityManager) {}

  async upsertMany(awards: readonly Award[]): Promise<UpsertSummary> {
    const byKey = new Map<string, Award>();
    for (const award of awards) byKey.set(`${award.source}:${award.externalId}`, award);
    const unique = [...byKey.values()];
    if (unique.length === 0) return { inserted: 0, updated: 0 };
    const em = this.em.fork();
    const existing = await em.find(
      GovconAward,
      { $or: unique.map((award) => ({ source: award.source, externalId: award.externalId })) },
      { fields: ['source', 'externalId'] },
    );
    const rows = unique.map(toRow);
    for (let start = 0; start < rows.length; start += BATCH) {
      await em.upsertMany(GovconAward, rows.slice(start, start + BATCH), {
        onConflictFields: ['source', 'externalId'],
      });
    }
    return { inserted: unique.length - existing.length, updated: existing.length };
  }

  async list(filter: AwardFilter, limit: number, offset: number): Promise<[Award[], number]> {
    const [rows, total] = await this.em.fork().findAndCount(GovconAward, whereOf(filter), {
      orderBy: { signedAt: 'desc', externalId: 'asc' },
      limit,
      offset,
    });
    return [rows.map(fromRow), total];
  }

  async findMatching(filter: AwardFilter, limit: number): Promise<Award[]> {
    const rows = await this.em.fork().find(GovconAward, whereOf(filter), {
      orderBy: { signedAt: 'desc', externalId: 'asc' },
      limit,
    });
    return rows.map(fromRow);
  }

  async history(since: string): Promise<HistoryRow[]> {
    const rows = await this.em
      .fork()
      .find(
        GovconAward,
        { signedAt: { $gte: since } },
        { fields: ['naicsCode', 'agencyCode', 'signedAt'] },
      );
    return rows.map((row) => ({
      naicsCode: row.naicsCode,
      agencyCode: row.agencyCode,
      signedAt: String(row.signedAt).slice(0, 10),
    }));
  }
}
