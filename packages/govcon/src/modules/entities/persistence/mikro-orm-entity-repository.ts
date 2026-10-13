import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { Entity } from '@sysdesign/contracts';
import { GovconEntity } from '@sysdesign/db';

import type { EntityRepository, UpsertSummary } from '../../../core/ports';

const toRow = (entity: Entity): Omit<GovconEntity, never> => ({
  uei: entity.uei,
  cage: entity.cage,
  legalName: entity.legalName,
  registrationStatus: entity.registrationStatus,
  registrationExpiresAt: entity.registrationExpiresAt,
  businessTypes: [...entity.businessTypes],
  sbaCertifications: [...entity.sbaCertifications],
  naics: entity.naics.map((item) => ({ ...item })),
  psc: [...entity.psc],
  excluded: entity.excluded,
  fetchedAt: new Date(entity.fetchedAt),
});

const fromRow = (row: GovconEntity): Entity => ({
  uei: row.uei,
  cage: row.cage,
  legalName: row.legalName,
  registrationStatus: row.registrationStatus,
  registrationExpiresAt:
    row.registrationExpiresAt === null ? null : String(row.registrationExpiresAt).slice(0, 10),
  businessTypes: [...row.businessTypes],
  sbaCertifications: [...row.sbaCertifications],
  naics: row.naics.map((item) => ({ ...item })),
  psc: [...row.psc],
  excluded: row.excluded,
  fetchedAt: row.fetchedAt.toISOString(),
});

/** Registrants in Postgres, upserted by UEI. */
@Injectable()
export class MikroOrmEntityRepository implements EntityRepository {
  constructor(private readonly em: EntityManager) {}

  async upsertMany(entities: readonly Entity[]): Promise<UpsertSummary> {
    const byUei = new Map(entities.map((entity) => [entity.uei, entity]));
    const unique = [...byUei.values()];
    if (unique.length === 0) return { inserted: 0, updated: 0 };
    const em = this.em.fork();
    const existing = await em.find(
      GovconEntity,
      { uei: { $in: unique.map((e) => e.uei) } },
      { fields: ['uei'] },
    );
    await em.upsertMany(GovconEntity, unique.map(toRow), { onConflictFields: ['uei'] });
    return { inserted: unique.length - existing.length, updated: existing.length };
  }

  async find(uei: string): Promise<Entity | null> {
    const row = await this.em.fork().findOne(GovconEntity, { uei });
    return row ? fromRow(row) : null;
  }
}
