import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { ApplicationStatus } from '@sysdesign/contracts';
import { JobApplication } from '@sysdesign/db';

import { companyKey, type Application } from '../application';
import type { ApplicationsQuery, ApplicationStore, InProgressFilter } from '../ports';

/** The record in Postgres: one row per application, each query on a fork of its own. */
@Injectable()
export class MikroOrmApplicationStore implements ApplicationStore {
  constructor(private readonly em: EntityManager) {}

  async find(id: string): Promise<Application | null> {
    const row = await this.em.fork().findOne(JobApplication, { id });
    return row === null ? null : applicationOf(row);
  }

  async insert(application: Application): Promise<boolean> {
    const em = this.em.fork();
    if ((await em.findOne(JobApplication, { id: application.id })) !== null) return false;
    em.create(JobApplication, { ...application });
    await em.flush();
    return true;
  }

  async setStatus(id: string, status: ApplicationStatus, closedAt: Date | null): Promise<void> {
    await this.em
      .fork()
      .nativeUpdate(
        JobApplication,
        { id },
        { status, closedAt, ...(status === 'in-progress' ? {} : { expiresAt: null }) },
      );
  }

  async since(subject: string, since: Date): Promise<Application[]> {
    const rows = await this.em.fork().find(
      JobApplication,
      {
        subject,
        $or: [{ closedAt: { $gte: since } }, { closedAt: null, openedAt: { $gte: since } }],
      },
      { orderBy: { openedAt: 'desc' } },
    );
    return rows.map(applicationOf);
  }

  async list(query: ApplicationsQuery): Promise<Application[]> {
    const rows = await this.em.fork().find(
      JobApplication,
      {
        subject: query.subject,
        ...(query.company === undefined ? {} : { identityKey: companyKey(query.company) }),
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.since === undefined ? {} : { openedAt: { $gte: query.since } }),
      },
      { orderBy: { openedAt: 'desc' }, limit: query.limit, offset: query.offset },
    );
    return rows.map(applicationOf);
  }

  async inProgress(filter: InProgressFilter): Promise<Application[]> {
    const rows = await this.em.fork().find(JobApplication, {
      status: 'in-progress',
      ...('sessionId' in filter
        ? { sessionId: filter.sessionId }
        : {
            profile: filter.profile,
            subject: filter.subject,
            sessionId: { $ne: filter.exceptSessionId },
          }),
    });
    return rows.map(applicationOf);
  }
}

const applicationOf = (row: JobApplication): Application => ({
  id: row.id,
  subject: row.subject,
  company: row.company,
  identityKey: row.identityKey,
  label: row.label,
  url: row.url,
  source: row.source,
  sessionId: row.sessionId,
  profile: row.profile,
  unitOrdinal: row.unitOrdinal,
  status: row.status,
  openedAt: row.openedAt,
  closedAt: row.closedAt,
  expiresAt: row.expiresAt,
});
